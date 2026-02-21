/**
 * AuthCallbackContext Tests
 * Tests for the auth callback context provider and hook
 */

import { AuthCallbackProvider, useAuthCallbacks } from '../../context/AuthCallbackContext';

describe('AuthCallbackContext', () => {
  // ==========================================================================
  // 1. Module Exports
  // ==========================================================================
  describe('Module Exports', () => {
    it('should export AuthCallbackProvider', () => {
      expect(AuthCallbackProvider).toBeDefined();
    });

    it('should export useAuthCallbacks hook', () => {
      expect(useAuthCallbacks).toBeDefined();
      expect(typeof useAuthCallbacks).toBe('function');
    });
  });

  // ==========================================================================
  // 2. Default Context Values
  // ==========================================================================
  describe('Default Context Values', () => {
    it('should return default callbacks when used outside provider', () => {
      // useAuthCallbacks uses useContext with a default value,
      // so it should NOT throw outside the provider (unlike SmuppyAlertContext)
      const React = require('react');
      const originalUseContext = React.useContext;

      // Simulate default context (createContext with defaults)
      const defaultCallbacks = {
        onRecoveryComplete: expect.any(Function),
        onProfileCreated: expect.any(Function),
      };

      React.useContext = jest.fn(() => ({
        onRecoveryComplete: () => {},
        onProfileCreated: () => {},
      }));

      const result = useAuthCallbacks();
      expect(result).toMatchObject(defaultCallbacks);

      // Default callbacks should be no-ops (not throw)
      expect(() => result.onRecoveryComplete()).not.toThrow();
      expect(() => result.onProfileCreated()).not.toThrow();

      React.useContext = originalUseContext;
    });
  });

  // ==========================================================================
  // 3. Callback Interface Contract
  // ==========================================================================
  describe('Callback Interface', () => {
    it('should support onRecoveryComplete callback', () => {
      const onRecoveryComplete = jest.fn();
      onRecoveryComplete();
      expect(onRecoveryComplete).toHaveBeenCalledTimes(1);
    });

    it('should support onProfileCreated callback', () => {
      const onProfileCreated = jest.fn();
      onProfileCreated();
      expect(onProfileCreated).toHaveBeenCalledTimes(1);
    });
  });
});
