/**
 * MASSIVE Stress Test - 100,000 Virtual Users
 * Run: k6 run stress-tests/massive-stress-test.js
 *
 * Purpose: Test API capacity for 5M DAU
 * Duration: ~3 minutes
 * Load: Ramp to 100,000 concurrent users
 *
 * WARNING: This is an EXTREME load test!
 * - Will hit AWS rate limits
 * - May incur significant costs
 * - Only run with approval
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const API_BASE = 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

// Custom metrics
const apiResponding = new Rate('api_responding');
const responseLatency = new Trend('response_latency');
const requestCount = new Counter('total_requests');
const throttledRequests = new Counter('throttled_requests');
const activeVUs = new Gauge('active_vus');

export const options = {
  scenarios: {
    massive_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10000 },   // Ramp to 10K
        { duration: '30s', target: 50000 },   // Ramp to 50K
        { duration: '30s', target: 100000 },  // Ramp to 100K
        { duration: '1m', target: 100000 },   // Hold at 100K
        { duration: '30s', target: 0 },       // Ramp down
      ],
    },
  },
  thresholds: {
    // Very lenient for extreme load
    http_req_duration: ['p(95)<5000'],  // 5 seconds max
    api_responding: ['rate>0.50'],      // At least 50% should respond
  },
  // Prevent test from failing on high error rate
  noConnectionReuse: false,
  userAgent: 'SmuppyLoadTest/1.0',
};

export function setup() {
  console.log('🚀 MASSIVE STRESS TEST STARTING');
  console.log('   Target: 100,000 concurrent users');
  console.log('   Duration: ~3 minutes');
  console.log('   API: ' + API_BASE);
  return { startTime: Date.now() };
}

export default function () {
  activeVUs.add(__VU);

  // Simple feed request
  const res = http.get(`${API_BASE}/feed?limit=10`, {
    headers: { 'Content-Type': 'application/json' },
    timeout: '30s',
    tags: { name: 'feed' },
  });

  requestCount.add(1);

  // Check if API responded (401 is expected, 429 is rate limited, 5xx is error)
  const responded = res.status !== 0;
  const rateLimited = res.status === 429;
  const serverError = res.status >= 500;

  apiResponding.add(responded);

  if (rateLimited) {
    throttledRequests.add(1);
  }

  if (responded && !serverError) {
    responseLatency.add(res.timings.duration);
  }

  check(res, {
    'got response': (r) => r.status !== 0,
    'not server error': (r) => r.status < 500,
    'response time < 5s': (r) => r.timings.duration < 5000,
  });

  // Very short sleep for max throughput
  sleep(Math.random() * 0.1);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n🏁 Test completed in ${duration.toFixed(0)} seconds`);
}

export function handleSummary(data) {
  const summary = generateMassiveSummary(data);

  return {
    'stress-tests/results/massive-test-summary.json': JSON.stringify(data, null, 2),
    stdout: summary,
  };
}

function generateMassiveSummary(data) {
  const m = data.metrics;
  let s = '\n';
  s += '╔════════════════════════════════════════════════════════════════════════════╗\n';
  s += '║                    🚀 MASSIVE STRESS TEST RESULTS 🚀                       ║\n';
  s += '║                        100,000 Virtual Users                               ║\n';
  s += '╠════════════════════════════════════════════════════════════════════════════╣\n';
  s += `║  Total Requests:            ${(m.http_reqs?.values?.count || 0).toString().padStart(15)}                        ║\n`;
  s += `║  Peak Request Rate:         ${(m.http_reqs?.values?.rate || 0).toFixed(2).padStart(15)} req/s                   ║\n`;
  s += `║  API Responding:            ${((m.api_responding?.values?.rate || 0) * 100).toFixed(2).padStart(15)}%                      ║\n`;
  s += `║  Throttled (429):           ${(m.throttled_requests?.values?.count || 0).toString().padStart(15)}                        ║\n`;
  s += '╠════════════════════════════════════════════════════════════════════════════╣\n';
  s += '║  Response Times:                                                           ║\n';
  s += `║    Average:                 ${(m.response_latency?.values?.avg || 0).toFixed(2).padStart(15)} ms                    ║\n`;
  s += `║    P50:                     ${(m.response_latency?.values?.['p(50)'] || 0).toFixed(2).padStart(15)} ms                    ║\n`;
  s += `║    P90:                     ${(m.response_latency?.values?.['p(90)'] || 0).toFixed(2).padStart(15)} ms                    ║\n`;
  s += `║    P95:                     ${(m.response_latency?.values?.['p(95)'] || 0).toFixed(2).padStart(15)} ms                    ║\n`;
  s += `║    P99:                     ${(m.response_latency?.values?.['p(99)'] || 0).toFixed(2).padStart(15)} ms                    ║\n`;
  s += `║    Max:                     ${(m.response_latency?.values?.max || 0).toFixed(2).padStart(15)} ms                    ║\n`;
  s += '╚════════════════════════════════════════════════════════════════════════════╝\n';

  // Capacity Analysis
  s += '\n📊 CAPACITY ANALYSIS:\n';

  const reqRate = m.http_reqs?.values?.rate || 0;
  const respondingRate = (m.api_responding?.values?.rate || 0) * 100;
  const throttled = m.throttled_requests?.values?.count || 0;
  const p95 = m.response_latency?.values?.['p(95)'] || 0;

  s += `   Peak throughput: ${reqRate.toFixed(0)} req/s\n`;
  s += `   Response rate: ${respondingRate.toFixed(1)}%\n`;
  s += `   Throttled requests: ${throttled}\n`;
  s += `   P95 latency: ${p95.toFixed(0)}ms\n`;

  // Estimate DAU capacity
  // Assuming average user makes 50 requests per session, 10% concurrent at peak
  const effectiveRPS = reqRate * (respondingRate / 100);
  const concurrentUsers = effectiveRPS * 2; // ~2s think time
  const estimatedDAU = concurrentUsers * 10;

  s += `\n   📈 ESTIMATED CAPACITY:\n`;
  s += `   - Effective RPS: ${effectiveRPS.toFixed(0)} req/s\n`;
  s += `   - Concurrent Users: ~${concurrentUsers.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} users\n`;
  s += `   - Estimated DAU: ~${(estimatedDAU / 1000000).toFixed(1)}M users\n`;

  // Verdict
  s += '\n';
  if (respondingRate > 90 && p95 < 2000) {
    s += '✅ MASSIVE TEST PASSED\n';
    s += '   - API handles extreme load\n';
    s += '   - Ready for 5M+ DAU\n';
  } else if (respondingRate > 50) {
    s += '⚠️  MASSIVE TEST WARNING\n';
    s += '   - API partially handles load\n';
    s += '   - Need Lambda concurrency increase for 5M DAU\n';
  } else {
    s += '❌ MASSIVE TEST FAILED\n';
    s += '   - API overwhelmed\n';
    s += '   - Significant scaling required\n';
  }

  // Recommendations
  s += '\n📋 RECOMMENDATIONS:\n';
  if (throttled > 0) {
    s += '   1. Increase API Gateway rate limits\n';
    s += '   2. Request Lambda concurrency increase (AWS Console)\n';
  }
  if (p95 > 1000) {
    s += '   3. Enable provisioned concurrency for Lambda\n';
    s += '   4. Increase Aurora ACU to 256\n';
  }

  return s;
}
