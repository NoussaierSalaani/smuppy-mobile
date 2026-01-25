/**
 * MEGA Stress Test - Target: 100k req/s
 * Run with: k6 run tests/mega-stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const successRate = new Rate('success');
const apiDuration = new Trend('api_duration');
const requestCount = new Counter('total_requests');

// Aggressive test configuration
export const options = {
  scenarios: {
    // Scenario 1: Ramp up to 1000 concurrent users
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },    // Warm up
        { duration: '1m', target: 500 },     // Ramp to 500
        { duration: '1m', target: 1000 },    // Ramp to 1000
        { duration: '2m', target: 1000 },    // Stay at 1000
        { duration: '30s', target: 2000 },   // Spike to 2000
        { duration: '1m', target: 2000 },    // Stay at 2000
        { duration: '30s', target: 0 },      // Ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],  // 95% < 1s, 99% < 2s
    errors: ['rate<0.05'],  // Error rate < 5%
    http_req_failed: ['rate<0.05'],
  },
  // Output to cloud or local
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

const BASE_URL = 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

// Simulated auth token (for testing authenticated endpoints)
const TEST_TOKEN = 'test-token-for-load-testing';

export default function () {
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-test',
    },
    timeout: '10s',
  };

  // Mix of different API calls to simulate real traffic
  const random = Math.random();

  if (random < 0.4) {
    // 40% - Health check (lightest endpoint)
    const res = http.get(`${BASE_URL}/health`, params);
    requestCount.add(1);
    apiDuration.add(res.timings.duration);
    const success = res.status === 200 || res.status === 403 || res.status === 404;
    successRate.add(success);
    errorRate.add(!success && res.status >= 500);
  } else if (random < 0.7) {
    // 30% - API config/public endpoint
    const res = http.get(`${BASE_URL}/api/config`, params);
    requestCount.add(1);
    apiDuration.add(res.timings.duration);
    const success = res.status < 500;
    successRate.add(success);
    errorRate.add(res.status >= 500);
  } else if (random < 0.9) {
    // 20% - Authenticated endpoint (will get 401/403)
    params.headers['Authorization'] = `Bearer ${TEST_TOKEN}`;
    const res = http.get(`${BASE_URL}/api/user/profile`, params);
    requestCount.add(1);
    apiDuration.add(res.timings.duration);
    const success = res.status === 401 || res.status === 403 || res.status === 200;
    successRate.add(success);
    errorRate.add(res.status >= 500);
  } else {
    // 10% - POST request (heavier)
    const res = http.post(`${BASE_URL}/api/auth/check`, JSON.stringify({
      email: `test${Math.floor(Math.random() * 10000)}@test.com`
    }), params);
    requestCount.add(1);
    apiDuration.add(res.timings.duration);
    const success = res.status < 500;
    successRate.add(success);
    errorRate.add(res.status >= 500);
  }

  // Minimal sleep to maximize throughput
  sleep(0.01);  // 10ms between requests per VU
}

export function handleSummary(data) {
  const duration = data.metrics.http_req_duration;
  const reqs = data.metrics.http_reqs;
  const errors = data.metrics.errors;

  const report = `
╔════════════════════════════════════════════════════════════════════════╗
║                    MEGA STRESS TEST RESULTS                            ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                        ║
║  📊 THROUGHPUT                                                         ║
║  ─────────────────────────────────────────────────────────────────     ║
║  Total Requests:        ${reqs ? reqs.values.count.toLocaleString().padStart(12) : 'N/A'}                            ║
║  Requests/sec:          ${reqs ? reqs.values.rate.toFixed(2).padStart(12) : 'N/A'}                            ║
║  Peak VUs:              ${data.metrics.vus_max ? data.metrics.vus_max.values.max.toString().padStart(12) : 'N/A'}                            ║
║                                                                        ║
║  ⏱️  LATENCY                                                           ║
║  ─────────────────────────────────────────────────────────────────     ║
║  Average:               ${duration ? (duration.values.avg).toFixed(2).padStart(12) : 'N/A'} ms                       ║
║  Median (P50):          ${duration ? (duration.values.med).toFixed(2).padStart(12) : 'N/A'} ms                       ║
║  P90:                   ${duration ? (duration.values['p(90)']).toFixed(2).padStart(12) : 'N/A'} ms                       ║
║  P95:                   ${duration ? (duration.values['p(95)']).toFixed(2).padStart(12) : 'N/A'} ms                       ║
║  P99:                   ${duration ? (duration.values['p(99)']).toFixed(2).padStart(12) : 'N/A'} ms                       ║
║  Max:                   ${duration ? (duration.values.max).toFixed(2).padStart(12) : 'N/A'} ms                       ║
║                                                                        ║
║  ✅ SUCCESS RATE                                                       ║
║  ─────────────────────────────────────────────────────────────────     ║
║  Success Rate:          ${data.metrics.success ? ((data.metrics.success.values.rate) * 100).toFixed(2).padStart(11) : 'N/A'}%                       ║
║  Error Rate (5xx):      ${errors ? ((errors.values.rate) * 100).toFixed(2).padStart(11) : '0.00'}%                       ║
║                                                                        ║
╚════════════════════════════════════════════════════════════════════════╝

📈 TO REACH 100K REQ/S:
─────────────────────────────────────────────────────────────────
Current: ${reqs ? reqs.values.rate.toFixed(0) : '0'} req/s
Target:  100,000 req/s
Gap:     ${reqs ? (100000 - reqs.values.rate).toFixed(0) : '100000'} req/s

AWS SCALING RECOMMENDATIONS:
1. API Gateway: Increase throttling limit to 100,000 req/s
2. Lambda: Set reserved concurrency to 10,000+
3. DynamoDB: Enable on-demand or provision 100,000+ RCU/WCU
4. CloudFront: Enable caching for read endpoints
5. Consider AWS Global Accelerator for global distribution
`;

  return {
    'tests/mega-stress-results.json': JSON.stringify(data, null, 2),
    stdout: report,
  };
}
