import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, SIZES } from '../../config/theme';
import { biometrics } from '../../utils/biometrics';
import { awsAuth } from '../../services/aws-auth';
import Button from '../../components/Button';

type BiometricType = 'face' | 'fingerprint' | null;
type PasswordAction = 'enable' | 'disable' | 'update';

interface FacialRecognitionScreenProps {
  navigation: { goBack: () => void };
}

export default function FacialRecognitionScreen({ navigation }: FacialRecognitionScreenProps) {
  const [enabled, setEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [loading, setLoading] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordAction, setPasswordAction] = useState<PasswordAction>('enable');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [successModal, setSuccessModal] = useState({ visible: false, title: '', message: '' });
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });

  // Store password verification result for biometrics.enable() callback
  const passwordVerifiedRef = useRef(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const isEnabled = await biometrics.isEnabled();
    const type = await biometrics.getType();
    setEnabled(isEnabled);
    setBiometricType(type);
  };

  const handleToggle = async (value: boolean) => {
    if (loading) return;
    if (value) {
      // SECURITY: Require password to enable biometrics
      // This prevents device owner from adding their biometrics to another person's account
      setPasswordAction('enable');
      setShowPasswordModal(true);
    } else {
      // Disable: also require password
      setPasswordAction('disable');
      setShowPasswordModal(true);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) {
      setPasswordError('Please enter your password');
      return;
    }

    setVerifying(true);
    setPasswordError('');

    try {
      // Verify password using AWS Cognito
      const isValid = await awsAuth.verifyPassword(password);

      if (!isValid) {
        setPasswordError('Incorrect password');
        setVerifying(false);
        return;
      }

      // Password verified - now perform the action
      passwordVerifiedRef.current = true;

      if (passwordAction === 'disable') {
        // Disable biometrics
        await biometrics.disable();
        setEnabled(false);
        setShowPasswordModal(false);
        setPassword('');
        setSuccessModal({
          visible: true,
          title: 'Disabled',
          message: `${isFaceId ? 'Face ID' : 'Touch ID'} has been disabled. You can enable it again anytime.`,
        });
      } else if (passwordAction === 'enable' || passwordAction === 'update') {
        // Close modal first
        setShowPasswordModal(false);
        setPassword('');

        // Enable/Update biometrics with verified password
        setLoading(true);
        const result = await biometrics.enable(async () => passwordVerifiedRef.current);
        setLoading(false);
        passwordVerifiedRef.current = false;

        if (result.success) {
          setEnabled(true);
          setSuccessModal({
            visible: true,
            title: passwordAction === 'enable' ? 'Enabled!' : 'Updated!',
            message: passwordAction === 'enable'
              ? `${isFaceId ? 'Face ID' : 'Touch ID'} has been enabled for quick and secure login.`
              : 'Biometric data has been updated successfully.',
          });
        } else if (result.error === 'blocked') {
          setErrorModal({
            visible: true,
            title: 'Too Many Attempts',
            message: `Please wait ${Math.ceil((result.remainingSeconds ?? 60) / 60)} minutes before trying again.`,
          });
        } else if (result.error === 'Password verification failed') {
          // Should not happen since we verified above, but handle it
          setErrorModal({
            visible: true,
            title: 'Verification Failed',
            message: 'Password verification failed. Please try again.',
          });
        } else {
          setErrorModal({
            visible: true,
            title: 'Failed',
            message: 'Could not enable biometric authentication. Please try again.',
          });
        }
      }
    } catch {
      setPasswordError('An error occurred. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleUpdate = async () => {
    if (loading) return;
    // SECURITY: Require password to update biometrics
    setPasswordAction('update');
    setShowPasswordModal(true);
  };

  const closePasswordModal = () => {
    setShowPasswordModal(false);
    setPassword('');
    setPasswordError('');
    setShowPassword(false);
  };

  const isFaceId = biometricType === 'face';

  const getPasswordModalText = () => {
    switch (passwordAction) {
      case 'enable':
        return {
          title: 'Confirm Your Identity',
          message: `Enter your Smuppy password to enable ${isFaceId ? 'Face ID' : 'Touch ID'}.\n\nOnly enable on your personal device for security.`,
        };
      case 'update':
        return {
          title: 'Confirm Your Identity',
          message: `Enter your Smuppy password to update ${isFaceId ? 'Face ID' : 'Touch ID'} data.`,
        };
      case 'disable':
      default:
        return {
          title: 'Confirm Your Identity',
          message: `Enter your Smuppy password to disable ${isFaceId ? 'Face ID' : 'Touch ID'}.`,
        };
    }
  };

  const renderPasswordModal = () => {
    const modalText = getPasswordModalText();
    return (
      <Modal visible={showPasswordModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={closePasswordModal} disabled={verifying}>
              <Ionicons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>

            <View style={styles.modalIconBox}>
              <Ionicons name="lock-closed" size={32} color={COLORS.primary} />
            </View>

            <Text style={styles.modalTitle}>{modalText.title}</Text>
            <Text style={styles.modalMessage}>{modalText.message}</Text>

            <View style={styles.passwordInputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.grayMuted} />
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.grayMuted}
                value={password}
                onChangeText={(text) => { setPassword(text); setPasswordError(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!verifying}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} disabled={verifying}>
                <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={COLORS.grayMuted} />
              </TouchableOpacity>
            </View>

            {passwordError ? <Text style={styles.passwordError}>{passwordError}</Text> : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closePasswordModal} disabled={verifying}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handlePasswordSubmit} disabled={verifying}>
                {verifying ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderSuccessModal = () => (
    <Modal visible={successModal.visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={[styles.modalIconBox, { backgroundColor: '#E8FBF5' }]}>
            <Ionicons name="checkmark-circle" size={40} color={COLORS.primary} />
          </View>
          <Text style={styles.modalTitle}>{successModal.title}</Text>
          <Text style={styles.modalMessage}>{successModal.message}</Text>
          <TouchableOpacity style={styles.successBtn} onPress={() => setSuccessModal({ ...successModal, visible: false })}>
            <Text style={styles.successBtnText}>Done</Text>
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
          <TouchableOpacity style={styles.errorBtn} onPress={() => setErrorModal({ ...errorModal, visible: false })}>
            <Text style={styles.errorBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isFaceId ? 'Facial Recognition' : 'Fingerprint'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Enable {isFaceId ? 'Facial Recognition' : 'Fingerprint'}</Text>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            trackColor={{ false: COLORS.grayLight, true: COLORS.primary }}
            thumbColor={COLORS.white}
            disabled={loading}
          />
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.iconBox}>
            <Ionicons name={isFaceId ? 'scan-outline' : 'finger-print-outline'} size={48} color={COLORS.primary} />
          </View>

          <Text style={styles.title}>{isFaceId ? 'Face ID' : 'Touch ID'}</Text>
          <Text style={styles.subtitle}>
            {enabled
              ? `${isFaceId ? 'Face ID' : 'Touch ID'} is enabled. Your ${isFaceId ? 'face' : 'fingerprint'} data is registered for quick and secure login.`
              : `Enable ${isFaceId ? 'Face ID' : 'Touch ID'} for faster, more secure access to your account.`}
          </Text>

          {enabled && (
            <Button variant="primary" size="lg" icon="refresh-outline" iconPosition="left" loading={loading} onPress={handleUpdate}>
              Update {isFaceId ? 'Face ID' : 'Touch ID'}
            </Button>
          )}
        </View>
      </View>

      {renderPasswordModal()}
      {renderSuccessModal()}
      {renderErrorModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.dark },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  toggleLabel: { fontSize: 16, fontWeight: '500', color: COLORS.dark },
  infoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 100 },
  iconBox: { width: 100, height: 100, borderRadius: 24, backgroundColor: '#E8FBF5', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary, borderStyle: 'dashed', marginBottom: SPACING.xl },
  title: { fontSize: 24, fontFamily: 'WorkSans-Bold', color: COLORS.dark, marginBottom: SPACING.sm },
  subtitle: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.xl, paddingHorizontal: SPACING.lg },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  modalContent: { width: '100%', backgroundColor: '#FFF', borderRadius: 24, padding: 28, alignItems: 'center' },
  modalClose: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  modalIconBox: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#E8FBF5', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#0A0A0F', marginBottom: 8, textAlign: 'center' },
  modalMessage: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  // Password Input
  passwordInputContainer: { flexDirection: 'row', alignItems: 'center', width: '100%', height: SIZES.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, marginBottom: SPACING.sm, backgroundColor: COLORS.white },
  passwordInput: { flex: 1, fontSize: 16, color: COLORS.dark, marginLeft: SPACING.sm },
  passwordError: { fontSize: 12, color: '#FF3B30', alignSelf: 'flex-start', marginBottom: SPACING.md },
  // Modal Buttons
  modalButtons: { flexDirection: 'row', gap: 12, width: '100%', marginTop: SPACING.md },
  cancelBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.grayLight, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.dark },
  confirmBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  successBtn: { width: '100%', paddingVertical: 16, backgroundColor: COLORS.primary, borderRadius: 14, alignItems: 'center' },
  successBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  errorBtn: { width: '100%', paddingVertical: 16, backgroundColor: '#FF3B30', borderRadius: 14, alignItems: 'center' },
  errorBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});