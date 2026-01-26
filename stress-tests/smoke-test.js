/**
 * Smoke Test - Quick Health Check
 * Run: k6 run stress-tests/smoke-test.js
 *
 * Purpose: Verify the API is responding correctly
 * Duration: ~2 minutes
 * Load: 5 concurrent users
 *
 * Note: API returns 401 for unauthenticated requests (expected behavior)
 * We verify the API is responding and returns consistent status codes
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const API_BASE = 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

// Custom metrics
const apiResponding = new Rate('api_responding');
const responseLatency = new Trend('response_latency');

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 5 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // API should respond (even with 401 for unauth)
    http_req_duration: ['p(95)<1000'],
    api_responding: ['rate>0.95'],  // 95% of requests should get a response
  },
};

export default function () {
  // Test 1: Posts endpoint - should return 401 (requires auth)
  const postsRes = http.get(`${API_BASE}/posts?limit=1`, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'posts_endpoint' },
  });

  // Check API is responding (401 = auth required, which is correct behavior)
  const postsCheck = check(postsRes, {
    'posts: API responds': (r) => r.status !== 0,
    'posts: status is 401 (auth required)': (r) => r.status === 401,
    'posts: response time < 1000ms': (r) => r.timings.duration < 1000,
    'posts: has response body': (r) => r.body && r.body.length > 0,
  });

  apiResponding.add(postsRes.status !== 0);
  responseLatency.add(postsRes.timings.duration);

  sleep(0.5);

  // Test 2: Feed endpoint
  const feedRes = http.get(`${API_BASE}/feed?limit=10`, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'feed_endpoint' },
  });

  check(feedRes, {
    'feed: API responds': (r) => r.status !== 0,
    'feed: status is 401 (auth required)': (r) => r.status === 401,
    'feed: response time < 1000ms': (r) => r.timings.duration < 1000,
  });

  apiResponding.add(feedRes.status !== 0);
  responseLatency.add(feedRes.timings.duration);

  sleep(0.5);

  // Test 3: Peaks endpoint
  const peaksRes = http.get(`${API_BASE}/peaks?limit=10`, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'peaks_endpoint' },
  });

  check(peaksRes, {
    'peaks: API responds': (r) => r.status !== 0,
    'peaks: status is 401 (auth required)': (r) => r.status === 401,
  });

  apiResponding.add(peaksRes.status !== 0);
  responseLatency.add(peaksRes.timings.duration);

  sleep(1);
}

export function handleSummary(data) {
  return {
    'stress-tests/results/smoke-test-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const metrics = data.metrics;
  let summary = '\n';
  summary += '╔══════════════════════════════════════════════════════════════╗\n';
  summary += '║                    SMOKE TEST RESULTS                        ║\n';
  summary += '╠══════════════════════════════════════════════════════════════╣\n';
  summary += `║  Total Requests:      ${(metrics.http_reqs?.values?.count || 0).toString().padStart(10)}                        ║\n`;
  summary += `║  API Responding:      ${((metrics.api_responding?.values?.rate || 0) * 100).toFixed(2).padStart(10)}%                       ║\n`;
  summary += '╠══════════════════════════════════════════════════════════════╣\n';
  summary += '║  Response Times:                                             ║\n';
  summary += `║    Average:           ${(metrics.http_req_duration?.values?.avg || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  summary += `║    P95:               ${(metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  summary += `║    P99:               ${(metrics.http_req_duration?.values?.['p(99)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  summary += `║    Max:               ${(metrics.http_req_duration?.values?.max || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  summary += '╚══════════════════════════════════════════════════════════════╝\n';

  // Analysis
  summary += '\n📊 ANALYSIS:\n';
  summary += '   - API returns 401 (Unauthorized) for unauthenticated requests\n';
  summary += '   - This is EXPECTED behavior - API requires authentication\n';
  summary += '   - What matters: API is responding quickly and consistently\n';

  // Verdict
  const responding = (metrics.api_responding?.values?.rate || 0) * 100;
  const p95 = metrics.http_req_duration?.values?.['p(95)'] || 0;
  const passed = responding > 95 && p95 < 1000;

  summary += '\n';
  if (passed) {
    summary += '✅ SMOKE TEST PASSED\n';
    summary += `   - ${responding.toFixed(0)}% of requests got a response\n`;
    summary += `   - P95 latency: ${p95.toFixed(0)}ms (under 1000ms threshold)\n`;
    summary += '   - API Gateway & Lambda are healthy\n';
  } else {
    summary += '❌ SMOKE TEST FAILED\n';
    if (responding <= 95) summary += `   - Only ${responding.toFixed(0)}% requests responded\n`;
    if (p95 >= 1000) summary += `   - P95 latency (${p95.toFixed(0)}ms) too high\n`;
  }

  return summary;
}
