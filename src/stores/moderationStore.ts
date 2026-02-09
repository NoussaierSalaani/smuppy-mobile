/**
 * Zustand store for account moderation state.
 * When a 403 response contains moderationStatus, the API layer
 * updates this store, and AppNavigator reacts accordingly.
 */

import { create } from 'zustand';

interface ModerationState {
  /** Current moderation status from backend */
  status: 'active' | 'suspended' | 'banned' | null;
  /** Reason for suspension/ban */
  reason: string | null;
  /** When suspension expires (ISO string) */
  suspendedUntil: string | null;
  /** Set moderation state from API 403 response */
  setModeration: (status: 'suspended' | 'banned', reason: string, suspendedUntil?: string) => void;
  /** Clear moderation state (on logout or appeal success) */
  clearModeration: () => void;
}

export const useModerationStore = create<ModerationState>((set) => ({
  status: null,
  reason: null,
  suspendedUntil: null,
  setModeration: (status, reason, suspendedUntil) =>
    set({ status, reason, suspendedUntil: suspendedUntil || null }),
  clearModeration: () =>
    set({ status: null, reason: null, suspendedUntil: null }),
}));
