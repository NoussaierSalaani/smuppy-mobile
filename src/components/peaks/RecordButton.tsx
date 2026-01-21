import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const COLORS = {
  primary: '#0EBF8A',
  white: '#FFFFFF',
  dark: '#0A0A0F',
  grayDark: '#2C2C2E',
};

// Taille du bouton
const BUTTON_SIZE = 100;
const SVG_SIZE = 72;

// Cercle de progression
const STROKE_WIDTH = 6;
const CENTER = BUTTON_SIZE / 2;
const RADIUS = (BUTTON_SIZE - STROKE_WIDTH) / 2 - 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Les 6 triangles du logo (extraits du SVG, adaptés pour viewBox 0 0 72 72)
const TRIANGLE_PATHS = [
  // Triangle 1 (haut gauche)
  "M9.1613 19.6646C7.86398 22.2477 6.95624 25.008 6.46751 27.856C5.21705 34.822 6.49414 42.0047 10.0697 48.1158L31.0875 23.5102L9.1613 19.6646Z",
  // Triangle 2 (haut)
  "M34.4381 3.15669C29.3797 3.42666 24.4713 4.96647 20.1676 7.63351C15.864 10.3006 12.3042 14.0086 9.81812 18.4141L41.8304 24.073L34.4381 3.15669Z",
  // Triangle 3 (bas droite)
  "M62.8173 46.459C64.1251 43.8774 65.0434 41.1171 65.5425 38.2675C66.7779 31.2979 65.4901 24.1168 61.909 18.0078L40.8911 42.6134L62.8173 46.459Z",
  // Triangle 4 (droite)
  "M61.1888 16.8195C58.9618 13.3345 56.0369 10.3468 52.5979 8.04403C49.1588 5.74122 45.2798 4.17307 41.2046 3.43805C39.4246 3.13839 37.6221 2.99195 35.817 3.00034L46.7802 33.5776L61.1888 16.8195Z",
  // Triangle 5 (bas gauche)
  "M10.822 49.3348C13.0584 52.7898 15.9846 55.7474 19.4176 58.0229C22.8507 60.2984 26.7169 61.8429 30.7749 62.5599C32.669 62.8742 34.5871 63.0206 36.507 62.9976L25.2307 32.4204L10.822 49.3348Z",
  // Triangle 6 (bas)
  "M37.9152 62.8419C42.909 62.5278 47.7444 60.9697 51.9795 58.3099C56.2146 55.6502 59.7145 51.9735 62.1594 47.6158L30.2097 41.9881L37.9152 62.8419Z",
];

interface RecordButtonProps {
  maxDuration?: number;
  minDuration?: number;
  onRecordStart?: () => void;
  onRecordEnd?: (duration: number) => void;
  onRecordCancel?: (message: string) => void;
}

const RecordButton = ({
  maxDuration = 10,
  minDuration = 3,
  onRecordStart,
  onRecordEnd,
  onRecordCancel,
}: RecordButtonProps): React.JSX.Element => {
  const [recording, setRecording] = useState(false);
  const recordDurationRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Animation: 0 = cercle plein, 1 = cercle vide
  const progress = useSharedValue(0);

  // Props animés pour le cercle
  const animatedProps = useAnimatedProps(() => {
    return {
      // strokeDashoffset: 0 = plein, CIRCUMFERENCE = vide
      strokeDashoffset: progress.value * CIRCUMFERENCE,
    };
  });

  const handlePressIn = (): void => {
    setRecording(true);
    recordDurationRef.current = 0;
    startTimeRef.current = Date.now();

    // Timer pour tracker la durée réelle
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - (startTimeRef.current || 0)) / 1000;
      recordDurationRef.current = elapsed;

      // Auto-stop si durée max atteinte
      if (elapsed >= maxDuration) {
        handlePressOut();
      }
    }, 50); // 50ms pour plus de précision

    // Animation du cercle: se vide de 0 à 1
    // Durée EXACTE = maxDuration en millisecondes
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: maxDuration * 1000, // Synchronisé EXACTEMENT avec la durée choisie
      easing: Easing.linear, // Linéaire pour une vitesse constante
    });

    if (onRecordStart) onRecordStart();
  };

  const handlePressOut = (): void => {
    if (!recording) return;

    const finalDuration = recordDurationRef.current;

    setRecording(false);

    // Stop timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop animation et reset
    cancelAnimation(progress);
    progress.value = 0;

    // Vérifier durée minimum
    if (finalDuration < minDuration) {
      if (onRecordCancel) {
        onRecordCancel(`Minimum ${minDuration} seconds required`);
      }
    } else {
      if (onRecordEnd) {
        onRecordEnd(finalDuration);
      }
    }
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={styles.pressable}
      >
        <View style={styles.buttonContainer}>
          {/* Cercle de fond (gris foncé) */}
          <Svg width={BUTTON_SIZE} height={BUTTON_SIZE} style={styles.progressSvg}>
            <Circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke={COLORS.grayDark}
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
            {/* Cercle vert qui se décharge */}
            <AnimatedCircle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              stroke={COLORS.primary}
              strokeWidth={STROKE_WIDTH}
              fill="none"
              strokeDasharray={CIRCUMFERENCE}
              animatedProps={animatedProps}
              strokeLinecap="round"
              rotation={-90}
              origin={`${CENTER}, ${CENTER}`}
            />
          </Svg>

          {/* Les 6 triangles blancs au centre */}
          <View style={styles.logoContainer}>
            <Svg
              width={SVG_SIZE * 0.75}
              height={SVG_SIZE * 0.75}
              viewBox="0 0 72 66"
            >
              {TRIANGLE_PATHS.map((path, index) => (
                <Path
                  key={index}
                  d={path}
                  fill={COLORS.white}
                  fillRule="evenodd"
                  clipRule="evenodd"
                />
              ))}
            </Svg>
          </View>
        </View>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  pressable: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
  },
  buttonContainer: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressSvg: {
    position: 'absolute',
  },
  logoContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default RecordButton;
