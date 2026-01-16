import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, StatusBar, ActivityIndicator } from 'react-native';
import { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { supabase } from '../../config/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { biometrics } from '../../utils/biometrics';
import { useUser } from '../../context/UserContext';

const SettingsScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user: contextUser, getFullName } = useUser();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [biometricType, setBiometricType] = useState(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    checkBiometrics();
    loadUserData();
  }, [contextUser, getFullName]);

  const loadUserData = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const authUser = data?.user;
      const metadata = authUser?.user_metadata || {};

      const name =
        metadata.full_name ||
        metadata.name ||
        getFullName?.() ||
        authUser?.email ||
        contextUser?.email ||
        'User';

      const avatar = metadata.avatar_url || contextUser?.avatar || null;

      setDisplayName(name);
      setAvatarUrl(avatar);
    } catch (error) {
      setDisplayName(getFullName?.() || contextUser?.email || 'User');
      setAvatarUrl(contextUser?.avatar || null);
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
    { id: 'profile', icon: 'person-outline', label: 'Profil', screen: 'EditProfil' },
    { id: 'password', icon: 'lock-closed-outline', label: 'Password', screen: 'PasswordManager' },
    ...(biometricAvailable ? [{ id: 'biometric', icon: biometricType === 'face' ? 'scan-outline' : 'finger-print-outline', label: biometricType === 'face' ? 'Facial Recognition' : 'Fingerprint', screen: 'FacialRecognition' }] : []),
    { id: 'notifications', icon: 'notifications-outline', label: 'Notifications', screen: 'NotificationSettings' },
    { id: 'report', icon: 'alert-circle-outline', label: 'Report a problem', screen: 'ReportProblem' },
    { id: 'terms', icon: 'document-text-outline', label: 'Terms and policies', screen: 'TermsPolicies' },
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
          <TouchableOpacity key={item.id} style={styles.menuItem} onPress={() => navigation.navigate(item.screen)}>
            <View style={styles.menuItemLeft}>
              <Ionicons name={item.icon} size={22} color="#0A0A0F" />
              <Text style={styles.menuItemLabel}>{item.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.menuItem} onPress={() => setShowLogoutModal(true)}>
          <View style={styles.menuItemLeft}>
            <Ionicons name="log-out-outline" size={22} color="#FF3B30" />
            <Text style={[styles.menuItemLabel, styles.logoutLabel]}>Logout</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.logoContainer}>
        <Text style={styles.logoText}>Smuppy</Text>
      </View>

      {renderLogoutModal()}
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
  logoutLabel: { color: '#FF3B30' },
  logoContainer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 40 },
  logoText: { fontSize: 24, fontFamily: 'WorkSans-Bold', color: '#E8E8E8' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
  modalIconBox: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: 'WorkSans-Bold', color: '#0A0A0F', marginBottom: 8 },
  modalMessage: { fontSize: 14, fontFamily: 'Poppins-Regular', color: '#0A0A0F', textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelButton: { flex: 1, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#11E3A3', alignItems: 'center' },
  cancelButtonText: { fontSize: 15, fontFamily: 'Poppins-SemiBold', color: '#11E3A3' },
  logoutButton: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' },
  logoutButtonText: { fontSize: 15, fontFamily: 'Poppins-SemiBold', color: '#FFF' },
});

export default SettingsScreen;