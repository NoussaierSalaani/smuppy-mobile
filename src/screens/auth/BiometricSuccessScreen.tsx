import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { useTheme } from '../../hooks/useTheme';

interface BiometricSuccessScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
    canGoBack: () => boolean;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
}

export default function BiometricSuccessScreen({ navigation }: BiometricSuccessScreenProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleContinue = () => {
    navigation.replace('TellUsAboutYou');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View style={styles.iconBox}>
            <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
          </View>
        </View>

        <Text style={styles.title}>Facial Recognition{'\n'}Enabled Successfully!</Text>
        <Text style={styles.subtitle}>
          You can now unlock your account quickly and securely using facial recognition. Enjoy a seamless and convenient login experience.{'\n\n'}
          And remember, you can update or disable this feature anytime in your account settings.
        </Text>

        <View style={styles.buttonContainer}>
          <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" onPress={handleContinue}>
            Continue
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
  iconBox: { width: 120, height: 120, borderRadius: 60, backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#E8FBF5', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontFamily: 'WorkSans-Bold', color: colors.dark, textAlign: 'center', marginBottom: SPACING.md },
  subtitle: { fontSize: 14, color: colors.gray, textAlign: 'center', lineHeight: 22, paddingHorizontal: SPACING.md, marginBottom: SPACING['3xl'] },
  buttonContainer: { width: '100%' },
  footer: { alignItems: 'center', paddingBottom: SPACING.xl },
});