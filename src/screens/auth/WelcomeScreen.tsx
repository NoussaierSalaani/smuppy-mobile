import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, ImageBackground, Animated, TouchableOpacity } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GRADIENTS } from '../../config/theme';
import { SmuppyIcon, SmuppyText } from '../../components/SmuppyLogo';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { height } = Dimensions.get('window');

interface WelcomeScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

const WelcomeScreen = ({ navigation }: WelcomeScreenProps) => {
  const { colors, isDark } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height * 0.4)).current;
  const scaleAnim = useRef(new Animated.Value(1.1)).current;
  const buttonsAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleOpenTerms = useCallback(() => { WebBrowser.openBrowserAsync('https://smuppy.com/terms'); }, []);
  const handleOpenPrivacy = useCallback(() => { WebBrowser.openBrowserAsync('https://smuppy.com/privacy'); }, []);

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, delay: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 1000, delay: 200, useNativeDriver: true }),
      ]),
      Animated.timing(buttonsAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container} testID="welcome-screen">
      <Animated.View style={[styles.imageContainer, { transform: [{ scale: scaleAnim }] }]}>
        <ImageBackground source={require('../../../assets/images/bg.png')} style={styles.backgroundImage} resizeMode="cover">
          <LinearGradient colors={['rgba(0, 179, 199, 0.3)', 'rgba(10, 37, 47, 0.85)', 'rgba(10, 37, 47, 0.95)']} locations={[0, 0.5, 1]} style={styles.gradientOverlay} />
        </ImageBackground>
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.headerContainer, { opacity: fadeAnim }]}>
          <View style={styles.logoContainer}>
            <SmuppyIcon size={50} variant="dark" />
            <SmuppyText width={100} variant="dark" />
          </View>
        </Animated.View>

        <View style={styles.centerContainer}>
          <Animated.View style={[styles.contentContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            <Text style={styles.welcomeText}>Welcome To</Text>
            <Text style={styles.brandText}>Smuppy</Text>
            <Text style={styles.taglineText}>The future of physical activities{'\n'}and wellbeing</Text>
          </Animated.View>
        </View>

        <Animated.View style={[styles.buttonContainer, { opacity: buttonsAnim }]}>
          <TouchableOpacity style={styles.primaryButtonWrapper} onPress={() => navigation.navigate('Signup')} activeOpacity={0.8} testID="signup-button" accessible={true} accessibilityLabel="signup-button" accessibilityRole="button">
            <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Create an Account?</Text>
              <Text style={styles.arrowIcon}>→</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Login')} activeOpacity={0.8} testID="login-button" accessible={true} accessibilityLabel="login-button" accessibilityRole="button">
            <Text style={styles.secondaryButtonText}>Login</Text>
            <Text style={styles.arrowIconSecondary}>→</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[styles.legalRow, { opacity: buttonsAnim }]}>
          <Text style={styles.legalText}>
            By continuing, you agree to our{' '}
            <Text style={styles.legalLink} onPress={handleOpenTerms} accessibilityRole="link">Terms</Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={handleOpenPrivacy} accessibilityRole="link">Privacy Policy</Text>.
          </Text>
        </Animated.View>

        <View style={styles.homeIndicator} />
      </SafeAreaView>
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  imageContainer: { ...StyleSheet.absoluteFillObject },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  gradientOverlay: { ...StyleSheet.absoluteFillObject },
  safeArea: { flex: 1 },
  headerContainer: { alignItems: 'center', paddingTop: 20 },
  logoContainer: { alignItems: 'center', gap: 10 },
  centerContainer: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: height * 0.25 },
  contentContainer: { alignItems: 'center', paddingHorizontal: 24 },
  welcomeText: { fontSize: 52, fontWeight: '700', color: colors.white, textAlign: 'center', marginBottom: 0 },
  brandText: { fontSize: 52, fontWeight: '700', color: colors.white, textAlign: 'center', marginBottom: 20 },
  taglineText: { fontSize: 16, fontWeight: '400', color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', lineHeight: 24 },
  buttonContainer: { paddingHorizontal: 24, paddingBottom: height * 0.08, gap: 16 },
  primaryButtonWrapper: { borderRadius: 30, overflow: 'hidden' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 30, gap: 8 },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: colors.dark },
  arrowIcon: { fontSize: 18, color: colors.dark, marginLeft: 4 },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 30, borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'transparent', gap: 8 },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: colors.primary },
  arrowIconSecondary: { fontSize: 18, color: colors.primary, marginLeft: 4 },
  legalRow: { alignItems: 'center', paddingHorizontal: 32, marginBottom: 8 },
  legalText: { fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', textAlign: 'center', lineHeight: 18 },
  legalLink: { color: 'rgba(255, 255, 255, 0.8)', textDecorationLine: 'underline' },
  homeIndicator: { height: 8 },
});

export default WelcomeScreen;