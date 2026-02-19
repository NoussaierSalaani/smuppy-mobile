/**
 * Profile Types Tests
 * Tests for profile type utilities: INITIAL_USER_PROFILE, isEmailDerivedName,
 * resolveProfile, and resolveDisplayName.
 */

import {
  INITIAL_USER_PROFILE,
  isEmailDerivedName,
  resolveProfile,
  resolveDisplayName,
} from '../../types/profile';

describe('Profile Types', () => {
  describe('INITIAL_USER_PROFILE', () => {
    it('should have id as null', () => {
      expect(INITIAL_USER_PROFILE.id).toBeNull();
    });

    it('should have displayName as empty string', () => {
      expect(INITIAL_USER_PROFILE.displayName).toBe('');
    });

    it('should have stats with fans=0, posts=0, peaks=0', () => {
      expect(INITIAL_USER_PROFILE.stats.fans).toBe(0);
      expect(INITIAL_USER_PROFILE.stats.posts).toBe(0);
      expect(INITIAL_USER_PROFILE.stats.peaks).toBe(0);
    });
  });

  describe('isEmailDerivedName', () => {
    it('should return true for null name', () => {
      expect(isEmailDerivedName(null, 'test@example.com')).toBe(true);
    });

    it('should return true for undefined name', () => {
      expect(isEmailDerivedName(undefined, 'test@example.com')).toBe(true);
    });

    it('should return true when name matches email prefix', () => {
      expect(isEmailDerivedName('john123', 'john123@gmail.com')).toBe(true);
    });

    it('should return true when name matches email prefix ignoring non-alphanumeric', () => {
      expect(isEmailDerivedName('john.doe', 'johndoe@gmail.com')).toBe(true);
    });

    it('should return false when name differs from email prefix', () => {
      expect(isEmailDerivedName('Jane Doe', 'johndoe@gmail.com')).toBe(false);
    });

    it('should return true when name matches case-insensitively', () => {
      expect(isEmailDerivedName('JOHN123', 'john123@gmail.com')).toBe(true);
    });

    it('should return true when no email provided and name is null/undefined', () => {
      expect(isEmailDerivedName(null)).toBe(true);
      expect(isEmailDerivedName(undefined)).toBe(true);
    });
  });

  describe('resolveDisplayName', () => {
    it('should return fallback for null user', () => {
      expect(resolveDisplayName(null)).toBe('User');
    });

    it('should return fallback for undefined user', () => {
      expect(resolveDisplayName(undefined)).toBe('User');
    });

    it('should return custom fallback when provided', () => {
      expect(resolveDisplayName(null, 'Anonymous')).toBe('Anonymous');
    });

    it('should return business_name for pro_business account', () => {
      expect(
        resolveDisplayName({
          account_type: 'pro_business',
          business_name: 'My Shop',
          full_name: 'John Doe',
        })
      ).toBe('My Shop');
    });

    it('should return businessName (camelCase) for pro_business account', () => {
      expect(
        resolveDisplayName({
          accountType: 'pro_business',
          businessName: 'My Brand',
          fullName: 'Jane Doe',
        })
      ).toBe('My Brand');
    });

    it('should return full_name when available', () => {
      expect(
        resolveDisplayName({
          full_name: 'John Doe',
          display_name: 'johnny',
          username: 'jdoe',
        })
      ).toBe('John Doe');
    });

    it('should return fullName (camelCase) when available', () => {
      expect(
        resolveDisplayName({
          fullName: 'Jane Smith',
          displayName: 'janeS',
          username: 'jsmith',
        })
      ).toBe('Jane Smith');
    });

    it('should return display_name when no full_name', () => {
      expect(
        resolveDisplayName({
          display_name: 'CoolUser',
          username: 'cooluser123',
        })
      ).toBe('CoolUser');
    });

    it('should return username as last resort', () => {
      expect(
        resolveDisplayName({
          username: 'lastresort',
        })
      ).toBe('lastresort');
    });

    it('should ignore empty/whitespace strings and fall through to next field', () => {
      expect(
        resolveDisplayName({
          full_name: '  ',
          display_name: 'ValidDisplay',
          username: 'user1',
        })
      ).toBe('ValidDisplay');
    });
  });

  describe('resolveProfile', () => {
    it('should return default UserProfile for null/null inputs', () => {
      const result = resolveProfile(null, null);
      expect(result.id).toBeNull();
      expect(result.displayName).toBe('User');
      expect(result.username).toBe('');
      expect(result.accountType).toBe('personal');
      expect(result.stats.fans).toBe(0);
      expect(result.stats.posts).toBe(0);
      expect(result.stats.peaks).toBe(0);
    });

    it('should use profileData fields when available', () => {
      const result = resolveProfile(
        {
          id: 'profile-123',
          username: 'testuser',
          bio: 'Hello world',
          display_name: 'TestDisplay',
        },
        null
      );
      expect(result.id).toBe('profile-123');
      expect(result.username).toBe('testuser');
      expect(result.bio).toBe('Hello world');
      expect(result.displayName).toBe('TestDisplay');
    });

    it('should fall back to storeUser fields when profileData missing', () => {
      const result = resolveProfile(
        {},
        {
          id: 'store-456',
          username: 'storeuser',
          bio: 'Store bio',
          displayName: 'StoreName',
        }
      );
      expect(result.id).toBe('store-456');
      expect(result.username).toBe('storeuser');
      expect(result.bio).toBe('Store bio');
      expect(result.displayName).toBe('StoreName');
    });

    it('should set business_name as displayName for business accounts', () => {
      const result = resolveProfile(
        {
          account_type: 'pro_business',
          business_name: 'My Shop',
          full_name: 'Owner Name',
        },
        null
      );
      expect(result.displayName).toBe('My Shop');
    });

    it('should use non-email-derived fullName as displayName', () => {
      const result = resolveProfile(
        { full_name: 'john123' },
        {
          fullName: 'Jane Doe',
          email: 'different@example.com',
        }
      );
      expect(result.displayName).toBe('Jane Doe');
    });

    it('should skip email-derived fullName and fall through to display_name', () => {
      const result = resolveProfile(
        {
          full_name: 'john123',
          display_name: 'Johnny',
        },
        {
          fullName: 'john123',
          email: 'john123@gmail.com',
        }
      );
      expect(result.displayName).toBe('Johnny');
    });

    it('should aggregate stats from multiple sources', () => {
      const result = resolveProfile(
        {
          fan_count: 100,
          post_count: 50,
        },
        {
          stats: { fans: 10, posts: 5, peaks: 20 },
        }
      );
      expect(result.stats.fans).toBe(100);
      expect(result.stats.posts).toBe(50);
      expect(result.stats.peaks).toBe(20);
    });

    it('should default accountType to personal', () => {
      const result = resolveProfile({}, {});
      expect(result.accountType).toBe('personal');
    });
  });
});
