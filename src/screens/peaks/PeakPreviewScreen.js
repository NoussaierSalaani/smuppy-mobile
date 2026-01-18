import React, { useState, useRef, useEffect } from 'react';
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
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { Video } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DARK_COLORS as COLORS } from '../../config/theme';
import { supabase } from '../../config/supabase';
import { uploadPostMedia } from '../../services/mediaUpload';
import { createPost } from '../../services/database';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const VISIBILITY_OPTIONS = [
  { value: 24, label: '24h' },
  { value: 48, label: '48h' },
];

// Sample location suggestions
const LOCATION_SUGGESTIONS = [
  'Gym Iron Paradise',
  'Central Park, NYC',
  'CrossFit Box',
  'Home Gym',
  'Beach Workout',
  'Mountain Trail',
];

const PeakPreviewScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  
  const { videoUri, duration, replyTo, originalPeak } = route.params || {};
  
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [textOverlay, setTextOverlay] = useState('');
  const [location, setLocation] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [feedDuration, setFeedDuration] = useState(48);
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Listen to keyboard
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
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
    return () => {
      if (videoRef.current) {
        videoRef.current.stopAsync();
      }
    };
  }, []);

  // Toggle video play/pause
  const togglePlayback = async () => {
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
  const handleGoBack = async () => {
    if (videoRef.current) {
      await videoRef.current.stopAsync();
    }
    navigation.goBack();
  };

  // Publish
  const handlePublish = async () => {
    setIsPublishing(true);

    if (videoRef.current) {
      await videoRef.current.stopAsync();
    }

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to publish a Peak');
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
      const peakData = {
        content: textOverlay || '',
        media_urls: [uploadResult.cdnUrl || uploadResult.url],
        media_type: 'video',
        visibility: 'public',
        location: location || null,
        is_peak: true,
        peak_duration: duration, // 6s, 10s, or 15s
        peak_expires_at: expiryDate.toISOString(),
        save_to_profile: saveToProfile,
        reply_to_peak_id: replyTo || null,
      };

      const { data: newPeak, error } = await createPost(peakData);

      if (error) {
        throw new Error(typeof error === 'string' ? error : 'Failed to create Peak');
      }

      Alert.alert(
        'Peak published! 🎉',
        replyTo ? 'Your reply has been posted' : 'Your Peak is now live',
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.navigate('Tabs', { screen: 'Home' });
            },
          },
        ]
      );
    } catch (error) {
      console.error('Peak publish error:', error);
      Alert.alert('Error', error.message || 'Unable to publish Peak');
    } finally {
      setIsPublishing(false);
    }
  };

  // Select location
  const selectLocation = (loc) => {
    setLocation(loc);
    setShowLocationInput(false);
    setLocationSearch('');
    Keyboard.dismiss();
  };

  // Filter locations
  const filteredLocations = locationSearch.length > 0
    ? LOCATION_SUGGESTIONS.filter(loc => 
        loc.toLowerCase().includes(locationSearch.toLowerCase())
      )
    : LOCATION_SUGGESTIONS;

  // Dismiss keyboard
  const handleCaptionDone = () => {
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
              resizeMode="cover"
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
          <TouchableOpacity 
            style={styles.backButton}
            onPress={handleGoBack}
          >
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
                  <Ionicons name="location" size={18} color={COLORS.primary} />
                  <TextInput
                    style={styles.locationInput}
                    placeholder="Search location..."
                    placeholderTextColor={COLORS.gray}
                    value={locationSearch}
                    onChangeText={setLocationSearch}
                    autoFocus
                  />
                  <TouchableOpacity onPress={() => {
                    setShowLocationInput(false);
                    setLocationSearch('');
                    Keyboard.dismiss();
                  }}>
                    <Ionicons name="close-circle" size={20} color={COLORS.gray} />
                  </TouchableOpacity>
                </View>
                <View style={styles.locationSuggestions}>
                  {filteredLocations.slice(0, 4).map((loc, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.locationSuggestion}
                      onPress={() => selectLocation(loc)}
                    >
                      <Ionicons name="location-outline" size={14} color={COLORS.gray} />
                      <Text style={styles.locationSuggestionText}>{loc}</Text>
                    </TouchableOpacity>
                  ))}
                  {locationSearch.length > 0 && !filteredLocations.includes(locationSearch) && (
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
                  <TouchableOpacity 
                    style={styles.captionOkButton}
                    onPress={handleCaptionDone}
                  >
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
                    <Text style={[
                      styles.visibilityOptionText,
                      feedDuration === option.value && styles.visibilityOptionTextActive,
                    ]}>
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
          </ScrollView>

          {/* Publish button */}
          {!keyboardVisible && (
            <View style={[styles.publishContainer, { paddingBottom: insets.bottom + 10 }]}>
              <TouchableOpacity
                style={[styles.publishButton, isPublishing && styles.publishButtonDisabled]}
                onPress={handlePublish}
                disabled={isPublishing}
              >
                {isPublishing ? (
                  <>
                    <ActivityIndicator size="small" color={COLORS.dark} />
                    <Text style={styles.publishButtonText}>Publishing...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="rocket" size={22} color={COLORS.dark} />
                    <Text style={styles.publishButtonText}>Publish Peak</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
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
  
  // Publish button
  publishContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
  },
  publishButtonDisabled: {
    opacity: 0.7,
  },
  publishButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
});

export default PeakPreviewScreen;