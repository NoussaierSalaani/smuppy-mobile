/**
 * useStripeCheckout Hook Tests
 * Tests for Stripe checkout flow (WebBrowser + polling)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockOpenBrowserAsync = jest.fn();
const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();
const mockNotificationAsync = jest.fn();
const mockGetWebCheckoutStatus = jest.fn();

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (_url: string, _opts: unknown) => mockOpenBrowserAsync(_url, _opts),
  WebBrowserPresentationStyle: { FULL_SCREEN: 0 },
}));

jest.mock('expo-linking', () => ({
  canOpenURL: (_url: string) => mockCanOpenURL(_url),
  openURL: (_url: string) => mockOpenURL(_url),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: (_type: unknown) => mockNotificationAsync(_type),
  NotificationFeedbackType: { Success: 'Success', Error: 'Error' },
}));

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    getWebCheckoutStatus: (_sessionId: string) => mockGetWebCheckoutStatus(_sessionId),
  },
}));

/**
 * Minimal hook runner
 */
function createHookRunner<T>(hookFn: () => T) {
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let callbackIndex = 0;
  let refIndex = 0;
  let result: T;

  const mockUseCallback = jest.fn((fn: unknown, _deps: unknown[]) => {
    const idx = callbackIndex++;
    callbackMap.set(idx, fn);
    return fn;
  });

  const mockUseRef = jest.fn((initial: unknown) => {
    const idx = refIndex++;
    if (!refMap.has(idx)) refMap.set(idx, { current: initial });
    return refMap.get(idx);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);

  function render() {
    callbackIndex = 0;
    refIndex = 0;
    result = hookFn();
  }

  render();

  return {
    get current() {
      return result;
    },
    rerender() {
      render();
    },
  };
}

import { useStripeCheckout } from '../../hooks/useStripeCheckout';

describe('useStripeCheckout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return openCheckout function', () => {
    const runner = createHookRunner(() => useStripeCheckout());

    expect(typeof runner.current.openCheckout).toBe('function');
  });

  it('should return cancelled status when user cancels browser', async () => {
    mockOpenBrowserAsync.mockResolvedValue({ type: 'cancel' });

    const runner = createHookRunner(() => useStripeCheckout());
    const result = await runner.current.openCheckout('https://checkout.stripe.com/test', 'cs_test_123');

    expect(result.status).toBe('cancelled');
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith('https://checkout.stripe.com/test', expect.any(Object));
  });

  it('should poll and return success when payment completes', async () => {
    mockOpenBrowserAsync.mockResolvedValue({ type: 'dismiss' });
    mockGetWebCheckoutStatus.mockResolvedValue({
      success: true,
      status: 'complete',
      paymentStatus: 'paid',
      metadata: { orderId: 'ord_123' },
    });

    const runner = createHookRunner(() => useStripeCheckout());
    const result = await runner.current.openCheckout('https://checkout.stripe.com/test', 'cs_test_123');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.paymentStatus).toBe('paid');
      expect(result.metadata).toEqual({ orderId: 'ord_123' });
    }
    expect(mockNotificationAsync).toHaveBeenCalled();
  });

  it('should handle no_payment_required as success', async () => {
    mockOpenBrowserAsync.mockResolvedValue({ type: 'dismiss' });
    mockGetWebCheckoutStatus.mockResolvedValue({
      success: true,
      status: 'complete',
      paymentStatus: 'no_payment_required',
    });

    const runner = createHookRunner(() => useStripeCheckout());
    const result = await runner.current.openCheckout('https://checkout.stripe.com/test', 'cs_test_123');

    expect(result.status).toBe('success');
  });

  it('should return failed when session is expired', async () => {
    mockOpenBrowserAsync.mockResolvedValue({ type: 'dismiss' });
    mockGetWebCheckoutStatus.mockResolvedValue({
      success: true,
      status: 'expired',
      paymentStatus: 'unpaid',
    });

    const runner = createHookRunner(() => useStripeCheckout());
    const result = await runner.current.openCheckout('https://checkout.stripe.com/test', 'cs_test_123');

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.message).toBe('Checkout session expired');
    }
    expect(mockNotificationAsync).toHaveBeenCalled();
  });

  it('should return pending when max polls exceeded with open status', async () => {
    mockOpenBrowserAsync.mockResolvedValue({ type: 'dismiss' });
    mockGetWebCheckoutStatus.mockResolvedValue({
      success: true,
      status: 'open',
      paymentStatus: 'unpaid',
    });

    const runner = createHookRunner(() => useStripeCheckout());
    // Note: This will poll MAX_POLLS times, each with a 1.5s delay.
    // Since we're mocking, Promise resolves immediately but the wait calls are real.
    // We need to use fake timers.
    jest.useFakeTimers();

    const resultPromise = runner.current.openCheckout('https://checkout.stripe.com/test', 'cs_test_123');

    // Advance through all poll intervals
    for (let i = 0; i < 8; i++) {
      await Promise.resolve(); // flush microtask for status call
      jest.advanceTimersByTime(1500);
      await Promise.resolve();
    }

    // Need to flush remaining microtasks
    jest.useRealTimers();
    const result = await resultPromise;

    expect(result.status).toBe('pending');
    if (result.status === 'pending') {
      expect(result.message).toContain('being processed');
    }
  }, 15000);

  it('should fallback to Linking when WebBrowser fails', async () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error('WebBrowser not available'));
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);

    const runner = createHookRunner(() => useStripeCheckout());
    const result = await runner.current.openCheckout('https://checkout.stripe.com/test', 'cs_test_123');

    expect(result.status).toBe('pending');
    expect(mockCanOpenURL).toHaveBeenCalledWith('https://checkout.stripe.com/test');
    expect(mockOpenURL).toHaveBeenCalledWith('https://checkout.stripe.com/test');
  });

  it('should return pending when both WebBrowser and Linking fail', async () => {
    mockOpenBrowserAsync.mockRejectedValue(new Error('WebBrowser failed'));
    mockCanOpenURL.mockRejectedValue(new Error('Linking failed'));

    const runner = createHookRunner(() => useStripeCheckout());
    const result = await runner.current.openCheckout('https://checkout.stripe.com/test', 'cs_test_123');

    expect(result.status).toBe('pending');
  });

  it('should prevent concurrent checkouts', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let resolveFirst: (value: any) => void;
    mockOpenBrowserAsync.mockReturnValueOnce(
      new Promise(resolve => { resolveFirst = resolve; })
    );

    const runner = createHookRunner(() => useStripeCheckout());

    const first = runner.current.openCheckout('https://checkout.stripe.com/test', 'cs_1');
    const second = await runner.current.openCheckout('https://checkout.stripe.com/test2', 'cs_2');

    expect(second.status).toBe('failed');
    if (second.status === 'failed') {
      expect(second.message).toContain('already in progress');
    }

    // Resolve first
    resolveFirst!({ type: 'cancel' });
    await first;
  });
});
