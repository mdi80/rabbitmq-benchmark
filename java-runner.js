/**
 * Java Benchmark Runner Module
 * Orchestrates the official RabbitMQ Java PerfTestMulti benchmark tool.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

class JavaRunner extends EventEmitter {
  constructor() {
    super();
    this.javaBin = this.resolveJavaPath();
    this.jarPath = path.resolve(__dirname, 'perf-test.jar');
    this.activeProcess = null;
    this.isRunning = false;
    this.currentJob = null;
    this.currentLogs = [];
  }

  resolveJavaPath() {
    const defaultJdk17 = 'C:\\Program Files\\Java\\jdk-17\\bin\\java.exe';
    if (fs.existsSync(defaultJdk17)) {
      return defaultJdk17;
    }
    const defaultJdk24 = 'C:\\Program Files\\Java\\jdk-24\\bin\\java.exe';
    if (fs.existsSync(defaultJdk24)) {
      return defaultJdk24;
    }
    return 'java';
  }

  parseSamplesFromResult(resultData) {
    if (!resultData) return { summary: {}, samples: [] };
    const scenarioKey = Object.keys(resultData)[0];
    if (!scenarioKey) return { summary: {}, samples: [] };

    const sObj = resultData[scenarioKey];
    const rawSamples = sObj.samples || [];

    let totalSend = 0;
    let totalRecv = 0;
    let maxLatency = 0;
    let minLatency = Infinity;
    let sumAvgLatency = 0;

    const samples = rawSamples.map((s, idx) => {
      const elapsedSec = s.elapsed ? Number((s.elapsed / 1000).toFixed(1)) : idx + 1;
      const sendRate = Math.round(s['send-msg-rate'] || 0);
      const recvRate = Math.round(s['recv-msg-rate'] || 0);
      const avgLatMs = s['avg-latency'] ? Number((s['avg-latency'] / 1000).toFixed(2)) : 0;
      const minLatMs = s['min-latency'] ? Number((s['min-latency'] / 1000).toFixed(2)) : 0;
      const maxLatMs = s['max-latency'] ? Number((s['max-latency'] / 1000).toFixed(2)) : 0;

      totalSend += sendRate;
      totalRecv += recvRate;
      if (maxLatMs > maxLatency) maxLatency = maxLatMs;
      if (minLatMs < minLatency && minLatMs > 0) minLatency = minLatMs;
      sumAvgLatency += avgLatMs;

      return {
        elapsed: elapsedSec,
        sendRate,
        recvRate,
        avgLatencyMs: avgLatMs,
        minLatencyMs: minLatMs,
        maxLatencyMs: maxLatMs
      };
    });

    const count = samples.length || 1;
    const overallAvgLat = Number((sumAvgLatency / count).toFixed(2));
    const overallAvgSend = Math.round(totalSend / count);
    const overallAvgRecv = Math.round(totalRecv / count);

    return {
      scenarioKey,
      samples,
      summary: {
        durationSec: count,
        totalSamples: count,
        avgLatencyMs: overallAvgLat,
        minLatencyMs: minLatency === Infinity ? 0 : minLatency,
        maxLatencyMs: maxLatency,
        avgSendRate: overallAvgSend,
        avgRecvRate: overallAvgRecv,
        totalSent: totalSend,
        totalRecv: totalRecv
      }
    };
  }

  async runCustomBenchmark({ duration = 10, rate = 20, producers = 2, consumers = 1, msgSize = 256 }) {
    const durNum = Math.max(2, parseInt(duration, 10) || 10);
    const prodNum = Math.max(1, parseInt(producers, 10) || 2);
    const consNum = Math.max(1, parseInt(consumers, 10) || 1);
    const sizeNum = Math.max(16, parseInt(msgSize, 10) || 256);
    const rateNum = parseInt(rate, 10) || 0;

    const paramObj = {
      'time-limit': durNum,
      'producer-count': prodNum,
      'consumer-count': consNum,
      'min-msg-size': sizeNum
    };

    if (rateNum > 0) {
      paramObj['producer-rate-limit'] = rateNum;
    }

    const spec = [{
      name: `custom_${rateNum > 0 ? rateNum + 'msg_s' : 'unthrottled'}_${prodNum}p_${consNum}c`,
      type: 'simple',
      uri: 'amqp://127.0.0.1:5672',
      params: [paramObj]
    }];

    const specDir = path.resolve(__dirname, 'specs');
    if (!fs.existsSync(specDir)) fs.mkdirSync(specDir, { recursive: true });

    const specPath = path.join(specDir, 'custom-spec.js');
    const outputPath = path.join(specDir, 'custom-result.js');

    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');

    const jobName = `Custom Java Test (${durNum}s @ ${rateNum > 0 ? rateNum + ' msg/s' : 'unthrottled'}, ${prodNum} prod, ${consNum} cons)`;
    const result = await this.runBenchmark('specs/custom-spec.js', 'specs/custom-result.js', jobName);

    const parsed = this.parseSamplesFromResult(result.data);
    return {
      jobName,
      durationSec: result.durationSec,
      specParams: {
        duration: durNum,
        rate: rateNum,
        producers: prodNum,
        consumers: consNum,
        msgSize: sizeNum
      },
      summary: parsed.summary,
      samples: parsed.samples,
      logs: this.currentLogs
    };
  }

  async runBenchmark(specRelativePath, outputRelativePath, jobName = 'Java Benchmark') {
    if (this.isRunning) {
      throw new Error('A Java benchmark is already running. Please wait or click Stop.');
    }

    if (!fs.existsSync(this.jarPath)) {
      throw new Error(`perf-test.jar not found at ${this.jarPath}`);
    }

    const specPath = path.resolve(__dirname, specRelativePath);
    const outputPath = path.resolve(__dirname, outputRelativePath);

    if (!fs.existsSync(specPath)) {
      throw new Error(`Specification file not found: ${specPath}`);
    }

    this.isRunning = true;
    this.currentLogs = [];
    this.currentJob = {
      name: jobName,
      specPath,
      outputPath,
      startTime: Date.now()
    };

    const args = [
      '-cp',
      this.jarPath,
      '-Dloader.main=com.rabbitmq.perf.PerfTestMulti',
      'org.springframework.boot.loader.PropertiesLauncher',
      specPath,
      outputPath
    ];

    const logStart = `[Java PerfTestMulti] Launching: java -cp perf-test.jar com.rabbitmq.perf.PerfTestMulti ${path.basename(specPath)} ${path.basename(outputPath)}`;
    this.currentLogs.push(logStart);
    this.emit('start', {
      jobName,
      specFile: path.basename(specPath),
      outputFile: path.basename(outputPath)
    });
    this.emit('log', { level: 'info', message: logStart });

    return new Promise((resolve, reject) => {
      this.activeProcess = spawn(this.javaBin, args, {
        cwd: __dirname,
        shell: false
      });

      this.activeProcess.stdout.on('data', (data) => {
        const text = data.toString('utf8').trim();
        if (text) {
          this.currentLogs.push(`[stdout] ${text}`);
          this.emit('log', { level: 'info', message: `[Java stdout] ${text}` });
        }
      });

      this.activeProcess.stderr.on('data', (data) => {
        const text = data.toString('utf8').trim();
        if (text) {
          const level = text.toLowerCase().includes('error') ? 'danger' : 'info';
          this.currentLogs.push(`[stderr] ${text}`);
          this.emit('log', { level, message: `[Java] ${text}` });
        }
      });

      this.activeProcess.on('error', (err) => {
        this.isRunning = false;
        this.activeProcess = null;
        this.emit('log', { level: 'danger', message: `[Java Process Error] ${err.message}` });
        reject(err);
      });

      this.activeProcess.on('close', (code) => {
        this.isRunning = false;
        const durationSec = Math.round((Date.now() - this.currentJob.startTime) / 1000);
        this.activeProcess = null;

        if (code === 0) {
          this.emit('log', {
            level: 'success',
            message: `[Java PerfTestMulti] Benchmark successfully completed in ${durationSec}s. Output written to ${path.basename(outputPath)}.`
          });

          let resultData = null;
          try {
            if (fs.existsSync(outputPath)) {
              let raw = fs.readFileSync(outputPath, 'utf8');
              if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
              resultData = JSON.parse(raw);
            }
          } catch (e) {
            this.emit('log', { level: 'warning', message: `Could not parse output JSON: ${e.message}` });
          }

          const finishEvent = {
            jobName,
            durationSec,
            exitCode: code,
            outputPath,
            data: resultData
          };

          this.emit('finish', finishEvent);
          resolve(finishEvent);
        } else {
          const err = new Error(`Java PerfTestMulti exited with code ${code}`);
          this.emit('log', {
            level: 'danger',
            message: `[Java PerfTestMulti] Process exited with code ${code}`
          });
          this.emit('finish', { jobName, durationSec, exitCode: code, error: err.message });
          reject(err);
        }
      });
    });
  }

  stop() {
    if (this.activeProcess && this.isRunning) {
      this.emit('log', { level: 'warning', message: '[Java Runner] Aborting active Java benchmark process...' });
      this.activeProcess.kill('SIGTERM');
      this.isRunning = false;
      this.activeProcess = null;
      return true;
    }
    return false;
  }
}

module.exports = new JavaRunner();
