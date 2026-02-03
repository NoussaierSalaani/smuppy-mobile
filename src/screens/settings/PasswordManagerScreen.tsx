import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, StatusBar, KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { awsAuth } from '../../services/aws-auth';
import { validatePassword, isPasswordValid, getPasswordStrengthLevel } from '../../utils/validation';
import CooldownModal, { useCooldown } from '../../components/CooldownModal';
import { checkAWSRateLimit } from '../../services/awsRateLimit';

interface PasswordManagerScreenProps {
  navigation: { goBack: () => void };
}

const PasswordManagerScreen = ({ navigation }: PasswordManagerScreenProps) => {
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  const [successModal, setSuccessModal] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });
  const { canAction, remainingTime, showModal, setShowModal, tryAction } = useCooldown(30);

  const passwordRules = validatePassword(newPassword);
  const newPasswordValid = isPasswordValid(newPassword);
  const strengthLevel = getPasswordStrengthLevel(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSave = currentPassword.length > 0 && newPasswordValid && passwordsMatch;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      // Verify current password first
      const isValid = await awsAuth.verifyPassword(currentPassword);
      if (!isValid) {
        setErrorModal({ visible: true, title: 'Incorrect Password', message: 'The current password you entered is incorrect. Please try again.' });
        setSaving(false);
        return;
      }

      // Change password using Cognito
      await awsAuth.changePassword(currentPassword, newPassword);

      // Note: changePassword in Cognito automatically invalidates other sessions
      setSuccessModal(true);
    } catch (error: unknown) {
      let errorTitle = 'Update Failed';
      const errMsg = error instanceof Error ? error.message : '';
      let errorMessage = errMsg || 'Failed to update password. Please try again.';
      if (errMsg.includes('same') || errMsg.includes('previously used')) { errorTitle = 'Same Password'; errorMessage = 'Your new password must be different from your current password.'; }
      setErrorModal({ visible: true, title: errorTitle, message: errorMessage });
    } finally {
      setSaving(false);
    }
  };

  const handleForgotPassword = async () => {
    try {
      const user = await awsAuth.getCurrentUser();
      if (!user?.email) return;

      // Check AWS rate limit first (server-side protection)
      const normalizedEmail = user.email.trim().toLowerCase();
      const awsCheck = await checkAWSRateLimit(normalizedEmail, 'auth-resend');
      if (!awsCheck.allowed) {
        setErrorModal({
          visible: true,
          title: 'Too many attempts',
          message: `Please wait ${Math.ceil((awsCheck.retryAfter || 300) / 60)} minutes before requesting another reset.`,
        });
        return;
      }

      tryAction(async () => {
        await awsAuth.forgotPassword(normalizedEmail);
      });
      setShowModal(true);
    } catch (err) {
      if (__DEV__) console.warn('[PasswordManager] Reset error:', err);
    }
  };

  const handleSuccessClose = () => { setSuccessModal(false); navigation.goBack(); };

  const renderPasswordInput = (label: string, value: string, setValue: (v: string) => void, showPassword: boolean, setShowPassword: (v: boolean) => void, placeholder = '', onFocus?: () => void, onBlur?: () => void) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.passwordInputContainer}>
        <TextInput style={styles.passwordInput} value={value} onChangeText={setValue} placeholder={placeholder} placeholderTextColor="#C7C7CC" secureTextEntry={!showPassword} autoCapitalize="none" onFocus={onFocus} onBlur={onBlur} />
        <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword(!showPassword)}>
          <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={22} color="#C7C7CC" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSuccessModal = () => (
    <Modal visible={successModal} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={[styles.modalIconBox, { backgroundColor: '#E8FBF5' }]}>
            <Ionicons name="checkmark-circle" size={40} color="#0EBF8A" />
          </View>
          <Text style={styles.modalTitle}>Password Updated!</Text>
          <Text style={styles.modalMessage}>
            Your password has been changed successfully.{'\n\n'}
            <Text style={styles.modalMessageBold}>All other devices have been logged out.</Text>
            {'\n'}They will need to use your new password to log in again.
          </Text>
          <TouchableOpacity style={styles.modalBtn} onPress={handleSuccessClose}>
            <Text style={styles.modalBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderErrorModal = () => (
    <Modal visible={errorModal.visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setErrorModal({ ...errorModal, visible: false })}>
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
          <View style={[styles.modalIconBox, { backgroundColor: '#FEE2E2' }]}>
            <Ionicons name="alert-circle" size={40} color="#FF3B30" />
          </View>
          <Text style={styles.modalTitle}>{errorModal.title}</Text>
          <Text style={styles.modalMessage}>{errorModal.message}</Text>
          <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#FF3B30' }]} onPress={() => setErrorModal({ ...errorModal, visible: false })}>
            <Text style={styles.modalBtnText}>Try Again</Text>
          </TouchableOpacity>
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
        <Text style={styles.headerTitle}>Change Password</Text>
        <TouchableOpacity style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} onPress={handleSave} disabled={!canSave || saving}>
          <Text style={[styles.saveButtonText, !canSave && styles.saveButtonTextDisabled]}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.infoBanner}>
            <Ionicons name="information-circle" size={20} color="#0891B2" />
            <Text style={styles.infoBannerText}>Changing your password will log out all other devices.</Text>
          </View>

          {renderPasswordInput('Current password', currentPassword, setCurrentPassword, showCurrent, setShowCurrent, 'Enter current password')}
          {renderPasswordInput('New password', newPassword, setNewPassword, showNew, setShowNew, 'Enter new password', () => setNewPasswordFocused(true), () => setNewPasswordFocused(false))}

          {newPassword.length > 0 && (
            <View style={styles.strengthContainer}>
              <View style={styles.strengthBarBg}>
                <View style={[styles.strengthBar, { width: strengthLevel.level === 'weak' ? '25%' : strengthLevel.level === 'medium' ? '50%' : strengthLevel.level === 'strong' ? '75%' : '100%', backgroundColor: strengthLevel.color }]} />
              </View>
              <Text style={[styles.strengthText, { color: strengthLevel.color }]}>{strengthLevel.label}</Text>
            </View>
          )}

          {(newPasswordFocused || newPassword.length > 0) && !newPasswordValid && (
            <View style={styles.rulesContainer}>
              {passwordRules.map((rule) => (
                <View key={rule.id} style={styles.ruleRow}>
                  <Ionicons name={rule.passed ? "checkmark-circle" : "ellipse-outline"} size={16} color={rule.passed ? '#0EBF8A' : '#9CA3AF'} />
                  <Text style={[styles.ruleText, rule.passed && styles.ruleTextPassed]}>{rule.label}</Text>
                </View>
              ))}
            </View>
          )}

          {renderPasswordInput('Confirm new password', confirmPassword, setConfirmPassword, showConfirm, setShowConfirm, 'Confirm new password')}

          {confirmPassword.length > 0 && (
            <View style={styles.matchRow}>
              <Ionicons name={passwordsMatch ? "checkmark-circle" : "close-circle"} size={16} color={passwordsMatch ? '#0EBF8A' : '#FF3B30'} />
              <Text style={[styles.matchText, { color: passwordsMatch ? '#0EBF8A' : '#FF3B30' }]}>{passwordsMatch ? 'Passwords match' : 'Passwords do not match'}</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.forgotButton, !canAction && styles.forgotButtonDisabled]} onPress={handleForgotPassword} disabled={!canAction}>
            <Text style={[styles.forgotButtonText, !canAction && styles.forgotButtonTextDisabled]}>{canAction ? 'Forgot current password?' : `Wait ${remainingTime}s`}</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {renderSuccessModal()}
      {renderErrorModal()}
      <CooldownModal visible={showModal} onClose={() => setShowModal(false)} seconds={remainingTime} title="Email Sent!" message="A password reset link has been sent to your email. You can request a new one in" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  keyboardView: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#0A0A0F' },
  saveButton: { backgroundColor: '#0EBF8A', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  saveButtonDisabled: { backgroundColor: '#E8E8E8' },
  saveButtonText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  saveButtonTextDisabled: { color: '#C7C7CC' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  infoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFEFF', borderRadius: 12, padding: 14, marginBottom: 24, gap: 10 },
  infoBannerText: { flex: 1, fontSize: 13, color: '#0891B2', lineHeight: 18 },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '500', color: '#0A0A0F', marginBottom: 8 },
  passwordInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8', borderRadius: 12, paddingRight: 12 },
  passwordInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#0A0A0F' },
  eyeButton: { padding: 8 },
  strengthContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: -8, gap: 10 },
  strengthBarBg: { flex: 1, height: 4, backgroundColor: '#E8E8E8', borderRadius: 2, overflow: 'hidden' },
  strengthBar: { height: '100%', borderRadius: 2 },
  strengthText: { fontSize: 12, fontWeight: '600', minWidth: 70 },
  rulesContainer: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, marginBottom: 20 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  ruleText: { fontSize: 13, color: '#9CA3AF' },
  ruleTextPassed: { color: '#0A0A0F' },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -12, marginBottom: 20 },
  matchText: { fontSize: 13, fontWeight: '500' },
  forgotButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 8 },
  forgotButtonDisabled: { opacity: 0.6 },
  forgotButtonText: { fontSize: 14, fontWeight: '500', color: '#0EBF8A' },
  forgotButtonTextDisabled: { color: '#9CA3AF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalContent: { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 28, alignItems: 'center' },
  modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  modalIconBox: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#0A0A0F', marginBottom: 12, textAlign: 'center' },
  modalMessage: { fontSize: 14, color: '#0A0A0F', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalMessageBold: { fontWeight: '600' },
  modalBtn: { width: '100%', paddingVertical: 16, backgroundColor: '#0EBF8A', borderRadius: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});

export default PasswordManagerScreen;