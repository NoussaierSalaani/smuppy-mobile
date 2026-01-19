import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../config/theme';
import { biometrics } from '../../utils/biometrics';
import Button from '../../components/Button';

export default function EnableBiometricScreen({ navigation }) {
  const [biometricType, setBiometricType] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkBiometrics();
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
    const result = await biometrics.enable();
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
            <Ionicons name={isFaceId ? 'scan-outline' : 'finger-print-outline'} size={48} color={COLORS.primary} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { flex: 1, paddingHorizontal: SPACING.xl, justifyContent: 'center', alignItems: 'center' },
  iconContainer: { marginBottom: SPACING['3xl'] },
  iconBox: { width: 100, height: 100, borderRadius: 24, backgroundColor: '#E8FBF5', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.primary, borderStyle: 'dashed' },
  title: { fontSize: 28, fontFamily: 'WorkSans-Bold', color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.md },
  subtitle: { fontSize: 15, color: COLORS.gray, textAlign: 'center', lineHeight: 22, paddingHorizontal: SPACING.lg, marginBottom: SPACING['3xl'] },
  buttonContainer: { width: '100%', gap: SPACING.md },
  footer: { alignItems: 'center', paddingBottom: SPACING.xl },
});