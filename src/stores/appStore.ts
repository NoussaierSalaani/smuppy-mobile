/**
 * App Store (UI State)
 * Manages global UI state like tab bar visibility, network status, badges
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface AppState {
  isTabBarVisible: boolean;
  isOnline: boolean;
  globalLoading: boolean;
  errorModal: {
    visible: boolean;
    title: string;
    message: string;
  };
  unreadNotifications: number;
  unreadMessages: number;
  setTabBarVisible: (visible: boolean) => void;
  setOnline: (online: boolean) => void;
  setGlobalLoading: (loading: boolean) => void;
  showError: (title: string, message: string) => void;
  hideError: () => void;
  setUnreadNotifications: (countOrUpdater: number | ((prev: number) => number)) => void;
  setUnreadMessages: (countOrUpdater: number | ((prev: number) => number)) => void;
}

export const useAppStore = create<AppState>()(
  immer((set) => ({
    // Tab bar visibility
    isTabBarVisible: true,
    // Network status
    isOnline: true,

    // Loading states
    globalLoading: false,

    // Error modal
    errorModal: {
      visible: false,
      title: '',
      message: '',
    },

    // Actions
    setTabBarVisible: (visible: boolean) =>
      set((state) => {
        state.isTabBarVisible = visible;
      }),

    setOnline: (online: boolean) =>
      set((state) => {
        state.isOnline = online;
      }),

    setGlobalLoading: (loading: boolean) =>
      set((state) => {
        state.globalLoading = loading;
      }),

    showError: (title: string, message: string) =>
      set((state) => {
        state.errorModal = { visible: true, title, message };
      }),

    hideError: () =>
      set((state) => {
        state.errorModal.visible = false;
      }),

    // Badge counts
    unreadNotifications: 0,
    unreadMessages: 0,

    setUnreadNotifications: (countOrUpdater) =>
      set((state) => {
        state.unreadNotifications = typeof countOrUpdater === 'function'
          ? countOrUpdater(state.unreadNotifications)
          : countOrUpdater;
      }),

    setUnreadMessages: (countOrUpdater) =>
      set((state) => {
        state.unreadMessages = typeof countOrUpdater === 'function'
          ? countOrUpdater(state.unreadMessages)
          : countOrUpdater;
      }),
  }))
);
