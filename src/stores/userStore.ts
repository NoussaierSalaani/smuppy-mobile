/**
 * User Store
 * Manages authenticated user profile state
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface User {
  id: string;
  // Basic info
  firstName?: string;
  lastName?: string;
  fullName?: string;
  displayName?: string;
  username?: string;
  email?: string;
  avatar?: string | null;
  coverImage?: string | null;
  bio?: string;
  location?: string;
  // Personal info
  dateOfBirth?: string;
  gender?: string;
  // Account type: 'personal' | 'pro_creator' | 'pro_business'
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  isVerified?: boolean;
  isPremium?: boolean;
  // Onboarding data
  interests?: string[];
  expertise?: string[];
  website?: string;
  socialLinks?: Record<string, string>;
  // Business data (for pro_business)
  businessName?: string;
  businessCategory?: string;
  businessAddress?: string;
  businessLatitude?: number;
  businessLongitude?: number;
  businessPhone?: string;
  locationsMode?: string;
  // Stats
  stats?: {
    fans?: number;
    posts?: number;
    following?: number;
  };
}

export interface UserState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  updateProfile: (updates: Partial<User>) => void;
  updateAvatar: (avatarUrl: string) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
  getFullName: () => string;
  isPro: () => boolean;
  isProfileComplete: () => boolean;
}

const initialUserState = {
  user: null as User | null,
  isLoading: true,
  isAuthenticated: false,
};

export const useUserStore = create<UserState>()(
  persist(
    immer((set, get) => ({
      ...initialUserState,

      // Actions
      setUser: (user: User | null) =>
        set((state) => {
          state.user = user;
          state.isAuthenticated = !!user;
          state.isLoading = false;
        }),

      updateProfile: (updates: Partial<User>) =>
        set((state) => {
          if (state.user && updates && typeof updates === 'object' && !Array.isArray(updates)) {
            // Ensure id cannot be overwritten by partial updates
            const { id: _id, ...safeUpdates } = updates;
            state.user = { ...state.user, ...safeUpdates };
          }
        }),

      updateAvatar: (avatarUrl: string) =>
        set((state) => {
          if (state.user) {
            state.user.avatar = avatarUrl;
          }
        }),

      setLoading: (loading: boolean) =>
        set((state) => {
          state.isLoading = loading;
        }),

      logout: () =>
        set((state) => {
          state.user = null;
          state.isAuthenticated = false;
          state.isLoading = false;
        }),

      // Selectors (computed values)
      getFullName: () => {
        const { user } = get();
        if (!user) return '';
        // Business accounts use businessName as their display name
        if (user.accountType === 'pro_business' && user.businessName) return user.businessName;
        // Try fullName first, then construct from firstName + lastName
        if (user.fullName) return user.fullName;
        if (user.displayName) return user.displayName;
        return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'User';
      },

      isPro: () => {
        const { user } = get();
        return user?.accountType === 'pro_creator' || user?.accountType === 'pro_business';
      },

      isProfileComplete: () => {
        const { user } = get();
        if (!user) return false;
        // Check required fields based on account type
        const hasBasicInfo = !!(user.username && (user.fullName || user.displayName || (user.firstName && user.lastName)));
        if (user.accountType === 'pro_business') {
          return hasBasicInfo && !!(user.businessName && user.businessCategory);
        }
        return hasBasicInfo;
      },
    })),
    {
      name: '@smuppy_user_store',
      storage: createJSONStorage(() => AsyncStorage),
      // SECURITY: Only persist non-sensitive fields to unencrypted AsyncStorage.
      // Sensitive data (email, phone, location) is re-fetched on session restore.
      partialize: (state) => ({
        user: state.user ? {
          id: state.user.id,
          username: state.user.username,
          fullName: state.user.fullName,
          displayName: state.user.displayName,
          firstName: state.user.firstName,
          lastName: state.user.lastName,
          avatar: state.user.avatar,
          coverImage: state.user.coverImage,
          bio: state.user.bio,
          accountType: state.user.accountType,
          isVerified: state.user.isVerified,
          isPremium: state.user.isPremium,
          interests: state.user.interests,
          expertise: state.user.expertise,
          businessName: state.user.businessName,
          businessCategory: state.user.businessCategory,
          locationsMode: state.user.locationsMode,
          stats: state.user.stats,
          // EXCLUDED: email, dateOfBirth, gender, businessAddress,
          // businessLatitude, businessLongitude, businessPhone, website,
          // socialLinks, location
        } : null,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
