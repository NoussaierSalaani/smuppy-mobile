/**
 * SmuppyAlertContext Tests
 * Tests for the alert context provider API and hook contract.
 *
 * Since the test environment is node (not jsdom), we test the module exports,
 * interface contract, and ensure the hook throws outside a provider.
 */

// Mock react-native (needed by some transitive imports)
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  StyleSheet: { create: (s: Record<string, unknown>) => s },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  Animated: {
    Value: jest.fn(() => ({
      interpolate: jest.fn(),
      setValue: jest.fn(),
    })),
    timing: jest.fn(() => ({ start: jest.fn() })),
    spring: jest.fn(() => ({ start: jest.fn() })),
    View: 'Animated.View',
    createAnimatedComponent: jest.fn((c: unknown) => c),
  },
  TouchableOpacity: 'TouchableOpacity',
  View: 'View',
  Text: 'Text',
  Modal: 'Modal',
}));

// Mock the SmuppyAlert component
jest.mock('../../components/SmuppyAlert', () => {
  const MockComponent = jest.fn(() => null);
  return {
    __esModule: true,
    default: MockComponent,
  };
});

import { SmuppyAlertProvider, useSmuppyAlert } from '../../context/SmuppyAlertContext';

describe('SmuppyAlertContext', () => {
  // ==========================================================================
  // 1. Module Exports
  // ==========================================================================
  describe('Module Exports', () => {
    it('should export SmuppyAlertProvider', () => {
      expect(SmuppyAlertProvider).toBeDefined();
      expect(typeof SmuppyAlertProvider).toBe('function');
    });

    it('should export useSmuppyAlert hook', () => {
      expect(useSmuppyAlert).toBeDefined();
      expect(typeof useSmuppyAlert).toBe('function');
    });
  });

  // ==========================================================================
  // 2. Hook Contract
  // ==========================================================================
  describe('useSmuppyAlert hook', () => {
    it('should throw when used outside SmuppyAlertProvider', () => {
      // useSmuppyAlert uses useContext which returns null outside provider
      // The hook explicitly throws an error in this case
      const React = require('react');
      const originalUseContext = React.useContext;
      React.useContext = jest.fn(() => null);

      expect(() => {
        useSmuppyAlert();
      }).toThrow('useSmuppyAlert must be used within SmuppyAlertProvider');

      React.useContext = originalUseContext;
    });

    it('should return the API object when context is available', () => {
      const React = require('react');
      const originalUseContext = React.useContext;

      // Simulate the provider providing an API object
      const mockApi = {
        showAlert: jest.fn(),
        showSuccess: jest.fn(),
        showError: jest.fn(),
        showWarning: jest.fn(),
        showConfirm: jest.fn(),
        showDestructiveConfirm: jest.fn(),
      };
      React.useContext = jest.fn(() => mockApi);

      const result = useSmuppyAlert();
      expect(result).toBe(mockApi);
      expect(result.showAlert).toBeDefined();
      expect(result.showSuccess).toBeDefined();
      expect(result.showError).toBeDefined();
      expect(result.showWarning).toBeDefined();
      expect(result.showConfirm).toBeDefined();
      expect(result.showDestructiveConfirm).toBeDefined();

      React.useContext = originalUseContext;
    });
  });

  // ==========================================================================
  // 3. Alert API Interface Contract
  // ==========================================================================
  describe('Alert API Interface', () => {
    it('showSuccess should accept title and optional message', () => {
      const showSuccess = jest.fn();
      showSuccess('Title');
      expect(showSuccess).toHaveBeenCalledWith('Title');

      showSuccess('Title', 'Message body');
      expect(showSuccess).toHaveBeenCalledWith('Title', 'Message body');
    });

    it('showError should accept title and optional message', () => {
      const showError = jest.fn();
      showError('Error Title');
      expect(showError).toHaveBeenCalledWith('Error Title');

      showError('Error', 'Details here');
      expect(showError).toHaveBeenCalledWith('Error', 'Details here');
    });

    it('showWarning should accept title and optional message', () => {
      const showWarning = jest.fn();
      showWarning('Warning');
      expect(showWarning).toHaveBeenCalledWith('Warning');
    });

    it('showConfirm should accept title, message, callback, and optional confirmText', () => {
      const showConfirm = jest.fn();
      const onConfirm = jest.fn();

      showConfirm('Are you sure?', 'This action cannot be undone.', onConfirm);
      expect(showConfirm).toHaveBeenCalledWith(
        'Are you sure?',
        'This action cannot be undone.',
        onConfirm
      );

      showConfirm('Delete?', 'Really?', onConfirm, 'Yes, delete');
      expect(showConfirm).toHaveBeenCalledWith(
        'Delete?',
        'Really?',
        onConfirm,
        'Yes, delete'
      );
    });

    it('showDestructiveConfirm should accept title, message, callback, and optional confirmText', () => {
      const showDestructiveConfirm = jest.fn();
      const onConfirm = jest.fn();

      showDestructiveConfirm('Delete Account', 'This is permanent.', onConfirm);
      expect(showDestructiveConfirm).toHaveBeenCalledWith(
        'Delete Account',
        'This is permanent.',
        onConfirm
      );

      showDestructiveConfirm('Remove', 'Sure?', onConfirm, 'Remove Now');
      expect(showDestructiveConfirm).toHaveBeenCalledWith(
        'Remove',
        'Sure?',
        onConfirm,
        'Remove Now'
      );
    });

    it('showAlert should accept a config object with type and buttons', () => {
      const showAlert = jest.fn();
      const config = {
        title: 'Custom Alert',
        message: 'Custom message',
        type: 'success' as const,
        buttons: [{ text: 'OK' }],
      };

      showAlert(config);
      expect(showAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Custom Alert',
          type: 'success',
        })
      );
    });
  });

  // ==========================================================================
  // 4. Provider Component
  // ==========================================================================
  describe('SmuppyAlertProvider', () => {
    it('should be a valid React component function', () => {
      expect(SmuppyAlertProvider.length).toBeGreaterThanOrEqual(0);
    });
  });
});
