/**
 * RabbitMQ Performance & Educational Benchmark Server
 * Exclusively drives official RabbitMQ Java PerfTestMulti benchmarks,
 * provides Git differential comparison, and serves the clean web UI.
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const javaRunner = require('./java-runner');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/examples', express.static(path.join(__dirname, 'examples')));
app.use('/lib', express.static(path.join(__dirname, 'lib')));
app.use('/specs', express.static(path.join(__dirname, 'specs')));
app.use('/legacy', express.static(__dirname));

// Broadcast WebSocket message
function broadcast(type, data) {
  const payload = JSON.stringify({ type, data });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Stream Java log events to WebSockets
javaRunner.on('log', (log) => broadcast('LOG', log));
javaRunner.on('start', (info) => broadcast('JAVA_STARTED', info));
javaRunner.on('finish', (result) => broadcast('JAVA_FINISHED', result));

// WebSocket connection
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    data: {
      isJavaRunning: javaRunner.isRunning,
      activeJob: javaRunner.currentJob
    }
  }));
});

// RabbitMQ Management API helpers
async function checkRabbitMQConnection() {
  try {
    const authHeader = 'Basic ' + Buffer.from('guest:guest').toString('base64');
    const res = await fetch('http://localhost:15672/api/overview', {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(2000)
    });
    if (res.ok) {
      const data = await res.json();
      return { connected: true, version: data.rabbitmq_version, cluster: data.cluster_name };
    }
    return { connected: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

async function purgeOrphanedQueues() {
  try {
    const authHeader = 'Basic ' + Buffer.from('guest:guest').toString('base64');
    const res = await fetch('http://localhost:15672/api/queues', {
      headers: { Authorization: authHeader }
    });
    if (!res.ok) return 0;
    const queues = await res.json();
    let cleaned = 0;
    for (const q of queues) {
      if ((q.name.startsWith('amq.gen-') || q.name.startsWith('perf-test-') || q.name.startsWith('custom_')) && q.consumers === 0) {
        await fetch(`http://localhost:15672/api/queues/%2f/${encodeURIComponent(q.name)}`, {
          method: 'DELETE',
          headers: { Authorization: authHeader }
        });
        cleaned++;
      }
    }
    return cleaned;
  } catch (err) {
    return 0;
  }
}

// ============================================================================
// REST API ENDPOINTS
// ============================================================================

// 1. Broker & Process Status
app.get('/api/status', async (req, res) => {
  const rmq = await checkRabbitMQConnection();
  res.json({
    rabbitmq: rmq,
    isJavaRunning: javaRunner.isRunning,
    activeJob: javaRunner.currentJob
  });
});

// 2. Run Custom Java Benchmark with Direct Number Inputs
app.post('/api/benchmark/custom', async (req, res) => {
  try {
    const { duration, rate, producers, consumers, msgSize } = req.body;

    // Purge any lingering queues before starting a new test
    await purgeOrphanedQueues();

    const result = await javaRunner.runCustomBenchmark({
      duration: parseInt(duration, 10) || 10,
      rate: parseInt(rate, 10) || 0,
      producers: parseInt(producers, 10) || 2,
      consumers: parseInt(consumers, 10) || 1,
      msgSize: parseInt(msgSize, 10) || 256
    });

    res.json({
      success: true,
      message: 'Java benchmark executed successfully',
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Run Benchmark with Identical Git Baseline Input (publish-consume-spec.js)
app.post('/api/benchmark/reproduce', async (req, res) => {
  try {
    await purgeOrphanedQueues();

    const specRel = path.join('examples', 'publish-consume-spec.js');
    const outRel = path.join('examples', 'publish-consume-result.js');

    const result = await javaRunner.runBenchmark(
      specRel,
      outRel,
      'Reproduce Baseline (publish-consume-spec.js: 4 producers, 2 consumers, 30s)'
    );

    const parsed = javaRunner.parseSamplesFromResult(result.data);

    res.json({
      success: true,
      message: 'Git baseline specification successfully reproduced on Docker RabbitMQ',
      jobName: result.jobName,
      durationSec: result.durationSec,
      summary: parsed.summary,
      samples: parsed.samples,
      meta: {
        source: 'Reproduced on Local Machine',
        environment: 'Windows 11 / Docker Container / RabbitMQ 3.13 / Erlang OTP 26 / OpenJDK 17',
        spec: 'publish-consume-spec.js (4 producers, 2 consumers, 30s, unthrottled)'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Fetch the Exact Git Reference Benchmark Dataset
app.get('/api/benchmark/git-reference', (req, res) => {
  try {
    const legacyPath = path.join(__dirname, 'examples', 'legacy-reported-result.json');
    if (!fs.existsSync(legacyPath)) {
      return res.status(404).json({ success: false, error: 'Git reference file not found' });
    }

    const raw = fs.readFileSync(legacyPath, 'utf8');
    const data = JSON.parse(raw);
    const parsed = javaRunner.parseSamplesFromResult(data);

    res.json({
      success: true,
      summary: parsed.summary,
      samples: parsed.samples,
      meta: {
        source: 'Official Git Repository Reference',
        environment: 'Linux 2.6 / Oracle JVM 7 / Dedicated Server Hardware (2012 baseline)',
        spec: 'publish-consume-spec.js (4 producers, 2 consumers, 30s, unthrottled)'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Fetch Latest Reproduced Benchmark Results (if available)
app.get('/api/benchmark/latest-reproduced', (req, res) => {
  try {
    const newlyGeneratedPath = path.join(__dirname, 'examples', 'publish-consume-result.js');
    if (!fs.existsSync(newlyGeneratedPath)) {
      return res.json({ success: false, message: 'Benchmark has not been reproduced yet' });
    }

    const raw = fs.readFileSync(newlyGeneratedPath, 'utf8');
    const data = JSON.parse(raw);
    const parsed = javaRunner.parseSamplesFromResult(data);

    res.json({
      success: true,
      summary: parsed.summary,
      samples: parsed.samples,
      meta: {
        source: 'Reproduced on Local Machine',
        environment: 'Windows 11 / Docker Container / RabbitMQ 3.13 / Erlang OTP 26 / OpenJDK 17',
        spec: 'publish-consume-spec.js (4 producers, 2 consumers, 30s, unthrottled)'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Purge Queues on Demand
app.post('/api/rabbitmq/purge', async (req, res) => {
  try {
    const count = await purgeOrphanedQueues();
    res.json({ success: true, count, message: `Purged ${count} stale benchmark queues from RabbitMQ.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Stop Running Java Benchmark
app.post('/api/benchmark/stop', (req, res) => {
  const stopped = javaRunner.stop();
  res.json({ success: true, stopped });
});

// Start Server
server.listen(PORT, async () => {
  console.log('=======================================================');
  console.log('RabbitMQ Performance & Educational Benchmark Server');
  console.log('=======================================================');
  console.log(`Web Dashboard:  http://localhost:${PORT}`);
  console.log(`Legacy Viewer:  http://localhost:${PORT}/legacy/examples/sample.html`);
  console.log(`RabbitMQ UI:    http://localhost:15672 (guest:guest)`);
  console.log('=======================================================');

  const check = await checkRabbitMQConnection();
  if (check.connected) {
    console.log(`[OK] Connected to Docker RabbitMQ (v${check.version})`);
  } else {
    console.log(`[WARN] RabbitMQ not reachable: ${check.error}`);
  }
});
