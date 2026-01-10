import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../config/theme';
import { SmuppyText } from '../../components/SmuppyLogo';

export default function PasswordSuccessScreen({ navigation }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.navigate('Login');
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <LinearGradient
          colors={['#00cdb5', '#0066ac']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.checkCircle}
        >
          <Ionicons name="checkmark" size={40} color={COLORS.white} />
        </LinearGradient>

        {/* Title */}
        <Text style={styles.title}>Password Changed!</Text>
        
        {/* Subtitle */}
        <Text style={styles.subtitle}>
          Your password has been successfully changed.
        </Text>

        {/* Redirect Text */}
        <View style={styles.redirectContainer}>
          <View style={styles.loadingDot} />
          <Text style={styles.redirect}>Redirecting to login...</Text>
        </View>
      </View>

      {/* Footer Logo */}
      <View style={styles.footer}>
        <SmuppyText width={140} variant="dark" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  checkCircle: { 
    width: 90, 
    height: 90, 
    borderRadius: 45, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginBottom: SPACING.xl,
    // Shadow
    shadowColor: '#00cdb5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: { 
    fontFamily: 'WorkSans-Bold',
    fontSize: 28, 
    fontWeight: '700', 
    color: '#0a252f', 
    textAlign: 'center', 
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: 16,
    color: '#676C75',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  redirectContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00cdb5',
  },
  redirect: { 
    fontSize: 14, 
    color: '#676C75',
  },
  footer: { 
    position: 'absolute', 
    bottom: SPACING['3xl'], 
    left: 0, 
    right: 0, 
    alignItems: 'center',
  },
});