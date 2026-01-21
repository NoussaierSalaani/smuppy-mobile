import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, StatusBar, ActivityIndicator, Alert, Switch } from 'react-native';
import { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { supabase } from '../../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { biometrics } from '../../utils/biometrics';
import { useUser } from '../../context/UserContext';
import { useCurrentProfile, useUpdateProfile } from '../../hooks';

const SettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user: contextUser, getFullName } = useUser();
  const { data: profileData, refetch } = useCurrentProfile();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [biometricType, setBiometricType] = useState(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>([]);
  const [isPrivate, setIsPrivate] = useState(false);
  const [togglingPrivacy, setTogglingPrivacy] = useState(false);

  useEffect(() => {
    checkBiometrics();
    loadUserData();
  }, [contextUser, getFullName, profileData]);

  const loadUserData = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const authUser = data?.user;
      const metadata = authUser?.user_metadata || {};
      const email = authUser?.email || contextUser?.email || '';
      const emailPrefix = email?.split('@')[0]?.toLowerCase() || '';

      // Helper to check if a name looks like an email-derived username
      const isEmailDerivedName = (name: string | undefined | null): boolean => {
        if (!name) return true;
        return name.toLowerCase() === emailPrefix ||
               name.toLowerCase().replace(/[^a-z0-9]/g, '') === emailPrefix.replace(/[^a-z0-9]/g, '');
      };

      // Find the best name, prioritizing actual names over email-derived ones
      let name = 'User';
      const candidates = [
        contextUser?.fullName,      // From onboarding context
        metadata.full_name,         // From Supabase auth metadata
        profileData?.full_name,     // From DB profile
        metadata.name,
        contextUser?.displayName,
        getFullName?.(),
      ].filter(Boolean) as string[];

      // First try to find a non-email-derived name
      for (const candidate of candidates) {
        if (!isEmailDerivedName(candidate)) {
          name = candidate;
          break;
        }
      }
      // If all are email-derived, use the first available
      if (name === 'User' && candidates.length > 0) {
        name = candidates[0];
      }
      // Last resort: email prefix
      if (name === 'User') {
        name = emailPrefix || 'User';
      }

      const avatar = profileData?.avatar_url || metadata.avatar_url || contextUser?.avatar || null;
      const userInterests = profileData?.interests || contextUser?.interests || [];

      setDisplayName(name);
      setAvatarUrl(avatar);
      setInterests(userInterests);
      setIsPrivate(profileData?.is_private || false);
    } catch (error) {
      const emailPrefix = contextUser?.email?.split('@')[0] || '';
      setDisplayName(contextUser?.fullName || profileData?.full_name || contextUser?.displayName || getFullName?.() || emailPrefix || 'User');
      setAvatarUrl(profileData?.avatar_url || contextUser?.avatar || null);
      setInterests(profileData?.interests || contextUser?.interests || []);
      setIsPrivate(profileData?.is_private || false);
    }
  };

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
      Alert.alert('Error', 'Failed to update privacy setting.');
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

  const MENU_ITEMS = [
    { id: 'profile', icon: 'person-outline' as const, label: 'Profil', screen: 'EditProfil' },
    { id: 'interests', icon: 'heart-outline' as const, label: 'Interests', screen: 'EditInterests', params: { currentInterests: interests } },
    { id: 'password', icon: 'lock-closed-outline' as const, label: 'Password', screen: 'PasswordManager' },
    ...(biometricAvailable ? [{ id: 'biometric', icon: (biometricType === 'face' ? 'scan-outline' : 'finger-print-outline') as 'scan-outline' | 'finger-print-outline', label: biometricType === 'face' ? 'Facial Recognition' : 'Fingerprint', screen: 'FacialRecognition' }] : []),
    { id: 'notifications', icon: 'notifications-outline' as const, label: 'Notifications', screen: 'NotificationSettings' },
    { id: 'report', icon: 'alert-circle-outline' as const, label: 'Report a problem', screen: 'ReportProblem' },
    { id: 'terms', icon: 'document-text-outline' as const, label: 'Terms and policies', screen: 'TermsPolicies' },
  ];

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await AsyncStorage.multiRemove(['@smuppy_remember_me', '@smuppy_saved_email', '@smuppy_user_profile']);
      await biometrics.disable();
      await supabase.auth.signOut({ scope: 'global' });
      setShowLogoutModal(false);
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'User not found');
        return;
      }

      // Delete user profile first
      await supabase.from('profiles').delete().eq('id', user.id);

      // Delete user auth (requires Edge Function with service role)
      const response = await fetch(`${supabase.supabaseUrl}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete account');
      }

      // Clear local storage and sign out
      await AsyncStorage.multiRemove(['@smuppy_remember_me', '@smuppy_saved_email', '@smuppy_user_profile']);
      await biometrics.disable();
      await supabase.auth.signOut({ scope: 'global' });

      setShowDeleteModal(false);
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'Auth' }] }));
    } catch (error) {
      console.error('Delete account error:', error);
      Alert.alert('Error', 'Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#0A0A0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.userSection}>
        {avatarUrl ? (
          <AvatarImage source={avatarUrl} size={50} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Ionicons name="person" size={28} color="#8E8E93" />
          </View>
        )}
        <Text style={styles.userName}>{displayName}</Text>
      </View>

      <View style={styles.menuContainer}>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.menuItem}
            onPress={() => navigation.navigate(item.screen, item.params)}
          >
            <View style={styles.menuItemLeft}>
              <Ionicons name={item.icon} size={22} color="#0A0A0F" />
              <Text style={styles.menuItemLabel}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        ))}

        {/* Privacy Toggle */}
        <View style={styles.menuItem}>
          <View style={styles.menuItemLeft}>
            <Ionicons name={isPrivate ? 'lock-closed-outline' : 'lock-open-outline'} size={22} color="#0A0A0F" />
            <View>
              <Text style={styles.menuItemLabel}>Private Account</Text>
              <Text style={styles.menuItemSubtitle}>
                {isPrivate ? 'Only fans can see your content' : 'Everyone can see your content'}
              </Text>
            </View>
          </View>
          <Switch
            value={isPrivate}
            onValueChange={togglePrivacy}
            trackColor={{ false: '#E8E8E8', true: '#0EBF8A' }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#E8E8E8"
            disabled={togglingPrivacy}
          />
        </View>

        <TouchableOpacity style={styles.menuItem} onPress={() => setShowLogoutModal(true)}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
            <Text style={[styles.menuItemLabel, styles.logoutLabel]}>Logout</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={() => setShowDeleteModal(true)}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="trash-outline" size={22} color="#FF3B30" />
            <Text style={[styles.menuItemLabel, styles.logoutLabel]}>Delete Account</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.logoContainer}>
        <Text style={styles.logoText}>Smuppy</Text>
      </View>

      {renderLogoutModal()}
      {renderDeleteModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontFamily: 'WorkSans-SemiBold', color: '#0A0A0F' },
  headerSpacer: { width: 40 },
  userSection: { alignItems: 'center', paddingVertical: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  avatarPlaceholder: { width: 80, height: 80, borderRadius: 40, marginBottom: 12, backgroundColor: '#F2F2F2', justifyContent: 'center', alignItems: 'center' },
  userName: { fontSize: 18, fontFamily: 'WorkSans-SemiBold', color: '#0A0A0F' },
  menuContainer: { paddingHorizontal: 20, paddingTop: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  menuItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuItemLabel: { fontSize: 16, fontFamily: 'Poppins-Regular', color: '#0A0A0F' },
  menuItemSubtitle: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  logoutLabel: { color: '#FF3B30' },
  logoContainer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40 },
  logoText: { fontSize: 24, fontFamily: 'WorkSans-Bold', color: '#E8E8E8' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
  modalIconBox: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: 'WorkSans-Bold', color: '#0A0A0F', marginBottom: 8 },
  modalMessage: { fontSize: 14, fontFamily: 'Poppins-Regular', color: '#0A0A0F', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelButton: { flex: 1, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#0EBF8A', alignItems: 'center' },
  cancelButtonText: { fontSize: 15, fontFamily: 'Poppins-SemiBold', color: '#0EBF8A' },
  logoutButton: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' },
  logoutButtonText: { fontSize: 15, fontFamily: 'Poppins-SemiBold', color: '#FFF' },
});

export default SettingsScreen;