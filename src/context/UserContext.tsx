import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key
const USER_STORAGE_KEY = '@smuppy_user_profile';

/**
 * User data interface matching the complete onboarding data
 */
export interface UserData {
  id: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  avatar: string | null;
  bio: string;
  username: string;
  accountType: 'personal' | 'pro_creator' | 'pro_local';
  isVerified: boolean;
  isPremium: boolean;
  // Onboarding data
  interests: string[];
  expertise: string[];
  website: string;
  socialLinks: Record<string, string>;
  // Business data
  businessName: string;
  businessCategory: string;
  businessAddress: string;
  businessPhone: string;
  locationsMode?: string;
}

// Default values
const DEFAULT_USER: UserData = {
  id: null,
  firstName: '',
  lastName: '',
  fullName: '',
  displayName: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  avatar: null,
  bio: '',
  username: '',
  accountType: 'personal',
  isVerified: false,
  isPremium: false,
  // Onboarding data
  interests: [],
  expertise: [],
  website: '',
  socialLinks: {},
  // Business data
  businessName: '',
  businessCategory: '',
  businessAddress: '',
  businessPhone: '',
};

/**
 * Basic info update interface
 */
interface BasicInfoUpdate {
  firstName?: string;
  lastName?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: string;
}

/**
 * User context value interface
 */
interface UserContextValue {
  user: UserData;
  isLoading: boolean;
  updateProfile: (updates: Partial<UserData>) => Promise<UserData>;
  updateAvatar: (avatarUri: string | null) => Promise<UserData>;
  updateBasicInfo: (info: BasicInfoUpdate) => Promise<UserData>;
  resetUser: () => Promise<void>;
  isProfileComplete: () => boolean;
  getFullName: () => string;
  isPro: () => boolean;
}

// Create context
const UserContext = createContext<UserContextValue | undefined>(undefined);

interface UserProviderProps {
  children: ReactNode;
}

/**
 * UserProvider - Wrap your app with this provider
 *
 * Usage:
 * <UserProvider>
 *   <App />
 * </UserProvider>
 */
export function UserProvider({ children }: UserProviderProps): React.JSX.Element {
  const [user, setUser] = useState<UserData>(DEFAULT_USER);
  const [isLoading, setIsLoading] = useState(true);

  // Load data on startup
  useEffect(() => {
    loadUserData();
  }, []);

  // Load from AsyncStorage
  const loadUserData = async (): Promise<void> => {
    try {
      const stored = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UserData>;
        setUser({ ...DEFAULT_USER, ...parsed });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Save to AsyncStorage
  const saveUserData = async (newData: UserData): Promise<void> => {
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newData));
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  };

  // Update profile
  const updateProfile = async (updates: Partial<UserData>): Promise<UserData> => {
    const newUser = { ...user, ...updates };
    setUser(newUser);
    await saveUserData(newUser);
    return newUser;
  };

  // Update avatar
  const updateAvatar = async (avatarUri: string | null): Promise<UserData> => {
    return updateProfile({ avatar: avatarUri });
  };

  // Update basic info
  const updateBasicInfo = async ({
    firstName,
    lastName,
    email,
    dateOfBirth,
    gender,
  }: BasicInfoUpdate): Promise<UserData> => {
    return updateProfile({ firstName, lastName, email, dateOfBirth, gender });
  };

  // Reset (logout)
  const resetUser = async (): Promise<void> => {
    setUser(DEFAULT_USER);
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
  };

  // Check if profile is complete
  const isProfileComplete = (): boolean => {
    return !!(
      user.firstName &&
      user.lastName &&
      user.email &&
      user.dateOfBirth &&
      user.gender
    );
  };

  // Get full name
  const getFullName = (): string => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.firstName || user.lastName || 'User';
  };

  // Check if pro account
  const isPro = (): boolean => {
    return user.accountType === 'pro_creator' || user.accountType === 'pro_local';
  };

  const value: UserContextValue = {
    user,
    isLoading,
    updateProfile,
    updateAvatar,
    updateBasicInfo,
    resetUser,
    isProfileComplete,
    getFullName,
    isPro,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

/**
 * Hook to use UserContext
 *
 * Usage:
 * const { user, updateProfile } = useUser();
 */
export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

export default UserContext;
