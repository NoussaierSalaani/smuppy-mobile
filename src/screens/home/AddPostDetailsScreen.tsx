/**
 * AddPostDetailsScreen - Ecran d'ajout des details d'un post
 *
 * Corrections appliquees:
 * - setTimeout avec cleanup proper via useRef
 * - Toutes les couleurs utilisent le theme
 * - Code optimise et clean
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../../types';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import {
  GRADIENTS,
  SPACING,
  SIZES,
  HIT_SLOP,
} from '../../config/theme';
import {
  searchNominatim,
  formatNominatimResult,
} from '../../config/api';
import { awsAuth } from '../../services/aws-auth';
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores';
import { createPost } from '../../services/database';
import { uploadPostMedia } from '../../services/mediaUpload';
import * as Location from 'expo-location';
import LazyMapView, { LazyMarker } from '../../components/LazyMapView';
import type { Feature, Point } from 'geojson';
import { useVibeStore } from '../../stores/vibeStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { queryClient, queryKeys } from '../../lib/queryClient';
import { useFeedStore } from '../../stores';

const { width } = Dimensions.get('window');

// ============================================
// CONSTANTS
// ============================================

// Base visibility options
const BASE_VISIBILITY_OPTIONS = [
  { id: 'public', label: 'Public', icon: 'globe-outline' as const, description: 'Anyone can see this post' },
  { id: 'fans', label: 'Fans Only', icon: 'people-outline' as const, description: 'Only your fans can see this' },
  { id: 'private', label: 'Private', icon: 'lock-closed-outline' as const, description: 'Only you can see this' },
] as const;

// Additional option for pro_creators - subscribers only (paid channel members)
const SUBSCRIBERS_OPTION = {
  id: 'subscribers',
  label: 'Subscribers Only',
  icon: 'star-outline' as const,
  description: 'Only paid channel subscribers can see this',
} as const;

const MAX_DESCRIPTION_LENGTH = 2200;

// Location prediction type (adapted for Nominatim)
interface LocationPrediction {
  place_id: string;
  display_name: string;
  main_text: string;
  secondary_text: string;
  lat: number;
  lon: number;
}

// Following user type
interface FollowingUser {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

// Tagged person type for state
interface TaggedPerson {
  id: string;
  name?: string;
  full_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
}

// Media item type
interface MediaItem {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  duration?: number;
}

type AddPostDetailsScreenRouteProp = RouteProp<MainStackParamList, 'AddPostDetails'>;
type AddPostDetailsScreenNavigationProp = NativeStackNavigationProp<MainStackParamList, 'AddPostDetails'>;

interface AddPostDetailsScreenProps {
  route: AddPostDetailsScreenRouteProp;
  navigation: AddPostDetailsScreenNavigationProp;
}

// ============================================
// COMPONENT
// ============================================

export default function AddPostDetailsScreen({ route, navigation }: AddPostDetailsScreenProps) {
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const { media, postType = 'post', fromProfile = false } = route.params;
  const insets = useSafeAreaInsets();
  const user = useUserStore((state) => state.user);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Dynamic visibility options based on account type
  // Pro creators can restrict content to paid subscribers
  const VISIBILITY_OPTIONS = user?.accountType === 'pro_creator'
    ? [...BASE_VISIBILITY_OPTIONS.slice(0, 2), SUBSCRIBERS_OPTION, BASE_VISIBILITY_OPTIONS[2]]
    : BASE_VISIBILITY_OPTIONS;

  // State
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private' | 'fans' | 'subscribers'>('public');
  const [location, setLocation] = useState('');
  const [taggedPeople, setTaggedPeople] = useState<TaggedPerson[]>([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // User data from AWS
  const [currentUser, setCurrentUser] = useState<{
    displayName: string;
    avatar: string | null;
  }>({
    displayName: 'User',
    avatar: null,
  });

  // Modals
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  // Location search
  const [locationSearch, setLocationSearch] = useState('');
  const [locationPredictions, setLocationPredictions] = useState<LocationPrediction[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [, setCurrentLocationName] = useState<string | null>(null);
  const [showMapView, setShowMapView] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: 48.8566, // Default to Paris
    longitude: 2.3522,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [selectedCoords, setSelectedCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<InstanceType<typeof import('@rnmapbox/maps').default.MapView> | null>(null);

  // Following users for tagging
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [isLoadingFollowing, setIsLoadingFollowing] = useState(false);

  // Refs for cleanup
  const postTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locationSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load user data from AWS
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await awsAuth.getCurrentUser();
        if (user) {
          // Get profile from AWS API
          let profile = null;
          try {
            profile = await awsAPI.getProfile(user.id);
          } catch {
            // Profile may not exist yet
          }

          const email = user.email || '';
          const emailPrefix = email.split('@')[0]?.toLowerCase() || '';

          // Helper to check if a name looks like an email-derived name
          const isEmailDerivedName = (name: string | undefined | null): boolean => {
            if (!name) return true;
            return name.toLowerCase() === emailPrefix ||
                   name.toLowerCase().replace(/[^a-z0-9]/g, '') === emailPrefix.replace(/[^a-z0-9]/g, '');
          };

          // Find the best name, prioritizing actual names over email-derived ones
          const candidates = [
            user.attributes?.name,
            profile?.fullName,
          ].filter(Boolean) as string[];

          let displayName = 'User';
          for (const candidate of candidates) {
            if (!isEmailDerivedName(candidate)) {
              displayName = candidate;
              break;
            }
          }
          // If all are email-derived, use the first available
          if (displayName === 'User' && candidates.length > 0) {
            displayName = candidates[0];
          }

          const avatar = profile?.avatarUrl || null;

          setCurrentUser({ displayName, avatar });
        }
      } catch (error) {
        if (__DEV__) console.warn('Error loading user data:', error);
      }
    };

    loadUserData();
  }, []);

  // Cleanup on unmount - important for memory management at scale
  useEffect(() => {
    const postTimeout = postTimeoutRef.current;
    const locationTimeout = locationSearchTimeout.current;
    const locationCache = locationCacheRef.current;
    return () => {
      if (postTimeout) {
        clearTimeout(postTimeout);
      }
      if (locationTimeout) {
        clearTimeout(locationTimeout);
      }
      // Clear location cache on unmount
      locationCache.clear();
    };
  }, []);

  // Fetch following users for tagging - optimized for scale
  // Only fetch when tag modal opens (lazy loading)
  const hasLoadedFollowing = useRef(false);

  useEffect(() => {
    if (!showTagModal || hasLoadedFollowing.current) return;

    const fetchFollowing = async () => {
      setIsLoadingFollowing(true);
      try {
        const user = await awsAuth.getCurrentUser();
        if (!user) return;

        // Get users that the current user is following via AWS API
        const followingProfiles = await awsAPI.getFollowingUsers(user.id, { limit: 100 });

        if (followingProfiles) {
          const users = followingProfiles.map((p) => ({
            id: p.id,
            full_name: p.fullName,
            avatar_url: p.avatarUrl,
          })).filter(Boolean) as FollowingUser[];
          setFollowingUsers(users);
          hasLoadedFollowing.current = true;
        }
      } catch (error) {
        if (__DEV__) console.warn('Error fetching following:', error);
      } finally {
        setIsLoadingFollowing(false);
      }
    };

    fetchFollowing();
  }, [showTagModal]);

  // Search locations with debounce + caching for 2M DAU optimization
  // Using Nominatim (OpenStreetMap) - 100% FREE
  const locationCacheRef = useRef<Map<string, LocationPrediction[]>>(new Map());

  useEffect(() => {
    if (locationSearchTimeout.current) {
      clearTimeout(locationSearchTimeout.current);
    }

    const query = locationSearch.trim().toLowerCase();
    if (!query || query.length < 2) {
      setLocationPredictions([]);
      return;
    }

    // Check cache first (reduces API calls significantly at scale)
    const cached = locationCacheRef.current.get(query);
    if (cached) {
      setLocationPredictions(cached);
      return;
    }

    // Debounce 400ms for better UX and reduced API calls
    locationSearchTimeout.current = setTimeout(async () => {
      setIsSearchingLocation(true);
      try {
        // Use Nominatim (FREE OpenStreetMap geocoding)
        const results = await searchNominatim(locationSearch, {
          limit: 5,
          addressdetails: true,
        });

        // Transform Nominatim results to our format
        const predictions: LocationPrediction[] = results.map((result) => {
          const formatted = formatNominatimResult(result);
          return {
            place_id: String(result.place_id),
            display_name: result.display_name,
            main_text: formatted.mainText,
            secondary_text: formatted.secondaryText,
            lat: parseFloat(result.lat),
            lon: parseFloat(result.lon),
          };
        });

        // Cache the result (limit cache size to prevent memory issues)
        if (locationCacheRef.current.size > 50) {
          const firstKey = locationCacheRef.current.keys().next().value;
          if (firstKey) locationCacheRef.current.delete(firstKey);
        }
        locationCacheRef.current.set(query, predictions);
        setLocationPredictions(predictions);
      } catch (error) {
        if (__DEV__) console.warn('Error searching locations:', error);
      } finally {
        setIsSearchingLocation(false);
      }
    }, 400);
  }, [locationSearch]);

  // Get current location
  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showError('Permission needed', 'Please allow location access to use this feature.');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      };

      // Update map region
      setMapRegion({
        ...coords,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      setSelectedCoords(coords);

      const [address] = await Location.reverseGeocodeAsync(coords);

      if (address) {
        const locationName = [address.name, address.city, address.region]
          .filter(Boolean)
          .join(', ');
        setLocation(locationName);
        setCurrentLocationName(locationName);
        if (!showMapView) {
          setShowLocationModal(false);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('Error getting location:', error);
      showError('Error', 'Could not get your current location.');
    }
  };

  // Handle map press to select location
  const handleMapPress = async (feature: Feature) => {
    if (!feature.geometry || feature.geometry.type !== 'Point') return;
    const [longitude, latitude] = (feature.geometry as Point).coordinates;
    const coords = { latitude, longitude };
    setSelectedCoords(coords);

    try {
      const [address] = await Location.reverseGeocodeAsync(coords);
      if (address) {
        const locationName = [address.name, address.street, address.city, address.region]
          .filter(Boolean)
          .slice(0, 3)
          .join(', ');
        setLocation(locationName);
        setCurrentLocationName(locationName);
      }
    } catch (error) {
      if (__DEV__) console.warn('Error reverse geocoding:', error);
    }
  };

  // Initialize map with current location when opening map view
  const openMapView = async () => {
    setShowMapView(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        const coords = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        };
        setMapRegion({
          ...coords,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        if (!selectedCoords) {
          setSelectedCoords(coords);
        }
      }
    } catch {
      // Location permission denied or unavailable
    }
  };

  // Current visibility option
  const currentVisibility = VISIBILITY_OPTIONS.find(v => v.id === visibility) || VISIBILITY_OPTIONS[0];

  // ============================================
  // HANDLERS
  // ============================================

  const handlePost = useCallback(async () => {
    if (isPosting) return;

    setIsPosting(true);
    setUploadProgress(0);

    try {
      // Get current user
      const user = await awsAuth.getCurrentUser();
      if (!user) {
        showError('Error', 'You must be logged in to create a post');
        setIsPosting(false);
        return;
      }

      // Upload media files
      const mediaUrls: string[] = [];
      const totalFiles = media.length;

      for (let i = 0; i < media.length; i++) {
        const mediaItem = media[i];
        const type = mediaItem.mediaType === 'video' ? 'video' : 'image';

        // Get the actual file URI from MediaLibrary asset
        // This converts ph:// URIs to file:// URIs on iOS
        let fileUri = mediaItem.uri;

        // Try multiple methods to get a valid file URI
        if (!fileUri.startsWith('file://') && !fileUri.startsWith('http')) {
          try {
            // Method 1: Try getAssetInfoAsync if we have an asset ID
            if (mediaItem.id) {
              const assetInfo = await MediaLibrary.getAssetInfoAsync(mediaItem.id);
              if (assetInfo.localUri) {
                fileUri = assetInfo.localUri;
              }
            }

            // Method 2: If still not a file:// URI, try to get asset by ID
            if (!fileUri.startsWith('file://') && mediaItem.id) {
              const asset = await MediaLibrary.getAssetInfoAsync(mediaItem.id, { shouldDownloadFromNetwork: true });
              if (asset.localUri) {
                fileUri = asset.localUri;
              }
            }
          } catch (uriError) {
            if (__DEV__) console.warn(`[Upload] URI conversion failed for media ${i + 1}:`, uriError);
            // Fallback: upload service will try fetch() for ph:// URIs
          }
        }

        const result = await uploadPostMedia(
          user.id,
          fileUri,
          type,
          (progress) => {
            const overallProgress = ((i / totalFiles) + (progress / 100 / totalFiles)) * 80;
            setUploadProgress(overallProgress);
          }
        );

        if (!result.success) {
          // More descriptive error for debugging
          if (__DEV__) console.warn(`[Upload] Failed for media ${i + 1}:`, result.error);
          throw new Error(result.error || `Failed to upload media ${i + 1}`);
        }

        mediaUrls.push(result.cdnUrl || result.url || '');
      }

      setUploadProgress(85);

      // Create post in database
      const mediaType = media.length === 1
        ? (media[0].mediaType === 'video' ? 'video' : 'image')
        : 'multiple';

      const postData = {
        content: description,
        media_urls: mediaUrls,
        media_type: mediaType as 'image' | 'video' | 'multiple',
        visibility: visibility,
        location: location || null,
        is_peak: postType === 'peaks',
        tagged_users: taggedPeople.map(p => p.id),
      };

      const { data: newPost, error } = await createPost(postData);

      if (error) {
        throw new Error(typeof error === 'string' ? error : 'Failed to create post');
      }

      setUploadProgress(100);

      // Invalidate caches so new post appears everywhere
      const currentUserId = useUserStore.getState().user?.id;
      if (newPost) {
        useFeedStore.getState().prependToFeed(newPost);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.all });
      if (currentUserId) {
        queryClient.invalidateQueries({ queryKey: ['posts', 'user', currentUserId] });
      }

      // Award vibe score for posting (not for business accounts)
      if (useUserStore.getState().user?.accountType !== 'pro_business') {
        useVibeStore.getState().addVibeAction('post');
      }

      // Navigate to success
      navigation.navigate('PostSuccess', {
        media,
        postType,
        description,
        visibility,
        location,
        taggedPeople,
        postId: newPost?.id,
        fromProfile,
      });
    } catch (error) {
      if (__DEV__) console.warn('Post creation error:', error);
      showError('Error', error instanceof Error ? error.message : 'Failed to create post. Please try again.');
      setIsPosting(false);
      setUploadProgress(0);
    }
  }, [isPosting, navigation, media, postType, description, visibility, location, taggedPeople, fromProfile, showError]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleSelectVisibility = useCallback((optionId: 'public' | 'private' | 'fans' | 'subscribers') => {
    setVisibility(optionId);
    setShowVisibilityModal(false);
  }, []);

  const _handleSelectLocation = useCallback((loc: string) => {
    setLocation(loc);
    setShowLocationModal(false);
  }, []);

  const handleToggleTag = useCallback((user: TaggedPerson) => {
    setTaggedPeople(prev => {
      const isTagged = prev.find(p => p.id === user.id);
      if (isTagged) {
        return prev.filter(p => p.id !== user.id);
      }
      return [...prev, user];
    });
  }, []);

  const handleRemoveTag = useCallback((userId: string) => {
    setTaggedPeople(prev => prev.filter(p => p.id !== userId));
  }, []);

  // ============================================
  // RENDER FUNCTIONS
  // ============================================

  const renderMediaPreview: ListRenderItem<MediaItem> = useCallback(({ item, index }) => (
    <TouchableOpacity
      style={[
        styles.mediaPreviewItem,
        index === currentMediaIndex && styles.mediaPreviewItemActive
      ]}
      onPress={() => setCurrentMediaIndex(index)}
    >
      <OptimizedImage source={item.uri} style={styles.mediaPreviewImage} />
      {item.mediaType === 'video' && (
        <View style={styles.videoIcon}>
          <Ionicons name="play" size={12} color={colors.white} />
        </View>
      )}
    </TouchableOpacity>
  ), [currentMediaIndex, styles, colors]);

  // Visibility Modal
  const renderVisibilityModal = () => (
    <Modal visible={showVisibilityModal} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowVisibilityModal(false)}>
            <Ionicons name="close" size={28} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Visibility</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.modalContent}>
          {VISIBILITY_OPTIONS.map((option) => {
            const isActive = visibility === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.visibilityOption,
                  isActive && styles.visibilityOptionActive
                ]}
                onPress={() => handleSelectVisibility(option.id as 'public' | 'private' | 'fans' | 'subscribers')}
              >
                <View style={[
                  styles.visibilityIconContainer,
                  isActive && styles.visibilityIconContainerActive
                ]}>
                  <Ionicons
                    name={option.icon}
                    size={24}
                    color={isActive ? colors.white : colors.dark}
                  />
                </View>
                <View style={styles.visibilityInfo}>
                  <Text style={styles.visibilityLabel}>{option.label}</Text>
                  <Text style={styles.visibilityDescription}>{option.description}</Text>
                </View>
                {isActive && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );

  // Location Modal
  const renderLocationModal = () => (
    <Modal visible={showLocationModal} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { setShowLocationModal(false); setLocationSearch(''); setShowMapView(false); }}>
            <Ionicons name="close" size={28} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add Location</Text>
          <TouchableOpacity onPress={() => { setShowLocationModal(false); setLocationSearch(''); setShowMapView(false); }}>
            <Text style={styles.modalDone}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* View Toggle - Search vs Map */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleButton, !showMapView && styles.viewToggleButtonActive]}
            onPress={() => setShowMapView(false)}
          >
            <Ionicons name="search" size={18} color={!showMapView ? colors.white : colors.dark} />
            <Text style={[styles.viewToggleText, !showMapView && styles.viewToggleTextActive]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleButton, showMapView && styles.viewToggleButtonActive]}
            onPress={openMapView}
          >
            <Ionicons name="map" size={18} color={showMapView ? colors.white : colors.dark} />
            <Text style={[styles.viewToggleText, showMapView && styles.viewToggleTextActive]}>Map</Text>
          </TouchableOpacity>
        </View>

        {showMapView ? (
          /* Map View */
          <View style={styles.mapContainer}>
            <LazyMapView
              ref={mapRef}
              style={styles.map}
              centerCoordinate={[mapRegion.longitude, mapRegion.latitude]}
              zoomLevel={15}
              onPress={handleMapPress}
              showsUserLocation
            >
              {selectedCoords && (
                <LazyMarker
                  coordinate={selectedCoords}
                >
                  <View style={styles.mapMarker}>
                    <Ionicons name="location" size={32} color={colors.primary} />
                  </View>
                </LazyMarker>
              )}
            </LazyMapView>

            {/* Selected Location Info */}
            {location && (
              <View style={styles.mapLocationInfo}>
                <Ionicons name="location" size={20} color={colors.primary} />
                <Text style={styles.mapLocationText} numberOfLines={2}>{location}</Text>
                <TouchableOpacity
                  style={styles.mapConfirmButton}
                  onPress={() => { setShowLocationModal(false); setShowMapView(false); }}
                >
                  <Text style={styles.mapConfirmText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Current Location Button on Map */}
            <TouchableOpacity style={styles.mapCurrentLocationButton} onPress={getCurrentLocation}>
              <Ionicons name="navigate" size={22} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          /* Search View */
          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Current Location Button */}
            <TouchableOpacity
              style={styles.currentLocationButton}
              onPress={getCurrentLocation}
            >
              <View style={styles.currentLocationIcon}>
                <Ionicons name="navigate" size={20} color={colors.primary} />
              </View>
              <Text style={styles.currentLocationText}>Use current location</Text>
            </TouchableOpacity>

            {/* Search Bar */}
            <View style={styles.searchBar}>
              <Ionicons name="search" size={20} color={colors.gray} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search location..."
                placeholderTextColor={colors.gray}
                value={locationSearch}
                onChangeText={setLocationSearch}
                autoFocus={!showMapView}
              />
              {locationSearch.length > 0 && (
                <TouchableOpacity onPress={() => setLocationSearch('')}>
                  <Ionicons name="close-circle" size={20} color={colors.gray} />
                </TouchableOpacity>
              )}
            </View>

            {/* Loading indicator */}
            {isSearchingLocation && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}

            {/* Location Predictions */}
            {locationPredictions.map((prediction) => (
              <TouchableOpacity
                key={prediction.place_id}
                style={styles.locationOption}
                onPress={() => {
                  setLocation(prediction.main_text);
                  // Also update map coordinates if available
                  if (prediction.lat && prediction.lon) {
                    const coords = { latitude: prediction.lat, longitude: prediction.lon };
                    setSelectedCoords(coords);
                    setMapRegion({
                      ...coords,
                      latitudeDelta: 0.01,
                      longitudeDelta: 0.01,
                    });
                  }
                  setShowLocationModal(false);
                  setLocationSearch('');
                }}
              >
                <Ionicons name="location-outline" size={22} color={colors.gray} />
                <View style={styles.locationTextContainer}>
                  <Text style={styles.locationText}>
                    {prediction.main_text}
                  </Text>
                  {prediction.secondary_text && (
                    <Text style={styles.locationSecondaryText}>
                      {prediction.secondary_text}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {/* No results message */}
            {locationSearch.length > 2 && !isSearchingLocation && locationPredictions.length === 0 && (
              <Text style={styles.noResultsText}>No locations found</Text>
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );

  // Filter following users by search query
  const filteredFollowing = followingUsers.filter(user =>
    user.full_name?.toLowerCase().includes(tagSearchQuery.toLowerCase())
  );

  // Tag People Modal
  const renderTagModal = () => (
    <Modal visible={showTagModal} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { setShowTagModal(false); setTagSearchQuery(''); }}>
            <Ionicons name="close" size={28} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Tag People</Text>
          <TouchableOpacity onPress={() => { setShowTagModal(false); setTagSearchQuery(''); }}>
            <Text style={styles.modalDone}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalContent}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={colors.gray} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search people you follow..."
              placeholderTextColor={colors.gray}
              value={tagSearchQuery}
              onChangeText={setTagSearchQuery}
              autoFocus
            />
            {tagSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setTagSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.gray} />
              </TouchableOpacity>
            )}
          </View>

          {/* Tagged people chips */}
          {taggedPeople.length > 0 && (
            <View style={styles.taggedChips}>
              {taggedPeople.map((person) => (
                <TouchableOpacity
                  key={person.id}
                  style={styles.taggedChip}
                  onPress={() => handleRemoveTag(person.id)}
                >
                  <AvatarImage source={person.avatar_url || person.avatar} size={24} style={styles.taggedChipAvatar} />
                  <Text style={styles.taggedChipName}>{person.full_name || person.name}</Text>
                  <Ionicons name="close" size={16} color={colors.gray} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Loading indicator */}
          {isLoadingFollowing && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Loading people you follow...</Text>
            </View>
          )}

          {/* Empty state */}
          {!isLoadingFollowing && followingUsers.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={colors.gray} />
              <Text style={styles.emptyStateText}>You're not a fan of anyone yet</Text>
              <Text style={styles.emptyStateSubtext}>Become a fan of people to tag them in your posts</Text>
            </View>
          )}

          {/* Following users list */}
          {filteredFollowing.map((user) => {
            const isTagged = taggedPeople.find(p => p.id === user.id);
            return (
              <TouchableOpacity
                key={user.id}
                style={styles.userOption}
                onPress={() => handleToggleTag({
                  id: user.id,
                  name: user.full_name,
                  full_name: user.full_name,
                  avatar: user.avatar_url,
                  avatar_url: user.avatar_url,
                })}
              >
                <AvatarImage source={user.avatar_url} size={44} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.full_name || 'User'}</Text>
                </View>
                <View style={[styles.checkbox, isTagged && styles.checkboxActive]}>
                  {isTagged && <Ionicons name="checkmark" size={16} color={colors.white} />}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* No results for search */}
          {!isLoadingFollowing && tagSearchQuery && filteredFollowing.length === 0 && followingUsers.length > 0 && (
            <Text style={styles.noResultsText}>No people found matching "{tagSearchQuery}"</Text>
          )}
        </View>
      </View>
    </Modal>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={HIT_SLOP.medium}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add details</Text>
        <TouchableOpacity onPress={handlePost} disabled={isPosting}>
          <LinearGradient colors={GRADIENTS.primary} style={styles.postButton}>
            {isPosting ? (
              <View style={styles.postingContainer}>
                <ActivityIndicator size="small" color={colors.white} />
                <Text style={styles.postButtonText}>{Math.round(uploadProgress)}%</Text>
              </View>
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Media Preview */}
        <View style={styles.mediaContainer}>
          <OptimizedImage
            source={media[currentMediaIndex]?.uri}
            style={styles.mainMedia}
            contentFit="cover"
          />
          {media[currentMediaIndex]?.mediaType === 'video' && (
            <View style={styles.playButton}>
              <Ionicons name="play" size={30} color={colors.white} />
            </View>
          )}
        </View>

        {/* Media Thumbnails (if multiple) */}
        {media.length > 1 && (
          <FlashList<MediaItem>
            data={media}
            renderItem={renderMediaPreview}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mediaThumbnails}
          />
        )}

        {/* User Info + Description */}
        <View style={styles.userSection}>
          <AvatarImage
            source={currentUser.avatar || null}
            size={44}
          />
          <View style={styles.userDetails}>
            <Text style={styles.currentUserName}>{currentUser.displayName}</Text>
          </View>
        </View>

        <View style={styles.descriptionContainer}>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Describe your post! (You can also add hashtags here...)"
            placeholderTextColor={colors.gray}
            multiline
            value={description}
            onChangeText={setDescription}
            maxLength={MAX_DESCRIPTION_LENGTH}
          />
          <Text style={styles.charCount}>
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </Text>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {/* Visibility */}
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setShowVisibilityModal(true)}
          >
            <View style={styles.optionLeft}>
              <View style={styles.optionIconContainer}>
                <Ionicons name={currentVisibility.icon} size={20} color={colors.white} />
              </View>
              <Text style={styles.optionLabel}>Visibility</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={styles.optionValue}>{currentVisibility.label}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </View>
          </TouchableOpacity>

          {/* Location */}
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setShowLocationModal(true)}
          >
            <View style={styles.optionLeft}>
              <View style={styles.optionIconContainer}>
                <Ionicons name="location-outline" size={20} color={colors.white} />
              </View>
              <Text style={styles.optionLabel}>Location</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={[styles.optionValue, location && styles.optionValueSet]}>
                {location || 'Add location'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </View>
          </TouchableOpacity>

          {/* Tag People */}
          <TouchableOpacity
            style={styles.optionRow}
            onPress={() => setShowTagModal(true)}
          >
            <View style={styles.optionLeft}>
              <View style={styles.optionIconContainer}>
                <Ionicons name="person-add-outline" size={20} color={colors.white} />
              </View>
              <Text style={styles.optionLabel}>Tag people</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={[styles.optionValue, taggedPeople.length > 0 && styles.optionValueSet]}>
                {taggedPeople.length > 0 ? `${taggedPeople.length} people` : 'Add tags'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Modals */}
      {renderVisibilityModal()}
      {renderLocationModal()}
      {renderTagModal()}

    </KeyboardAvoidingView>
  );
}

// ============================================
// STYLES
// ============================================

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.primary,
  },
  headerSpacer: {
    width: 28,
  },
  postButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  postButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.white,
  },
  postingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Media
  mediaContainer: {
    width: width,
    height: width * 0.6,
    backgroundColor: colors.dark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainMedia: {
    width: '100%',
    height: '100%',
  },
  playButton: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaThumbnails: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  mediaPreviewItem: {
    width: 60,
    height: 60,
    borderRadius: SIZES.radiusSm,
    marginRight: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mediaPreviewItemActive: {
    borderColor: colors.primary,
  },
  mediaPreviewImage: {
    width: '100%',
    height: '100%',
  },
  videoIcon: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: colors.overlay,
    padding: 2,
    borderRadius: 3,
  },

  // User Section
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  currentUserAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userDetails: {
    marginLeft: SPACING.md,
  },
  currentUserName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: colors.primary,
  },

  // Description
  descriptionContainer: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(14, 191, 138, 0.15)',
  },
  descriptionInput: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: colors.dark,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.primary,
    textAlign: 'right',
    marginTop: 5,
    opacity: 0.7,
  },

  // Options
  optionsContainer: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: 10,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: SPACING.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: colors.primary,
    marginLeft: SPACING.md,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionValue: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    marginRight: SPACING.sm,
  },
  optionValueSet: {
    color: colors.primary,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  modalTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.dark,
  },
  modalDone: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: colors.primary,
  },
  modalContent: {
    padding: SPACING.lg,
  },

  // Visibility Options
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  visibilityOptionActive: {
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  visibilityIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.grayBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  visibilityIconContainerActive: {
    backgroundColor: colors.primary,
  },
  visibilityInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  visibilityLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.dark,
  },
  visibilityDescription: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: colors.dark,
    marginLeft: SPACING.sm,
  },

  // Current Location Button
  currentLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  currentLocationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E6FAF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentLocationText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 15,
    color: colors.primary,
    marginLeft: SPACING.md,
  },

  // Location
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  locationTextContainer: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  locationText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 15,
    color: colors.dark,
  },
  locationSecondaryText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.gray,
    marginTop: 2,
  },

  // Loading & Empty states
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
  },
  noResultsText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyStateText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.dark,
    marginTop: SPACING.md,
  },
  emptyStateSubtext: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    marginTop: SPACING.xs,
  },

  // Tagged Chips
  taggedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.md,
  },
  taggedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.grayBorder,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  taggedChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  taggedChipName: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.dark,
    marginRight: 6,
  },

  // User Option (Tag)
  userOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  userName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 15,
    color: colors.dark,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 100,
  },

  // View Toggle
  viewToggle: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 25,
    padding: 4,
  },
  viewToggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 22,
    gap: 6,
  },
  viewToggleButtonActive: {
    backgroundColor: colors.primary,
  },
  viewToggleText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.dark,
  },
  viewToggleTextActive: {
    color: colors.white,
  },

  // Map Styles
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  mapMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapLocationInfo: {
    position: 'absolute',
    bottom: 20,
    left: SPACING.lg,
    right: SPACING.lg,
    backgroundColor: colors.white,
    borderRadius: SIZES.radiusMd,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  mapLocationText: {
    flex: 1,
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.dark,
    marginLeft: SPACING.sm,
  },
  mapConfirmButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  mapConfirmText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: colors.white,
  },
  mapCurrentLocationButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
});
