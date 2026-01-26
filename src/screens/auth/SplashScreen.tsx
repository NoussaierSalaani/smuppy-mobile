import React, { useEffect } from 'react';
import { View, Text, StyleSheet, StatusBar, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SmuppyIcon, SmuppyText } from '../../components/SmuppyLogo';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
    canGoBack: () => boolean;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
}

const SplashScreen = ({ navigation }: SplashScreenProps) => {
  useEffect(() => {
    const timer = setTimeout(() => navigation.replace('Welcome'), 1500);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={['#00B3C7', '#0EBF8A', '#7BEDC6']} locations={[0, 0.5, 1]} style={styles.gradient}>
        <View style={styles.logoContainer}>
          <SmuppyIcon size={100} variant="dark" />
        </View>
        <View style={styles.bottomContainer}>
          <Text style={styles.fromText}>from</Text>
          <SmuppyText width={90} variant="dark" />
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1, width, height },
  logoContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bottomContainer: { paddingBottom: 50, alignItems: 'center' },
  fromText: { fontSize: 12, fontWeight: '300', color: '#0A252F', marginBottom: 4, letterSpacing: 0.5 },
});

export default SplashScreen;