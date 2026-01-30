import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StatusBar,
  TextInput,
  ScrollView,
  Switch,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
  EmitterSubscription,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { DARK_COLORS as COLORS } from '../../config/theme';
import { awsAuth } from '../../services/aws-auth';
import { uploadPostMedia } from '../../services/mediaUpload';
import { createPost } from '../../services/database';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { searchNominatim, NominatimSearchResult, formatNominatimResult } from '../../config/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface VisibilityOption {
  value: number;
  label: string;
}

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  { value: 24, label: '24h' },
  { value: 48, label: '48h' },
];


interface OriginalPeakUser {
  id: string;
  name: string;
  avatar: string;
}

interface OriginalPeak {
  id: string;
  user?: OriginalPeakUser;
}

type RootStackParamList = {
  PeakPreview: {
    videoUri: string;
    duration: number;
    replyTo?: string;
    originalPeak?: OriginalPeak;
  };
  Tabs: { screen: string };
  [key: string]: object | undefined;
};

const PeakPreviewScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'PeakPreview'>>();
  const { showError: errorAlert } = useSmuppyAlert();
  const alert = { error: errorAlert };

  const { videoUri, duration, replyTo, originalPeak } = route.params || {};

  const videoRef = useRef<Video>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [textOverlay, setTextOverlay] = useState('');
  const [location, setLocation] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [feedDuration, setFeedDuration] = useState(48);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isChallenge, setIsChallenge] = useState(false);
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeRules, setChallengeRules] = useState('');
  const [locationSuggestions, setLocationSuggestions] = useState<NominatimSearchResult[]>([]);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen to keyboard
  useEffect(() => {
    const showSub: EmitterSubscription = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true)
    );
    const hideSub: EmitterSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setShowLocationInput(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Cleanup
  useEffect(() => {
    const ref = videoRef.current;
    return () => {
      if (ref) {
        ref.stopAsync();
      }
    };
  }, []);

  // Toggle video play/pause
  const togglePlayback = async (): Promise<void> => {
    if (videoRef.current) {
      if (isPlaying) {
        await videoRef.current.pauseAsync();
      } else {
        await videoRef.current.playAsync();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Go back
  const handleGoBack = async (): Promise<void> => {
    if (videoRef.current) {
      await videoRef.current.stopAsync();
    }
    navigation.goBack();
  };

  // Publish
  const handlePublish = async (): Promise<void> => {
    setIsPublishing(true);

    if (videoRef.current) {
      await videoRef.current.stopAsync();
    }

    try {
      // Get current user
      const user = await awsAuth.getCurrentUser();
      if (!user) {
        alert.error('Login Required', 'You must be logged in to publish a Peak');
        setIsPublishing(false);
        return;
      }

      // Upload video
      const uploadResult = await uploadPostMedia(user.id, videoUri, 'video');

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to upload video');
      }

      // Calculate expiry date based on feedDuration (24h or 48h)
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + feedDuration);

      // Create peak in database
      const mediaUrl = uploadResult.cdnUrl || uploadResult.url || '';
      const peakData = {
        content: textOverlay || '',
        media_urls: [mediaUrl].filter(Boolean) as string[],
        media_type: 'video' as const,
        visibility: 'public' as const,
        location: location || null,
        is_peak: true,
        peak_duration: duration, // 6s, 10s, or 15s
        peak_expires_at: expiryDate.toISOString(),
        save_to_profile: saveToProfile,
        reply_to_peak_id: replyTo || null,
        is_challenge: isChallenge,
        challenge_title: isChallenge ? challengeTitle : null,
        challenge_rules: isChallenge ? challengeRules : null,
      };

      const { error } = await createPost(peakData);

      if (error) {
        throw new Error(typeof error === 'string' ? error : 'Failed to create Peak');
      }

      // Show success and navigate
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Peak publish error:', error);
      alert.error('Publish Failed', (error as Error).message || 'Unable to publish Peak');
    } finally {
      setIsPublishing(false);
    }
  };

  // Nominatim search
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) { setLocationSuggestions([]); return; }
    setIsLoadingLocation(true);
    try {
      const results = await searchNominatim(query, { limit: 5 });
      setLocationSuggestions(results);
    } catch {
      setLocationSuggestions([]);
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  const handleLocationSearchChange = useCallback((text: string) => {
    setLocationSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchPlaces(text), 300);
  }, [searchPlaces]);

  useEffect(() => {
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, []);

  const selectLocation = (loc: string): void => {
    setLocation(loc);
    setShowLocationInput(false);
    setLocationSearch('');
    setLocationSuggestions([]);
    Keyboard.dismiss();
  };

  const detectCurrentLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setIsLoadingLocation(false); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [reverseResult] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (reverseResult) {
        const parts = [reverseResult.street, reverseResult.city, reverseResult.country].filter(Boolean);
        selectLocation(parts.join(', '));
      }
    } catch (error) {
      console.error('Location detection error:', error);
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  // Dismiss keyboard
  const handleCaptionDone = (): void => {
    Keyboard.dismiss();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Full screen video background */}
      <TouchableWithoutFeedback onPress={togglePlayback}>
        <View style={styles.videoContainer}>
          {videoUri ? (
            <Video
              ref={videoRef}
              source={{ uri: videoUri }}
              style={styles.fullscreenVideo}
              resizeMode={ResizeMode.COVER}
              isLooping
              shouldPlay={isPlaying}
              isMuted={false}
            />
          ) : (
            <View style={styles.videoPlaceholder} />
          )}

          {/* Play/Pause indicator */}
          {!isPlaying && (
            <View style={styles.playIndicator}>
              <View style={styles.playButton}>
                <Ionicons name="play" size={50} color={COLORS.white} />
              </View>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Content overlay */}
      <KeyboardAvoidingView
        style={styles.contentOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        pointerEvents="box-none"
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <Ionicons name="chevron-back" size={28} color={COLORS.white} />
          </TouchableOpacity>

          <View style={styles.durationBadge}>
            <Text style={styles.durationBadgeText}>{duration}s</Text>
          </View>

          <View style={{ width: 40 }} />
        </View>

        {/* Spacer to push options to bottom */}
        <View style={styles.spacer} pointerEvents="none" />

        {/* Options panel at bottom */}
        <View style={styles.optionsPanel}>
          <ScrollView
            style={styles.optionsScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Reply info */}
            {replyTo && originalPeak && (
              <View style={styles.replyInfo}>
                <Ionicons name="link" size={14} color={COLORS.primary} />
                <Text style={styles.replyText}>Reply to {originalPeak.user?.name}</Text>
              </View>
            )}

            {/* Location */}
            {showLocationInput ? (
              <View style={styles.locationInputContainer}>
                <View style={styles.locationInputHeader}>
                  <TouchableOpacity onPress={detectCurrentLocation} disabled={isLoadingLocation}>
                    {isLoadingLocation ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Ionicons name="locate" size={18} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                  <TextInput
                    style={styles.locationInput}
                    placeholder="Search location..."
                    placeholderTextColor={COLORS.gray}
                    value={locationSearch}
                    onChangeText={handleLocationSearchChange}
                    autoFocus
                  />
                  {isLoadingLocation && <ActivityIndicator size="small" color={COLORS.primary} />}
                  <TouchableOpacity
                    onPress={() => {
                      setShowLocationInput(false);
                      setLocationSearch('');
                      setLocationSuggestions([]);
                      Keyboard.dismiss();
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color={COLORS.gray} />
                  </TouchableOpacity>
                </View>
                <View style={styles.locationSuggestions}>
                  {locationSuggestions.map((result) => {
                    const formatted = formatNominatimResult(result);
                    return (
                      <TouchableOpacity
                        key={result.place_id.toString()}
                        style={styles.locationSuggestion}
                        onPress={() => selectLocation(formatted.fullAddress)}
                      >
                        <Ionicons name="location-outline" size={14} color={COLORS.gray} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.locationSuggestionText} numberOfLines={1}>{formatted.mainText}</Text>
                          {formatted.secondaryText ? (
                            <Text style={styles.locationSecondaryText} numberOfLines={1}>{formatted.secondaryText}</Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {locationSearch.length > 0 && locationSuggestions.length === 0 && !isLoadingLocation && (
                    <TouchableOpacity
                      style={styles.locationSuggestion}
                      onPress={() => selectLocation(locationSearch)}
                    >
                      <Ionicons name="add-circle-outline" size={14} color={COLORS.primary} />
                      <Text style={[styles.locationSuggestionText, { color: COLORS.primary }]}>
                        Use "{locationSearch}"
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setShowLocationInput(true)}
              >
                <View style={styles.optionLeft}>
                  <Ionicons name="location-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.optionLabel}>Location</Text>
                </View>
                <View style={styles.optionRight}>
                  <Text style={styles.optionValue} numberOfLines={1}>
                    {location || 'Add'}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.gray} />
                </View>
              </TouchableOpacity>
            )}

            {/* Caption/CTA */}
            <View style={styles.captionContainer}>
              <View style={styles.captionHeader}>
                <Ionicons name="text-outline" size={18} color={COLORS.primary} />
                <Text style={styles.optionLabel}>Caption / CTA</Text>
              </View>
              <View style={styles.captionInputWrapper}>
                <TextInput
                  style={styles.captionInput}
                  placeholder="Ex: 50 push-ups challenge!"
                  placeholderTextColor={COLORS.gray}
                  value={textOverlay}
                  onChangeText={setTextOverlay}
                  maxLength={60}
                  returnKeyType="done"
                  onSubmitEditing={handleCaptionDone}
                />
                {textOverlay.length > 0 && (
                  <TouchableOpacity style={styles.captionOkButton} onPress={handleCaptionDone}>
                    <Text style={styles.captionOkText}>OK</Text>
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.charCount}>{textOverlay.length}/60</Text>
            </View>

            {/* Visibility */}
            <View style={styles.optionRow}>
              <View style={styles.optionLeft}>
                <Ionicons name="time-outline" size={18} color={COLORS.primary} />
                <Text style={styles.optionLabel}>Visible for</Text>
              </View>
              <View style={styles.visibilityPicker}>
                {VISIBILITY_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.visibilityOption,
                      feedDuration === option.value && styles.visibilityOptionActive,
                    ]}
                    onPress={() => setFeedDuration(option.value)}
                  >
                    <Text
                      style={[
                        styles.visibilityOptionText,
                        feedDuration === option.value && styles.visibilityOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Save to profile - ALWAYS VISIBLE */}
            <View style={styles.optionRow}>
              <View style={styles.optionLeft}>
                <Ionicons name="bookmark-outline" size={18} color={COLORS.primary} />
                <Text style={styles.optionLabel}>Save to profile</Text>
              </View>
              <Switch
                value={saveToProfile}
                onValueChange={setSaveToProfile}
                trackColor={{ false: '#3A3A3C', true: COLORS.primary }}
                thumbColor={COLORS.white}
                ios_backgroundColor="#3A3A3C"
              />
            </View>

            {/* Challenge Toggle */}
            <View style={styles.optionRow}>
              <View style={styles.optionLeft}>
                <Ionicons name="trophy-outline" size={18} color="#FFD700" />
                <Text style={styles.optionLabel}>Challenge</Text>
              </View>
              <Switch
                value={isChallenge}
                onValueChange={setIsChallenge}
                trackColor={{ false: '#3A3A3C', true: '#FFD700' }}
                thumbColor={COLORS.white}
                ios_backgroundColor="#3A3A3C"
              />
            </View>

            {isChallenge && (
              <View style={styles.challengeFields}>
                <TextInput
                  style={styles.challengeInput}
                  placeholder="Challenge title"
                  placeholderTextColor={COLORS.gray}
                  value={challengeTitle}
                  onChangeText={setChallengeTitle}
                  maxLength={80}
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.challengeInput, { height: 60 }]}
                  placeholder="Rules (optional)"
                  placeholderTextColor={COLORS.gray}
                  value={challengeRules}
                  onChangeText={setChallengeRules}
                  maxLength={200}
                  multiline
                  returnKeyType="done"
                />
              </View>
            )}
          </ScrollView>

          {/* Publish button */}
          {!keyboardVisible && (
            <View style={[styles.publishContainer, { paddingBottom: insets.bottom + 10 }]}>
              <TouchableOpacity
                style={styles.publishButtonContainer}
                onPress={handlePublish}
                disabled={isPublishing}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={isPublishing ? ['#888', '#666'] : [COLORS.primary, '#00B5C1']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.publishGradient}
                >
                  {isPublishing ? (
                    <>
                      <ActivityIndicator size="small" color={COLORS.white} />
                      <Text style={styles.publishButtonText}>Publishing...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="rocket" size={22} color={COLORS.dark} />
                      <Text style={styles.publishButtonText}>Publish Peak</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Success Modal */}
      {showSuccessModal && (
        <View style={styles.successOverlay}>
          <View style={styles.successContent}>
            <LinearGradient
              colors={[COLORS.primary, '#00B5C1']}
              style={styles.successIconBg}
            >
              <Ionicons name="checkmark" size={50} color={COLORS.white} />
            </LinearGradient>
            <Text style={styles.successTitle}>Peak Published! 🎉</Text>
            <Text style={styles.successDesc}>
              {replyTo ? 'Your reply has been posted' : 'Your Peak is now live and ready to go viral!'}
            </Text>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => {
                setShowSuccessModal(false);
                navigation.navigate('Tabs', { screen: 'Home' });
              }}
            >
              <Text style={styles.successButtonText}>View Feed</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },

  // Full screen video
  videoContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  fullscreenVideo: {
    flex: 1,
  },
  videoPlaceholder: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  playIndicator: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 8,
  },

  // Content overlay
  contentOverlay: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  durationBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
  },

  // Spacer
  spacer: {
    flex: 1,
  },

  // Options panel
  optionsPanel: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.45,
  },
  optionsScroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // Reply info
  replyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  replyText: {
    fontSize: 13,
    color: COLORS.primary,
  },

  // Option row
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.white,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '45%',
  },
  optionValue: {
    fontSize: 13,
    color: COLORS.gray,
  },

  // Location input
  locationInputContainer: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
  },
  locationInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  locationInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
  },
  locationSuggestions: {
    maxHeight: 140,
  },
  locationSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  locationSuggestionText: {
    fontSize: 13,
    color: COLORS.white,
  },
  locationSecondaryText: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
  },

  // Caption
  captionContainer: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  captionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  captionInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(17, 227, 163, 0.3)',
  },
  captionInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  captionOkButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 4,
  },
  captionOkText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.dark,
  },
  charCount: {
    fontSize: 11,
    color: COLORS.gray,
    textAlign: 'right',
    marginTop: 6,
  },

  // Visibility
  visibilityPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  visibilityOption: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  visibilityOptionActive: {
    backgroundColor: COLORS.primary,
  },
  visibilityOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  visibilityOptionTextActive: {
    color: COLORS.dark,
  },

  // Challenge fields
  challengeFields: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  challengeInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.white,
    fontSize: 14,
  },

  // Publish button
  publishContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  publishButtonContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  publishGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  publishButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.dark,
  },

  // Success Modal
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  successIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  successTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 12,
    textAlign: 'center',
  },
  successDesc: {
    fontSize: 16,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  successButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  successButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.dark,
  },
});

export default PeakPreviewScreen;
