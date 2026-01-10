import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, ImageBackground, Animated, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS } from '../../config/theme';
import { SmuppyIcon, SmuppyText } from '../../components/SmuppyLogo';

const { width, height } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(height * 0.4)).current;
  const scaleAnim = useRef(new Animated.Value(1.1)).current;
  const buttonsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 800, delay: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 1000, delay: 200, useNativeDriver: true }),
      ]),
      Animated.timing(buttonsAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
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
          <TouchableOpacity style={styles.primaryButtonWrapper} onPress={() => navigation.navigate('Signup')} activeOpacity={0.8}>
            <LinearGradient colors={GRADIENTS.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Create an Account?</Text>
              <Text style={styles.arrowIcon}>→</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate('Login')} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>Login</Text>
            <Text style={styles.arrowIconSecondary}>→</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.homeIndicator} />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  imageContainer: { ...StyleSheet.absoluteFillObject },
  backgroundImage: { flex: 1, width: '100%', height: '100%' },
  gradientOverlay: { ...StyleSheet.absoluteFillObject },
  safeArea: { flex: 1 },
  headerContainer: { alignItems: 'center', paddingTop: 20 },
  logoContainer: { alignItems: 'center', gap: 10 },
  centerContainer: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: height * 0.25 },
  contentContainer: { alignItems: 'center', paddingHorizontal: 24 },
  welcomeText: { fontSize: 52, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginBottom: 0 },
  brandText: { fontSize: 52, fontWeight: '700', color: COLORS.white, textAlign: 'center', marginBottom: 20 },
  taglineText: { fontSize: 16, fontWeight: '400', color: 'rgba(255, 255, 255, 0.7)', textAlign: 'center', lineHeight: 24 },
  buttonContainer: { paddingHorizontal: 24, paddingBottom: height * 0.08, gap: 16 },
  primaryButtonWrapper: { borderRadius: 30, overflow: 'hidden' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 30, gap: 8 },
  primaryButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.dark },
  arrowIcon: { fontSize: 18, color: COLORS.dark, marginLeft: 4 },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 24, borderRadius: 30, borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: 'transparent', gap: 8 },
  secondaryButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  arrowIconSecondary: { fontSize: 18, color: COLORS.primary, marginLeft: 4 },
  homeIndicator: { height: 8 },
});

export default WelcomeScreen;