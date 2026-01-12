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
import { COLORS, SPACING } from '../../config/theme';
import { SmuppyLogoFull } from '../../components/SmuppyLogo';

const { width, height } = Dimensions.get('window');

// Confetti colors
const CONFETTI_COLORS = ['#00CDB5', '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

// Single confetti piece
const Confetti = ({ delay, startX, color }) => {
  const translateY = useRef(new Animated.Value(-50)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: height + 100,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.timing(translateX, {
          toValue: (Math.random() - 0.5) * 200,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: Math.random() * 10,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, []);

  const spin = rotate.interpolate({
    inputRange: [0, 10],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.confetti,
        {
          left: startX,
          backgroundColor: color,
          transform: [{ translateY }, { translateX }, { rotate: spin }],
          opacity,
        },
      ]}
    />
  );
};

// Sparkle animation
const Sparkle = ({ delay, x, y }) => {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[styles.sparkle, { left: x, top: y, transform: [{ scale }], opacity }]}>
      <Ionicons name="sparkles" size={24} color="#FFD700" />
    </Animated.View>
  );
};

export default function SuccessScreen({ navigation }) {
  const checkScale = useRef(new Animated.Value(0)).current;
  const checkOpacity = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.8)).current;
  const ringOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslate = useRef(new Animated.Value(20)).current;
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const loaderRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Séquence d'animations
    Animated.sequence([
      // Ring apparaît
      Animated.parallel([
        Animated.spring(ringScale, { toValue: 1, friction: 4, useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      // Check apparaît avec bounce
      Animated.parallel([
        Animated.spring(checkScale, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
        Animated.timing(checkOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]),
      // Texte apparaît
      Animated.parallel([
        Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(textTranslate, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
      // Loader apparaît
      Animated.timing(loaderOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Rotation continue du loader
    Animated.loop(
      Animated.timing(loaderRotate, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    ).start();

    // Rediriger vers le Home après 4 secondes
    const timer = setTimeout(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
      });
    }, 4000);

    return () => clearTimeout(timer);
  }, [navigation]);

  const spin = loaderRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Générer les confettis
  const confettis = [];
  for (let i = 0; i < 50; i++) {
    confettis.push(
      <Confetti
        key={i}
        delay={i * 50}
        startX={Math.random() * width}
        color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
      />
    );
  }

  // Générer les sparkles
  const sparkles = [
    { x: width * 0.15, y: height * 0.25, delay: 500 },
    { x: width * 0.8, y: height * 0.3, delay: 700 },
    { x: width * 0.2, y: height * 0.6, delay: 900 },
    { x: width * 0.75, y: height * 0.55, delay: 1100 },
    { x: width * 0.5, y: height * 0.2, delay: 1300 },
    { x: width * 0.3, y: height * 0.7, delay: 1500 },
    { x: width * 0.85, y: height * 0.65, delay: 1700 },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Confettis */}
      <View style={styles.confettiContainer}>
        {confettis}
      </View>

      {/* Sparkles */}
      {sparkles.map((s, i) => (
        <Sparkle key={i} x={s.x} y={s.y} delay={s.delay} />
      ))}

      <View style={styles.content}>
        {/* Logo */}
        <SmuppyLogoFull width={180} />

        {/* Success Circle with Check */}
        <View style={styles.successContainer}>
          <Animated.View style={[styles.successRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}>
            <Animated.View style={[styles.checkContainer, { transform: [{ scale: checkScale }], opacity: checkOpacity }]}>
              <Ionicons name="checkmark" size={50} color={COLORS.white} />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Success Text */}
        <Animated.View style={{ opacity: textOpacity, transform: [{ translateY: textTranslate }] }}>
          <Text style={styles.title}>Your account is</Text>
          <Text style={styles.titleBold}>successfully created</Text>
        </Animated.View>
      </View>

      {/* Loader */}
      <Animated.View style={[styles.loaderContainer, { opacity: loaderOpacity }]}>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <View style={styles.loader}>
            <View style={styles.loaderArc} />
          </View>
        </Animated.View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.white,
  },
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  confetti: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 10,
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
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  checkContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: COLORS.dark,
    textAlign: 'center',
  },
  titleBold: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: COLORS.dark,
    textAlign: 'center',
  },
  loaderContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  loader: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderArc: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: COLORS.primary,
  },
});