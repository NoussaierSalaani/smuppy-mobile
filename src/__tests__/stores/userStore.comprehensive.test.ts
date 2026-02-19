/**
 * User Store — Comprehensive Tests
 *
 * Tests the actual useUserStore from src/stores/userStore.ts,
 * covering all actions, computed selectors, security (partialize),
 * staleness logic, and edge cases.
 */

// Mock AsyncStorage before any imports
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { useUserStore, selectIsProfileStale, User, UserState } from '../../stores/userStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid user for quick setup */
const minimalUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-000',
  ...overrides,
});

/** Fully-populated user for completeness checks */
const fullUser: User = {
  id: 'user-full',
  firstName: 'Alice',
  lastName: 'Wonderland',
  fullName: 'Alice Wonderland',
  displayName: 'AliceW',
  username: 'alicew',
  email: 'alice@example.com',
  avatar: 'https://cdn.example.com/alice.jpg',
  coverImage: 'https://cdn.example.com/alice-cover.jpg',
  bio: 'Curiouser and curiouser',
  location: 'Wonderland',
  dateOfBirth: '1990-05-15',
  gender: 'female',
  accountType: 'personal',
  isVerified: true,
  isPremium: false,
  interests: ['rabbits', 'tea'],
  expertise: ['exploration'],
  website: 'https://alice.example.com',
  socialLinks: { twitter: '@alice' },
  businessName: undefined,
  businessCategory: undefined,
  businessAddress: undefined,
  businessLatitude: undefined,
  businessLongitude: undefined,
  businessPhone: undefined,
  locationsMode: undefined,
  stats: { fans: 200, posts: 42, following: 15 },
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('UserStore (comprehensive)', () => {
  beforeEach(() => {
    // Reset to pristine initial state before every test
    useUserStore.getState().logout();
    useUserStore.setState({ isLoading: true, lastProfileFetchedAt: null });
  });

  // ========================================================================
  // 1. Initial state
  // ========================================================================
  describe('Initial State', () => {
    it('should have user=null, isLoading=true, isAuthenticated=false, lastProfileFetchedAt=null', () => {
      const state = useUserStore.getState();
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(true);
      expect(state.isAuthenticated).toBe(false);
      expect(state.lastProfileFetchedAt).toBeNull();
    });
  });

  // ========================================================================
  // 2. setUser — sets user, isAuthenticated, isLoading, lastProfileFetchedAt
  // ========================================================================
  describe('setUser', () => {
    it('should set user and mark as authenticated with isLoading=false', () => {
      const user = minimalUser({ firstName: 'Bob', username: 'bob' });
      useUserStore.getState().setUser(user);
      const state = useUserStore.getState();

      expect(state.user).toEqual(user);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should set lastProfileFetchedAt to a recent timestamp', () => {
      const before = Date.now();
      useUserStore.getState().setUser(minimalUser());
      const after = Date.now();

      const ts = useUserStore.getState().lastProfileFetchedAt;
      expect(ts).not.toBeNull();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('should preserve all User fields when set', () => {
      useUserStore.getState().setUser(fullUser);
      expect(useUserStore.getState().user).toEqual(fullUser);
    });

    // ------------------------------------------------------------------
    // 3. setUser(null) — clears everything
    // ------------------------------------------------------------------
    it('should clear user, isAuthenticated, isLoading and lastProfileFetchedAt when called with null', () => {
      // First authenticate
      useUserStore.getState().setUser(minimalUser());
      expect(useUserStore.getState().isAuthenticated).toBe(true);

      // Then clear
      useUserStore.getState().setUser(null);
      const state = useUserStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.lastProfileFetchedAt).toBeNull();
    });
  });

  // ========================================================================
  // 4. updateProfile — merges updates, does NOT overwrite id
  // ========================================================================
  describe('updateProfile', () => {
    it('should merge partial updates into existing user', () => {
      useUserStore.getState().setUser(minimalUser({ id: 'u1', firstName: 'Old', bio: 'Original' }));

      useUserStore.getState().updateProfile({ bio: 'Updated', location: 'Paris' });
      const user = useUserStore.getState().user!;

      expect(user.bio).toBe('Updated');
      expect(user.location).toBe('Paris');
      expect(user.firstName).toBe('Old'); // untouched
    });

    it('should NOT overwrite the id even if updates contain id', () => {
      useUserStore.getState().setUser(minimalUser({ id: 'original-id' }));

      useUserStore.getState().updateProfile({ id: 'evil-id', bio: 'hacked' } as Partial<User>);
      const user = useUserStore.getState().user!;

      expect(user.id).toBe('original-id');
      expect(user.bio).toBe('hacked');
    });

    it('should update lastProfileFetchedAt on successful update', () => {
      useUserStore.getState().setUser(minimalUser());

      // Advance time conceptually — just verify the timestamp changes
      const tsBefore = useUserStore.getState().lastProfileFetchedAt;
      useUserStore.getState().updateProfile({ bio: 'new' });
      const tsAfter = useUserStore.getState().lastProfileFetchedAt;

      expect(tsAfter).not.toBeNull();
      expect(tsAfter! >= tsBefore!).toBe(true);
    });

    it('should do nothing if user is null', () => {
      useUserStore.getState().setUser(null);
      useUserStore.getState().updateProfile({ bio: 'ignored' });

      expect(useUserStore.getState().user).toBeNull();
    });

    // ------------------------------------------------------------------
    // 5. updateProfile with invalid input (null, array) — no-op
    // ------------------------------------------------------------------
    it('should be a no-op when updates is null', () => {
      useUserStore.getState().setUser(minimalUser({ bio: 'safe' }));

      useUserStore.getState().updateProfile(null as unknown as Partial<User>);
      expect(useUserStore.getState().user!.bio).toBe('safe');
    });

    it('should be a no-op when updates is an array', () => {
      useUserStore.getState().setUser(minimalUser({ bio: 'safe' }));

      useUserStore.getState().updateProfile([] as unknown as Partial<User>);
      expect(useUserStore.getState().user!.bio).toBe('safe');
    });

    it('should be a no-op when updates is undefined', () => {
      useUserStore.getState().setUser(minimalUser({ bio: 'safe' }));

      useUserStore.getState().updateProfile(undefined as unknown as Partial<User>);
      expect(useUserStore.getState().user!.bio).toBe('safe');
    });

    it('should update nested stats object via spread', () => {
      useUserStore.getState().setUser(minimalUser({ stats: { fans: 10, posts: 5, following: 2 } }));

      useUserStore.getState().updateProfile({ stats: { fans: 20, posts: 10, following: 5 } });
      expect(useUserStore.getState().user!.stats).toEqual({ fans: 20, posts: 10, following: 5 });
    });
  });

  // ========================================================================
  // 6. updateAvatar — updates avatar only
  // ========================================================================
  describe('updateAvatar', () => {
    it('should update only the avatar field', () => {
      useUserStore.getState().setUser(minimalUser({
        avatar: 'https://old.jpg',
        bio: 'keep me',
      }));

      useUserStore.getState().updateAvatar('https://new.jpg');
      const user = useUserStore.getState().user!;

      expect(user.avatar).toBe('https://new.jpg');
      expect(user.bio).toBe('keep me');
    });

    it('should do nothing if user is null', () => {
      useUserStore.getState().setUser(null);
      useUserStore.getState().updateAvatar('https://ignored.jpg');

      expect(useUserStore.getState().user).toBeNull();
    });

    it('should allow setting avatar to an empty string', () => {
      useUserStore.getState().setUser(minimalUser({ avatar: 'https://old.jpg' }));

      useUserStore.getState().updateAvatar('');
      expect(useUserStore.getState().user!.avatar).toBe('');
    });
  });

  // ========================================================================
  // 7. setLoading
  // ========================================================================
  describe('setLoading', () => {
    it('should set isLoading to true', () => {
      useUserStore.getState().setLoading(true);
      expect(useUserStore.getState().isLoading).toBe(true);
    });

    it('should set isLoading to false', () => {
      useUserStore.getState().setLoading(false);
      expect(useUserStore.getState().isLoading).toBe(false);
    });

    it('should not affect other state properties', () => {
      useUserStore.getState().setUser(minimalUser({ username: 'keep' }));
      useUserStore.getState().setLoading(true);

      const state = useUserStore.getState();
      expect(state.isLoading).toBe(true);
      expect(state.user!.username).toBe('keep');
      expect(state.isAuthenticated).toBe(true);
    });
  });

  // ========================================================================
  // 8. logout — complete reset
  // ========================================================================
  describe('logout', () => {
    it('should clear user, isAuthenticated, isLoading, and lastProfileFetchedAt', () => {
      useUserStore.getState().setUser(fullUser);
      expect(useUserStore.getState().isAuthenticated).toBe(true);

      useUserStore.getState().logout();
      const state = useUserStore.getState();

      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.lastProfileFetchedAt).toBeNull();
    });

    it('should be idempotent — calling logout twice does not throw', () => {
      useUserStore.getState().logout();
      useUserStore.getState().logout();
      expect(useUserStore.getState().user).toBeNull();
    });
  });

  // ========================================================================
  // 9. getFullName — full fallback chain
  // ========================================================================
  describe('getFullName', () => {
    it('should return empty string when user is null', () => {
      useUserStore.getState().setUser(null);
      expect(useUserStore.getState().getFullName()).toBe('');
    });

    it('should return businessName for pro_business with businessName', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_business',
        businessName: 'Acme Corp',
        fullName: 'John Doe',
        displayName: 'JohnD',
        firstName: 'John',
        lastName: 'Doe',
        username: 'johndoe',
      }));
      expect(useUserStore.getState().getFullName()).toBe('Acme Corp');
    });

    it('should NOT return businessName for pro_business without businessName', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_business',
        fullName: 'Fallback Name',
      }));
      expect(useUserStore.getState().getFullName()).toBe('Fallback Name');
    });

    it('should return fullName when present (non-business)', () => {
      useUserStore.getState().setUser(minimalUser({
        fullName: 'Alice Wonderland',
        displayName: 'AliceW',
        firstName: 'Alice',
        lastName: 'Wonderland',
        username: 'alicew',
      }));
      expect(useUserStore.getState().getFullName()).toBe('Alice Wonderland');
    });

    it('should return displayName when fullName is absent', () => {
      useUserStore.getState().setUser(minimalUser({
        displayName: 'AliceW',
        firstName: 'Alice',
        lastName: 'Wonderland',
        username: 'alicew',
      }));
      expect(useUserStore.getState().getFullName()).toBe('AliceW');
    });

    it('should construct from firstName + lastName when fullName and displayName are absent', () => {
      useUserStore.getState().setUser(minimalUser({
        firstName: 'Alice',
        lastName: 'Wonderland',
        username: 'alicew',
      }));
      expect(useUserStore.getState().getFullName()).toBe('Alice Wonderland');
    });

    it('should return firstName only when lastName is absent', () => {
      useUserStore.getState().setUser(minimalUser({
        firstName: 'Alice',
        username: 'alicew',
      }));
      expect(useUserStore.getState().getFullName()).toBe('Alice');
    });

    it('should return lastName only when firstName is absent', () => {
      useUserStore.getState().setUser(minimalUser({
        lastName: 'Wonderland',
        username: 'alicew',
      }));
      expect(useUserStore.getState().getFullName()).toBe('Wonderland');
    });

    it('should return username when no name fields are set', () => {
      useUserStore.getState().setUser(minimalUser({
        username: 'alicew',
      }));
      expect(useUserStore.getState().getFullName()).toBe('alicew');
    });

    it('should return "User" as ultimate fallback', () => {
      useUserStore.getState().setUser(minimalUser());
      expect(useUserStore.getState().getFullName()).toBe('User');
    });

    it('should return businessName even when accountType is pro_business and all other name fields exist', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_business',
        businessName: 'Business First',
        fullName: 'Should Not Show',
        displayName: 'Neither This',
        firstName: 'Nor',
        lastName: 'This',
        username: 'noruser',
      }));
      expect(useUserStore.getState().getFullName()).toBe('Business First');
    });
  });

  // ========================================================================
  // 10. isPro
  // ========================================================================
  describe('isPro', () => {
    it('should return true for pro_creator', () => {
      useUserStore.getState().setUser(minimalUser({ accountType: 'pro_creator' }));
      expect(useUserStore.getState().isPro()).toBe(true);
    });

    it('should return true for pro_business', () => {
      useUserStore.getState().setUser(minimalUser({ accountType: 'pro_business' }));
      expect(useUserStore.getState().isPro()).toBe(true);
    });

    it('should return false for personal', () => {
      useUserStore.getState().setUser(minimalUser({ accountType: 'personal' }));
      expect(useUserStore.getState().isPro()).toBe(false);
    });

    it('should return false when accountType is undefined', () => {
      useUserStore.getState().setUser(minimalUser());
      expect(useUserStore.getState().isPro()).toBe(false);
    });

    it('should return false when user is null', () => {
      useUserStore.getState().setUser(null);
      expect(useUserStore.getState().isPro()).toBe(false);
    });
  });

  // ========================================================================
  // 11. isProfileComplete
  // ========================================================================
  describe('isProfileComplete', () => {
    it('should return false when user is null', () => {
      useUserStore.getState().setUser(null);
      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    // --- Personal / pro_creator accounts ---
    it('should return true with username + fullName', () => {
      useUserStore.getState().setUser(minimalUser({ username: 'alice', fullName: 'Alice W' }));
      expect(useUserStore.getState().isProfileComplete()).toBe(true);
    });

    it('should return true with username + displayName', () => {
      useUserStore.getState().setUser(minimalUser({ username: 'alice', displayName: 'AliceW' }));
      expect(useUserStore.getState().isProfileComplete()).toBe(true);
    });

    it('should return true with username + firstName + lastName', () => {
      useUserStore.getState().setUser(minimalUser({ username: 'alice', firstName: 'Alice', lastName: 'W' }));
      expect(useUserStore.getState().isProfileComplete()).toBe(true);
    });

    it('should return false without username even if fullName is set', () => {
      useUserStore.getState().setUser(minimalUser({ fullName: 'Alice W' }));
      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return false with username but no name fields', () => {
      useUserStore.getState().setUser(minimalUser({ username: 'alice' }));
      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return false with username + firstName only (no lastName)', () => {
      useUserStore.getState().setUser(minimalUser({ username: 'alice', firstName: 'Alice' }));
      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return false with username + lastName only (no firstName)', () => {
      useUserStore.getState().setUser(minimalUser({ username: 'alice', lastName: 'W' }));
      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    // --- pro_business accounts ---
    it('should return true for pro_business with basic info + businessName + businessCategory', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_business',
        username: 'acmecorp',
        fullName: 'Acme Corp',
        businessName: 'Acme Corporation',
        businessCategory: 'Technology',
      }));
      expect(useUserStore.getState().isProfileComplete()).toBe(true);
    });

    it('should return false for pro_business missing businessName', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_business',
        username: 'acmecorp',
        fullName: 'Acme Corp',
        businessCategory: 'Technology',
      }));
      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return false for pro_business missing businessCategory', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_business',
        username: 'acmecorp',
        fullName: 'Acme Corp',
        businessName: 'Acme Corporation',
      }));
      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return false for pro_business missing basic info', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_business',
        businessName: 'Acme Corporation',
        businessCategory: 'Technology',
        // no username or name
      }));
      expect(useUserStore.getState().isProfileComplete()).toBe(false);
    });

    it('should return true for pro_creator with basic info (no business fields needed)', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_creator',
        username: 'creator1',
        displayName: 'The Creator',
      }));
      expect(useUserStore.getState().isProfileComplete()).toBe(true);
    });
  });

  // ========================================================================
  // 12. isProfileStale
  // ========================================================================
  describe('isProfileStale', () => {
    it('should return true when lastProfileFetchedAt is null', () => {
      useUserStore.setState({ lastProfileFetchedAt: null });
      expect(useUserStore.getState().isProfileStale()).toBe(true);
    });

    it('should return false when profile was just fetched', () => {
      useUserStore.getState().setUser(minimalUser());
      // setUser sets lastProfileFetchedAt to Date.now()
      expect(useUserStore.getState().isProfileStale()).toBe(false);
    });

    it('should return true when profile was fetched more than 5 minutes ago', () => {
      const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
      useUserStore.setState({ lastProfileFetchedAt: sixMinutesAgo });

      expect(useUserStore.getState().isProfileStale()).toBe(true);
    });

    it('should return false when profile was fetched less than 5 minutes ago', () => {
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      useUserStore.setState({ lastProfileFetchedAt: twoMinutesAgo });

      expect(useUserStore.getState().isProfileStale()).toBe(false);
    });

    it('should return true at exactly 5 minutes (boundary: 300_001 ms ago)', () => {
      const justOverThreshold = Date.now() - 300_001;
      useUserStore.setState({ lastProfileFetchedAt: justOverThreshold });

      expect(useUserStore.getState().isProfileStale()).toBe(true);
    });

    it('should return false at exactly the threshold (300_000 ms ago)', () => {
      // The condition is strictly greater than: Date.now() - ts > 300_000
      // So at exactly 300_000 it should be false.
      const exactlyAtThreshold = Date.now() - 300_000;
      useUserStore.setState({ lastProfileFetchedAt: exactlyAtThreshold });

      expect(useUserStore.getState().isProfileStale()).toBe(false);
    });

    it('should become stale after logout (lastProfileFetchedAt reset to null)', () => {
      useUserStore.getState().setUser(minimalUser());
      expect(useUserStore.getState().isProfileStale()).toBe(false);

      useUserStore.getState().logout();
      expect(useUserStore.getState().isProfileStale()).toBe(true);
    });
  });

  // ========================================================================
  // 13. selectIsProfileStale selector function
  // ========================================================================
  describe('selectIsProfileStale', () => {
    it('should return true when lastProfileFetchedAt is null', () => {
      const state = { lastProfileFetchedAt: null } as UserState;
      expect(selectIsProfileStale(state)).toBe(true);
    });

    it('should return false when fetched recently', () => {
      const state = { lastProfileFetchedAt: Date.now() } as UserState;
      expect(selectIsProfileStale(state)).toBe(false);
    });

    it('should return true when fetched more than 5 minutes ago', () => {
      const state = { lastProfileFetchedAt: Date.now() - 400_000 } as UserState;
      expect(selectIsProfileStale(state)).toBe(true);
    });

    it('should agree with the store method for fresh state', () => {
      useUserStore.getState().setUser(minimalUser());
      const storeResult = useUserStore.getState().isProfileStale();
      const selectorResult = selectIsProfileStale(useUserStore.getState());

      expect(selectorResult).toBe(storeResult);
    });

    it('should agree with the store method for stale state', () => {
      useUserStore.setState({ lastProfileFetchedAt: Date.now() - 600_000 });
      const storeResult = useUserStore.getState().isProfileStale();
      const selectorResult = selectIsProfileStale(useUserStore.getState());

      expect(selectorResult).toBe(storeResult);
    });

    it('should agree with the store method for null state', () => {
      useUserStore.setState({ lastProfileFetchedAt: null });
      const storeResult = useUserStore.getState().isProfileStale();
      const selectorResult = selectIsProfileStale(useUserStore.getState());

      expect(selectorResult).toBe(storeResult);
    });
  });

  // ========================================================================
  // 14. Security: partialize excludes sensitive fields
  // ========================================================================
  describe('Partialize (security)', () => {
    /**
     * The persist middleware uses partialize to select which state fields
     * are written to AsyncStorage. We extract the partialize function from
     * the persist options and verify that sensitive fields are excluded.
     *
     * We access the internal persist API exposed by zustand/middleware.
     */

    it('should include only safe fields in the persisted state', () => {
      useUserStore.getState().setUser(fullUser);

      // Access the persist API to get the partialize result
      const persistApi = (useUserStore as unknown as { persist: { getOptions: () => { partialize: (state: UserState) => unknown } } }).persist;
      const options = persistApi.getOptions();
      const partialState = options.partialize(useUserStore.getState()) as {
        user: Record<string, unknown> | null;
        isAuthenticated: boolean;
        lastProfileFetchedAt: number | null;
      };

      expect(partialState.user).not.toBeNull();
      const persistedUser = partialState.user!;

      // Verify included fields
      expect(persistedUser.id).toBe(fullUser.id);
      expect(persistedUser.username).toBe(fullUser.username);
      expect(persistedUser.fullName).toBe(fullUser.fullName);
      expect(persistedUser.displayName).toBe(fullUser.displayName);
      expect(persistedUser.firstName).toBe(fullUser.firstName);
      expect(persistedUser.lastName).toBe(fullUser.lastName);
      expect(persistedUser.avatar).toBe(fullUser.avatar);
      expect(persistedUser.coverImage).toBe(fullUser.coverImage);
      expect(persistedUser.bio).toBe(fullUser.bio);
      expect(persistedUser.accountType).toBe(fullUser.accountType);
      expect(persistedUser.isVerified).toBe(fullUser.isVerified);
      expect(persistedUser.isPremium).toBe(fullUser.isPremium);
      expect(persistedUser.interests).toEqual(fullUser.interests);
      expect(persistedUser.expertise).toEqual(fullUser.expertise);
      expect(persistedUser.businessName).toBe(fullUser.businessName);
      expect(persistedUser.businessCategory).toBe(fullUser.businessCategory);
      expect(persistedUser.locationsMode).toBe(fullUser.locationsMode);
      expect(persistedUser.stats).toEqual(fullUser.stats);

      // Verify excluded sensitive fields are NOT present
      expect(persistedUser).not.toHaveProperty('email');
      expect(persistedUser).not.toHaveProperty('dateOfBirth');
      expect(persistedUser).not.toHaveProperty('gender');
      expect(persistedUser).not.toHaveProperty('location');
      expect(persistedUser).not.toHaveProperty('website');
      expect(persistedUser).not.toHaveProperty('socialLinks');
      expect(persistedUser).not.toHaveProperty('businessAddress');
      expect(persistedUser).not.toHaveProperty('businessLatitude');
      expect(persistedUser).not.toHaveProperty('businessLongitude');
      expect(persistedUser).not.toHaveProperty('businessPhone');
    });

    it('should persist isAuthenticated and lastProfileFetchedAt at the top level', () => {
      useUserStore.getState().setUser(minimalUser());

      const persistApi = (useUserStore as unknown as { persist: { getOptions: () => { partialize: (state: UserState) => unknown } } }).persist;
      const options = persistApi.getOptions();
      const partialState = options.partialize(useUserStore.getState()) as {
        user: unknown;
        isAuthenticated: boolean;
        lastProfileFetchedAt: number | null;
      };

      expect(partialState.isAuthenticated).toBe(true);
      expect(partialState.lastProfileFetchedAt).toEqual(expect.any(Number));
    });

    it('should persist user as null when user is null', () => {
      useUserStore.getState().setUser(null);

      const persistApi = (useUserStore as unknown as { persist: { getOptions: () => { partialize: (state: UserState) => unknown } } }).persist;
      const options = persistApi.getOptions();
      const partialState = options.partialize(useUserStore.getState()) as {
        user: unknown;
        isAuthenticated: boolean;
        lastProfileFetchedAt: number | null;
      };

      expect(partialState.user).toBeNull();
      expect(partialState.isAuthenticated).toBe(false);
    });

    it('should NOT persist isLoading (transient state)', () => {
      useUserStore.getState().setUser(minimalUser());
      useUserStore.getState().setLoading(true);

      const persistApi = (useUserStore as unknown as { persist: { getOptions: () => { partialize: (state: UserState) => unknown } } }).persist;
      const options = persistApi.getOptions();
      const partialState = options.partialize(useUserStore.getState()) as Record<string, unknown>;

      expect(partialState).not.toHaveProperty('isLoading');
    });
  });

  // ========================================================================
  // Additional edge cases
  // ========================================================================
  describe('Edge Cases', () => {
    it('updateProfile after setUser(null) then setUser(user) should work', () => {
      useUserStore.getState().setUser(null);
      useUserStore.getState().setUser(minimalUser({ bio: 'start' }));
      useUserStore.getState().updateProfile({ bio: 'end' });

      expect(useUserStore.getState().user!.bio).toBe('end');
    });

    it('should handle rapid setUser calls correctly', () => {
      useUserStore.getState().setUser(minimalUser({ id: 'first' }));
      useUserStore.getState().setUser(minimalUser({ id: 'second' }));
      useUserStore.getState().setUser(minimalUser({ id: 'third' }));

      expect(useUserStore.getState().user!.id).toBe('third');
      expect(useUserStore.getState().isAuthenticated).toBe(true);
    });

    it('getFullName should handle firstName-only for pro_business without businessName', () => {
      useUserStore.getState().setUser(minimalUser({
        accountType: 'pro_business',
        firstName: 'Solo',
      }));
      // No businessName, no fullName, no displayName => firstName trimmed
      expect(useUserStore.getState().getFullName()).toBe('Solo');
    });

    it('authentication state cycle: setUser -> logout -> setUser -> setUser(null)', () => {
      useUserStore.getState().setUser(minimalUser());
      expect(useUserStore.getState().isAuthenticated).toBe(true);

      useUserStore.getState().logout();
      expect(useUserStore.getState().isAuthenticated).toBe(false);

      useUserStore.getState().setUser(minimalUser());
      expect(useUserStore.getState().isAuthenticated).toBe(true);

      useUserStore.getState().setUser(null);
      expect(useUserStore.getState().isAuthenticated).toBe(false);
    });

    it('updateAvatar should not change lastProfileFetchedAt', () => {
      useUserStore.getState().setUser(minimalUser({ avatar: 'old.jpg' }));
      const tsAfterSet = useUserStore.getState().lastProfileFetchedAt;

      useUserStore.getState().updateAvatar('new.jpg');
      const tsAfterAvatar = useUserStore.getState().lastProfileFetchedAt;

      expect(tsAfterAvatar).toBe(tsAfterSet);
    });
  });
});
