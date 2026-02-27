/**
 * Profile Types
 * Shared type definitions for profile-related components
 */

import { ACCOUNT_TYPE } from '../config/accountTypes';

// Type for profile data from various sources (API, store, context)
export interface ProfileDataSource {
  id?: string | null;
  full_name?: string;
  display_name?: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
  avatar_url?: string;
  avatar?: string;
  cover_url?: string;
  coverImage?: string;
  bio?: string;
  location?: string;
  businessAddress?: string;
  account_type?: string;
  accountType?: string;
  interests?: string[];
  expertise?: string[];
  website?: string;
  social_links?: Record<string, string>;
  socialLinks?: Record<string, string>;
  business_name?: string;
  businessName?: string;
  business_category?: string;
  businessCategory?: string;
  is_verified?: boolean;
  isVerified?: boolean;
  is_premium?: boolean;
  isPremium?: boolean;
  fan_count?: number;
  fans?: number;
  following_count?: number;
  following?: number;
  post_count?: number;
  posts?: number;
  peak_count?: number;
  peaks?: number;
  stats?: { fans?: number; posts?: number; peaks?: number; following?: number };
}

// Normalized user profile for UI display
export interface UserProfile {
  id: string | null;
  displayName: string;
  username: string;
  avatar: string | null;
  coverImage: string | null;
  bio: string;
  location: string;
  accountType: 'personal' | 'pro_creator' | 'pro_business';
  interests: string[];
  expertise: string[];
  website: string;
  socialLinks: Record<string, string>;
  businessName: string;
  businessCategory: string;
  isVerified: boolean;
  isPremium: boolean;
  stats: {
    fans: number;
    posts: number;
    peaks: number;
    following?: number;
  };
}

// Initial empty user
export const INITIAL_USER_PROFILE: UserProfile = {
  id: null,
  displayName: '',
  username: '',
  avatar: null,
  coverImage: null,
  bio: '',
  location: '',
  accountType: 'personal',
  interests: [],
  expertise: [],
  website: '',
  socialLinks: {},
  businessName: '',
  businessCategory: '',
  isVerified: false,
  isPremium: false,
  stats: {
    fans: 0,
    posts: 0,
    peaks: 0,
  },
};

// Helper to check if a name looks like an email-derived username
export const isEmailDerivedName = (name: string | undefined | null, email?: string): boolean => {
  if (!name) return true;
  const emailPrefix = email?.split('@')[0]?.toLowerCase() || '';
  return (
    name.toLowerCase() === emailPrefix.toLowerCase() ||
    name.toLowerCase().replaceAll(/[^a-z0-9]/g, '') === emailPrefix.replaceAll(/[^a-z0-9]/g, '')
  );
};

// Resolve profile from multiple data sources
export const resolveProfile = (
  profileData: ProfileDataSource | null | undefined,
  storeUser: ProfileDataSource | null | undefined
): UserProfile => {
  const base = (profileData || {}) as ProfileDataSource;
  const fallback = (storeUser || {}) as ProfileDataSource;

  // Build display name
  // Priority: businessName (if business) > fullName (non-email) > full_name (non-email) > display_name > displayName > firstName+lastName > full_name > fullName
  let displayName = 'User';
  const email = fallback.email || base.email || '';

  // Business accounts: prioritize business_name
  const isBusiness = (base.account_type || base.accountType || fallback.accountType) === ACCOUNT_TYPE.PRO_BUSINESS;
  const bName = base.business_name || base.businessName || fallback.businessName;
  if (isBusiness && bName && bName.trim()) {
    displayName = bName;
  } else if (fallback.fullName && !isEmailDerivedName(fallback.fullName, email)) {
    displayName = fallback.fullName;
  } else if (base.full_name && !isEmailDerivedName(base.full_name, email)) {
    displayName = base.full_name;
  } else if (base.display_name) {
    displayName = base.display_name;
  } else if (fallback.displayName) {
    displayName = fallback.displayName;
  } else if (fallback.firstName && fallback.lastName) {
    displayName = `${fallback.firstName} ${fallback.lastName}`.trim();
  } else if (base.full_name) {
    displayName = base.full_name;
  } else if (fallback.fullName) {
    displayName = fallback.fullName;
  }

  return {
    id: base.id || fallback.id || null,
    displayName,
    username: base.username || fallback.username || '',
    avatar: base.avatar_url || fallback.avatar || null,
    coverImage: base.cover_url || fallback.coverImage || null,
    bio: base.bio || fallback.bio || '',
    location: base.location || fallback.location || fallback.businessAddress || '',
    accountType: (base.account_type || base.accountType || fallback.accountType || 'personal') as UserProfile['accountType'],
    interests: base.interests || fallback.interests || [],
    expertise: base.expertise || fallback.expertise || [],
    website: base.website || fallback.website || '',
    socialLinks: base.social_links || fallback.socialLinks || {},
    businessName: base.business_name || base.businessName || fallback.businessName || '',
    businessCategory: base.business_category || base.businessCategory || fallback.businessCategory || '',
    isVerified: base.is_verified ?? fallback.isVerified ?? false,
    isPremium: base.is_premium ?? fallback.isPremium ?? false,
    stats: {
      fans: base.fan_count ?? base.fans ?? fallback.stats?.fans ?? 0,
      posts: base.post_count ?? base.posts ?? fallback.stats?.posts ?? 0,
      peaks: base.peak_count ?? base.peaks ?? fallback.stats?.peaks ?? 0,
      following: base.following_count ?? base.following ?? fallback.stats?.following ?? 0,
    },
  };
};

/**
 * Resolve display name for any user object from the API.
 * Business accounts use business_name; others use full_name/display_name.
 * Properly handles empty strings as falsy values.
 */
export const resolveDisplayName = (user: {
  account_type?: string | null;
  accountType?: string | null;
  business_name?: string | null;
  businessName?: string | null;
  full_name?: string | null;
  fullName?: string | null;
  display_name?: string | null;
  displayName?: string | null;
  username?: string | null;
} | null | undefined, fallback = 'User'): string => {
  if (!user) return fallback;

  // Business accounts use business_name
  const isBusiness = (user.account_type || user.accountType) === ACCOUNT_TYPE.PRO_BUSINESS;
  const bName = user.business_name || user.businessName;
  if (isBusiness && bName?.trim()) return bName;

  // Check each field explicitly, treating empty/whitespace strings as falsy
  const fullName = user.full_name || user.fullName;
  if (fullName?.trim()) return fullName;

  const displayName = user.display_name || user.displayName;
  if (displayName?.trim()) return displayName;

  // Fallback to username
  if (user.username?.trim()) return user.username;

  return fallback;
};
