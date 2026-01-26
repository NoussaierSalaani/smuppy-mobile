import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../config/theme';
import { biometrics } from '../../utils/biometrics';

export default function BiometricLoginScreen({ navigation }) {
  const [biometricType, setBiometricType] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const init = async () => {
    const type = await biometrics.getType();
    setBiometricType(type);
    attemptBiometricLogin();
  };

  const attemptBiometricLogin = async () => {
    setError('');
    const result = await biometrics.loginWithBiometrics();
    if (result.success) {
      navigation.replace('Main');
    } else if (result.error) {
      setError('Authentication failed. Try again or use password.');
    }
  };

  const handleUsePassword = () => {
    navigation.replace('Login');
  };

  const isFaceId = biometricType === 'face';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <TouchableOpacity style={styles.iconBox} onPress={attemptBiometricLogin} activeOpacity={0.8}>
            <Ionicons name={isFaceId ? 'scan-outline' : 'finger-print-outline'} size={64} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>{isFaceId ? 'Face ID' : 'Touch ID'}</Text>
        <Text style={styles.subtitle}>Tap the icon to authenticate</Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color={COLORS.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.passwordLink} onPress={handleUsePassword}>
          <Text style={styles.passwordLinkText}>Use password instead</Text>
          <Ionicons name="arrow-forward" size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { flex: 1, paddingHorizontal: SPACING.xl, justifyContent: 'center', alignItems: 'center' },
  iconContainer: { marginBottom: SPACING['3xl'] },
  iconBox: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#E8FBF5', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: COLORS.primary },
  title: { fontSize: 28, fontFamily: 'WorkSans-Bold', color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, color: COLORS.gray, textAlign: 'center', marginBottom: SPACING.xl },
  errorContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.lg },
  errorText: { fontSize: 14, color: COLORS.error },
  passwordLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: SPACING.md },
  passwordLinkText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  footer: { alignItems: 'center', paddingBottom: SPACING.xl },
});