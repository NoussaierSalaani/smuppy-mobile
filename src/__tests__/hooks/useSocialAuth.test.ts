/**
 * useSocialAuth Hook Tests
 * Tests for Apple/Google social authentication flow
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock react-native Platform (must be before hook import)
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: jest.fn() },
}));

// Mock Sentry
jest.mock('../../lib/sentry', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

// Mock dependencies
const mockIsAppleSignInAvailable = jest.fn();
const mockSignInWithApple = jest.fn();
const mockUseGoogleAuth = jest.fn();
const mockHandleGoogleSignIn = jest.fn();
const mockRecordConsent = jest.fn();

jest.mock('../../services/socialAuth', () => ({
  isAppleSignInAvailable: () => mockIsAppleSignInAvailable(),
  signInWithApple: () => mockSignInWithApple(),
  useGoogleAuth: () => mockUseGoogleAuth(),
  handleGoogleSignIn: (_resp: unknown) => mockHandleGoogleSignIn(_resp),
}));

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    recordConsent: (...args: unknown[]) => mockRecordConsent(...args),
  },
}));

/**
 * Minimal hook runner with state, effect, callback, and ref support.
 */
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let previousEffectDeps: Array<unknown[] | undefined> = [];
  let effectCleanups: Array<(() => void) | void> = [];
  let pendingEffects: Array<{ idx: number; fn: () => void | (() => void) }> = [];
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

  const mockUseEffect = jest.fn((fn: () => void | (() => void), deps?: unknown[]) => {
    const idx = effectIndex++;
    const prevDeps = previousEffectDeps[idx];

    let shouldRun = false;
    if (prevDeps === undefined) shouldRun = true;
    else if (deps === undefined) shouldRun = true;
    else if (deps.length !== prevDeps.length) shouldRun = true;
    else {
      for (let i = 0; i < deps.length; i++) {
        if (deps[i] !== prevDeps[i]) { shouldRun = true; break; }
      }
    }

    if (shouldRun) pendingEffects.push({ idx, fn });
    previousEffectDeps[idx] = deps;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useState').mockImplementation(mockUseState as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useEffect').mockImplementation(mockUseEffect as any);

  function flushEffects() {
    const effects = [...pendingEffects];
    pendingEffects = [];
    for (const { idx, fn } of effects) {
      if (effectCleanups[idx]) effectCleanups[idx]!();
      const cleanup = fn();
      effectCleanups[idx] = cleanup || undefined;
    }
  }

  function render() {
    stateIndex = 0;
    callbackIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    result = hookFn();
    flushEffects();
  }

  render();

  return {
    get current() { return result; },
    rerender() { render(); },
  };
}

function flushAsync(ms = 50): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { useSocialAuth } from '../../hooks/useSocialAuth';

describe('useSocialAuth', () => {
  const mockOnError = jest.fn();
  const mockGooglePromptAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: Google auth returns a request object + null response + promptAsync
    mockUseGoogleAuth.mockReturnValue([{ type: 'request' }, null, mockGooglePromptAsync]);
    mockIsAppleSignInAvailable.mockResolvedValue(true);
    mockRecordConsent.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return expected properties', () => {
    const runner = createHookRunner(() =>
      useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
    );

    expect(typeof runner.current.handleAppleSignIn).toBe('function');
    expect(typeof runner.current.handleGoogleSignInPress).toBe('function');
    expect(runner.current.socialLoading).toBeNull();
    // appleAvailable starts as false, updated asynchronously
    expect(runner.current.appleAvailable).toBe(false);
  });

  it('should set appleAvailable after checking availability', async () => {
    mockIsAppleSignInAvailable.mockResolvedValue(true);

    const runner = createHookRunner(() =>
      useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
    );

    await flushAsync();
    runner.rerender();

    expect(runner.current.appleAvailable).toBe(true);
  });

  it('should set appleAvailable to false when not available', async () => {
    mockIsAppleSignInAvailable.mockResolvedValue(false);

    const runner = createHookRunner(() =>
      useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
    );

    await flushAsync();
    runner.rerender();

    expect(runner.current.appleAvailable).toBe(false);
  });

  // ========================================
  // Apple Sign-In
  // ========================================

  describe('handleAppleSignIn', () => {
    it('should call signInWithApple on press', async () => {
      mockSignInWithApple.mockResolvedValue({ success: true });

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
      );

      await runner.current.handleAppleSignIn();

      expect(mockSignInWithApple).toHaveBeenCalled();
    });

    it('should call onError when Apple sign-in fails with error', async () => {
      mockSignInWithApple.mockResolvedValue({ success: false, error: 'Invalid credentials' });

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
      );

      await runner.current.handleAppleSignIn();

      expect(mockOnError).toHaveBeenCalledWith('Apple Sign-In Failed', 'Invalid credentials');
    });

    it('should NOT call onError when Apple sign-in is cancelled', async () => {
      mockSignInWithApple.mockResolvedValue({ success: false, error: 'cancelled' });

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
      );

      await runner.current.handleAppleSignIn();

      expect(mockOnError).not.toHaveBeenCalled();
    });

    it('should use errorPrefix in error title', async () => {
      mockSignInWithApple.mockResolvedValue({ success: false, error: 'Auth failed' });

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-Up', onError: mockOnError })
      );

      await runner.current.handleAppleSignIn();

      expect(mockOnError).toHaveBeenCalledWith('Apple Sign-Up Failed', 'Auth failed');
    });

    it('should enforce rate limiting (cooldown)', async () => {
      mockSignInWithApple.mockResolvedValue({ success: true });

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
      );

      await runner.current.handleAppleSignIn();
      await runner.current.handleAppleSignIn(); // second call immediately

      // Only called once due to cooldown
      expect(mockSignInWithApple).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // Google Sign-In
  // ========================================

  describe('handleGoogleSignInPress', () => {
    it('should call googlePromptAsync when request is available', async () => {
      mockGooglePromptAsync.mockResolvedValue(undefined);

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
      );

      await runner.current.handleGoogleSignInPress();

      expect(mockGooglePromptAsync).toHaveBeenCalled();
    });

    it('should call onError when googleRequest is null', async () => {
      mockUseGoogleAuth.mockReturnValue([null, null, mockGooglePromptAsync]);

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
      );

      await runner.current.handleGoogleSignInPress();

      expect(mockOnError).toHaveBeenCalledWith(
        'Google Sign-In Unavailable',
        expect.stringContaining('not configured')
      );
      expect(mockGooglePromptAsync).not.toHaveBeenCalled();
    });

    it('should enforce rate limiting on Google sign-in', async () => {
      mockGooglePromptAsync.mockResolvedValue(undefined);

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
      );

      await runner.current.handleGoogleSignInPress();
      await runner.current.handleGoogleSignInPress(); // second call immediately

      expect(mockGooglePromptAsync).toHaveBeenCalledTimes(1);
    });

    it('should call onError when googlePromptAsync throws', async () => {
      mockGooglePromptAsync.mockRejectedValue(new Error('prompt failed'));

      const runner = createHookRunner(() =>
        useSocialAuth({ errorPrefix: 'Sign-In', onError: mockOnError })
      );

      await runner.current.handleGoogleSignInPress();

      expect(mockOnError).toHaveBeenCalledWith(
        'Google Sign-In Failed',
        'Unable to open Google Sign-In. Please try again.',
      );
    });
  });
});
