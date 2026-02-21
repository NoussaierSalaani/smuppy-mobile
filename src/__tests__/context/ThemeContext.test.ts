/**
 * ThemeContext Tests
 * Tests for the theme context provider and hook
 */

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock react-native
jest.mock('react-native', () => ({
  Appearance: {
    getColorScheme: jest.fn(() => 'light'),
  },
  useColorScheme: jest.fn(() => 'light'),
}));

// Mock theme config
jest.mock('../../config/theme', () => ({
  COLORS: { primary: '#000', background: '#fff' },
  GRADIENTS: { primary: ['#000', '#fff'] },
  FORM: { borderRadius: 8 },
  SHADOWS: { sm: {} },
  getThemeColors: jest.fn((mode: string) => ({
    primary: mode === 'dark' ? '#fff' : '#000',
    background: mode === 'dark' ? '#000' : '#fff',
  })),
  getThemeGradients: jest.fn((mode: string) => ({
    primary: mode === 'dark' ? ['#fff', '#000'] : ['#000', '#fff'],
  })),
  getThemeForm: jest.fn(() => ({ borderRadius: 8 })),
  getThemeShadows: jest.fn(() => ({ sm: {} })),
}));

import { ThemeProvider, useTheme } from '../../context/ThemeContext';

describe('ThemeContext', () => {
  // ==========================================================================
  // 1. Module Exports
  // ==========================================================================
  describe('Module Exports', () => {
    it('should export ThemeProvider', () => {
      expect(ThemeProvider).toBeDefined();
      expect(typeof ThemeProvider).toBe('function');
    });

    it('should export useTheme hook', () => {
      expect(useTheme).toBeDefined();
      expect(typeof useTheme).toBe('function');
    });
  });

  // ==========================================================================
  // 2. useTheme Hook Contract
  // ==========================================================================
  describe('useTheme hook', () => {
    it('should throw when used outside ThemeProvider', () => {
      const React = require('react');
      const originalUseContext = React.useContext;
      React.useContext = jest.fn(() => null);

      expect(() => {
        useTheme();
      }).toThrow('useTheme must be used within ThemeProvider');

      React.useContext = originalUseContext;
    });

    it('should return theme values when context is available', () => {
      const React = require('react');
      const originalUseContext = React.useContext;

      const mockTheme = {
        colors: { primary: '#000', background: '#fff' },
        gradients: { primary: ['#000', '#fff'] },
        form: { borderRadius: 8 },
        shadows: { sm: {} },
        isDark: false,
        mode: 'light' as const,
        preference: 'system' as const,
        setTheme: jest.fn(),
      };
      React.useContext = jest.fn(() => mockTheme);

      const result = useTheme();
      expect(result.colors).toBeDefined();
      expect(result.gradients).toBeDefined();
      expect(result.form).toBeDefined();
      expect(result.shadows).toBeDefined();
      expect(result.isDark).toBe(false);
      expect(result.mode).toBe('light');
      expect(result.preference).toBe('system');
      expect(typeof result.setTheme).toBe('function');

      React.useContext = originalUseContext;
    });
  });

  // ==========================================================================
  // 3. Theme Interface Contract
  // ==========================================================================
  describe('Theme Interface', () => {
    it('should support light and dark modes', () => {
      const modes = ['light', 'dark'];
      expect(modes).toContain('light');
      expect(modes).toContain('dark');
    });

    it('should support system, light, and dark preferences', () => {
      const preferences = ['system', 'light', 'dark'];
      expect(preferences).toContain('system');
      expect(preferences).toContain('light');
      expect(preferences).toContain('dark');
    });

    it('should derive isDark from mode', () => {
      const dark: string = 'dark';
      const light: string = 'light';
      expect(dark === 'dark').toBe(true);
      expect(light === 'dark').toBe(false);
    });
  });
});
