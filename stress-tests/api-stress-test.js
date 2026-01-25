/**
 * Smuppy API Stress Test
 *
 * Run with: k6 run api-stress-test.js
 *
 * Environment variables:
 *   SUPABASE_ANON_KEY - Your Supabase anon key
 *   TEST_TYPE - smoke, load, stress, spike, or soak
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const feedLatency = new Trend('feed_latency');
const authLatency = new Trend('auth_latency');
const profileLatency = new Trend('profile_latency');
const successfulLogins = new Counter('successful_logins');

// Configuration
const SUPABASE_URL = 'https://wbgfaeytioxnkdsuvvlx.supabase.co';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

// Test type from environment
const TEST_TYPE = __ENV.TEST_TYPE || 'smoke';

// Scenario configurations
const scenarios = {
  smoke: {
    vus: 5,
    duration: '30s',
  },
  load: {
    vus: 100,
    duration: '5m',
  },
  stress: {
    stages: [
      { duration: '2m', target: 100 },
      { duration: '5m', target: 500 },
      { duration: '2m', target: 1000 },
      { duration: '5m', target: 1000 },
      { duration: '2m', target: 0 },
    ],
  },
  spike: {
    stages: [
      { duration: '1m', target: 50 },
      { duration: '10s', target: 1000 },
      { duration: '2m', target: 1000 },
      { duration: '10s', target: 50 },
      { duration: '1m', target: 0 },
    ],
  },
  soak: {
    vus: 200,
    duration: '30m',
  },
};

// Export options based on test type
export const options = {
  ...scenarios[TEST_TYPE],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
};

// Headers for Supabase requests
const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// Helper function for API calls
function supabaseGet(endpoint, customHeaders = {}) {
  const url = `${SUPABASE_URL}/rest/v1${endpoint}`;
  return http.get(url, { headers: { ...headers, ...customHeaders } });
}

function supabasePost(endpoint, body, customHeaders = {}) {
  const url = `${SUPABASE_URL}/rest/v1${endpoint}`;
  return http.post(url, JSON.stringify(body), { headers: { ...headers, ...customHeaders } });
}

function supabaseRpc(functionName, params = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${functionName}`;
  return http.post(url, JSON.stringify(params), { headers });
}

// Setup function - runs once before the test
export function setup() {
  console.log(`\n🚀 Starting ${TEST_TYPE.toUpperCase()} test for Smuppy`);
  console.log(`📍 Target: ${SUPABASE_URL}`);

  // Verify connection
  const res = supabaseGet('/profiles?limit=1');
  if (res.status !== 200) {
    console.error('❌ Cannot connect to Supabase!');
    console.error(`Status: ${res.status}, Body: ${res.body}`);
  } else {
    console.log('✅ Connection verified');
  }

  return { startTime: new Date().toISOString() };
}

// Main test function - runs for each VU
export default function () {
  // Simulate real user behavior with different actions
  const actions = [
    { weight: 30, fn: testFeed },        // 30% - Browse feed
    { weight: 25, fn: testProfiles },    // 25% - View profiles
    { weight: 20, fn: testPosts },       // 20% - View posts
    { weight: 10, fn: testSearch },      // 10% - Search
    { weight: 10, fn: testPeaks },       // 10% - View peaks
    { weight: 5, fn: testMessages },     // 5% - Messages
  ];

  // Weighted random selection
  const random = Math.random() * 100;
  let cumulative = 0;

  for (const action of actions) {
    cumulative += action.weight;
    if (random <= cumulative) {
      action.fn();
      break;
    }
  }

  // Think time - simulates user reading/scrolling
  sleep(Math.random() * 3 + 1); // 1-4 seconds
}

// Test: Load Feed (most common action)
function testFeed() {
  group('Feed', () => {
    const start = Date.now();

    // Get posts from followed users
    const res = supabaseGet('/posts?select=*,author:profiles(id,username,full_name,avatar_url,is_verified)&order=created_at.desc&limit=10');

    feedLatency.add(Date.now() - start);

    const success = check(res, {
      'feed status is 200': (r) => r.status === 200,
      'feed has data': (r) => {
        try {
          const data = JSON.parse(r.body);
          return Array.isArray(data);
        } catch {
          return false;
        }
      },
      'feed response time < 500ms': (r) => r.timings.duration < 500,
    });

    errorRate.add(!success);
  });
}

// Test: View Profiles
function testProfiles() {
  group('Profiles', () => {
    const start = Date.now();

    // Get random profiles
    const res = supabaseGet('/profiles?select=*&limit=20&order=created_at.desc');

    profileLatency.add(Date.now() - start);

    const success = check(res, {
      'profiles status is 200': (r) => r.status === 200,
      'profiles response time < 300ms': (r) => r.timings.duration < 300,
    });

    errorRate.add(!success);

    // Simulate viewing a specific profile
    if (res.status === 200) {
      try {
        const profiles = JSON.parse(res.body);
        if (profiles.length > 0) {
          const randomProfile = profiles[Math.floor(Math.random() * profiles.length)];
          const profileRes = supabaseGet(`/profiles?id=eq.${randomProfile.id}&select=*`);

          check(profileRes, {
            'single profile loads': (r) => r.status === 200,
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  });
}

// Test: View Posts
function testPosts() {
  group('Posts', () => {
    const res = supabaseGet('/posts?select=*,author:profiles(id,username,avatar_url)&limit=20&order=created_at.desc');

    const success = check(res, {
      'posts status is 200': (r) => r.status === 200,
      'posts response time < 400ms': (r) => r.timings.duration < 400,
    });

    errorRate.add(!success);

    // Simulate viewing post details + comments
    if (res.status === 200) {
      try {
        const posts = JSON.parse(res.body);
        if (posts.length > 0) {
          const randomPost = posts[Math.floor(Math.random() * posts.length)];

          // Get post comments
          const commentsRes = supabaseGet(`/comments?post_id=eq.${randomPost.id}&select=*,author:profiles(id,username,avatar_url)&limit=20`);

          check(commentsRes, {
            'comments load': (r) => r.status === 200,
          });

          // Get post likes count
          const likesRes = supabaseGet(`/likes?post_id=eq.${randomPost.id}&select=count`);

          check(likesRes, {
            'likes count loads': (r) => r.status === 200,
          });
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  });
}

// Test: Search
function testSearch() {
  group('Search', () => {
    const searchTerms = ['fitness', 'gym', 'workout', 'muscle', 'cardio', 'yoga'];
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    // Search profiles
    const profilesRes = supabaseGet(`/profiles?or=(username.ilike.*${term}*,full_name.ilike.*${term}*)&limit=20`);

    const success = check(profilesRes, {
      'search status is 200': (r) => r.status === 200,
      'search response time < 500ms': (r) => r.timings.duration < 500,
    });

    errorRate.add(!success);

    // Search posts by tags
    const postsRes = supabaseGet(`/posts?tags=cs.{${term}}&limit=20`);

    check(postsRes, {
      'post search works': (r) => r.status === 200,
    });
  });
}

// Test: Peaks (short videos)
function testPeaks() {
  group('Peaks', () => {
    const res = supabaseGet('/peaks?select=*,author:profiles(id,username,avatar_url,is_verified)&order=created_at.desc&limit=10');

    const success = check(res, {
      'peaks status is 200': (r) => r.status === 200,
      'peaks response time < 400ms': (r) => r.timings.duration < 400,
    });

    errorRate.add(!success);
  });
}

// Test: Messages/Conversations
function testMessages() {
  group('Messages', () => {
    // This would normally require authentication
    // For now, just test the endpoint availability
    const res = supabaseGet('/conversations?select=*&limit=10');

    // We expect 401 or empty result without auth
    const success = check(res, {
      'conversations endpoint responds': (r) => r.status === 200 || r.status === 401,
    });

    errorRate.add(!success);
  });
}

// Teardown function - runs once after the test
export function teardown(data) {
  console.log(`\n📊 Test completed!`);
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}
