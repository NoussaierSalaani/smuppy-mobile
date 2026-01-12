import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS } from '../../config/theme';

const { width } = Dimensions.get('window');

export default function PostSuccessScreen({ route, navigation }) {
  const { media, postType } = route.params;
  
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
        routes: [{ name: 'Tabs' }],
      });
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Background Preview */}
      <Image 
        source={{ uri: media[0]?.uri }} 
        style={styles.backgroundImage}
        blurRadius={20}
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
            colors={GRADIENTS.primary}
            style={styles.checkGradient}
          >
            <Ionicons name="checkmark" size={40} color="#fff" />
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
          <Image source={{ uri: media[0]?.uri }} style={styles.previewImage} />
          {media.length > 1 && (
            <View style={styles.multipleIndicator}>
              <Ionicons name="copy" size={14} color="#fff" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    shadowColor: COLORS.primary,
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
    shadowColor: '#000',
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  multipleCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

  // Text
  successTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
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
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
});
