/**
 * k6 Load Test — Smuppy Critical API Endpoints
 *
 * Targets (per PRODUCTION_PLAN.md Phase 1.5):
 *   p95 latency < 200ms
 *   p99 latency < 500ms
 *   Error rate  < 0.1%
 *
 * Usage:
 *   # Install k6: brew install k6
 *   # Run against staging:
 *   k6 run --env BASE_URL=https://api-staging.smuppy.com/api load-tests/k6-critical-endpoints.js
 *
 *   # Run with custom token:
 *   k6 run --env BASE_URL=https://api-staging.smuppy.com/api \
 *          --env AUTH_TOKEN=<cognito-id-token> \
 *          load-tests/k6-critical-endpoints.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom metrics ──────────────────────────────────────────────
const errorRate = new Rate('errors');
const feedLatency = new Trend('feed_latency', true);
const postLatency = new Trend('post_latency', true);
const conversationsLatency = new Trend('conversations_latency', true);
const messagesLatency = new Trend('messages_latency', true);
const uploadUrlLatency = new Trend('upload_url_latency', true);
const searchLatency = new Trend('search_latency', true);

// ── Configuration ───────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'https://api-staging.smuppy.com/api';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';

const headers = {
  'Content-Type': 'application/json',
  ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
};

// ── Setup (validate env) ────────────────────────────────────────
export function setup() {
  if (!AUTH_TOKEN) {
    console.warn('⚠ AUTH_TOKEN not set — authenticated endpoints will return 401');
  }
  if (!__ENV.TEST_CONVERSATION_ID) {
    console.warn('⚠ TEST_CONVERSATION_ID not set — message tests will fail');
  }
  return {};
}

// ── Load profile ────────────────────────────────────────────────
// Ramp up over 1 min, sustain for 3 min, ramp down over 1 min
export const options = {
  stages: [
    { duration: '1m', target: 50 },   // ramp up to 50 VUs
    { duration: '3m', target: 100 },   // sustain at 100 VUs
    { duration: '1m', target: 0 },     // ramp down
  ],
  thresholds: {
    // Global thresholds
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    errors: ['rate<0.001'],  // < 0.1% error rate

    // Per-endpoint thresholds
    feed_latency: ['p(95)<200', 'p(99)<500'],
    post_latency: ['p(95)<300', 'p(99)<600'],
    conversations_latency: ['p(95)<200', 'p(99)<500'],
    messages_latency: ['p(95)<200', 'p(99)<500'],
    upload_url_latency: ['p(95)<300', 'p(99)<600'],
    search_latency: ['p(95)<250', 'p(99)<500'],
  },
};

// ── Test scenarios ──────────────────────────────────────────────

export default function () {
  // Weighted distribution: feed is hit most often (40%), then messages (25%),
  // conversations (15%), search (10%), upload (5%), create post (5%)
  const rand = Math.random();

  if (rand < 0.40) {
    testFeed();
  } else if (rand < 0.65) {
    testSendMessage();
  } else if (rand < 0.80) {
    testConversations();
  } else if (rand < 0.90) {
    testSearch();
  } else if (rand < 0.95) {
    testUploadUrl();
  } else {
    testCreatePost();
  }

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s think time
}

// ── Endpoint tests ──────────────────────────────────────────────

function testFeed() {
  group('GET /posts/feed', () => {
    const res = http.get(`${BASE_URL}/posts/feed?limit=20`, { headers });
    feedLatency.add(res.timings.duration);
    const ok = check(res, {
      'feed: status 200': (r) => r.status === 200,
      'feed: has data': (r) => {
        try { return JSON.parse(r.body).data !== undefined; }
        catch { return false; }
      },
    });
    errorRate.add(!ok);
  });
}

function testConversations() {
  group('GET /conversations', () => {
    const res = http.get(`${BASE_URL}/conversations?limit=20`, { headers });
    conversationsLatency.add(res.timings.duration);
    const ok = check(res, {
      'conversations: status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });
}

function testSendMessage() {
  group('POST /conversations/:id/messages', () => {
    // Use a test conversation ID — replace with a valid one for your staging env
    const conversationId = __ENV.TEST_CONVERSATION_ID || 'test-conv-id';
    const payload = JSON.stringify({
      content: `[LOAD-TEST] message at ${Date.now()}`,
      type: 'text',
    });
    const res = http.post(
      `${BASE_URL}/conversations/${conversationId}/messages`,
      payload,
      { headers },
    );
    messagesLatency.add(res.timings.duration);
    const ok = check(res, {
      'message: status 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    errorRate.add(!ok);
  });
}

function testUploadUrl() {
  group('POST /media/upload-url', () => {
    const payload = JSON.stringify({
      contentType: 'image/jpeg',
      fileName: `loadtest-${Date.now()}.jpg`,
    });
    const res = http.post(`${BASE_URL}/media/upload-url`, payload, { headers });
    uploadUrlLatency.add(res.timings.duration);
    const ok = check(res, {
      'upload-url: status 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    errorRate.add(!ok);
  });
}

function testSearch() {
  group('GET /profiles/search', () => {
    const queries = ['test', 'john', 'user', 'smuppy', 'alex'];
    const q = queries[Math.floor(Math.random() * queries.length)];
    const res = http.get(`${BASE_URL}/profiles/search?q=${q}&limit=10`, { headers });
    searchLatency.add(res.timings.duration);
    const ok = check(res, {
      'search: status 200': (r) => r.status === 200,
    });
    errorRate.add(!ok);
  });
}

function testCreatePost() {
  group('POST /posts', () => {
    const payload = JSON.stringify({
      content: `[LOAD-TEST] post ${Date.now()}`,
      type: 'image',
      media: 'https://cdn.smuppy.com/test/placeholder.jpg',
    });
    const res = http.post(`${BASE_URL}/posts`, payload, { headers });
    postLatency.add(res.timings.duration);
    const ok = check(res, {
      'create-post: status 2xx': (r) => r.status >= 200 && r.status < 300,
    });
    errorRate.add(!ok);
  });
}
