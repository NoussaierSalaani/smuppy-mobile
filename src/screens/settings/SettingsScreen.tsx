import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  StatusBar,
  ActivityIndicator,
  Switch,
  ScrollView,
} from 'react-native';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as backend from '../../services/backend';
import { awsAPI } from '../../services/aws-api';
import { unregisterPushToken } from '../../services/notifications';
import { useCurrentProfile, useUpdateProfile } from '../../hooks';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../hooks/useTheme';
import { resetAllStores, useUserStore } from '../../stores';
import type { ThemePreference } from '../../stores/themeStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { HIT_SLOP } from '../../config/theme';
import { hapticButtonPress, hapticDestructive } from '../../utils/haptics';
import { VerifiedBadge } from '../../components/Badge';

const COVER_HEIGHT = 160;

/** Sanitize text: strip HTML tags and control characters per CLAUDE.md */
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
};

interface SettingsScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
  const insets = useSafeAreaInsets();
  const { preference, setTheme, colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const user = useUserStore((state) => state.user);
  const getFullName = useUserStore((state) => state.getFullName);
  const { data: profileData, refetch } = useCurrentProfile();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [_username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [expertise, setExpertise] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const loadUserData = useCallback(async () => {
    try {
      const authUser = await backend.getCurrentUser();
      const email = authUser?.email || user?.email || '';
      const emailPrefix = email?.split('@')[0]?.toLowerCase() || '';

      const isEmailDerivedName = (name: string | undefined | null): boolean => {
        if (!name) return true;
        return name.toLowerCase() === emailPrefix ||
               name.toLowerCase().replace(/[^a-z0-9]/g, '') === emailPrefix.replace(/[^a-z0-9]/g, '');
      };

      let name = 'User';
      const candidates = [
        user?.fullName,
        profileData?.full_name,
        user?.displayName,
        getFullName?.(),
      ].filter(Boolean) as string[];

      for (const candidate of candidates) {
        if (!isEmailDerivedName(candidate)) {
          name = candidate;
          break;
        }
      }
      if (name === 'User' && candidates.length > 0) {
        name = candidates[0];
      }
      if (name === 'User') {
        name = emailPrefix || 'User';
      }

      const avatar = profileData?.avatar_url || user?.avatar || null;
      const cover = profileData?.cover_url || null;
      const userInterests = profileData?.interests || user?.interests || [];
      const userExpertise = profileData?.expertise || user?.expertise || [];
      setExpertise(userExpertise);
      const userUsername = profileData?.username || authUser?.username || emailPrefix || '';

      setDisplayName(name);
      setUsername(userUsername);
      setAvatarUrl(avatar);
      setCoverUrl(cover);
      setInterests(userInterests);
      setIsPrivate(profileData?.is_private || false);
    } catch {
      const emailPrefix = user?.email?.split('@')[0] || '';
      setDisplayName(user?.fullName || profileData?.full_name || user?.displayName || getFullName?.() || emailPrefix || 'User');
      setUsername(profileData?.username || emailPrefix || '');
      setAvatarUrl(profileData?.avatar_url || user?.avatar || null);
      setCoverUrl(profileData?.cover_url || null);
      setInterests(profileData?.interests || user?.interests || []);
      setIsPrivate(profileData?.is_private || false);
    }
  }, [user, getFullName, profileData]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  const togglePrivacy = async () => {
    if (togglingPrivacy) return;
    setTogglingPrivacy(true);
    try {
      const newValue = !isPrivate;
      await updateDbProfile({ is_private: newValue });
      setIsPrivate(newValue);
      await refetch();
    } catch (error) {
      if (__DEV__) console.warn('Toggle privacy error:', error);
      showError('Error', 'Failed to update privacy setting.');
    } finally {
      setTogglingPrivacy(false);
    }
  };

  // Separate checks for creator-only vs all pro features
  const isProCreator = user?.accountType === 'pro_creator';
  const isProBusiness = user?.accountType === 'pro_business';
  const isPro = isProCreator || isProBusiness;

  const ACCOUNT_ITEMS = [
    { id: 'profile', icon: 'person-outline' as const, label: 'Edit Profile', screen: 'EditProfile' },
    ...(!isProCreator ? [{ id: 'interests', icon: 'heart-outline' as const, label: 'Interests', screen: 'EditInterests', params: { currentInterests: interests } }] : []),
    ...(isProBusiness ? [{ id: 'category', icon: 'storefront-outline' as const, label: 'Business Category', screen: 'EditBusinessCategory', params: { currentCategory: user?.businessCategory } }] : []),
    ...(isPro ? [{ id: 'expertise', icon: 'school-outline' as const, label: 'Areas of Expertise', screen: 'EditExpertise', params: { currentExpertise: expertise } }] : []),
    { id: 'password', icon: 'lock-closed-outline' as const, label: 'Password', screen: 'PasswordManager' },
    { id: 'activity', icon: 'time-outline' as const, label: 'Your Activity', screen: 'ActivityHistory' },
  ];

  const PREFERENCES_ITEMS = [
    { id: 'notifications', icon: 'notifications-outline' as const, label: 'Notifications', screen: 'NotificationSettings' },
    { id: 'followRequests', icon: 'person-add-outline' as const, label: 'Follow Requests', screen: 'FollowRequests' },
  ];

  const SUPPORT_ITEMS = [
    { id: 'blocked', icon: 'ban-outline' as const, label: 'Blocked Users', screen: 'BlockedUsers' },
    { id: 'muted', icon: 'volume-mute-outline' as const, label: 'Muted Users', screen: 'MutedUsers' },
    { id: 'report', icon: 'alert-circle-outline' as const, label: 'Report a Problem', screen: 'ReportProblem' },
    { id: 'terms', icon: 'document-text-outline' as const, label: 'Terms & Policies', screen: 'TermsPolicies' },
  ];

  const handleLogout = useCallback(async () => {
    hapticDestructive();
    setLoggingOut(true);
    try {
      // Unregister push token before clearing auth (best-effort, don't block logout)
      await unregisterPushToken(user?.id || '').catch(() => {});

      // Clear SecureStore auth keys (remember me, tokens, etc.)
      await storage.clear([
        STORAGE_KEYS.REMEMBER_ME,
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER_ID,
      ]);
      // Clear AsyncStorage (Zustand persisted store, cached profile data)
      await AsyncStorage.multiRemove([
        '@smuppy_saved_email',
        '@smuppy_user_profile',
        '@smuppy_user_store', // Zustand persisted store - CRITICAL!
      ]);
      // Reset all Zustand stores (user, feed, auth, app)
      resetAllStores();

      setShowLogoutModal(false);
      // signOut triggers onAuthStateChange in AppNavigator which auto-navigates to Auth
      // No need for manual navigation.reset - it causes "action not handled" warning
      await backend.signOut();
    } catch (error) {
      if (__DEV__) console.warn('Logout error:', error);
      setShowLogoutModal(false);
    } finally {
      setLoggingOut(false);
    }
  }, [user?.id]);

  const handleDeleteAccount = useCallback(async () => {
    hapticDestructive();
    setDeleting(true);
    try {
      const currentUser = await backend.getCurrentUser();
      if (!currentUser) {
        showError('Error', 'User not found');
        return;
      }

      // Unregister push token before deleting account (best-effort)
      await unregisterPushToken(user?.id || '').catch(() => {});

      // Delete account via AWS Lambda
      await awsAPI.deleteAccount();

      // Clear SecureStore auth keys
      await storage.clear([
        STORAGE_KEYS.REMEMBER_ME,
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.REFRESH_TOKEN,
        STORAGE_KEYS.USER_ID,
      ]);
      // Clear AsyncStorage (Zustand persisted store, cached profile data)
      await AsyncStorage.multiRemove([
        '@smuppy_saved_email',
        '@smuppy_user_profile',
        '@smuppy_user_store', // Zustand persisted store - CRITICAL!
      ]);
      // Reset all Zustand stores
      resetAllStores();

      setShowDeleteModal(false);
      // signOut triggers onAuthStateChange in AppNavigator which auto-navigates to Auth
      // No need for manual navigation.reset - it causes "action not handled" warning
      await backend.signOut();
    } catch (error) {
      if (__DEV__) console.warn('Delete account error:', error);
      showError('Error', 'Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [user?.id, showError]);

  const handleMenuItemPress = useCallback((item: { screen: string; params?: Record<string, unknown> }) => {
    hapticButtonPress();
    navigation.navigate(item.screen, item.params);
  }, [navigation]);

  const handleGoBack = useCallback(() => {
    hapticButtonPress();
    navigation.goBack();
  }, [navigation]);

  const handleNavigateUpgradeToPro = useCallback(() => {
    navigation.navigate('UpgradeToPro');
  }, [navigation]);

  const handleNavigateCreatorWallet = useCallback(() => {
    hapticButtonPress();
    navigation.navigate('CreatorWallet');
  }, [navigation]);

  const handleNavigatePlatformSubscription = useCallback(() => {
    hapticButtonPress();
    navigation.navigate('PlatformSubscription');
  }, [navigation]);

  const handleNavigateIdentityVerification = useCallback(() => {
    hapticButtonPress();
    navigation.navigate('IdentityVerification');
  }, [navigation]);

  const handleNavigatePaymentMethods = useCallback(() => {
    hapticButtonPress();
    navigation.navigate('PaymentMethods');
  }, [navigation]);

  const handleNavigatePrivateSessions = useCallback(() => {
    hapticButtonPress();
    navigation.navigate('PrivateSessionsManage');
  }, [navigation]);

  const handleShowLogoutModal = useCallback(() => {
    hapticDestructive();
    setShowLogoutModal(true);
  }, []);

  const handleShowDeleteModal = useCallback(() => {
    hapticDestructive();
    setShowDeleteModal(true);
  }, []);

  const handleCancelLogout = useCallback(() => {
    hapticButtonPress();
    setShowLogoutModal(false);
  }, []);

  const handleConfirmLogout = useCallback(() => {
    hapticDestructive();
    handleLogout();
  }, [handleLogout]);

  const handleCancelDelete = useCallback(() => {
    hapticButtonPress();
    setShowDeleteModal(false);
  }, []);

  const handleConfirmDelete = useCallback(() => {
    hapticDestructive();
    handleDeleteAccount();
  }, [handleDeleteAccount]);

  const handleLogoutModalClose = useCallback(() => {
    if (!loggingOut) setShowLogoutModal(false);
  }, [loggingOut]);

  const handleDeleteModalClose = useCallback(() => {
    if (!deleting) setShowDeleteModal(false);
  }, [deleting]);

  const backButtonTopStyle = useMemo(() => ({ top: insets.top + 10 }), [insets.top]);
  const headerTitleTopStyle = useMemo(() => ({ top: insets.top + 14 }), [insets.top]);

  const renderMenuItem = (item: { id: string; icon: React.ComponentProps<typeof Ionicons>['name']; label: string; screen: string; params?: Record<string, unknown> }, index: number) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.menuItem, index === 0 && styles.menuItemFirst]}
      onPress={() => handleMenuItemPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.menuItemIcon}>
        <Ionicons name={item.icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.menuItemLabel}>{item.label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.primary} />
    </TouchableOpacity>
  );

  const renderLogoutModal = () => (
    <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={handleLogoutModalClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconBox}>
            <Ionicons name="log-out-outline" size={32} color={colors.error} />
          </View>
          <Text style={styles.modalTitle}>Log out</Text>
          <Text style={styles.modalMessage}>Are you sure you want to log out of your account?</Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelLogout} disabled={loggingOut}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={handleConfirmLogout} disabled={loggingOut}>
              {loggingOut ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.logoutButtonText}>Yes, Logout</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderDeleteModal = () => (
    <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={handleDeleteModalClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconBox}>
            <Ionicons name="trash-outline" size={32} color={colors.error} />
          </View>
          <Text style={styles.modalTitle}>Delete Account</Text>
          <Text style={styles.modalMessage}>This action is permanent and cannot be undone. All your data, posts, and connections will be deleted.</Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelDelete} disabled={deleting}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={handleConfirmDelete} disabled={deleting}>
              {deleting ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.logoutButtonText}>Delete</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Cover Photo */}
        <View style={styles.headerSection}>
          {coverUrl ? (
            <OptimizedImage source={coverUrl} style={styles.coverImage} />
          ) : (
            <View style={[styles.coverImage, styles.coverPlaceholder]}>
              <LinearGradient
                colors={[colors.primary, '#0A8F6A', '#064E3B']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
            </View>
          )}

          {/* Gradient Overlay */}
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.5)']}
            style={styles.coverGradient}
          />

          {/* Back Button */}
          <TouchableOpacity
            style={[styles.backButton, backButtonTopStyle]}
            onPress={handleGoBack}
            hitSlop={HIT_SLOP.medium}
          >
            <Ionicons name="arrow-back" size={24} color={colors.white} />
          </TouchableOpacity>

          {/* Settings Title */}
          <Text style={[styles.headerTitle, headerTitleTopStyle]}>Settings</Text>

          {/* Profile Info on Cover */}
          <View style={styles.profileOnCover}>
            <View style={styles.avatarContainer}>
              {avatarUrl ? (
                <AvatarImage source={avatarUrl} size={80} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={36} color={colors.gray400} />
                </View>
              )}
              {user?.isVerified && (
                <View style={styles.avatarBadge}>
                  <Ionicons name="checkmark" size={12} color={colors.white} />
                </View>
              )}
            </View>
            <Text style={styles.displayName}>{sanitizeText(displayName)}</Text>
          </View>
        </View>

        {/* Menu Sections */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.menuCard}>
            {ACCOUNT_ITEMS.map((item, index) => renderMenuItem(item, index))}
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.menuCard}>
            {PREFERENCES_ITEMS.map((item, index) => renderMenuItem(item, index))}

            {/* Privacy Toggle */}
            <View style={styles.menuItem}>
              <View style={styles.menuItemIcon}>
                <Ionicons name={isPrivate ? 'lock-closed-outline' : 'lock-open-outline'} size={20} color={colors.primary} />
              </View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemLabel}>Private Account</Text>
                <Text style={styles.menuItemSubtitle}>
                  {isPrivate ? 'Only fans see your content' : 'Everyone can see'}
                </Text>
              </View>
              <Switch
                value={isPrivate}
                onValueChange={togglePrivacy}
                trackColor={{ false: colors.gray200, true: colors.primary }}
                thumbColor={colors.white}
                ios_backgroundColor={colors.gray200}
                disabled={togglingPrivacy}
              />
            </View>

            {/* Appearance Toggle */}
            <View style={styles.menuItem}>
              <View style={styles.menuItemIcon}>
                <Ionicons name="contrast-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.menuItemLabel}>Appearance</Text>
              <View style={styles.appearanceChips}>
                {APPEARANCE_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.appearanceChip,
                      preference === opt.value && styles.appearanceChipActive,
                    ]}
                    onPress={() => setTheme(opt.value)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.appearanceChipText,
                        preference === opt.value && styles.appearanceChipTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.menuCard}>
            {SUPPORT_ITEMS.map((item, index) => renderMenuItem(item, index))}
          </View>
        </View>

        {/* Payments & Monetization */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Payments & Monetization</Text>
          <View style={styles.menuCard}>
            {/* Upgrade to Pro Creator - Only for personal accounts */}
            {user?.accountType === 'personal' && (
              <TouchableOpacity
                style={[styles.menuItem, styles.menuItemFirst, styles.upgradeItem]}
                onPress={handleNavigateUpgradeToPro}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[colors.primary, '#00B5C1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.upgradeGradient}
                >
                  <View style={styles.upgradeIconContainer}>
                    <Ionicons name="star" size={20} color={colors.white} />
                  </View>
                  <View style={styles.upgradeTextContainer}>
                    <Text style={styles.upgradeTitle}>Upgrade to Pro Creator</Text>
                    <Text style={styles.upgradeSubtitle}>Unlock tips, unlimited events & more</Text>
                  </View>
                  <View style={styles.upgradeArrow}>
                    <Ionicons name="arrow-forward" size={18} color={colors.white} />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Creator Wallet - Not for personal accounts */}
            {user?.accountType !== 'personal' && (
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemFirst]}
              onPress={handleNavigateCreatorWallet}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.menuItemIconWallet]}>
                <Ionicons name="wallet-outline" size={20} color={colors.success} />
              </View>
              <Text style={styles.menuItemLabel}>Creator Wallet</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
            )}

            {/* Go Pro - Not for personal accounts */}
            {user?.accountType !== 'personal' && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleNavigatePlatformSubscription}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.menuItemIconPro]}>
                <Ionicons name="rocket-outline" size={20} color={colors.purple} />
              </View>
              <Text style={styles.menuItemLabel}>Go Pro</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleNavigateIdentityVerification}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.menuItemIconVerification]}>
                <VerifiedBadge size={20} />
              </View>
              <View style={styles.menuItemContent}>
                <Text style={styles.menuItemLabel}>Identity Verification</Text>
                <Text style={styles.menuItemSubtitle}>
                  {user?.isVerified ? 'Active' : 'Not verified'}
                </Text>
              </View>
              {user?.isVerified ? (
                <View style={styles.verifiedStatusDot} />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              )}
            </TouchableOpacity>

            {/* Payment Methods - All users */}
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleNavigatePaymentMethods}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.menuItemIconPayment]}>
                <Ionicons name="card-outline" size={20} color={colors.purple} />
              </View>
              <Text style={styles.menuItemLabel}>Payment Methods</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>

            {/* Private Sessions - Creator & Business */}
            {isPro && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleNavigatePrivateSessions}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.menuItemIconSessions]}>
                <Ionicons name="videocam-outline" size={20} color={colors.orange} />
              </View>
              <Text style={styles.menuItemLabel}>Private Sessions</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
            </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.menuSection}>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemFirst]}
              onPress={handleShowLogoutModal}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.dangerIcon]}>
                <Ionicons name="log-out-outline" size={20} color={colors.error} />
              </View>
              <Text style={[styles.menuItemLabel, styles.dangerLabel]}>Logout</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.error} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleShowDeleteModal}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.dangerIcon]}>
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </View>
              <Text style={[styles.menuItemLabel, styles.dangerLabel]}>Delete Account</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {renderLogoutModal()}
      {renderDeleteModal()}
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof import('../../config/theme').getThemeColors>, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Header Section
  headerSection: {
    height: COVER_HEIGHT + 80,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: COVER_HEIGHT,
    position: 'absolute',
    top: 0,
  },
  coverPlaceholder: {
    overflow: 'hidden',
  },
  coverGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerTitle: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 17,
    fontFamily: 'WorkSans-SemiBold',
    color: colors.white,
    zIndex: 10,
  },
  profileOnCover: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: colors.gray100,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.gray200,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.gray100,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.gray100,
  },
  displayName: {
    fontSize: 18,
    fontFamily: 'WorkSans-Bold',
    color: colors.gray900,
  },
  username: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: colors.gray500,
    marginTop: 2,
  },

  // Menu Sections
  menuSection: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: 'WorkSans-SemiBold',
    color: colors.gray500,
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    backgroundColor: colors.background,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  menuItemFirst: {
    borderTopWidth: 0,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemContent: {
    flex: 1,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
    color: colors.gray900,
  },
  menuItemSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: colors.gray400,
    marginTop: 1,
  },
  verifiedStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  appearanceChips: {
    flexDirection: 'row',
    gap: 6,
  },
  appearanceChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.gray100,
  },
  appearanceChipActive: {
    backgroundColor: colors.primary,
  },
  appearanceChipText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: colors.gray500,
  },
  appearanceChipTextActive: {
    color: colors.white,
  },
  menuItemIconWallet: {
    backgroundColor: isDark ? colors.backgroundSecondary : '#E8F5E9',
  },
  menuItemIconPro: {
    backgroundColor: isDark ? colors.backgroundSecondary : '#EDE7F6',
  },
  menuItemIconVerification: {
    backgroundColor: isDark ? colors.backgroundSecondary : '#E3F2FD',
  },
  menuItemIconPayment: {
    backgroundColor: isDark ? colors.backgroundSecondary : '#F3E5F5',
  },
  menuItemIconSessions: {
    backgroundColor: isDark ? colors.backgroundSecondary : '#FFF3E0',
  },
  dangerIcon: {
    backgroundColor: colors.errorLight,
  },
  dangerLabel: {
    color: colors.error,
  },

  // Upgrade to Pro Creator
  upgradeItem: {
    padding: 0,
    overflow: 'hidden',
  },
  upgradeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: '100%',
  },
  upgradeIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  upgradeTextContainer: {
    flex: 1,
  },
  upgradeTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: colors.white,
  },
  upgradeSubtitle: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },
  upgradeArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  modalIconBox: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'WorkSans-Bold',
    color: colors.gray900,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: colors.gray500,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: colors.primary,
  },
  logoutButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: colors.white,
  },
});

export default SettingsScreen;
