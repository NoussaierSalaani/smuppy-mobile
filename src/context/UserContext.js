import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Clé pour AsyncStorage
const USER_STORAGE_KEY = '@smuppy_user_profile';

// Valeurs par défaut
const DEFAULT_USER = {
  id: null,
  firstName: '',
  lastName: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  avatar: null,
  bio: '',
  username: '',
  accountType: 'personal', // 'personal' | 'pro'
  isVerified: false,
  isPremium: false,
};

// Créer le context
const UserContext = createContext(undefined);

/**
 * UserProvider - Wrap ton app avec ce provider
 * 
 * Usage:
 * <UserProvider>
 *   <App />
 * </UserProvider>
 */
export function UserProvider({ children }) {
  const [user, setUser] = useState(DEFAULT_USER);
  const [isLoading, setIsLoading] = useState(true);

  // Charger les données au démarrage
  useEffect(() => {
    loadUserData();
  }, []);

  // Charger depuis AsyncStorage
  const loadUserData = async () => {
    try {
      const stored = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser({ ...DEFAULT_USER, ...parsed });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Sauvegarder dans AsyncStorage
  const saveUserData = async (newData) => {
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newData));
    } catch (error) {
      console.error('Error saving user data:', error);
    }
  };

  // Mettre à jour le profil
  const updateProfile = async (updates) => {
    const newUser = { ...user, ...updates };
    setUser(newUser);
    await saveUserData(newUser);
    return newUser;
  };

  // Mettre à jour l'avatar
  const updateAvatar = async (avatarUri) => {
    return updateProfile({ avatar: avatarUri });
  };

  // Mettre à jour les infos de base
  const updateBasicInfo = async ({ firstName, lastName, email, dateOfBirth, gender }) => {
    return updateProfile({ firstName, lastName, email, dateOfBirth, gender });
  };

  // Réinitialiser (logout)
  const resetUser = async () => {
    setUser(DEFAULT_USER);
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
  };

  // Vérifier si le profil est complet
  const isProfileComplete = () => {
    return !!(
      user.firstName &&
      user.lastName &&
      user.email &&
      user.dateOfBirth &&
      user.gender
    );
  };

  // Obtenir le nom complet
  const getFullName = () => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.firstName || user.lastName || 'User';
  };

  // Vérifier si c'est un compte Pro
  const isPro = () => user.accountType === 'pro';

  const value = {
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
 * Hook pour utiliser le UserContext
 * 
 * Usage:
 * const { user, updateProfile } = useUser();
 */
export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

export default UserContext;