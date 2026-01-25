/**
 * Smuppy Realtime (WebSocket) Stress Test
 *
 * Tests concurrent WebSocket connections for:
 * - Chat messages
 * - Notifications
 * - Live updates
 *
 * Run with: k6 run realtime-stress-test.js
 */

import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const wsConnectionErrors = new Rate('ws_connection_errors');
const wsMessageLatency = new Trend('ws_message_latency');
const wsConnections = new Counter('ws_connections');
const wsMessages = new Counter('ws_messages');

// Configuration
const SUPABASE_URL = 'wbgfaeytioxnkdsuvvlx.supabase.co';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

// Test type
const TEST_TYPE = __ENV.TEST_TYPE || 'smoke';

// Scenario configurations for WebSocket tests
const scenarios = {
  smoke: {
    vus: 10,
    duration: '30s',
  },
  load: {
    vus: 200,
    duration: '5m',
  },
  stress: {
    stages: [
      { duration: '1m', target: 100 },
      { duration: '3m', target: 500 },
      { duration: '2m', target: 1000 },
      { duration: '3m', target: 1000 },
      { duration: '1m', target: 0 },
    ],
  },
  concurrent: {
    // Test maximum concurrent connections
    stages: [
      { duration: '30s', target: 200 },
      { duration: '1m', target: 500 },
      { duration: '1m', target: 1000 },
      { duration: '1m', target: 2000 },
      { duration: '2m', target: 2000 },
      { duration: '30s', target: 0 },
    ],
  },
};

export const options = {
  ...scenarios[TEST_TYPE],
  thresholds: {
    ws_connection_errors: ['rate<0.1'],  // Less than 10% connection failures
    ws_message_latency: ['p(95)<1000'],   // 95% messages < 1s
  },
};

// WebSocket URL for Supabase Realtime
const WS_URL = `wss://${SUPABASE_URL}/realtime/v1/websocket?apikey=${SUPABASE_ANON_KEY}&vsn=1.0.0`;

export function setup() {
  console.log(`\n🔌 Starting Realtime ${TEST_TYPE.toUpperCase()} test`);
  console.log(`📍 Target: wss://${SUPABASE_URL}`);
  return { startTime: new Date().toISOString() };
}

export default function () {
  const vuId = __VU;
  const iterationId = __ITER;

  // Connect to Supabase Realtime
  const res = ws.connect(WS_URL, {}, function (socket) {
    wsConnections.add(1);

    socket.on('open', () => {
      // Join a channel (simulate subscribing to updates)
      const joinMessage = JSON.stringify({
        topic: `realtime:public:posts`,
        event: 'phx_join',
        payload: {},
        ref: `${vuId}-${iterationId}`,
      });

      socket.send(joinMessage);

      // Send heartbeat to keep connection alive
      socket.setInterval(() => {
        socket.send(JSON.stringify({
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: `hb-${vuId}`,
        }));
      }, 30000); // Every 30 seconds
    });

    socket.on('message', (msg) => {
      wsMessages.add(1);

      try {
        const data = JSON.parse(msg);

        check(data, {
          'message has topic': (d) => d.topic !== undefined,
          'message has event': (d) => d.event !== undefined,
        });

        // Track latency for broadcast messages
        if (data.event === 'broadcast') {
          const now = Date.now();
          if (data.payload && data.payload.timestamp) {
            wsMessageLatency.add(now - data.payload.timestamp);
          }
        }
      } catch (e) {
        // Ignore parse errors for non-JSON messages
      }
    });

    socket.on('error', (e) => {
      wsConnectionErrors.add(1);
      console.error(`WebSocket error: ${e}`);
    });

    socket.on('close', () => {
      // Connection closed
    });

    // Keep connection open for the duration
    // Simulate a user staying connected
    sleep(Math.random() * 60 + 30); // 30-90 seconds

    // Leave channel before closing
    socket.send(JSON.stringify({
      topic: `realtime:public:posts`,
      event: 'phx_leave',
      payload: {},
      ref: `leave-${vuId}`,
    }));

    socket.close();
  });

  check(res, {
    'WebSocket connection successful': (r) => r && r.status === 101,
  });

  if (!res || res.status !== 101) {
    wsConnectionErrors.add(1);
  }
}

export function teardown(data) {
  console.log(`\n📊 Realtime test completed!`);
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}
