/**
 * Stress Test - Beyond Normal Capacity
 * Run: k6 run stress-tests/stress-test.js
 *
 * Purpose: Find the breaking point of the API
 * Duration: ~26 minutes
 * Load: Up to 500 concurrent users
 *
 * WARNING: This test will push the API to its limits.
 * Only run on staging environment!
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

const API_BASE = 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

// Custom metrics
const errorRate = new Rate('errors');
const feedLatency = new Trend('feed_latency');
const postsLatency = new Trend('posts_latency');
const apiCalls = new Counter('api_calls');
const activeUsers = new Gauge('active_users');

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up
    { duration: '3m', target: 100 },   // Hold
    { duration: '2m', target: 200 },   // Increase
    { duration: '3m', target: 200 },   // Hold
    { duration: '2m', target: 300 },   // Increase
    { duration: '3m', target: 300 },   // Hold
    { duration: '2m', target: 400 },   // Increase
    { duration: '3m', target: 400 },   // Hold
    { duration: '2m', target: 500 },   // Peak
    { duration: '3m', target: 500 },   // Hold at peak
    { duration: '3m', target: 0 },     // Ramp down
  ],
  thresholds: {
    // More lenient thresholds for stress test
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    http_req_failed: ['rate<0.05'],  // Allow 5% error rate under stress
    errors: ['rate<0.05'],
  },
};

export function setup() {
  console.log('Starting stress test...');
  console.log('API Base URL:', API_BASE);
  console.log('Max VUs: 500');
  return { startTime: Date.now() };
}

export default function (data) {
  activeUsers.add(__VU);

  // Simulate realistic user behavior under stress
  const scenario = Math.random();

  if (scenario < 0.5) {
    // 50% - Feed operations (most critical)
    testFeed();
  } else if (scenario < 0.75) {
    // 25% - Posts/Peaks
    testPosts();
  } else {
    // 25% - Profile operations
    testProfiles();
  }

  // Shorter sleep under stress (users are impatient)
  sleep(Math.random() * 1 + 0.5);
}

function testFeed() {
  const res = http.get(`${API_BASE}/feed?limit=20`, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'feed', scenario: 'stress' },
    timeout: '10s',
  });

  const success = check(res, {
    'feed status OK': (r) => [200, 401, 429].includes(r.status),
    'feed not timeout': (r) => r.timings.duration < 5000,
  });

  errorRate.add(!success);
  feedLatency.add(res.timings.duration);
  apiCalls.add(1);

  // Check for rate limiting
  if (res.status === 429) {
    console.log(`Rate limited at VU ${__VU}`);
  }
}

function testPosts() {
  group('Posts Under Stress', function () {
    // Posts list
    const postsRes = http.get(`${API_BASE}/posts?limit=10`, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'posts', scenario: 'stress' },
      timeout: '10s',
    });

    check(postsRes, {
      'posts status OK': (r) => [200, 401, 429].includes(r.status),
    });

    postsLatency.add(postsRes.timings.duration);
    apiCalls.add(1);

    // Peaks
    const peaksRes = http.get(`${API_BASE}/peaks?limit=5`, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'peaks', scenario: 'stress' },
      timeout: '10s',
    });

    check(peaksRes, {
      'peaks status OK': (r) => [200, 401, 429].includes(r.status),
    });

    apiCalls.add(1);
  });
}

function testProfiles() {
  const res = http.get(`${API_BASE}/profiles/search?q=test&limit=5`, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'profile_search', scenario: 'stress' },
    timeout: '10s',
  });

  check(res, {
    'search status OK': (r) => [200, 401, 429].includes(r.status),
  });

  apiCalls.add(1);
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Stress test completed in ${duration.toFixed(0)} seconds`);
}

export function handleSummary(data) {
  const summary = generateStressSummary(data);

  return {
    'stress-tests/results/stress-test-summary.json': JSON.stringify(data, null, 2),
    stdout: summary,
  };
}

function generateStressSummary(data) {
  const m = data.metrics;
  let s = '\n';
  s += '╔══════════════════════════════════════════════════════════════════════╗\n';
  s += '║                       STRESS TEST RESULTS                            ║\n';
  s += '║                    (500 Concurrent Users Peak)                       ║\n';
  s += '╠══════════════════════════════════════════════════════════════════════╣\n';
  s += `║  Total Requests:         ${(m.http_reqs?.values?.count || 0).toString().padStart(12)}                        ║\n`;
  s += `║  Peak Request Rate:      ${(m.http_reqs?.values?.rate || 0).toFixed(2).padStart(12)} req/s                    ║\n`;
  s += `║  Total API Calls:        ${(m.api_calls?.values?.count || 0).toString().padStart(12)}                        ║\n`;
  s += `║  Error Rate:             ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2).padStart(12)}%                       ║\n`;
  s += '╠══════════════════════════════════════════════════════════════════════╣\n';
  s += '║  Response Times:                                                     ║\n';
  s += `║    Average:              ${(m.http_req_duration?.values?.avg || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P50:                  ${(m.http_req_duration?.values?.['p(50)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P90:                  ${(m.http_req_duration?.values?.['p(90)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P95:                  ${(m.http_req_duration?.values?.['p(95)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P99:                  ${(m.http_req_duration?.values?.['p(99)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    Max:                  ${(m.http_req_duration?.values?.max || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += '╠══════════════════════════════════════════════════════════════════════╣\n';
  s += '║  Feed Performance:                                                   ║\n';
  s += `║    Avg:                  ${(m.feed_latency?.values?.avg || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += `║    P95:                  ${(m.feed_latency?.values?.['p(95)'] || 0).toFixed(2).padStart(12)} ms                     ║\n`;
  s += '╚══════════════════════════════════════════════════════════════════════╝\n';

  // Analysis
  s += '\n📊 ANALYSIS:\n';

  const p95 = m.http_req_duration?.values?.['p(95)'] || 0;
  const p99 = m.http_req_duration?.values?.['p(99)'] || 0;
  const errorRate = (m.http_req_failed?.values?.rate || 0) * 100;
  const reqRate = m.http_reqs?.values?.rate || 0;

  s += `   - Peak throughput: ${reqRate.toFixed(0)} req/s\n`;
  s += `   - P95 latency: ${p95.toFixed(0)}ms\n`;
  s += `   - P99 latency: ${p99.toFixed(0)}ms\n`;
  s += `   - Error rate: ${errorRate.toFixed(2)}%\n`;

  // Capacity estimate
  const estimatedConcurrentUsers = reqRate * 2; // Assuming 0.5s avg think time
  s += `\n   Estimated concurrent user capacity: ~${estimatedConcurrentUsers.toFixed(0)} users\n`;

  // DAU estimate (assuming 10% concurrent at peak)
  const estimatedDAU = estimatedConcurrentUsers * 10;
  s += `   Estimated DAU capacity: ~${(estimatedDAU / 1000).toFixed(0)}K DAU\n`;

  // Verdict
  s += '\n';
  if (p95 < 1000 && errorRate < 5) {
    s += '✅ STRESS TEST PASSED - API handles 500 concurrent users\n';
    s += '   Ready for production scaling!\n';
  } else if (p95 < 2000 && errorRate < 10) {
    s += '⚠️  STRESS TEST WARNING - Performance degradation at high load\n';
    s += '   Consider increasing Lambda concurrency before scaling.\n';
  } else {
    s += '❌ STRESS TEST FAILED - Breaking point reached\n';
    s += '   Scaling issues need to be addressed.\n';
  }

  return s;
}
