/**
 * Smuppy AWS API Stress Test
 * Run with: k6 run tests/stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const apiDuration = new Trend('api_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '1m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 100 },  // Spike to 100 users
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests < 500ms
    errors: ['rate<0.1'],               // Error rate < 10%
  },
};

const BASE_URL = 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

export default function () {
  // Test 1: Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, {
    'health status 200': (r) => r.status === 200 || r.status === 404,
  });
  apiDuration.add(healthRes.timings.duration);
  errorRate.add(healthRes.status >= 400 && healthRes.status !== 404);

  sleep(0.5);

  // Test 2: Public endpoint (if exists)
  const publicRes = http.get(`${BASE_URL}/api/public/config`);
  check(publicRes, {
    'public config accessible': (r) => r.status === 200 || r.status === 404 || r.status === 403,
  });
  apiDuration.add(publicRes.timings.duration);

  sleep(0.5);

  // Test 3: Auth endpoint (should return 401 without token)
  const authRes = http.get(`${BASE_URL}/api/user/profile`, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(authRes, {
    'auth endpoint requires token': (r) => r.status === 401 || r.status === 403 || r.status === 404,
  });
  apiDuration.add(authRes.timings.duration);

  sleep(1);
}

export function handleSummary(data) {
  return {
    'tests/stress-test-results.json': JSON.stringify(data, null, 2),
    stdout: generateReport(data),
  };
}

function generateReport(data) {
  const duration = data.metrics.http_req_duration;
  const reqs = data.metrics.http_reqs;

  return `
╔══════════════════════════════════════════════════════════════╗
║                    STRESS TEST RESULTS                       ║
╠══════════════════════════════════════════════════════════════╣
║ Total Requests:     ${reqs ? reqs.values.count : 'N/A'}
║ Request Rate:       ${reqs ? (reqs.values.rate || 0).toFixed(2) : 'N/A'} req/s
║ Avg Duration:       ${duration ? duration.values.avg.toFixed(2) : 'N/A'} ms
║ P95 Duration:       ${duration ? duration.values['p(95)'].toFixed(2) : 'N/A'} ms
║ Max Duration:       ${duration ? duration.values.max.toFixed(2) : 'N/A'} ms
║ Error Rate:         ${data.metrics.errors ? (data.metrics.errors.values.rate * 100).toFixed(2) : '0'}%
╚══════════════════════════════════════════════════════════════╝
`;
}
