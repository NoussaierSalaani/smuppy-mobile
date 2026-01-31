import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ThemeMode = 'light' | 'dark';

interface ThemeStoreState {
  preference: ThemePreference;
  mode: ThemeMode;
  setPreference: (preference: ThemePreference) => void;
  setSystemScheme: (scheme: 'light' | 'dark' | null | undefined) => void;
  reset: () => void;
}

function resolveMode(preference: ThemePreference, systemScheme?: 'light' | 'dark' | null | undefined): ThemeMode {
  if (preference === 'system') {
    return systemScheme === 'dark' ? 'dark' : 'light';
  }
  return preference;
}

export const useThemeStore = create<ThemeStoreState>()(
  persist(
    (set, get) => ({
      preference: 'system' as ThemePreference,
      mode: resolveMode('system', Appearance.getColorScheme()),

      setPreference: (preference: ThemePreference) => {
        const systemScheme = Appearance.getColorScheme();
        set({
          preference,
          mode: resolveMode(preference, systemScheme),
        });
      },

      setSystemScheme: (scheme: 'light' | 'dark' | null | undefined) => {
        const { preference } = get();
        if (preference === 'system') {
          set({ mode: resolveMode('system', scheme) });
        }
      },

      reset: () => {
        set({
          preference: 'system',
          mode: resolveMode('system', Appearance.getColorScheme()),
        });
      },
    }),
    {
      name: '@smuppy_theme_store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preference: state.preference,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Re-resolve mode from persisted preference + current system scheme
          state.mode = resolveMode(state.preference, Appearance.getColorScheme());
        }
      },
    }
  )
);

export const themeStore = {
  reset: () => {
    useThemeStore.getState().reset();
  },
};
