/**
 * Auth Store (Sensitive data)
 * Manages session tokens — not persisted (managed by AWS Cognito)
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface Session {
  access_token: string;
  refresh_token: string;
  user?: unknown;
  [key: string]: unknown;
}

export interface AuthState {
  session: Session | null;
  setSession: (session: Session | null) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  immer((set) => ({
    // Session info (not persisted - managed by AWS Cognito)
    session: null as Session | null,

    // Actions
    setSession: (session: Session | null) =>
      set((state) => {
        state.session = session;
      }),

    clearAuth: () =>
      set((state) => {
        state.session = null;
      }),
  }))
);
