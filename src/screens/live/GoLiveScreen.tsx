// src/screens/live/GoLiveScreen.tsx
// Simplified: Just for going live (public). Private sessions managed separately.
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Animated,
  StatusBar,
  Image,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS } from '../../config/theme';
import { useUserStore } from '../../stores';

const { width: _width, height: _height } = Dimensions.get('window');

export default function GoLiveScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useUserStore((state) => state.user);

  const [title, setTitle] = useState('');
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [isCountdown, setIsCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);

  // Protect route - only pro_creator can access
  useEffect(() => {
    if (user?.accountType !== 'pro_creator') {
      Alert.alert(
        'Pro Creator Feature',
        'Live streaming is only available for Pro Creator accounts.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  }, [user?.accountType, navigation]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const countdownAnim = useRef(new Animated.Value(1)).current;

  // Pulse animation for go live button
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Countdown logic
  useEffect(() => {
    if (isCountdown && countdownValue > 0) {
      countdownAnim.setValue(0.5);
      Animated.spring(countdownAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 5,
      }).start();

      const timer = setTimeout(() => {
        setCountdownValue(countdownValue - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (isCountdown && countdownValue === 0) {
      navigation.replace('LiveStreaming', {
        title: title || 'Live Session',
        audience: 'public',
        isPrivate: false,
      });
    }
  }, [isCountdown, countdownValue]);

  const handleClose = () => {
    navigation.goBack();
  };

  const handleGoLive = () => {
    setIsCountdown(true);
  };

  // Countdown overlay
  if (isCountdown) {
    return (
      <View style={styles.countdownContainer}>
        <StatusBar barStyle="light-content" />
        <View style={styles.cameraBackground}>
          <Image
            source={{ uri: undefined }}
            style={styles.cameraBackgroundImage}
            blurRadius={3}
          />
          <View style={styles.cameraOverlay} />
        </View>

        <Animated.View
          style={[
            styles.countdownCircle,
            { transform: [{ scale: countdownAnim }] }
          ]}
        >
          <LinearGradient
            colors={GRADIENTS.primary}
            style={styles.countdownGradient}
          >
            <Text style={styles.countdownText}>
              {countdownValue || ''}
            </Text>
          </LinearGradient>
        </Animated.View>

        {countdownValue === 0 && (
          <Text style={styles.goLiveText}>GO LIVE!</Text>
        )}

        <TouchableOpacity
          style={[styles.cancelCountdownButton, { bottom: insets.bottom + 30 }]}
          onPress={() => {
            setIsCountdown(false);
            setCountdownValue(3);
          }}
        >
          <Text style={styles.cancelCountdownText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Camera preview background */}
      <View style={styles.cameraBackground}>
        <Image
          source={{ uri: undefined }}
          style={styles.cameraBackgroundImage}
        />
        <View style={styles.cameraOverlay} />
      </View>

      {/* Top Controls */}
      <View style={[styles.topControls, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={handleClose} style={styles.iconButton}>
          <Ionicons name="close" size={28} color="white" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          {title ? (
            <TouchableOpacity
              style={styles.titleBadge}
              onPress={() => setShowTitleInput(true)}
            >
              <View style={styles.liveDotSmall} />
              <Text style={styles.titleBadgeText} numberOfLines={1}>{title}</Text>
              <Ionicons name="pencil" size={14} color="white" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Spacer to balance the close button on the left */}
        <View style={styles.iconButton} />
      </View>

      {/* Side Controls */}
      <View style={styles.sideControls}>
        <TouchableOpacity
          style={styles.sideButton}
          onPress={() => setShowTitleInput(true)}
        >
          <View style={styles.sideIconBg}>
            <Ionicons name="text" size={18} color="white" />
          </View>
          <Text style={styles.sideButtonLabel}>Title</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.sideButton}>
          <View style={styles.sideIconBg}>
            <Ionicons name="camera-reverse-outline" size={18} color="white" />
          </View>
          <Text style={styles.sideButtonLabel}>Flip</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.sideButton}>
          <View style={styles.sideIconBg}>
            <Ionicons name="sparkles" size={18} color="white" />
          </View>
          <Text style={styles.sideButtonLabel}>Effects</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Controls */}
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 20 }]}>
        {/* Live indicator */}
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveIndicatorText}>For all your fans</Text>
        </View>

        {/* Go Live Button */}
        <TouchableOpacity onPress={handleGoLive} activeOpacity={0.9}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <LinearGradient
              colors={GRADIENTS.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.goLiveButton}
            >
              <View style={styles.goLiveInner}>
                <Ionicons name="radio" size={24} color="white" />
                <Text style={styles.goLiveButtonText}>GO LIVE</Text>
              </View>
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>

        {/* Help text */}
        <Text style={styles.helpText}>
          Your live will be visible to all your fans
        </Text>
      </View>

      {/* Title Input Sheet */}
      {showTitleInput && (
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowTitleInput(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.titleInputSheet}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add a title</Text>
            <TextInput
              style={styles.titleInput}
              placeholder="What's your live about?"
              placeholderTextColor="rgba(10, 37, 47, 0.4)"
              value={title}
              onChangeText={setTitle}
              autoFocus
              maxLength={100}
            />
            <TouchableOpacity
              style={styles.titleSaveButton}
              onPress={() => setShowTitleInput(false)}
            >
              <LinearGradient
                colors={GRADIENTS.primary}
                style={styles.titleSaveGradient}
              >
                <Text style={styles.titleSaveText}>Save</Text>
              </LinearGradient>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraBackgroundImage: {
    width: '100%',
    height: '100%',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  titleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    maxWidth: '100%',
  },
  liveDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
  titleBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    maxWidth: 150,
  },
  sideControls: {
    position: 'absolute',
    left: 16,
    top: '35%',
    gap: 16,
  },
  sideButton: {
    alignItems: 'center',
    gap: 4,
  },
  sideIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sideButtonLabel: {
    color: 'white',
    fontSize: 11,
    fontWeight: '500',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 16,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  liveIndicatorText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  goLiveButton: {
    width: 150,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  goLiveInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goLiveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  helpText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
  },
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(10, 37, 47, 0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.dark,
    textAlign: 'center',
    marginBottom: 20,
  },
  titleInputSheet: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingTop: 12,
  },
  titleInput: {
    backgroundColor: 'rgba(10, 37, 47, 0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.dark,
    marginBottom: 16,
  },
  titleSaveButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  titleSaveGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  titleSaveText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Countdown styles
  countdownContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  countdownCircle: {
    marginBottom: 20,
  },
  countdownGradient: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  countdownText: {
    fontSize: 72,
    fontWeight: '700',
    color: 'white',
  },
  goLiveText: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
    letterSpacing: 2,
  },
  cancelCountdownButton: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 25,
  },
  cancelCountdownText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
