// Stress Test Configuration for Smuppy
// Using k6 - https://k6.io

export const CONFIG = {
  // Supabase Configuration
  SUPABASE_URL: 'https://wbgfaeytioxnkdsuvvlx.supabase.co',
  SUPABASE_ANON_KEY: '__ENV.SUPABASE_ANON_KEY', // Pass via environment variable

  // Test User Credentials (create test users in Supabase)
  TEST_USERS: [
    { email: 'stress_test_1@smuppy.test', password: 'StressTest123!' },
    { email: 'stress_test_2@smuppy.test', password: 'StressTest123!' },
    { email: 'stress_test_3@smuppy.test', password: 'StressTest123!' },
  ],

  // Endpoints to test
  ENDPOINTS: {
    // Auth
    LOGIN: '/auth/v1/token?grant_type=password',
    SIGNUP: '/auth/v1/signup',

    // REST API
    PROFILES: '/rest/v1/profiles',
    POSTS: '/rest/v1/posts',
    FOLLOWS: '/rest/v1/follows',
    LIKES: '/rest/v1/likes',
    COMMENTS: '/rest/v1/comments',
    CONVERSATIONS: '/rest/v1/conversations',
    MESSAGES: '/rest/v1/messages',
    PEAKS: '/rest/v1/peaks',

    // RPC Functions
    RPC_FEED: '/rest/v1/rpc/get_feed',
    RPC_SUGGESTIONS: '/rest/v1/rpc/get_suggestions',
  },

  // Test Scenarios
  SCENARIOS: {
    // Smoke test - verify system works
    smoke: {
      vus: 5,
      duration: '30s',
    },
    // Load test - normal expected load
    load: {
      vus: 100,
      duration: '5m',
    },
    // Stress test - find breaking point
    stress: {
      stages: [
        { duration: '2m', target: 100 },   // Ramp up
        { duration: '5m', target: 500 },   // Stay at 500
        { duration: '2m', target: 1000 },  // Push to 1000
        { duration: '5m', target: 1000 },  // Stay at 1000
        { duration: '2m', target: 0 },     // Ramp down
      ],
    },
    // Spike test - sudden traffic surge
    spike: {
      stages: [
        { duration: '1m', target: 50 },    // Normal load
        { duration: '10s', target: 1000 }, // Spike!
        { duration: '2m', target: 1000 },  // Stay at spike
        { duration: '10s', target: 50 },   // Back to normal
        { duration: '1m', target: 0 },     // Ramp down
      ],
    },
    // Soak test - sustained load over time
    soak: {
      vus: 200,
      duration: '30m',
    },
  },

  // Thresholds (pass/fail criteria)
  THRESHOLDS: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95% < 500ms, 99% < 1s
    http_req_failed: ['rate<0.01'],                   // Less than 1% errors
    http_reqs: ['rate>100'],                          // At least 100 req/s
  },
};
