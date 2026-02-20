/**
 * useTipPayment Hook Tests
 * Tests for tip payment flow
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
const mockShowWarning = jest.fn();
const mockOpenCheckout = jest.fn();
const mockSendTip = jest.fn();
const mockNotificationAsync = jest.fn();

jest.mock('../../context/SmuppyAlertContext', () => ({
  useSmuppyAlert: jest.fn(() => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showWarning: mockShowWarning,
  })),
}));

jest.mock('./../../hooks/useStripeCheckout', () => ({
  useStripeCheckout: jest.fn(() => ({
    openCheckout: mockOpenCheckout,
  })),
}));

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    sendTip: (...args: unknown[]) => mockSendTip(...args),
  },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: (_type: unknown) => mockNotificationAsync(_type),
  NotificationFeedbackType: { Error: 'Error', Success: 'Success' },
}));

/**
 * Minimal hook runner
 */
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
  let refIndex = 0;
  let result: T;

  const mockUseState = jest.fn((initial: unknown) => {
    const idx = stateIndex++;
    if (!state.has(idx)) state.set(idx, initial);
    const setter = (val: unknown) => {
      const newVal = typeof val === 'function' ? (val as (prev: unknown) => unknown)(state.get(idx)) : val;
      state.set(idx, newVal);
    };
    return [state.get(idx), setter];
  });

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
  jest.spyOn(require('react'), 'useState').mockImplementation(mockUseState as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);

  function render() {
    stateIndex = 0;
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

import { useTipPayment } from '../../hooks/useTipPayment';

const TEST_RECIPIENT = { id: 'user-1', username: 'jane', displayName: 'Jane Doe' };
const TEST_CONTEXT = { type: 'profile' as const, id: 'profile-1' };

describe('useTipPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return sendTip function and initial state', () => {
    const runner = createHookRunner(() => useTipPayment());

    expect(typeof runner.current.sendTip).toBe('function');
    expect(runner.current.isProcessing).toBe(false);
    expect(runner.current.error).toBeNull();
  });

  it('should successfully send a tip via checkout flow', async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      checkoutUrl: 'https://checkout.stripe.com/pay',
      sessionId: 'cs_123',
    });
    mockOpenCheckout.mockResolvedValue({ status: 'success' });

    const runner = createHookRunner(() => useTipPayment());
    const result = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(result).toBe(true);
    expect(mockSendTip).toHaveBeenCalledWith({
      receiverId: 'user-1',
      amount: 500,
      contextType: 'profile',
      contextId: 'profile-1',
      message: undefined,
      isAnonymous: undefined,
    });
    expect(mockOpenCheckout).toHaveBeenCalledWith('https://checkout.stripe.com/pay', 'cs_123');
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('should return false when user cancels checkout', async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      checkoutUrl: 'https://checkout.stripe.com/pay',
      sessionId: 'cs_123',
    });
    mockOpenCheckout.mockResolvedValue({ status: 'cancelled' });

    const runner = createHookRunner(() => useTipPayment());
    const result = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(result).toBe(false);
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  it('should handle checkout failure', async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      checkoutUrl: 'https://checkout.stripe.com/pay',
      sessionId: 'cs_123',
    });
    mockOpenCheckout.mockResolvedValue({ status: 'failed', message: 'Card declined' });

    const runner = createHookRunner(() => useTipPayment());
    const result = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(result).toBe(false);
    expect(mockShowError).toHaveBeenCalled();
  });

  it('should show warning for pending checkout', async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      checkoutUrl: 'https://checkout.stripe.com/pay',
      sessionId: 'cs_123',
    });
    mockOpenCheckout.mockResolvedValue({ status: 'pending', message: 'Processing' });

    const runner = createHookRunner(() => useTipPayment());
    const result = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(result).toBe(true); // pending counts as truthy return
    expect(mockShowWarning).toHaveBeenCalled();
  });

  it('should handle backend failure (success=false)', async () => {
    mockSendTip.mockResolvedValue({
      success: false,
      message: 'Recipient not found',
    });

    const runner = createHookRunner(() => useTipPayment());
    const result = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(result).toBe(false);
    expect(mockShowError).toHaveBeenCalled();
  });

  it('should handle clientSecret response as not available', async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      clientSecret: 'pi_xxx_secret_yyy',
    });

    const runner = createHookRunner(() => useTipPayment());
    const result = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(result).toBe(false);
    expect(mockShowError).toHaveBeenCalled();
  });

  it('should handle no payment method returned', async () => {
    mockSendTip.mockResolvedValue({ success: true }); // no checkoutUrl, no clientSecret

    const runner = createHookRunner(() => useTipPayment());
    const result = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(result).toBe(false);
    expect(mockShowError).toHaveBeenCalled();
  });

  it('should prevent double-submit while processing', async () => {
    let resolveFirst: (value: unknown) => void;
    mockSendTip.mockReturnValueOnce(
      new Promise(resolve => { resolveFirst = resolve; })
    );

    const runner = createHookRunner(() => useTipPayment());

    const first = runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);
    const second = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(second).toBe(false); // blocked by processingRef
    expect(mockSendTip).toHaveBeenCalledTimes(1);

    resolveFirst!({ success: true, checkoutUrl: 'url', sessionId: 'cs' });
    mockOpenCheckout.mockResolvedValue({ status: 'cancelled' });
    await first;
  });

  it('should enforce cooldown between tip attempts', async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      checkoutUrl: 'https://checkout.stripe.com/pay',
      sessionId: 'cs_123',
    });
    mockOpenCheckout.mockResolvedValue({ status: 'cancelled' });

    const runner = createHookRunner(() => useTipPayment());

    // First attempt
    await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    // Second attempt immediately after -- should be blocked by cooldown
    const secondResult = await runner.current.sendTip(TEST_RECIPIENT, 500, TEST_CONTEXT);

    expect(secondResult).toBe(false);
    // sendTip should only have been called once (cooldown blocks the second)
    expect(mockSendTip).toHaveBeenCalledTimes(1);
  });

  it('should pass message and isAnonymous options', async () => {
    mockSendTip.mockResolvedValue({
      success: true,
      checkoutUrl: 'url',
      sessionId: 'cs_1',
    });
    mockOpenCheckout.mockResolvedValue({ status: 'success' });

    const runner = createHookRunner(() => useTipPayment());
    await runner.current.sendTip(TEST_RECIPIENT, 1000, TEST_CONTEXT, {
      message: 'Great content!',
      isAnonymous: true,
    });

    expect(mockSendTip).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Great content!',
      isAnonymous: true,
    }));
  });
});
