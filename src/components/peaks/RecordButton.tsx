import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withSpring,
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

// Cercle de progression (bordure verte extérieure)
const STROKE_WIDTH = 4;
const CENTER = BUTTON_SIZE / 2;
const RADIUS = (BUTTON_SIZE / 2) - (STROKE_WIDTH / 2); // 48
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Taille du S logo au centre (un peu plus petit que le cercle intérieur)
const S_LOGO_SIZE = 60;

// Le path du "S" de Smuppy (extrait de SmuppyLogo.tsx)
const S_PATH = "M36.8445 16.3889C40.2001 16.3889 43.1731 16.7499 45.6952 17.5466L45.6961 17.5457C47.9435 18.24 49.925 19.1587 51.568 20.351L51.8917 20.5928L52.0447 20.72C52.3901 21.0282 52.6527 21.4197 52.8057 21.859L52.9845 22.4094C53.3743 23.7004 53.5686 25.0322 53.5686 26.3954C53.5686 27.8947 53.368 29.3288 52.9285 30.6705C52.6766 31.4394 52.3447 32.1684 51.9202 32.8356C54.413 35.3416 55.5594 38.7191 55.5594 42.6438C55.5594 46.8053 53.879 50.3262 50.6985 53.0495L50.3855 53.3101C50.3815 53.3133 50.3778 53.3167 50.3739 53.3199C46.7451 56.2443 42.0323 57.562 36.5262 57.562C33.6012 57.562 30.9821 57.341 28.6982 56.8685C26.5188 56.4342 24.4075 55.686 22.3683 54.6376L21.9602 54.4233C21.6244 54.2432 21.3303 53.9955 21.0968 53.696L21.0008 53.5644C19.4181 51.2641 18.5281 48.7785 18.528 46.1488C18.528 43.5103 19.4407 41.1733 21.2924 39.3335C20.6433 38.6636 20.0879 37.8937 19.6261 37.0377C18.6813 35.2863 18.2098 33.3884 18.2097 31.3871C18.2097 26.3967 20.3723 22.3915 24.5485 19.6726L24.5529 19.6699L24.8784 19.4627C28.2676 17.3645 32.3024 16.389 36.8445 16.3889ZM36.8445 21.8519C32.9667 21.8519 29.911 22.7065 27.5254 24.2535C24.9076 25.9593 23.6727 28.2372 23.6727 31.3871C23.6727 32.5008 23.9273 33.5053 24.4338 34.4441C24.7176 34.9702 25.0354 35.3753 25.3798 35.6906C26.4403 35.4225 27.5388 35.2932 28.667 35.2932C31.744 35.2932 34.5125 36.0865 36.6836 37.9348L36.8917 38.1171L36.9068 38.1296L37.2047 38.4132C37.8628 39.0637 38.4191 39.7981 38.8327 40.6228H38.8345C39.2875 41.4784 39.6294 42.471 39.6294 43.5472C39.6294 44.3873 39.3495 45.3164 38.6104 46.0555C38.0185 46.6474 37.3213 46.9265 36.7477 47.0611L36.5103 47.11C35.2509 47.3389 34.0147 46.6634 33.5156 45.5087L33.4258 45.2721C32.9929 43.948 32.422 43.2244 31.8511 42.819L31.7373 42.7425L31.7222 42.7327C31.0334 42.2865 29.9679 41.9503 28.3221 41.9503C27.0073 41.9503 26.024 42.3582 25.1967 43.1533C24.4036 43.9156 23.991 44.8437 23.991 46.1488C23.991 47.3261 24.3321 48.5736 25.1478 49.9206C26.4571 50.5687 27.7798 51.0496 29.1187 51.369L29.7829 51.514L29.8052 51.5184C31.6275 51.8955 33.8582 52.0991 36.5262 52.0991C41.1726 52.0991 44.5452 50.9948 46.9338 49.0751C49.1085 47.3018 50.0965 45.2156 50.0965 42.6438C50.0965 39.4048 49.0686 37.3795 47.3277 36.0587V36.0578C45.7382 34.8748 43.5481 34.1711 40.5355 34.1711C39.6857 34.1711 39.1404 34.2433 38.8265 34.324C37.475 34.6715 36.0783 33.9448 35.5882 32.6382C35.4358 32.2319 35.356 31.8159 35.3383 31.404L35.3348 31.2271L35.3472 30.9292C35.4068 30.2359 35.6755 29.5672 36.1519 29.0114C36.6521 28.4278 37.2604 28.1081 37.7444 27.9266L37.7782 27.9141C38.7339 27.57 40.0676 27.514 41.3055 27.514C42.9157 27.514 44.6123 27.799 46.3727 28.3134C46.861 28.456 47.3385 28.6092 47.7963 28.7713C47.9916 28.1017 48.1057 27.3168 48.1057 26.3954C48.1057 25.7232 48.0275 25.0748 47.8763 24.4446C47.0508 23.9174 46.0329 23.429 44.7945 22.9989L44.0831 22.7659L44.0645 22.7597C42.2366 22.1801 39.8523 21.8519 36.8445 21.8519Z";

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Animation: 0 = cercle plein, 1 = cercle vide
  const progress = useSharedValue(0);

  // Animation for S logo scale (inflate/deflate effect)
  const logoScale = useSharedValue(1);

  // Props animés pour le cercle de progression
  const animatedProps = useAnimatedProps(() => {
    return {
      // strokeDashoffset: 0 = plein, CIRCUMFERENCE = vide
      strokeDashoffset: progress.value * CIRCUMFERENCE,
    };
  });

  // Style animé - scale du S logo (gonfle/dégonfle)
  const logoAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: logoScale.value },
      ],
    };
  });

  const handlePressIn = (): void => {
    setRecording(true);
    recordDurationRef.current = 0;
    startTimeRef.current = Date.now();

    // S logo inflate animation - gonfle avec spring pour effet naturel
    logoScale.value = withSpring(1.25, {
      damping: 12,
      stiffness: 180,
    });

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

    // S logo deflate animation - dégonfle avec spring
    logoScale.value = withSpring(1, {
      damping: 15,
      stiffness: 200,
    });

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

          {/* Le S de Smuppy au centre - gonfle/dégonfle */}
          <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
            <Svg
              width={S_LOGO_SIZE}
              height={S_LOGO_SIZE}
              viewBox="0 0 74 74"
              fill="none"
            >
              <Defs>
                {/* Gradient vert/cyan pour le S */}
                <LinearGradient id="sGradient" x1="18" y1="16" x2="55" y2="58" gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor="#0EBF8A" />
                  <Stop offset="1" stopColor="#00B3C7" />
                </LinearGradient>
              </Defs>
              <Path
                d={S_PATH}
                fill="url(#sGradient)"
              />
            </Svg>
          </Animated.View>
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
