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
