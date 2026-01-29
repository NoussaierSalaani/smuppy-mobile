import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../../config/theme';
import { SmuppyLogoFull } from '../../components/SmuppyLogo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONFETTI_COLORS = ['#00CDB5', '#0891B2', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'];

interface ConfettiProps {
  delay: number;
  startX: number;
  color: string;
  size: number;
}

const Confetti = ({ delay, startX, color, size }: ConfettiProps) => {
  const translateY = useRef(new Animated.Value(-50)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }).start();
      Animated.parallel([
        Animated.timing(translateY, { toValue: SCREEN_HEIGHT + 100, duration: 2500 + Math.random() * 1500, useNativeDriver: true }),
        Animated.timing(translateX, { toValue: (Math.random() - 0.5) * 150, duration: 2500, useNativeDriver: true }),
        Animated.timing(rotate, { toValue: 10, duration: 2500, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        width: size,
        height: size * 0.6,
        backgroundColor: color,
        borderRadius: 2,
        transform: [
          { translateY },
          { translateX },
          { rotate: rotate.interpolate({ inputRange: [0, 10], outputRange: ['0deg', '720deg'] }) },
        ],
        opacity,
      }}
    />
  );
};

interface FireworkParticleProps {
  delay: number;
  centerX: number;
  centerY: number;
  angle: number;
  color: string;
}

const FireworkParticle = ({ delay, centerX, centerY, angle, color }: FireworkParticleProps) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const distance = 80 + Math.random() * 60;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.delay(500),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
        Animated.timing(translateX, { toValue: Math.cos(angle) * distance, duration: 800, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: Math.sin(angle) * distance, duration: 800, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: centerX,
        top: centerY,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        transform: [{ translateX }, { translateY }, { scale }],
        opacity,
      }}
    />
  );
};

interface FireworkProps {
  x: number;
  y: number;
  delay: number;
  color: string;
}

const Firework = ({ x, y, delay, color }: FireworkProps) => (
  <>
    {Array.from({ length: 12 }, (_, i) => (
      <FireworkParticle key={i} delay={delay} centerX={x} centerY={y} angle={(i / 12) * Math.PI * 2} color={color} />
    ))}
  </>
);

interface SuccessScreenProps {
  route: { params?: { onProfileCreated?: () => void } };
  navigation: { reset: (state: { index: number; routes: Array<{ name: string }> }) => void };
}

export default function SuccessScreen({ route, navigation: _navigation }: SuccessScreenProps) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(20)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.5)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;

  const { onProfileCreated } = route?.params || {};

  useEffect(() => {
    // Logo and text appear together quickly
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(textTranslate, { toValue: 0, friction: 6, useNativeDriver: true }),
    ]).start();

    // Then the circle and check
    const circleTimer = setTimeout(() => {
      Animated.parallel([
        Animated.spring(ringScale, { toValue: 1, friction: 4, tension: 50, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start(() => {
        Animated.parallel([
          Animated.spring(checkScale, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
          Animated.timing(checkOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
      });
    }, 400);

    // After 3s, call onProfileCreated → AppNavigator sets hasProfile = true → shows Main
    const redirectTimer = setTimeout(() => {
      if (onProfileCreated) {
        onProfileCreated();
      }
    }, 3000);

    return () => {
      clearTimeout(circleTimer);
      clearTimeout(redirectTimer);
    };
  }, [onProfileCreated]);

  const confettis = Array.from({ length: 50 }, (_, i) => (
    <Confetti
      key={`c${i}`}
      delay={300 + i * 40}
      startX={Math.random() * SCREEN_WIDTH}
      color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
      size={8 + Math.random() * 8}
    />
  ));

  const fireworks = [
    { x: SCREEN_WIDTH * 0.2, y: SCREEN_HEIGHT * 0.25, delay: 500, color: '#00CDB5' },
    { x: SCREEN_WIDTH * 0.8, y: SCREEN_HEIGHT * 0.2, delay: 700, color: '#0891B2' },
    { x: SCREEN_WIDTH * 0.15, y: SCREEN_HEIGHT * 0.6, delay: 900, color: '#4ECDC4' },
    { x: SCREEN_WIDTH * 0.85, y: SCREEN_HEIGHT * 0.55, delay: 1100, color: '#00CDB5' },
    { x: SCREEN_WIDTH * 0.5, y: SCREEN_HEIGHT * 0.15, delay: 1300, color: '#0891B2' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Animations Layer */}
      <View style={styles.animationLayer} pointerEvents="none">
        {confettis}
      </View>
      <View style={styles.animationLayer} pointerEvents="none">
        {fireworks.map((fw, i) => <Firework key={`f${i}`} {...fw} />)}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Animated.View style={{ opacity: logoOpacity }}>
          <SmuppyLogoFull iconSize={50} textWidth={130} iconVariant="dark" textVariant="dark" />
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: textOpacity, transform: [{ translateY: textTranslate }] }]}>
          <Text style={styles.title}>Your account is</Text>
          <Text style={styles.title}>successfully created</Text>
        </Animated.View>

        <View style={styles.successContainer}>
          <Animated.View style={{ transform: [{ scale: ringScale }], opacity: ringOpacity }}>
            <LinearGradient
              colors={GRADIENTS.diagonal}
              start={GRADIENTS.diagonalStart}
              end={GRADIENTS.diagonalEnd}
              style={styles.successRing}
            >
              <Animated.View style={{ transform: [{ scale: checkScale }], opacity: checkOpacity }}>
                <Ionicons name="checkmark" size={50} color={COLORS.white} />
              </Animated.View>
            </LinearGradient>
          </Animated.View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  animationLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  textContainer: { marginTop: 20 },
  successContainer: { marginTop: 40 },
  successRing: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 15, elevation: 10 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: COLORS.dark, textAlign: 'center' },
});
