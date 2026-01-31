import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore, type ThemePreference, type ThemeMode } from '../stores/themeStore';
import { COLORS, GRADIENTS, FORM, SHADOWS, getThemeColors, getThemeGradients, getThemeForm, getThemeShadows } from '../config/theme';

export type ThemeColors = typeof COLORS;

interface ThemeContextValue {
  colors: ThemeColors;
  gradients: typeof GRADIENTS;
  form: typeof FORM;
  shadows: typeof SHADOWS;
  isDark: boolean;
  mode: ThemeMode;
  preference: ThemePreference;
  setTheme: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const mode = useThemeStore((s) => s.mode);
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);
  const setSystemScheme = useThemeStore((s) => s.setSystemScheme);

  useEffect(() => {
    setSystemScheme(systemScheme);
  }, [systemScheme, setSystemScheme]);

  const value = useMemo<ThemeContextValue>(() => ({
    colors: getThemeColors(mode),
    gradients: getThemeGradients(mode),
    form: getThemeForm(mode),
    shadows: getThemeShadows(mode),
    isDark: mode === 'dark',
    mode,
    preference,
    setTheme: setPreference,
  }), [mode, preference, setPreference]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
