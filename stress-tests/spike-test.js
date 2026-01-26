/**
 * Spike Test - Sudden Traffic Surge
 * Run: k6 run stress-tests/spike-test.js
 *
 * Purpose: Test API's ability to handle sudden traffic spikes
 * (e.g., viral content, influencer mention, marketing campaign)
 * Duration: ~6 minutes
 * Load: Sudden spike from 50 to 500 users
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const API_BASE = 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

// Custom metrics
const errorRate = new Rate('errors');
const spikeLatency = new Trend('spike_latency');
const recoveryLatency = new Trend('recovery_latency');
const requestCount = new Counter('total_requests');

export const options = {
  stages: [
    { duration: '1m', target: 50 },    // Baseline
    { duration: '10s', target: 500 },  // SPIKE!
    { duration: '2m', target: 500 },   // Hold spike
    { duration: '10s', target: 50 },   // Drop back
    { duration: '2m', target: 50 },    // Recovery period
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],  // Allow higher latency during spike
    http_req_failed: ['rate<0.10'],     // Allow 10% errors during spike
  },
};

let spikePhase = false;
let recoveryPhase = false;

export default function () {
  const currentTime = Date.now();
  const testStart = __ENV.K6_TEST_START || currentTime;
  const elapsedSeconds = (currentTime - testStart) / 1000;

  // Determine phase
  if (elapsedSeconds >= 60 && elapsedSeconds < 190) {
    spikePhase = true;
    recoveryPhase = false;
  } else if (elapsedSeconds >= 190) {
    spikePhase = false;
    recoveryPhase = true;
  }

  // Test feed (most critical endpoint)
  const res = http.get(`${API_BASE}/feed?limit=20`, {
    headers: { 'Content-Type': 'application/json' },
    tags: {
      name: 'feed',
      phase: spikePhase ? 'spike' : (recoveryPhase ? 'recovery' : 'baseline'),
    },
    timeout: '15s',
  });

  const success = check(res, {
    'status is acceptable': (r) => [200, 401, 429, 503].includes(r.status),
    'response received': (r) => r.body !== null,
  });

  errorRate.add(!success);
  requestCount.add(1);

  // Track latency by phase
  if (spikePhase) {
    spikeLatency.add(res.timings.duration);
  } else if (recoveryPhase) {
    recoveryLatency.add(res.timings.duration);
  }

  // Also test peaks during spike (secondary load)
  if (Math.random() < 0.3) {
    const peaksRes = http.get(`${API_BASE}/peaks?limit=5`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: '15s',
    });
    requestCount.add(1);
  }

  sleep(Math.random() * 0.5 + 0.2);
}

export function handleSummary(data) {
  const summary = generateSpikeSummary(data);

  return {
    'stress-tests/results/spike-test-summary.json': JSON.stringify(data, null, 2),
    stdout: summary,
  };
}

function generateSpikeSummary(data) {
  const m = data.metrics;
  let s = '\n';
  s += '╔══════════════════════════════════════════════════════════════════════╗\n';
  s += '║                        SPIKE TEST RESULTS                            ║\n';
  s += '║                  (50 → 500 → 50 users sudden spike)                  ║\n';
  s += '╠══════════════════════════════════════════════════════════════════════╣\n';
  s += `║  Total Requests:         ${(m.http_reqs?.values?.count || 0).toString().padStart(12)}                        ║\n`;
  s += `║  Peak Request Rate:      ${(m.http_reqs?.values?.rate || 0).toFixed(2).padStart(12)} req/s                    ║\n`;
  s += `║  Error Rate:             ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2).padStart(12)}%                       ║\n`;
  s += '╠══════════════════════════════════════════════════════════════════════╣\n';
  s += '║  Overall Response Times:                                             ║\n';
  s += `║    P50:                  ${(m.http_req_duration?.values?.['p(50)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P95:                  ${(m.http_req_duration?.values?.['p(95)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P99:                  ${(m.http_req_duration?.values?.['p(99)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    Max:                  ${(m.http_req_duration?.values?.max || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += '╠══════════════════════════════════════════════════════════════════════╣\n';
  s += '║  During Spike (500 users):                                           ║\n';
  s += `║    Avg Latency:          ${(m.spike_latency?.values?.avg || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P95 Latency:          ${(m.spike_latency?.values?.['p(95)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += '╠══════════════════════════════════════════════════════════════════════╣\n';
  s += '║  Recovery Phase:                                                     ║\n';
  s += `║    Avg Latency:          ${(m.recovery_latency?.values?.avg || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P95 Latency:          ${(m.recovery_latency?.values?.['p(95)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += '╚══════════════════════════════════════════════════════════════════════╝\n';

  // Analysis
  const spikeP95 = m.spike_latency?.values?.['p(95)'] || 0;
  const recoveryP95 = m.recovery_latency?.values?.['p(95)'] || 0;
  const errorRate = (m.http_req_failed?.values?.rate || 0) * 100;

  s += '\n📊 SPIKE HANDLING ANALYSIS:\n';
  s += `   - Spike latency P95: ${spikeP95.toFixed(0)}ms\n`;
  s += `   - Recovery latency P95: ${recoveryP95.toFixed(0)}ms\n`;
  s += `   - Recovery time: ${recoveryP95 < spikeP95 * 0.5 ? 'Fast' : 'Slow'}\n`;

  // Verdict
  s += '\n';
  if (spikeP95 < 2000 && errorRate < 10 && recoveryP95 < 500) {
    s += '✅ SPIKE TEST PASSED\n';
    s += '   - API handles sudden 10x traffic spike\n';
    s += '   - Recovers quickly after spike subsides\n';
  } else if (spikeP95 < 5000 && errorRate < 20) {
    s += '⚠️  SPIKE TEST WARNING\n';
    s += '   - API struggles under sudden spike\n';
    s += '   - Consider auto-scaling or provisioned concurrency\n';
  } else {
    s += '❌ SPIKE TEST FAILED\n';
    s += '   - API cannot handle sudden traffic spikes\n';
    s += '   - Immediate scaling improvements needed\n';
  }

  return s;
}
