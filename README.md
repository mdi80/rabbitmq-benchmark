# RabbitMQ Performance & Educational Benchmark Laboratory

An educational laboratory and interactive web dashboard for benchmarking RabbitMQ performance, reproducing official baseline results, and analyzing environment differentials.

Execution is driven exclusively by the official **RabbitMQ Java `PerfTest` engine** (`com.rabbitmq.perf.PerfTestMulti` in `perf-test.jar`), while the modern web interface provides real-time time-series diagramming, side-by-side differential comparison, and saturation knee analysis.

---

## 🚀 Key Features

* **Official Java Benchmark Engine**:
  * Directly spawns `com.rabbitmq.perf.PerfTestMulti` from `perf-test.jar` (v2.25.0) against RabbitMQ.
  * Measures microsecond-precision consumer latency distributions, publish/delivery rates, and message throughput.

* **Custom Benchmark Parameter Testing (Tab 1)**:
  * Direct numeric input for:
    * **Duration**: Test runtime in seconds (e.g., `10s`).
    * **Rate Limit**: Target throughput per producer in msg/s (e.g., `20 msg/s`, or `0` for unthrottled maximum).
    * **Producers Count**: Number of parallel publishing threads.
    * **Consumers Count**: Number of parallel consuming threads.
    * **Payload Size**: Byte size per message (e.g., `256` bytes).
  * Built-in quick presets: Gentle test (`20 msg/s`), Moderate (`5,000 msg/s`), High Concurrency (`15,000 msg/s`), Saturation Knee (`26,000 msg/s`), and Unthrottled Max.
  * Automatically renders Chart.js throughput diagrams, end-to-end latency curves, and a saturation health assessment.

* **Git Differential Comparison (Tab 2)**:
  * **Left Column (Git Reference)**: Displays the historical reference benchmark dataset committed in the Git repository (`examples/legacy-reported-result.json` from `publish-consume-spec.js`: 4 producers, 2 consumers, 30s, unthrottled).
  * **Right Column (Local Reproduction on Docker)**: One-click reproduction running the identical specification against your local Docker RabbitMQ broker.
  * **Differential Analysis**: Side-by-side comparison cards for $\Delta$ Average Latency, $\Delta$ Max Latency Spike, and Throughput Fidelity, accompanied by an environmental contrast analysis (Bare-Metal 2012 vs Modern Containerized Erlang OTP 26).

* **Authentic Legacy Flot Viewer (Tab 3)**:
  * Embedded historical visualizer rendering original jQuery Flot charts from `examples/sample.html`.

---

## 📋 Prerequisites

* **Docker & Docker Compose** (for running RabbitMQ 3.13)
* **Node.js** (v18 or newer)
* **Java JDK** (17 LTS or newer)

---

## 🛠️ Quick Start Guide

### 1. Start RabbitMQ via Docker
```bash
docker compose up -d
```
* **AMQP Endpoint**: `amqp://127.0.0.1:5672`
* **Management UI**: `http://localhost:15672` (Username: `guest`, Password: `guest`)

### 2. Install Node.js Dependencies
```bash
npm install
```

### 3. Launch the Benchmark Laboratory Server
```bash
npm start
```

### 4. Open the Web Dashboard
Navigate to:
```
http://localhost:3000
```

---

## 📁 Project Structure

```
├── docker-compose.yml          # Container configuration for RabbitMQ 3-management
├── perf-test.jar               # Official RabbitMQ Java PerfTestMulti standalone tool
├── java-runner.js              # Node.js wrapper executing the Java PerfTest process
├── server.js                   # Express orchestrator & REST API endpoints
├── package.json                # Project dependencies & scripts
├── public/                     # Modern Web Dashboard assets
│   ├── index.html              # Laboratory user interface with 3 primary tabs
│   ├── dashboard.js            # Frontend controller & Chart.js diagram renderer
│   └── dashboard.css           # Modern dark-mode styling
├── examples/                   # Baseline benchmarks & legacy visualizer
│   ├── publish-consume-spec.js # Official benchmark specification (4 prod, 2 cons, 30s)
│   ├── publish-consume-result.js # Local machine reproduced results
│   ├── legacy-reported-result.json # Committed Git reference dataset
│   └── sample.html             # Original jQuery Flot chart visualizer
├── specs/                      # Custom benchmark specifications & outputs
└── lib/                        # Local offline libraries (Chart.js)
```

---

## 🔬 Educational Benchmark Insights

When reproducing `publish-consume-spec.js` (4 producers, 2 consumers, 30 seconds unthrottled):
* **Git Baseline (2012)**: Executed on Linux 2.6 / Oracle JVM 7 on bare-metal hardware. Queues backed up to over $900\text{ ms}$, resulting in an average end-to-end latency of $673.0\text{ ms}$ with peak latency spikes reaching $1,138\text{ ms}$.
* **Local Reproduction (Today)**: Executed on modern Docker RabbitMQ 3.13 / Erlang OTP 26 / OpenJDK 17. The broker achieves an average end-to-end latency of $\approx 1.8 - 3.5\text{ ms}$ (**$99.7\%$ lower latency**), showcasing the generational efficiency improvements in modern Erlang memory management and socket buffer handling.
