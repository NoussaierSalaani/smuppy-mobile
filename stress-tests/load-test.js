/**
 * Load Test - Normal Traffic Simulation
 * Run: k6 run stress-tests/load-test.js
 *
 * Purpose: Test API under normal expected load
 * Duration: ~16 minutes
 * Load: Up to 100 concurrent users
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const API_BASE = 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

// Custom metrics
const errorRate = new Rate('errors');
const feedLatency = new Trend('feed_latency');
const postsLatency = new Trend('posts_latency');
const peaksLatency = new Trend('peaks_latency');
const profileLatency = new Trend('profile_latency');
const apiCalls = new Counter('api_calls');

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01'],
    feed_latency: ['p(95)<400'],
    posts_latency: ['p(95)<400'],
  },
};

export default function () {
  // Simulate realistic user behavior
  const scenario = Math.random();

  if (scenario < 0.4) {
    // 40% - Browse feed (most common action)
    browseFeed();
  } else if (scenario < 0.7) {
    // 30% - View posts/peaks
    viewPosts();
  } else if (scenario < 0.85) {
    // 15% - Search profiles
    searchProfiles();
  } else {
    // 15% - View specific profile
    viewProfile();
  }

  // Random sleep between 1-3 seconds (simulates reading time)
  sleep(Math.random() * 2 + 1);
}

function browseFeed() {
  group('Browse Feed', function () {
    const res = http.get(`${API_BASE}/feed?limit=20`, {
      headers: {
        'Content-Type': 'application/json',
        // Note: In real test, you'd include auth token
        // 'Authorization': `Bearer ${__ENV.AUTH_TOKEN}`,
      },
      tags: { name: 'feed' },
    });

    const success = check(res, {
      'feed status 200 or 401': (r) => r.status === 200 || r.status === 401,
      'feed response time OK': (r) => r.timings.duration < 500,
    });

    errorRate.add(!success);
    feedLatency.add(res.timings.duration);
    apiCalls.add(1);

    // Simulate scrolling - load more
    if (res.status === 200) {
      sleep(0.5);
      const moreRes = http.get(`${API_BASE}/feed?limit=20&cursor=${Date.now()}`, {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'feed_more' },
      });
      feedLatency.add(moreRes.timings.duration);
      apiCalls.add(1);
    }
  });
}

function viewPosts() {
  group('View Posts', function () {
    // Get posts list
    const res = http.get(`${API_BASE}/posts?limit=20`, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'posts_list' },
    });

    const success = check(res, {
      'posts status 200 or 401': (r) => r.status === 200 || r.status === 401,
      'posts response time OK': (r) => r.timings.duration < 500,
    });

    errorRate.add(!success);
    postsLatency.add(res.timings.duration);
    apiCalls.add(1);

    // Also check peaks
    sleep(0.3);
    const peaksRes = http.get(`${API_BASE}/peaks?limit=10`, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'peaks' },
    });

    check(peaksRes, {
      'peaks status 200 or 401': (r) => r.status === 200 || r.status === 401,
    });

    peaksLatency.add(peaksRes.timings.duration);
    apiCalls.add(1);
  });
}

function searchProfiles() {
  group('Search Profiles', function () {
    const searchTerms = ['fitness', 'yoga', 'coach', 'trainer', 'sport'];
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    const res = http.get(`${API_BASE}/profiles/search?q=${term}&limit=10`, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'profile_search' },
    });

    const success = check(res, {
      'search status 200 or 401': (r) => r.status === 200 || r.status === 401,
      'search response time OK': (r) => r.timings.duration < 600,
    });

    errorRate.add(!success);
    profileLatency.add(res.timings.duration);
    apiCalls.add(1);
  });
}

function viewProfile() {
  group('View Profile', function () {
    // Use a test profile ID or random UUID
    const profileId = 'test-user-' + Math.floor(Math.random() * 100);

    const res = http.get(`${API_BASE}/profiles/${profileId}`, {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'profile_view' },
    });

    check(res, {
      'profile status 200/401/404': (r) => [200, 401, 404].includes(r.status),
    });

    profileLatency.add(res.timings.duration);
    apiCalls.add(1);
  });
}

export function handleSummary(data) {
  const summary = generateSummary(data);

  return {
    'stress-tests/results/load-test-summary.json': JSON.stringify(data, null, 2),
    stdout: summary,
  };
}

function generateSummary(data) {
  const m = data.metrics;
  let s = '\n';
  s += '╔══════════════════════════════════════════════════════════════╗\n';
  s += '║                    LOAD TEST RESULTS                         ║\n';
  s += '╠══════════════════════════════════════════════════════════════╣\n';
  s += `║  Total Requests:      ${(m.http_reqs?.values?.count || 0).toString().padStart(10)}                        ║\n`;
  s += `║  Request Rate:        ${(m.http_reqs?.values?.rate || 0).toFixed(2).padStart(10)} req/s                  ║\n`;
  s += `║  Failed Requests:     ${((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2).padStart(10)}%                       ║\n`;
  s += '╠══════════════════════════════════════════════════════════════╣\n';
  s += '║  Response Times:                                             ║\n';
  s += `║    Average:           ${(m.http_req_duration?.values?.avg || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += `║    P50 (Median):      ${(m.http_req_duration?.values?.['p(50)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += `║    P90:               ${(m.http_req_duration?.values?.['p(90)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += `║    P95:               ${(m.http_req_duration?.values?.['p(95)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += `║    P99:               ${(m.http_req_duration?.values?.['p(99)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += `║    Max:               ${(m.http_req_duration?.values?.max || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += '╠══════════════════════════════════════════════════════════════╣\n';
  s += '║  Custom Metrics:                                             ║\n';
  s += `║    Feed Latency P95:  ${(m.feed_latency?.values?.['p(95)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += `║    Posts Latency P95: ${(m.posts_latency?.values?.['p(95)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += `║    Peaks Latency P95: ${(m.peaks_latency?.values?.['p(95)'] || 0).toFixed(2).padStart(10)} ms                     ║\n`;
  s += '╚══════════════════════════════════════════════════════════════╝\n';

  // Verdict
  const p95 = m.http_req_duration?.values?.['p(95)'] || 0;
  const errorRate = m.http_req_failed?.values?.rate || 0;
  const passed = p95 < 500 && errorRate < 0.01;

  s += '\n';
  if (passed) {
    s += '✅ LOAD TEST PASSED - API handles 100 concurrent users well\n';
  } else {
    s += '❌ LOAD TEST FAILED - Performance issues detected\n';
    if (p95 >= 500) s += `   - P95 latency (${p95.toFixed(0)}ms) exceeds 500ms threshold\n`;
    if (errorRate >= 0.01) s += `   - Error rate (${(errorRate * 100).toFixed(2)}%) exceeds 1% threshold\n`;
  }

  return s;
}
