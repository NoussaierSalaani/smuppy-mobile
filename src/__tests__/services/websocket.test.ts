/**
 * WebSocket Service Tests
 *
 * Tests the WebSocketService singleton for connection, messaging,
 * and reconnection logic. All external dependencies are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockGetIdToken = jest.fn();
const mockGetWsToken = jest.fn();

jest.mock('../../services/aws-auth', () => ({
  awsAuth: { getIdToken: mockGetIdToken },
}));

jest.mock('../../services/aws-api', () => ({
  awsAPI: { getWsToken: mockGetWsToken },
}));

jest.mock('../../config/aws-config', () => ({
  AWS_CONFIG: {
    api: { websocketEndpoint: 'wss://test.example.com' },
  },
}));

(global as Record<string, unknown>).__DEV__ = false;

// Mock WebSocket class
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static readonly CONNECTING = 0;

  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onmessage: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  send = jest.fn();
  close = jest.fn();

  constructor(public url: string, public protocols?: string | string[]) {
    MockWebSocket.instances.push(this);
  }

  static instances: MockWebSocket[] = [];
  static reset() {
    MockWebSocket.instances = [];
  }

  // Simulate connection open
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({});
  }

  // Simulate receiving a message
  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  // Simulate close
  simulateClose(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  // Simulate error
  simulateError() {
    this.onerror?.({});
  }
}

(global as Record<string, unknown>).WebSocket = MockWebSocket;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

// We need a fresh instance for each test
let websocketModule: typeof import('../../services/websocket');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebSocketService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    MockWebSocket.reset();

    // Reset the module to get a fresh singleton
    jest.resetModules();

    // Re-apply mocks after module reset
    jest.mock('../../services/aws-auth', () => ({
      awsAuth: { getIdToken: mockGetIdToken },
    }));
    jest.mock('../../services/aws-api', () => ({
      awsAPI: { getWsToken: mockGetWsToken },
    }));
    jest.mock('../../config/aws-config', () => ({
      AWS_CONFIG: {
        api: { websocketEndpoint: 'wss://test.example.com' },
      },
    }));

     
    websocketModule = require('../../services/websocket');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // =========================================================================
  // connect
  // =========================================================================

  describe('connect', () => {
    it('should connect with auth token and ws token', async () => {
      mockGetIdToken.mockResolvedValue('id-token-123');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token-456' });

      const connectPromise = websocketModule.websocketService.connect();

      // Wait for async token fetching
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Simulate connection open
      const ws = MockWebSocket.instances[0];
      expect(ws).toBeDefined();
      expect(ws.url).toBe('wss://test.example.com');
      ws.simulateOpen();

      await connectPromise;
    });

    it('should throw when no auth token available', async () => {
      mockGetIdToken.mockResolvedValue(null);

      await expect(websocketModule.websocketService.connect()).rejects.toThrow(
        'No authentication token available'
      );
    });

    it('should not connect when already connected', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      // Second connect should be a no-op
      await websocketModule.websocketService.connect();
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  // =========================================================================
  // disconnect
  // =========================================================================

  describe('disconnect', () => {
    it('should close socket with code 1000', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      websocketModule.websocketService.disconnect();
      expect(ws.close).toHaveBeenCalledWith(1000, 'Client disconnect');
    });

    it('should handle disconnect when not connected', () => {
      expect(() => websocketModule.websocketService.disconnect()).not.toThrow();
    });
  });

  // =========================================================================
  // sendMessage
  // =========================================================================

  describe('sendMessage', () => {
    it('should send JSON payload through socket', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      const payload = {
        action: 'sendMessage' as const,
        conversationId: 'c1',
        content: 'Hello',
        recipientId: 'u2',
      };

      websocketModule.websocketService.sendMessage(payload);
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(payload));
    });

    it('should throw when not connected', () => {
      expect(() =>
        websocketModule.websocketService.sendMessage({
          action: 'sendMessage',
          conversationId: 'c1',
          content: 'Hello',
          recipientId: 'u2',
        })
      ).toThrow('WebSocket is not connected');
    });
  });

  // =========================================================================
  // sendTypingIndicator
  // =========================================================================

  describe('sendTypingIndicator', () => {
    it('should not throw when not connected', () => {
      expect(() =>
        websocketModule.websocketService.sendTypingIndicator('c1', true)
      ).not.toThrow();
    });
  });

  // =========================================================================
  // sendReadReceipt
  // =========================================================================

  describe('sendReadReceipt', () => {
    it('should not throw when not connected', () => {
      expect(() =>
        websocketModule.websocketService.sendReadReceipt('c1', 'm1')
      ).not.toThrow();
    });
  });

  // =========================================================================
  // send
  // =========================================================================

  describe('send', () => {
    it('should not throw when not connected', () => {
      expect(() =>
        websocketModule.websocketService.send({ action: 'test' })
      ).not.toThrow();
    });
  });

  // =========================================================================
  // isConnected
  // =========================================================================

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(websocketModule.websocketService.isConnected()).toBe(false);
    });
  });

  // =========================================================================
  // Event handlers
  // =========================================================================

  describe('onMessage', () => {
    it('should subscribe and unsubscribe message handler', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      const handler = jest.fn();
      const unsubscribe = websocketModule.websocketService.onMessage(handler);

      ws.simulateMessage({ type: 'message', content: 'hello' });
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'message', content: 'hello' })
      );

      unsubscribe();
      handler.mockClear();

      ws.simulateMessage({ type: 'message', content: 'world' });
      expect(handler).not.toHaveBeenCalled();
    });

    it('should ignore malformed messages', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      const handler = jest.fn();
      websocketModule.websocketService.onMessage(handler);

      // Invalid type
      ws.simulateMessage({ type: 'invalid_type' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onConnectionChange', () => {
    it('should notify on connection and disconnection', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const handler = jest.fn();
      websocketModule.websocketService.onConnectionChange(handler);

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      expect(handler).toHaveBeenCalledWith(true);

      ws.simulateClose(1000);
      expect(handler).toHaveBeenCalledWith(false);
    });
  });

  describe('onError', () => {
    it('should subscribe to error events', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const handler = jest.fn();
      websocketModule.websocketService.onError(handler);

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateError();

      expect(handler).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // =========================================================================
  // Reconnection
  // =========================================================================

  describe('reconnection', () => {
    it('should schedule reconnect on abnormal close', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      // Abnormal close (not 1000)
      ws.simulateClose(1006, 'Connection lost');

      // Reconnect should be scheduled
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    it('should not reconnect on intentional close (1000)', async () => {
      mockGetIdToken.mockResolvedValue('token');
      mockGetWsToken.mockResolvedValue({ token: 'ws-token' });

      const connectPromise = websocketModule.websocketService.connect();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      const ws = MockWebSocket.instances[0];
      ws.simulateOpen();
      await connectPromise;

      ws.simulateClose(1000, 'Normal');

      // No reconnect timer for clean close
      // (ping interval was cleared by onclose, only reconnect timer matters)
      // We verify by checking no new WebSocket was created
      jest.advanceTimersByTime(120000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });
});
