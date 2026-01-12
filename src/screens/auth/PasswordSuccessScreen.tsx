import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';

export default function PasswordSuccessScreen({ navigation }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.navigate('Login');
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Success Icon */}
        <LinearGradient
          colors={GRADIENTS.primary}
          start={GRADIENTS.primaryStart}
          end={GRADIENTS.primaryEnd}
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
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: { 
    fontFamily: 'WorkSans-Bold',
    fontSize: 28, 
    color: COLORS.dark, 
    textAlign: 'center', 
    marginBottom: SPACING.md,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.gray,
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
    backgroundColor: COLORS.primary,
  },
  redirect: { 
    fontSize: 14, 
    color: COLORS.gray,
  },
});