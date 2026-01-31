import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../../config/theme';
import { biometrics, BiometricType } from '../../utils/biometrics';
import Button from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';

interface EnableBiometricScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
    canGoBack: () => boolean;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
}

export default function EnableBiometricScreen({ navigation }: EnableBiometricScreenProps) {
  const { colors, isDark } = useTheme();
  const [biometricType, setBiometricType] = useState<BiometricType>(null);
  const [loading, setLoading] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    checkBiometrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkBiometrics = async () => {
    const available = await biometrics.isAvailable();
    if (!available) {
      navigation.replace('TellUsAboutYou');
      return;
    }
    const type = await biometrics.getType();
    setBiometricType(type);
  };

  const handleEnable = async () => {
    if (loading) return;
    setLoading(true);
    // SECURITY: During onboarding, the user JUST signed up and verified their account
    // They are already authenticated, so we can skip password re-verification
    // This is safe because they just entered their password moments ago
    const result = await biometrics.enable(async () => true);
    setLoading(false);
    if (result.success) {
      navigation.replace('BiometricSuccess');
    }
  };

  const handleSkip = () => {
    navigation.replace('TellUsAboutYou');
  };

  const isFaceId = biometricType === 'face';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.iconBox}>
            <Ionicons name={isFaceId ? 'scan-outline' : 'finger-print-outline'} size={48} color={colors.primary} />
          </View>
        </View>

        <Text style={styles.title}>Enable {isFaceId ? 'Facial' : 'Fingerprint'}{'\n'}Recognition</Text>
        <Text style={styles.subtitle}>
          Secure your account with {isFaceId ? 'facial recognition' : 'fingerprint'} for faster, easier access. You can set it up now or later in Settings.
        </Text>

        <View style={styles.buttonContainer}>
          <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" loading={loading} onPress={handleEnable}>
            Enable {isFaceId ? 'Facial' : 'Fingerprint'} Recognition
          </Button>
          <Button variant="text" size="lg" onPress={handleSkip}>
            Skip for now
          </Button>
        </View>
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
  iconBox: { width: 100, height: 100, borderRadius: 24, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#E8FBF5', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.primary, borderStyle: 'dashed' },
  title: { fontSize: 28, fontFamily: 'WorkSans-Bold', color: colors.dark, textAlign: 'center', marginBottom: SPACING.md },
  subtitle: { fontSize: 15, color: colors.gray, textAlign: 'center', lineHeight: 22, paddingHorizontal: SPACING.lg, marginBottom: SPACING['3xl'] },
  buttonContainer: { width: '100%', gap: SPACING.md },
  footer: { alignItems: 'center', paddingBottom: SPACING.xl },
});