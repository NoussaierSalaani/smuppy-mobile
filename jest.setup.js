/**
 * Jest Setup File
 * Minimal configuration for basic tests
 */

// Setup test timeout
jest.setTimeout(10000);

// Suppress console warnings in tests unless DEBUG is set
if (!process.env.DEBUG) {
  global.console.warn = jest.fn();
}

// Mock AsyncStorage for Zustand persist middleware
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
