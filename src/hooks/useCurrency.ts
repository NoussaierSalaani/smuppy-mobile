/**
 * useCurrency Hook
 * Handles currency detection and formatting
 */

import { useState, useEffect, useCallback } from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { awsAPI } from '../services/aws-api';

// Get device locale without expo-localization
const getDeviceLocale = (): string => {
  try {
    if (Platform.OS === 'ios') {
      return (
        NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] ||
        'en-US'
      );
    }
    return NativeModules.I18nManager?.localeIdentifier || 'en-US';
  } catch {
    return 'en-US';
  }
};

interface Currency {
  code: string;
  symbol: string;
  name?: string;
}

interface CurrencyState {
  currency: Currency;
  supported: Currency[];
  isLoading: boolean;
}

const CURRENCY_STORAGE_KEY = '@smuppy_currency';

const DEFAULT_CURRENCY: Currency = {
  code: 'EUR',
  symbol: '€',
  name: 'Euro',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CAD: 'CA$',
  CHF: 'CHF',
  AUD: 'A$',
  JPY: '¥',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
};

const LOCALE_CURRENCY_MAP: Record<string, string> = {
  'en-US': 'USD',
  'en-CA': 'CAD',
  'en-GB': 'GBP',
  'en-AU': 'AUD',
  'fr-FR': 'EUR',
  'de-DE': 'EUR',
  'es-ES': 'EUR',
  'it-IT': 'EUR',
  'fr-CA': 'CAD',
  'de-CH': 'CHF',
  'fr-CH': 'CHF',
  'ja-JP': 'JPY',
  'sv-SE': 'SEK',
  'nb-NO': 'NOK',
  'da-DK': 'DKK',
};

export function useCurrency() {
  const [state, setState] = useState<CurrencyState>({
    currency: DEFAULT_CURRENCY,
    supported: [],
    isLoading: true,
  });

  useEffect(() => {
    loadCurrency();
  }, []);

  const loadCurrency = async () => {
    try {
      // Try to get from storage first
      const storedCurrency = await AsyncStorage.getItem(CURRENCY_STORAGE_KEY);
      if (storedCurrency) {
        const parsed = JSON.parse(storedCurrency);
        setState((prev) => ({
          ...prev,
          currency: parsed,
          isLoading: false,
        }));
        return;
      }

      // Try to get from API
      try {
        const response = await awsAPI.getCurrencySettings();
        if (response.success && response.currency) {
          const currency: Currency = {
            code: response.currency.code,
            symbol: response.currency.symbol || CURRENCY_SYMBOLS[response.currency.code] || response.currency.code,
          };

          await AsyncStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(currency));

          setState({
            currency,
            supported: response.supported || [],
            isLoading: false,
          });
          return;
        }
      } catch {
        if (__DEV__) console.log('API currency detection failed, using locale');
      }

      // Fallback to locale detection
      const locale = getDeviceLocale();
      const detectedCode = LOCALE_CURRENCY_MAP[locale] || 'EUR';
      const currency: Currency = {
        code: detectedCode,
        symbol: CURRENCY_SYMBOLS[detectedCode] || detectedCode,
      };

      await AsyncStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(currency));

      setState((prev) => ({
        ...prev,
        currency,
        isLoading: false,
      }));
    } catch (error) {
      if (__DEV__) console.warn('Load currency error:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const setCurrency = useCallback(async (code: string) => {
    const symbol = CURRENCY_SYMBOLS[code] || code;
    const newCurrency: Currency = { code, symbol };

    setState((prev) => ({
      ...prev,
      currency: newCurrency,
    }));

    await AsyncStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(newCurrency));

    // Update on server if logged in
    try {
      await awsAPI.updateCurrencySettings(code);
    } catch {
      if (__DEV__) console.log('Failed to update currency on server');
    }
  }, []);

  const formatAmount = useCallback(
    (amountInCents: number, options?: { showSymbol?: boolean; showCode?: boolean }) => {
      const { showSymbol = true, showCode = false } = options || {};
      const amount = amountInCents / 100;
      const { code, symbol } = state.currency;

      // Format based on currency
      let formatted: string;
      if (code === 'JPY') {
        // No decimals for JPY
        formatted = Math.round(amount).toLocaleString();
      } else {
        formatted = amount.toFixed(2);
      }

      if (showCode) {
        return `${formatted} ${code}`;
      }

      if (showSymbol) {
        // Symbol position varies by currency
        if (['USD', 'CAD', 'AUD', 'GBP'].includes(code)) {
          return `${symbol}${formatted}`;
        }
        return `${formatted}${symbol}`;
      }

      return formatted;
    },
    [state.currency]
  );

  const convertAmount = useCallback(
    (amountInCents: number, _fromCurrency: string): number => {
      // This is a simplified version - in production you'd use real exchange rates
      // For now, we just return the same amount
      // You could integrate with a forex API for real-time rates
      return amountInCents;
    },
    []
  );

  return {
    ...state,
    setCurrency,
    formatAmount,
    convertAmount,
    reload: loadCurrency,
  };
}

export default useCurrency;
