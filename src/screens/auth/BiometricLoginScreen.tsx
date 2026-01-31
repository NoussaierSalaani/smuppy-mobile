import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../../config/theme';
import { biometrics } from '../../utils/biometrics';
import { useTheme } from '../../hooks/useTheme';
import { getCurrentProfile } from '../../services/database';

type BiometricType = 'face' | 'fingerprint' | 'iris' | null;

interface BiometricLoginScreenProps {
  navigation: {
    replace: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export default function BiometricLoginScreen({ navigation }: BiometricLoginScreenProps) {
  const { colors, isDark } = useTheme();
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [error, setError] = useState('');

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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
      // Verify profile exists before navigating to Main
      const { data: profile } = await getCurrentProfile(false).catch(() => ({ data: null }));
      if (profile) {
        navigation.replace('Main');
      } else {
        navigation.replace('Login');
      }
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
            <Ionicons name={isFaceId ? 'scan-outline' : 'finger-print-outline'} size={64} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>{isFaceId ? 'Face ID' : 'Touch ID'}</Text>
        <Text style={styles.subtitle}>Tap the icon to authenticate</Text>

        {error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={16} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.passwordLink} onPress={handleUsePassword}>
          <Text style={styles.passwordLinkText}>Use password instead</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, paddingHorizontal: SPACING.xl, justifyContent: 'center', alignItems: 'center' },
  iconContainer: { marginBottom: SPACING['3xl'] },
  iconBox: { width: 140, height: 140, borderRadius: 70, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#E8FBF5', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: colors.primary },
  title: { fontSize: 28, fontFamily: 'WorkSans-Bold', color: colors.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, color: colors.gray, textAlign: 'center', marginBottom: SPACING.xl },
  errorContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.lg },
  errorText: { fontSize: 14, color: colors.error },
  passwordLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: SPACING.md },
  passwordLinkText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  footer: { alignItems: 'center', paddingBottom: SPACING.xl },
});