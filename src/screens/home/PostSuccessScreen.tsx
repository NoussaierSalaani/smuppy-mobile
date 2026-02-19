import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import OptimizedImage from '../../components/OptimizedImage';

const { width } = Dimensions.get('window');

interface MediaItem {
  uri: string;
}

interface PostSuccessScreenProps {
  route: { params: { media: MediaItem[]; postType: string; fromProfile?: boolean } };
  navigation: {
    goBack: () => void;
    navigate: (screen: string) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: object }> }) => void;
  };
}

export default function PostSuccessScreen({ route, navigation }: PostSuccessScreenProps) {
  const { media, postType, fromProfile = false } = route.params;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate success elements
    Animated.sequence([
      // Checkmark bounce
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      // Fade in text
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    // Progress bar animation
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start();

    // Auto navigate after 3 seconds
    const timer = setTimeout(() => {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Tabs', params: fromProfile ? { screen: 'Profile' } : undefined }],
      });
    }, 3000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Background Preview */}
      <OptimizedImage
        source={media[0]?.uri}
        style={styles.backgroundImage}
        contentFit="cover"
        priority="low"
      />
      <View style={styles.overlay} />

      {/* Content */}
      <View style={styles.content}>
        {/* Checkmark */}
        <Animated.View 
          style={[
            styles.checkCircle,
            { transform: [{ scale: scaleAnim }] }
          ]}
        >
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.checkGradient}
          >
            <Ionicons name="checkmark" size={40} color={colors.background} />
          </LinearGradient>
        </Animated.View>

        {/* Media Preview */}
        <Animated.View 
          style={[
            styles.mediaPreview,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }] 
            }
          ]}
        >
          <OptimizedImage source={media[0]?.uri} style={styles.previewImage} contentFit="cover" />
          {media.length > 1 && (
            <View style={styles.multipleIndicator}>
              <Ionicons name="copy" size={14} color={colors.background} />
              <Text style={styles.multipleCount}>{media.length}</Text>
            </View>
          )}
        </Animated.View>

        {/* Success Message */}
        <Animated.Text 
          style={[
            styles.successTitle,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }] 
            }
          ]}
        >
          Your {postType === 'peaks' ? 'peak' : 'post'} is live!
        </Animated.Text>
        
        <Animated.Text 
          style={[
            styles.successSubtitle,
            { 
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }] 
            }
          ]}
        >
          Ready to make an impact? 🚀
        </Animated.Text>

        {/* Progress bar */}
        <Animated.View style={[styles.progressContainer, { opacity: fadeAnim }]}>
          <View style={styles.progressBar}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const createStyles = (colors: typeof import('../../config/theme').COLORS, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },

  // Checkmark
  checkCircle: {
    marginBottom: 30,
  },
  checkGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },

  // Media Preview
  mediaPreview: {
    width: width * 0.5,
    height: width * 0.6,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 30,
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  multipleIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  multipleCount: {
    color: colors.background,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Text
  successTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.background,
    textAlign: 'center',
    marginBottom: 10,
  },
  successSubtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 40,
  },

  // Progress
  progressContainer: {
    width: '100%',
    alignItems: 'center',
  },
  progressBar: {
    width: 150,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
});
