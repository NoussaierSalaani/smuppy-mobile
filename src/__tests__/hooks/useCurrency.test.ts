/**
 * useCurrency Hook Tests
 * Tests for currency detection, formatting, and persistence
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies BEFORE imports
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockGetCurrencySettings = jest.fn();
const mockUpdateCurrencySettings = jest.fn();

jest.mock('react-native', () => ({
  NativeModules: {
    SettingsManager: {
      settings: {
        AppleLocale: 'en-US',
        AppleLanguages: ['en-US'],
      },
    },
    I18nManager: {
      localeIdentifier: 'en-US',
    },
  },
  Platform: {
    OS: 'ios',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

jest.mock('../../services/aws-api', () => ({
  awsAPI: {
    getCurrencySettings: (...args: unknown[]) => mockGetCurrencySettings(...args),
    updateCurrencySettings: (...args: unknown[]) => mockUpdateCurrencySettings(...args),
  },
}));

/**
 * Minimal hook runner with deferred useEffect execution.
 * useEffect callbacks are queued and flushed after the render, matching real React
 * behavior where effects run after the render phase (not during it).
 */
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
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

  const mockUseEffect = jest.fn((fn: () => void | (() => void), deps?: unknown[]) => {
    const idx = effectIndex++;
    const prevDeps = previousEffectDeps[idx];

    let shouldRun = false;
    if (prevDeps === undefined) {
      shouldRun = true;
    } else if (deps === undefined) {
      shouldRun = true;
    } else if (deps.length !== prevDeps.length) {
      shouldRun = true;
    } else {
      for (let i = 0; i < deps.length; i++) {
        if (deps[i] !== prevDeps[i]) {
          shouldRun = true;
          break;
        }
      }
    }

    if (shouldRun) {
      pendingEffects.push({ idx, fn });
    }

    previousEffectDeps[idx] = deps;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useState').mockImplementation(mockUseState as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
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
    effectIndex = 0;
    pendingEffects = [];
    result = hookFn();
    flushEffects();
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

/** Helper: flush microtasks (allow pending async operations to settle) */
function flushAsync(ms = 50): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { useCurrency } from '../../hooks/useCurrency';

describe('useCurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockGetCurrencySettings.mockRejectedValue(new Error('not available'));
    mockUpdateCurrencySettings.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should initialize with EUR as default currency and isLoading=true', () => {
    const runner = createHookRunner(() => useCurrency());

    expect(runner.current.currency).toEqual({
      code: 'EUR',
      symbol: '\u20ac',
      name: 'Euro',
    });
    expect(runner.current.isLoading).toBe(true);
    expect(runner.current.supported).toEqual([]);
  });

  it('should return expected function properties', () => {
    const runner = createHookRunner(() => useCurrency());

    expect(typeof runner.current.setCurrency).toBe('function');
    expect(typeof runner.current.formatAmount).toBe('function');
    expect(typeof runner.current.convertAmount).toBe('function');
    expect(typeof runner.current.reload).toBe('function');
  });

  // ========================================
  // formatAmount
  // ========================================

  describe('formatAmount', () => {
    it('should format EUR amount with symbol after the number', () => {
      const runner = createHookRunner(() => useCurrency());

      // Default currency is EUR
      const formatted = runner.current.formatAmount(1999);
      expect(formatted).toBe('19.99\u20ac');
    });

    it('should format with symbol for prefix currencies (USD)', async () => {
      const runner = createHookRunner(() => useCurrency());

      // Wait for loadCurrency to finish before setting currency
      await flushAsync();

      await runner.current.setCurrency('USD');
      runner.rerender();

      const formatted = runner.current.formatAmount(1999);
      expect(formatted).toBe('$19.99');
    });

    it('should format with symbol for prefix currencies (GBP)', async () => {
      const runner = createHookRunner(() => useCurrency());

      await flushAsync();

      await runner.current.setCurrency('GBP');
      runner.rerender();

      const formatted = runner.current.formatAmount(1999);
      expect(formatted).toBe('\u00a319.99');
    });

    it('should format with code when showCode=true', () => {
      const runner = createHookRunner(() => useCurrency());

      const formatted = runner.current.formatAmount(1999, { showCode: true });
      expect(formatted).toBe('19.99 EUR');
    });

    it('should format without symbol when showSymbol=false', () => {
      const runner = createHookRunner(() => useCurrency());

      const formatted = runner.current.formatAmount(1999, { showSymbol: false });
      expect(formatted).toBe('19.99');
    });

    it('should handle 0 amount', () => {
      const runner = createHookRunner(() => useCurrency());

      const formatted = runner.current.formatAmount(0);
      expect(formatted).toBe('0.00\u20ac');
    });

    it('should handle JPY with no decimals', async () => {
      const runner = createHookRunner(() => useCurrency());

      await flushAsync();

      await runner.current.setCurrency('JPY');
      runner.rerender();

      const formatted = runner.current.formatAmount(15000);
      // JPY: 15000 / 100 = 150, formatted as integer
      expect(formatted).toBe('150\u00a5');
    });

    it('should handle large amounts', () => {
      const runner = createHookRunner(() => useCurrency());

      const formatted = runner.current.formatAmount(999999);
      expect(formatted).toBe('9999.99\u20ac');
    });

    it('should handle CAD with prefix symbol', async () => {
      const runner = createHookRunner(() => useCurrency());

      await flushAsync();

      await runner.current.setCurrency('CAD');
      runner.rerender();

      const formatted = runner.current.formatAmount(2500);
      expect(formatted).toBe('CA$25.00');
    });

    it('should handle AUD with prefix symbol', async () => {
      const runner = createHookRunner(() => useCurrency());

      await flushAsync();

      await runner.current.setCurrency('AUD');
      runner.rerender();

      const formatted = runner.current.formatAmount(5000);
      expect(formatted).toBe('A$50.00');
    });
  });

  // ========================================
  // setCurrency
  // ========================================

  describe('setCurrency', () => {
    it('should update the currency state', async () => {
      const runner = createHookRunner(() => useCurrency());

      await flushAsync();

      await runner.current.setCurrency('USD');
      runner.rerender();

      expect(runner.current.currency.code).toBe('USD');
      expect(runner.current.currency.symbol).toBe('$');
    });

    it('should persist currency to AsyncStorage', async () => {
      const runner = createHookRunner(() => useCurrency());

      await flushAsync();

      await runner.current.setCurrency('GBP');

      expect(mockSetItem).toHaveBeenCalledWith(
        '@smuppy_currency',
        JSON.stringify({ code: 'GBP', symbol: '\u00a3' })
      );
    });

    it('should update currency on server', async () => {
      const runner = createHookRunner(() => useCurrency());

      await flushAsync();

      await runner.current.setCurrency('CHF');

      expect(mockUpdateCurrencySettings).toHaveBeenCalledWith('CHF');
    });

    it('should handle unknown currency code by using code as symbol', async () => {
      const runner = createHookRunner(() => useCurrency());

      await flushAsync();

      await runner.current.setCurrency('XYZ');
      runner.rerender();

      expect(runner.current.currency.code).toBe('XYZ');
      expect(runner.current.currency.symbol).toBe('XYZ');
    });
  });

  // ========================================
  // convertAmount
  // ========================================

  describe('convertAmount', () => {
    it('should return the same amount (simplified implementation)', () => {
      const runner = createHookRunner(() => useCurrency());

      const result = runner.current.convertAmount(1000, 'USD');
      expect(result).toBe(1000);
    });

    it('should handle zero amount', () => {
      const runner = createHookRunner(() => useCurrency());

      const result = runner.current.convertAmount(0, 'GBP');
      expect(result).toBe(0);
    });
  });

  // ========================================
  // loadCurrency (via useEffect on mount)
  // ========================================

  describe('loadCurrency', () => {
    it('should load stored currency from AsyncStorage on mount', async () => {
      const storedCurrency = JSON.stringify({ code: 'GBP', symbol: '\u00a3' });
      mockGetItem.mockResolvedValue(storedCurrency);

      const runner = createHookRunner(() => useCurrency());

      await flushAsync();
      runner.rerender();

      expect(mockGetItem).toHaveBeenCalledWith('@smuppy_currency');
      expect(runner.current.currency.code).toBe('GBP');
      expect(runner.current.isLoading).toBe(false);
    });

    it('should fallback to API when no stored currency', async () => {
      mockGetItem.mockResolvedValue(null);
      mockGetCurrencySettings.mockResolvedValue({
        success: true,
        currency: { code: 'USD', symbol: '$' },
        supported: [{ code: 'USD', symbol: '$' }, { code: 'EUR', symbol: '\u20ac' }],
      });

      const runner = createHookRunner(() => useCurrency());

      await flushAsync();
      runner.rerender();

      expect(mockGetCurrencySettings).toHaveBeenCalled();
      expect(runner.current.currency.code).toBe('USD');
      expect(runner.current.isLoading).toBe(false);
    });

    it('should fallback to locale detection when API fails', async () => {
      mockGetItem.mockResolvedValue(null);
      mockGetCurrencySettings.mockRejectedValue(new Error('Network error'));

      const runner = createHookRunner(() => useCurrency());

      await flushAsync();
      runner.rerender();

      // Locale is 'en-US' (from mock), which maps to USD
      expect(runner.current.currency.code).toBe('USD');
      expect(runner.current.isLoading).toBe(false);
    });

    it('should set isLoading to false even when everything fails', async () => {
      mockGetItem.mockRejectedValue(new Error('Storage error'));

      const runner = createHookRunner(() => useCurrency());

      await flushAsync();
      runner.rerender();

      expect(runner.current.isLoading).toBe(false);
    });

    it('should persist detected currency to AsyncStorage', async () => {
      mockGetItem.mockResolvedValue(null);
      mockGetCurrencySettings.mockRejectedValue(new Error('API unavailable'));

      createHookRunner(() => useCurrency());

      await flushAsync();

      // Should have saved the locale-detected currency (USD for en-US)
      expect(mockSetItem).toHaveBeenCalledWith(
        '@smuppy_currency',
        JSON.stringify({ code: 'USD', symbol: '$' })
      );
    });

    it('should persist API-returned currency to AsyncStorage', async () => {
      mockGetItem.mockResolvedValue(null);
      mockGetCurrencySettings.mockResolvedValue({
        success: true,
        currency: { code: 'GBP', symbol: '\u00a3' },
      });

      createHookRunner(() => useCurrency());

      await flushAsync();

      expect(mockSetItem).toHaveBeenCalledWith(
        '@smuppy_currency',
        JSON.stringify({ code: 'GBP', symbol: '\u00a3' })
      );
    });
  });
});
