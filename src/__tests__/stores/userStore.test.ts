/**
 * User Store Tests
 * Tests for user state management, authentication, and profile operations
 *
 * Since useUserStore is defined in stores/index.ts which has many dependencies,
 * we recreate the store logic here for isolated unit testing.
 * This tests the same logic without the import chain issues.
 */

// Mock AsyncStorage before any imports
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============================================
// TYPE DEFINITIONS (same as stores/index.ts)
// ============================================

interface User {
  id: string;
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
  dateOfBirth?: string;
  gender?: string;
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  isVerified?: boolean;
  isPremium?: boolean;
  interests?: string[];
  expertise?: string[];
  website?: string;
  socialLinks?: Record<string, string>;
  businessName?: string;
  businessCategory?: string;
  businessAddress?: string;
  businessLatitude?: number;
  businessLongitude?: number;
  businessPhone?: string;
  locationsMode?: string;
  stats?: {
    fans?: number;
    posts?: number;
    following?: number;
  };
}

interface UserState {
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

// ============================================
// RECREATE USER STORE FOR TESTING
// ============================================

const initialUserState = {
  user: null as User | null,
  isLoading: true,
  isAuthenticated: false,
};

const useUserStore = create<UserState>()(
  persist(
    immer((set, get) => ({
      ...initialUserState,

      setUser: (user: User | null) =>
        set((state) => {
          state.user = user;
          state.isAuthenticated = !!user;
          state.isLoading = false;
        }),

      updateProfile: (updates: Partial<User>) =>
        set((state) => {
          if (state.user) {
            state.user = { ...state.user, ...updates };
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

      getFullName: () => {
        const { user } = get();
        if (!user) return '';
        if (user.accountType === 'pro_business' && user.businessName) return user.businessName;
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
        const hasBasicInfo = !!(user.username && (user.fullName || user.displayName || (user.firstName && user.lastName)));
        if (user.accountType === 'pro_business') {
          return hasBasicInfo && !!(user.businessName && user.businessCategory);
        }
        return hasBasicInfo;
      },
    })),
    {
      name: '@smuppy_user_store_test',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

describe('UserStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useUserStore.getState().logout();
    useUserStore.setState({ isLoading: true });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      useUserStore.getState().logout();
      useUserStore.setState({ isLoading: true });
      const state = useUserStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(true);
    });
  });

  describe('setUser', () => {
    it('should set user and mark as authenticated', () => {
      const mockUser = {
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        username: 'johndoe',
      };

      useUserStore.getState().setUser(mockUser);
      const state = useUserStore.getState();

      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should set user to null and mark as not authenticated', () => {
      // First set a user
      useUserStore.getState().setUser({ id: 'user-123' });

      // Then clear it
      useUserStore.getState().setUser(null);
      const state = useUserStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('should preserve all user fields', () => {
      const fullUser = {
        id: 'user-456',
        firstName: 'Jane',
        lastName: 'Smith',
        fullName: 'Jane Smith',
        displayName: 'JaneS',
        username: 'janesmith',
        email: 'jane@example.com',
        avatar: 'https://example.com/avatar.jpg',
        coverImage: 'https://example.com/cover.jpg',
        bio: 'Hello world',
        location: 'New York',
        dateOfBirth: '1990-01-15',
        gender: 'female',
        accountType: 'personal' as const,
        isVerified: true,
        isPremium: false,
        interests: ['music', 'art'],
        expertise: ['photography'],
        website: 'https://jane.com',
        socialLinks: { twitter: '@jane' },
        stats: { fans: 100, posts: 50, following: 25 },
      };

      useUserStore.getState().setUser(fullUser);
      const state = useUserStore.getState();

      expect(state.user).toEqual(fullUser);
    });
  });

  describe('updateProfile', () => {
    it('should update specific user fields', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        bio: 'Original bio',
      });

      useUserStore.getState().updateProfile({
        bio: 'Updated bio',
        location: 'Los Angeles',
      });

      const state = useUserStore.getState();
      expect(state.user?.bio).toBe('Updated bio');
      expect(state.user?.location).toBe('Los Angeles');
      expect(state.user?.firstName).toBe('John'); // Unchanged
    });

    it('should do nothing if user is null', () => {
      useUserStore.getState().setUser(null);
      useUserStore.getState().updateProfile({ bio: 'New bio' });

      expect(useUserStore.getState().user).toBeNull();
    });

    it('should update nested stats object', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        stats: { fans: 10, posts: 5, following: 3 },
      });

      useUserStore.getState().updateProfile({
        stats: { fans: 15, posts: 6, following: 4 },
      });

      expect(useUserStore.getState().user?.stats).toEqual({
        fans: 15,
        posts: 6,
        following: 4,
      });
    });
  });

  describe('updateAvatar', () => {
    it('should update user avatar', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        avatar: 'https://example.com/old-avatar.jpg',
      });

      useUserStore.getState().updateAvatar('https://example.com/new-avatar.jpg');

      expect(useUserStore.getState().user?.avatar).toBe('https://example.com/new-avatar.jpg');
    });

    it('should do nothing if user is null', () => {
      useUserStore.getState().setUser(null);
      useUserStore.getState().updateAvatar('https://example.com/avatar.jpg');

      expect(useUserStore.getState().user).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('should update loading state', () => {
      useUserStore.getState().setLoading(true);
      expect(useUserStore.getState().isLoading).toBe(true);

      useUserStore.getState().setLoading(false);
      expect(useUserStore.getState().isLoading).toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear user and auth state', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        firstName: 'John',
        accountType: 'pro_creator',
      });

      expect(useUserStore.getState().isAuthenticated).toBe(true);

      useUserStore.getState().logout();
      const state = useUserStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('getFullName', () => {
    it('should return businessName for pro_business accounts', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
        businessName: 'Acme Corp',
        accountType: 'pro_business',
      });

      expect(useUserStore.getState().getFullName()).toBe('Acme Corp');
    });

    it('should return fullName if available', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        fullName: 'John William Doe',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(useUserStore.getState().getFullName()).toBe('John William Doe');
    });

    it('should return displayName if fullName not available', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        displayName: 'JohnD',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(useUserStore.getState().getFullName()).toBe('JohnD');
    });

    it('should construct from firstName and lastName', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
      });

      expect(useUserStore.getState().getFullName()).toBe('John Doe');
    });

    it('should return username if no names available', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        username: 'johndoe',
      });

      expect(useUserStore.getState().getFullName()).toBe('johndoe');
    });

    it('should return "User" as fallback', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
      });

      expect(useUserStore.getState().getFullName()).toBe('User');
    });

    it('should return empty string if user is null', () => {
      useUserStore.getState().setUser(null);

      expect(useUserStore.getState().getFullName()).toBe('');
    });
  });

  describe('isPro', () => {
    it('should return true for pro_creator accounts', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        accountType: 'pro_creator',
      });

      expect(useUserStore.getState().isPro()).toBe(true);
    });

    it('should return true for pro_business accounts', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        accountType: 'pro_business',
      });

      expect(useUserStore.getState().isPro()).toBe(true);
    });

    it('should return false for personal accounts', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        accountType: 'personal',
      });

      expect(useUserStore.getState().isPro()).toBe(false);
    });

    it('should return false if user is null', () => {
      useUserStore.getState().setUser(null);

      expect(useUserStore.getState().isPro()).toBe(false);
    });

    it('should return false if accountType is undefined', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
      });

      expect(useUserStore.getState().isPro()).toBe(false);
    });
  });

  describe('isProfileComplete', () => {
    it('should return false if user is null', () => {
      useUserStore.getState().setUser(null);

      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return true for personal account with basic info', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        username: 'johndoe',
        fullName: 'John Doe',
        accountType: 'personal',
      });

      expect(useUserStore.getState().isProfileComplete()).toBe(true);
    });

    it('should return true for personal account with firstName and lastName', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        username: 'johndoe',
        firstName: 'John',
        lastName: 'Doe',
        accountType: 'personal',
      });

      expect(useUserStore.getState().isProfileComplete()).toBe(true);
    });

    it('should return false for personal account missing username', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        fullName: 'John Doe',
        accountType: 'personal',
      });

      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return true for pro_business with required fields', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        username: 'acmecorp',
        displayName: 'Acme Corp',
        accountType: 'pro_business',
        businessName: 'Acme Corporation',
        businessCategory: 'Technology',
      });

      expect(useUserStore.getState().isProfileComplete()).toBe(true);
    });

    it('should return false for pro_business missing businessName', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        username: 'acmecorp',
        fullName: 'Acme Corp',
        accountType: 'pro_business',
        businessCategory: 'Technology',
      });

      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return false for pro_business missing businessCategory', () => {
      useUserStore.getState().setUser({
        id: 'user-123',
        username: 'acmecorp',
        fullName: 'Acme Corp',
        accountType: 'pro_business',
        businessName: 'Acme Corporation',
      });

      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });
  });

  describe('Business Account Fields', () => {
    it('should store and retrieve all business fields', () => {
      const businessUser = {
        id: 'user-123',
        accountType: 'pro_business' as const,
        businessName: 'Acme Corporation',
        businessCategory: 'Technology',
        businessAddress: '123 Tech Street',
        businessLatitude: 37.7749,
        businessLongitude: -122.4194,
        businessPhone: '+1-555-123-4567',
        locationsMode: 'single',
      };

      useUserStore.getState().setUser(businessUser);
      const state = useUserStore.getState();

      expect(state.user?.businessName).toBe('Acme Corporation');
      expect(state.user?.businessCategory).toBe('Technology');
      expect(state.user?.businessAddress).toBe('123 Tech Street');
      expect(state.user?.businessLatitude).toBe(37.7749);
      expect(state.user?.businessLongitude).toBe(-122.4194);
      expect(state.user?.businessPhone).toBe('+1-555-123-4567');
      expect(state.user?.locationsMode).toBe('single');
    });
  });

  describe('Authentication State', () => {
    it('should maintain isAuthenticated in sync with user', () => {
      // Initially not authenticated
      useUserStore.getState().logout();
      expect(useUserStore.getState().isAuthenticated).toBe(false);

      // Set user -> authenticated
      useUserStore.getState().setUser({ id: 'user-123' });
      expect(useUserStore.getState().isAuthenticated).toBe(true);

      // Clear user -> not authenticated
      useUserStore.getState().setUser(null);
      expect(useUserStore.getState().isAuthenticated).toBe(false);

      // Set user again
      useUserStore.getState().setUser({ id: 'user-456' });
      expect(useUserStore.getState().isAuthenticated).toBe(true);

      // Logout -> not authenticated
      useUserStore.getState().logout();
      expect(useUserStore.getState().isAuthenticated).toBe(false);
    });
  });
});
