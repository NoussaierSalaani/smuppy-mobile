/**
 * Theme Store Tests
 * Tests for theme preference management and mode derivation
 */

// Mock AsyncStorage before any imports
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock React Native Appearance API
const mockGetColorScheme = jest.fn();
jest.mock('react-native', () => ({
  Appearance: {
    getColorScheme: () => mockGetColorScheme(),
  },
}));

import { useThemeStore } from '../../stores/themeStore';

describe('ThemeStore', () => {
  beforeEach(() => {
    // Reset mock to return 'light' by default
    mockGetColorScheme.mockReturnValue('light');
    // Reset store to initial state
    useThemeStore.getState().reset();
  });

  describe('Initial State', () => {
    it('should have system as default preference', () => {
      const state = useThemeStore.getState();
      expect(state.preference).toBe('system');
    });

    it('should derive mode from system scheme when preference is system', () => {
      mockGetColorScheme.mockReturnValue('dark');
      useThemeStore.getState().reset();

      const state = useThemeStore.getState();
      expect(state.preference).toBe('system');
      expect(state.mode).toBe('dark');
    });

    it('should default to light mode if system scheme is null', () => {
      mockGetColorScheme.mockReturnValue(null);
      useThemeStore.getState().reset();

      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should default to light mode if system scheme is undefined', () => {
      mockGetColorScheme.mockReturnValue(undefined);
      useThemeStore.getState().reset();

      expect(useThemeStore.getState().mode).toBe('light');
    });
  });

  describe('setPreference', () => {
    it('should set preference to light', () => {
      useThemeStore.getState().setPreference('light');

      const state = useThemeStore.getState();
      expect(state.preference).toBe('light');
      expect(state.mode).toBe('light');
    });

    it('should set preference to dark', () => {
      useThemeStore.getState().setPreference('dark');

      const state = useThemeStore.getState();
      expect(state.preference).toBe('dark');
      expect(state.mode).toBe('dark');
    });

    it('should set preference to system and use system scheme', () => {
      mockGetColorScheme.mockReturnValue('dark');
      useThemeStore.getState().setPreference('system');

      const state = useThemeStore.getState();
      expect(state.preference).toBe('system');
      expect(state.mode).toBe('dark');
    });

    it('should ignore system scheme when preference is light', () => {
      mockGetColorScheme.mockReturnValue('dark');
      useThemeStore.getState().setPreference('light');

      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should ignore system scheme when preference is dark', () => {
      mockGetColorScheme.mockReturnValue('light');
      useThemeStore.getState().setPreference('dark');

      expect(useThemeStore.getState().mode).toBe('dark');
    });
  });

  describe('setSystemScheme', () => {
    it('should update mode when preference is system', () => {
      useThemeStore.getState().setPreference('system');
      useThemeStore.getState().setSystemScheme('dark');

      expect(useThemeStore.getState().mode).toBe('dark');
    });

    it('should update mode to light when system scheme changes to light', () => {
      useThemeStore.getState().setPreference('system');
      useThemeStore.getState().setSystemScheme('dark');
      expect(useThemeStore.getState().mode).toBe('dark');

      useThemeStore.getState().setSystemScheme('light');
      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should NOT update mode when preference is light', () => {
      useThemeStore.getState().setPreference('light');
      useThemeStore.getState().setSystemScheme('dark');

      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should NOT update mode when preference is dark', () => {
      useThemeStore.getState().setPreference('dark');
      useThemeStore.getState().setSystemScheme('light');

      expect(useThemeStore.getState().mode).toBe('dark');
    });

    it('should handle null system scheme', () => {
      useThemeStore.getState().setPreference('system');
      useThemeStore.getState().setSystemScheme(null);

      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should handle undefined system scheme', () => {
      useThemeStore.getState().setPreference('system');
      useThemeStore.getState().setSystemScheme(undefined);

      expect(useThemeStore.getState().mode).toBe('light');
    });
  });

  describe('reset', () => {
    it('should reset preference to system', () => {
      useThemeStore.getState().setPreference('dark');
      expect(useThemeStore.getState().preference).toBe('dark');

      useThemeStore.getState().reset();

      expect(useThemeStore.getState().preference).toBe('system');
    });

    it('should re-derive mode from current system scheme', () => {
      useThemeStore.getState().setPreference('light');
      mockGetColorScheme.mockReturnValue('dark');

      useThemeStore.getState().reset();

      expect(useThemeStore.getState().mode).toBe('dark');
    });
  });

  describe('Mode Derivation Logic', () => {
    describe('when preference is system', () => {
      beforeEach(() => {
        useThemeStore.getState().setPreference('system');
      });

      it('should use dark mode when system is dark', () => {
        mockGetColorScheme.mockReturnValue('dark');
        useThemeStore.getState().setSystemScheme('dark');

        expect(useThemeStore.getState().mode).toBe('dark');
      });

      it('should use light mode when system is light', () => {
        mockGetColorScheme.mockReturnValue('light');
        useThemeStore.getState().setSystemScheme('light');

        expect(useThemeStore.getState().mode).toBe('light');
      });
    });

    describe('when preference is explicit', () => {
      it('should always be light when preference is light', () => {
        useThemeStore.getState().setPreference('light');

        // Try to change system scheme
        useThemeStore.getState().setSystemScheme('dark');
        expect(useThemeStore.getState().mode).toBe('light');

        useThemeStore.getState().setSystemScheme('light');
        expect(useThemeStore.getState().mode).toBe('light');

        useThemeStore.getState().setSystemScheme(null);
        expect(useThemeStore.getState().mode).toBe('light');
      });

      it('should always be dark when preference is dark', () => {
        useThemeStore.getState().setPreference('dark');

        // Try to change system scheme
        useThemeStore.getState().setSystemScheme('light');
        expect(useThemeStore.getState().mode).toBe('dark');

        useThemeStore.getState().setSystemScheme('dark');
        expect(useThemeStore.getState().mode).toBe('dark');

        useThemeStore.getState().setSystemScheme(null);
        expect(useThemeStore.getState().mode).toBe('dark');
      });
    });
  });

  describe('Preference Cycling', () => {
    it('should cycle through preferences correctly', () => {
      mockGetColorScheme.mockReturnValue('light');

      // Start with system (default)
      expect(useThemeStore.getState().preference).toBe('system');
      expect(useThemeStore.getState().mode).toBe('light');

      // Change to dark
      useThemeStore.getState().setPreference('dark');
      expect(useThemeStore.getState().preference).toBe('dark');
      expect(useThemeStore.getState().mode).toBe('dark');

      // Change to light
      useThemeStore.getState().setPreference('light');
      expect(useThemeStore.getState().preference).toBe('light');
      expect(useThemeStore.getState().mode).toBe('light');

      // Back to system
      mockGetColorScheme.mockReturnValue('dark');
      useThemeStore.getState().setPreference('system');
      expect(useThemeStore.getState().preference).toBe('system');
      expect(useThemeStore.getState().mode).toBe('dark');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid preference changes', () => {
      useThemeStore.getState().setPreference('light');
      useThemeStore.getState().setPreference('dark');
      useThemeStore.getState().setPreference('system');
      useThemeStore.getState().setPreference('light');

      expect(useThemeStore.getState().preference).toBe('light');
      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should handle rapid system scheme changes', () => {
      useThemeStore.getState().setPreference('system');

      useThemeStore.getState().setSystemScheme('dark');
      useThemeStore.getState().setSystemScheme('light');
      useThemeStore.getState().setSystemScheme('dark');
      useThemeStore.getState().setSystemScheme('light');

      expect(useThemeStore.getState().mode).toBe('light');
    });

    it('should maintain preference when system scheme changes', () => {
      useThemeStore.getState().setPreference('dark');

      // Simulate system scheme changes
      useThemeStore.getState().setSystemScheme('light');
      useThemeStore.getState().setSystemScheme('dark');

      // Preference should remain unchanged
      expect(useThemeStore.getState().preference).toBe('dark');
    });
  });
});
