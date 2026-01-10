import React, { useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../config/theme';
import { SmuppyLogoFull } from '../../components/SmuppyLogo';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Confetti colors
const CONFETTI_COLORS = ['#00CDB5', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

// Single confetti piece
const Confetti = ({ delay, startX, color, size }) => {
  const translateY = useRef(new Animated.Value(-50)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 1, duration: 100, useNativeDriver: true }).start();
      
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT + 100,
          duration: 2500 + Math.random() * 1500,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: (Math.random() - 0.5) * 150,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 10,
          duration: 2500,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, []);

  const spin = rotate.interpolate({
    inputRange: [0, 10],
    outputRange: ['0deg', '720deg'],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        width: size,
        height: size * 0.6,
        backgroundColor: color,
        borderRadius: 2,
        transform: [{ translateY }, { translateX }, { rotate: spin }],
        opacity,
      }}
    />
  );
};

// Firework particle
const FireworkParticle = ({ delay, centerX, centerY, angle, color }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const distance = 80 + Math.random() * 60;
  const targetX = Math.cos(angle) * distance;
  const targetY = Math.sin(angle) * distance;

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
        Animated.timing(translateX, { toValue: targetX, duration: 800, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: targetY, duration: 800, useNativeDriver: true }),
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

// Full firework burst
const Firework = ({ x, y, delay, color }) => {
  const particles = [];
  const numParticles = 12;
  
  for (let i = 0; i < numParticles; i++) {
    const angle = (i / numParticles) * Math.PI * 2;
    particles.push(
      <FireworkParticle
        key={i}
        delay={delay}
        centerX={x}
        centerY={y}
        angle={angle}
        color={color}
      />
    );
  }
  
  return <>{particles}</>;
};

export default function SuccessScreen({ navigation }) {
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.5)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(30)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Séquence d'animations
    Animated.sequence([
      Animated.timing(logoOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(ringScale, { toValue: 1, friction: 4, tension: 50, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(textTranslate, { toValue: 0, friction: 6, useNativeDriver: true }),
      ]),
    ]).start();

    // Rediriger vers le Home après 4 secondes
    const timer = setTimeout(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [navigation]);

  // Générer les confettis
  const confettis = [];
  for (let i = 0; i < 50; i++) {
    confettis.push(
      <Confetti
        key={`c${i}`}
        delay={300 + i * 40}
        startX={Math.random() * SCREEN_WIDTH}
        color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
        size={8 + Math.random() * 8}
      />
    );
  }

  // Fireworks
  const fireworks = [
    { x: SCREEN_WIDTH * 0.2, y: SCREEN_HEIGHT * 0.25, delay: 500, color: '#FFD700' },
    { x: SCREEN_WIDTH * 0.8, y: SCREEN_HEIGHT * 0.2, delay: 700, color: '#FF6B6B' },
    { x: SCREEN_WIDTH * 0.15, y: SCREEN_HEIGHT * 0.6, delay: 900, color: '#4ECDC4' },
    { x: SCREEN_WIDTH * 0.85, y: SCREEN_HEIGHT * 0.55, delay: 1100, color: '#00CDB5' },
    { x: SCREEN_WIDTH * 0.5, y: SCREEN_HEIGHT * 0.15, delay: 1300, color: '#DDA0DD' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Confettis */}
      <View style={styles.animationLayer} pointerEvents="none">
        {confettis}
      </View>

      {/* Fireworks */}
      <View style={styles.animationLayer} pointerEvents="none">
        {fireworks.map((fw, i) => (
          <Firework key={`f${i}`} x={fw.x} y={fw.y} delay={fw.delay} color={fw.color} />
        ))}
      </View>

      <View style={styles.content}>
        {/* Logo - DARK */}
        <Animated.View style={{ opacity: logoOpacity }}>
          <SmuppyLogoFull width={180} variant="dark" />
        </Animated.View>

        {/* Success Circle */}
        <View style={styles.successContainer}>
          <Animated.View style={[styles.successRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}>
            <Animated.View style={{ transform: [{ scale: checkScale }], opacity: checkOpacity }}>
              <Ionicons name="checkmark" size={50} color={COLORS.white} />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Text - NOIR */}
        <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslate }] }}>
          <Text style={styles.title}>Your account is</Text>
          <Text style={styles.title}>successfully created</Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.white,
  },
  animationLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  successContainer: {
    marginTop: 40,
    marginBottom: 30,
  },
  successRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: COLORS.dark,
    textAlign: 'center',
  },
});