import React, { useState, useEffect, useCallback } from 'react';
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
import { biometrics } from '../../utils/biometrics';
import { useCurrentProfile, useUpdateProfile } from '../../hooks';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '../../config/theme';
import { resetAllStores, useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

const COVER_HEIGHT = 160;

type BiometricType = 'face' | 'fingerprint' | null;

interface SettingsScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
  const insets = useSafeAreaInsets();
  const { showError } = useSmuppyAlert();
  const user = useUserStore((state) => state.user);
  const getFullName = useUserStore((state) => state.getFullName);
  const { data: profileData, refetch } = useCurrentProfile();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [expertise, setExpertise] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);

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
    checkBiometrics();
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
      console.error('Toggle privacy error:', error);
      showError('Error', 'Failed to update privacy setting.');
    } finally {
      setTogglingPrivacy(false);
    }
  };

  const checkBiometrics = async () => {
    const available = await biometrics.isAvailable();
    setBiometricAvailable(available);
    if (available) {
      const type = await biometrics.getType();
      setBiometricType(type);
    }
  };

  // Separate checks for creator-only vs all pro features
  const isProCreator = user?.accountType === 'pro_creator';
  const isPro = isProCreator || user?.accountType === 'pro_business';

  const MENU_ITEMS = [
    { id: 'profile', icon: 'person-outline' as const, label: 'Edit Profile', screen: 'EditProfile' },
    // Personal → Interests only, Pro → Expertise only
    ...(!isPro ? [{ id: 'interests', icon: 'heart-outline' as const, label: 'Interests', screen: 'EditInterests', params: { currentInterests: interests } }] : []),
    ...(isProCreator ? [{ id: 'expertise', icon: 'school-outline' as const, label: 'Areas of Expertise', screen: 'EditExpertise', params: { currentExpertise: expertise } }] : []),
    { id: 'password', icon: 'lock-closed-outline' as const, label: 'Password', screen: 'PasswordManager' },
    ...(biometricAvailable ? [{ id: 'biometric', icon: (biometricType === 'face' ? 'scan-outline' : 'finger-print-outline') as 'scan-outline' | 'finger-print-outline', label: biometricType === 'face' ? 'Face ID' : 'Touch ID', screen: 'FacialRecognition' }] : []),
    { id: 'notifications', icon: 'notifications-outline' as const, label: 'Notifications', screen: 'NotificationSettings' },
    { id: 'followRequests', icon: 'person-add-outline' as const, label: 'Follow Requests', screen: 'FollowRequests' },
    { id: 'blocked', icon: 'ban-outline' as const, label: 'Blocked Users', screen: 'BlockedUsers' },
    { id: 'muted', icon: 'volume-mute-outline' as const, label: 'Muted Users', screen: 'MutedUsers' },
    { id: 'report', icon: 'alert-circle-outline' as const, label: 'Report a Problem', screen: 'ReportProblem' },
    { id: 'terms', icon: 'document-text-outline' as const, label: 'Terms & Policies', screen: 'TermsPolicies' },
  ];

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
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
      await biometrics.disable();
      setShowLogoutModal(false);
      // signOut triggers onAuthStateChange in AppNavigator which auto-navigates to Auth
      // No need for manual navigation.reset - it causes "action not handled" warning
      await backend.signOut();
    } catch (error) {
      console.error('Logout error:', error);
      setShowLogoutModal(false);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const currentUser = await backend.getCurrentUser();
      if (!currentUser) {
        showError('Error', 'User not found');
        return;
      }

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
      await biometrics.disable();
      setShowDeleteModal(false);
      // signOut triggers onAuthStateChange in AppNavigator which auto-navigates to Auth
      // No need for manual navigation.reset - it causes "action not handled" warning
      await backend.signOut();
    } catch (error) {
      console.error('Delete account error:', error);
      showError('Error', 'Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const renderMenuItem = (item: typeof MENU_ITEMS[0], index: number) => (
    <TouchableOpacity
      key={item.id}
      style={[styles.menuItem, index === 0 && styles.menuItemFirst]}
      onPress={() => navigation.navigate(item.screen, item.params)}
      activeOpacity={0.7}
    >
      <View style={styles.menuItemIcon}>
        <Ionicons name={item.icon} size={20} color={COLORS.primaryGreen} />
      </View>
      <Text style={styles.menuItemLabel}>{item.label}</Text>
      <Ionicons name="chevron-forward" size={18} color={COLORS.primaryGreen} />
    </TouchableOpacity>
  );

  const renderLogoutModal = () => (
    <Modal visible={showLogoutModal} transparent animationType="fade" onRequestClose={() => !loggingOut && setShowLogoutModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconBox}>
            <Ionicons name="log-out-outline" size={32} color="#FF3B30" />
          </View>
          <Text style={styles.modalTitle}>Log out</Text>
          <Text style={styles.modalMessage}>Are you sure you want to log out of your account?</Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowLogoutModal(false)} disabled={loggingOut}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} disabled={loggingOut}>
              {loggingOut ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.logoutButtonText}>Yes, Logout</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderDeleteModal = () => (
    <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => !deleting && setShowDeleteModal(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={[styles.modalIconBox, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="trash-outline" size={32} color="#FF3B30" />
          </View>
          <Text style={styles.modalTitle}>Delete Account</Text>
          <Text style={styles.modalMessage}>This action is permanent and cannot be undone. All your data, posts, and connections will be deleted.</Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowDeleteModal(false)} disabled={deleting}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.logoutButton} onPress={handleDeleteAccount} disabled={deleting}>
              {deleting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.logoutButtonText}>Delete</Text>}
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
                colors={[COLORS.primaryGreen, '#0A8F6A', '#064E3B']}
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
            style={[styles.backButton, { top: insets.top + 10 }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>

          {/* Settings Title */}
          <Text style={[styles.headerTitle, { top: insets.top + 14 }]}>Settings</Text>

          {/* Profile Info on Cover */}
          <View style={styles.profileOnCover}>
            <View style={styles.avatarContainer}>
              {avatarUrl ? (
                <AvatarImage source={avatarUrl} size={80} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={36} color="#9CA3AF" />
                </View>
              )}
              <View style={styles.avatarBadge}>
                <Ionicons name="checkmark" size={12} color="#FFF" />
              </View>
            </View>
            <Text style={styles.displayName}>{displayName}</Text>
            {username ? <Text style={styles.username}>@{username}</Text> : null}
          </View>
        </View>

        {/* Menu Sections */}
        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.menuCard}>
            {MENU_ITEMS.slice(0, 4).map((item, index) => renderMenuItem(item, index))}
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.menuCard}>
            {MENU_ITEMS.slice(4, 6).map((item, index) => renderMenuItem(item, index))}

            {/* Privacy Toggle */}
            <View style={styles.menuItem}>
              <View style={styles.menuItemIcon}>
                <Ionicons name={isPrivate ? 'lock-closed-outline' : 'lock-open-outline'} size={20} color={COLORS.primaryGreen} />
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
                trackColor={{ false: '#E5E7EB', true: COLORS.primaryGreen }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#E5E7EB"
                disabled={togglingPrivacy}
              />
            </View>
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.menuCard}>
            {MENU_ITEMS.slice(6).map((item, index) => renderMenuItem(item, index))}
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
                onPress={() => navigation.navigate('UpgradeToPro')}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={[COLORS.primaryGreen, '#00B5C1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.upgradeGradient}
                >
                  <View style={styles.upgradeIconContainer}>
                    <Ionicons name="star" size={20} color="#FFF" />
                  </View>
                  <View style={styles.upgradeTextContainer}>
                    <Text style={styles.upgradeTitle}>Upgrade to Pro Creator</Text>
                    <Text style={styles.upgradeSubtitle}>Unlock tips, unlimited events & more</Text>
                  </View>
                  <View style={styles.upgradeArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#FFF" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {/* Creator Wallet - Not for personal accounts */}
            {user?.accountType !== 'personal' && (
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemFirst]}
              onPress={() => navigation.navigate('CreatorWallet')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="wallet-outline" size={20} color="#22C55E" />
              </View>
              <Text style={styles.menuItemLabel}>Creator Wallet</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.primaryGreen} />
            </TouchableOpacity>
            )}

            {/* Go Pro - Not for personal accounts */}
            {user?.accountType !== 'personal' && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('PlatformSubscription')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: '#EDE7F6' }]}>
                <Ionicons name="rocket-outline" size={20} color="#7C3AED" />
              </View>
              <Text style={styles.menuItemLabel}>Go Pro</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.primaryGreen} />
            </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('IdentityVerification')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color="#2196F3" />
              </View>
              <Text style={styles.menuItemLabel}>Identity Verification</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.primaryGreen} />
            </TouchableOpacity>

            {/* Private Sessions - Creator only */}
            {isProCreator && (
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('PrivateSessionsManage')}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="videocam-outline" size={20} color="#FF9800" />
              </View>
              <Text style={styles.menuItemLabel}>Private Sessions</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.primaryGreen} />
            </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.menuSection}>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemFirst]}
              onPress={() => setShowLogoutModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.dangerIcon]}>
                <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
              </View>
              <Text style={[styles.menuItemLabel, styles.dangerLabel]}>Logout</Text>
              <Ionicons name="chevron-forward" size={18} color="#FF3B30" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => setShowDeleteModal(true)}
              activeOpacity={0.7}
            >
              <View style={[styles.menuItemIcon, styles.dangerIcon]}>
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
              </View>
              <Text style={[styles.menuItemLabel, styles.dangerLabel]}>Delete Account</Text>
              <Ionicons name="chevron-forward" size={18} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {renderLogoutModal()}
      {renderDeleteModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
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
    color: '#FFF',
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
    borderColor: '#F3F4F6',
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#F3F4F6',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primaryGreen,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F3F4F6',
  },
  displayName: {
    fontSize: 18,
    fontFamily: 'WorkSans-Bold',
    color: '#111827',
  },
  username: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#6B7280',
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
    color: '#6B7280',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
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
    borderTopColor: '#F3F4F6',
  },
  menuItemFirst: {
    borderTopWidth: 0,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${COLORS.primaryGreen}15`,
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
    color: '#111827',
  },
  menuItemSubtitle: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#9CA3AF',
    marginTop: 1,
  },
  dangerIcon: {
    backgroundColor: '#FEE2E2',
  },
  dangerLabel: {
    color: '#FF3B30',
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
    color: '#FFF',
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

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerLogo: {
    fontSize: 22,
    fontFamily: 'WorkSans-Bold',
    color: '#D1D5DB',
  },
  footerVersion: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#9CA3AF',
    marginTop: 4,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  modalIconBox: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'WorkSans-Bold',
    color: '#0A0A0F',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#6B7280',
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
    borderColor: COLORS.primaryGreen,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: COLORS.primaryGreen,
  },
  logoutButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFF',
  },
});

export default SettingsScreen;
