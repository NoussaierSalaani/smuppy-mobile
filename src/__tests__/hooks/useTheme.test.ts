/**
 * useTheme Hook Tests
 * Tests for theme accessor (re-exported from ThemeContext)
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock the ThemeContext
const mockThemeValue = {
  colors: { primary: '#000', background: '#FFF' },
  gradients: {},
  form: {},
  shadows: {},
  isDark: false,
  mode: 'light' as const,
  preference: 'system' as const,
  setTheme: jest.fn(),
};

jest.mock('../../context/ThemeContext', () => ({
  useTheme: jest.fn(() => mockThemeValue),
  ThemeColors: {},
}));

import { useTheme } from '../../hooks/useTheme';

describe('useTheme', () => {
  it('should re-export useTheme from ThemeContext', () => {
    expect(typeof useTheme).toBe('function');
  });

  it('should return theme context value', () => {
    const result = useTheme();

    expect(result).toBe(mockThemeValue);
    expect(result.isDark).toBe(false);
    expect(result.mode).toBe('light');
  });

  it('should include setTheme function', () => {
    const result = useTheme();

    expect(typeof result.setTheme).toBe('function');
  });

  it('should include colors object', () => {
    const result = useTheme();

    expect(result.colors).toBeDefined();
    expect(result.colors.primary).toBe('#000');
  });
});
