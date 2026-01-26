/**
 * K6 Stress Test Configuration
 * Smuppy Mobile API Load Testing
 */

// API Endpoints
export const API_BASE_URL = 'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging';

// Test Users (create test accounts or use existing)
export const TEST_USERS = [
  { email: 'loadtest1@smuppy.com', password: 'LoadTest123!' },
  { email: 'loadtest2@smuppy.com', password: 'LoadTest123!' },
  { email: 'loadtest3@smuppy.com', password: 'LoadTest123!' },
];

// Thresholds for pass/fail criteria
export const THRESHOLDS = {
  // 95% of requests should be below 500ms
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
  // Less than 1% error rate
  http_req_failed: ['rate<0.01'],
  // At least 100 requests per second
  http_reqs: ['rate>100'],
};

// Load stages for different test scenarios
export const LOAD_STAGES = {
  // Smoke test - minimal load
  smoke: [
    { duration: '1m', target: 5 },
    { duration: '1m', target: 5 },
    { duration: '30s', target: 0 },
  ],

  // Load test - normal expected load
  load: [
    { duration: '2m', target: 50 },
    { duration: '5m', target: 50 },
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],

  // Stress test - beyond normal capacity
  stress: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 300 },
    { duration: '5m', target: 400 },
    { duration: '2m', target: 500 },
    { duration: '5m', target: 500 },
    { duration: '5m', target: 0 },
  ],

  // Spike test - sudden traffic spike
  spike: [
    { duration: '1m', target: 50 },
    { duration: '30s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 0 },
  ],

  // Soak test - sustained load over time
  soak: [
    { duration: '5m', target: 200 },
    { duration: '30m', target: 200 },
    { duration: '5m', target: 0 },
  ],
};
