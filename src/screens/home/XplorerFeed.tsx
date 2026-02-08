import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Dimensions, ScrollView, TextInput, StatusBar, Pressable, Keyboard } from 'react-native';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import Mapbox, { MapView, Camera, PointAnnotation, LocationPuck } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { GRADIENTS } from '../../config/theme';
import { FEATURES } from '../../config/featureFlags';
import { LiquidButton } from '../../components/LiquidButton';
import { BlurView } from 'expo-blur';
import { useTabBar } from '../../context/TabBarContext';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { awsAPI } from '../../services/aws-api';
import { useTheme } from '../../hooks/useTheme';
import { searchNominatim, NominatimSearchResult, isValidCoordinate } from '../../config/api';

// UUID validation regex for API calls
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sanitize user-generated text: remove HTML tags and control characters
const sanitizeText = (text: string | undefined | null): string =>
  text?.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '') || '';

// Initialize Mapbox with access token
const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
if (mapboxToken) {
  Mapbox.setAccessToken(mapboxToken);
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const baseWidth = 390;

const wp = (percentage: number) => (percentage * SCREEN_WIDTH) / 100;
const hp = (percentage: number) => (percentage * SCREEN_HEIGHT) / 100;
const normalize = (size: number) => Math.round(size * (SCREEN_WIDTH / baseWidth));

// ============================================
// PIN COLORS BY CATEGORY
// ============================================
const PIN_COLORS: Record<string, string> = {
  coaches: '#0EBF8A',
  gyms: '#1E90FF',
  wellness: '#9B59B6',
  sports: '#FFD700',
  food: '#00B5C1',
  stores: '#0081BE',
  events: '#FF6B6B',
  groups: '#4ECDC4',
  spots: '#5D4037',
  live: '#FF0000',
};

// ============================================
// 8 FILTER CHIPS - Available to ALL accounts
// ============================================
type FilterDef = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  subcategories: string[];
};

const FILTERS: FilterDef[] = [
  { key: 'coaches', label: 'Coaches', icon: 'person', color: PIN_COLORS.coaches, subcategories: ['Personal Trainers', 'Yoga Teachers', 'Sport Coaches', 'Nutritionists'] },
  { key: 'gyms', label: 'Gyms', icon: 'barbell', color: PIN_COLORS.gyms, subcategories: ['Gym', 'CrossFit', 'Boxing', 'Climbing', 'MMA', 'HIIT', 'Pilates', 'Bootcamp'] },
  { key: 'wellness', label: 'Wellness', icon: 'leaf', color: PIN_COLORS.wellness, subcategories: ['Yoga Studios', 'Spas', 'Meditation', 'Pools', 'Swim Schools'] },
  { key: 'sports', label: 'Sports', icon: 'trophy', color: PIN_COLORS.sports, subcategories: ['Sports Club', 'Tennis', 'Golf', 'Running Club', 'Cycling', 'Dance'] },
  { key: 'food', label: 'Food', icon: 'restaurant', color: PIN_COLORS.food, subcategories: ['Healthy Food', 'Smoothies', 'Meal Prep', 'Supplements', 'Juice Bars'] },
  { key: 'stores', label: 'Stores', icon: 'bag-handle', color: PIN_COLORS.stores, subcategories: ['Sportswear', 'Equipment', 'Accessories', 'Shoes', 'Nutrition'] },
  { key: 'events', label: 'Events', icon: 'calendar', color: PIN_COLORS.events, subcategories: ['Running', 'Hiking', 'Cycling', 'Soccer', 'Basketball', 'Tennis', 'Yoga', 'CrossFit', 'Swimming'] },
  { key: 'groups', label: 'Groups', icon: 'people', color: PIN_COLORS.groups, subcategories: ['Running', 'Hiking', 'Cycling', 'Gym', 'Yoga', 'Sports', 'Swimming'] },
  { key: 'spots', label: 'Spots', icon: 'location', color: PIN_COLORS.spots, subcategories: ['Parks', 'Outdoor Gyms', 'Trails', 'Courts', 'Fields', 'Beaches'] },
];

const MAX_ACTIVE_FILTERS = 3;

// ============================================
// FAB ACTIONS BY ACCOUNT TYPE
// ============================================
type FabAction = { label: string; icon: keyof typeof Ionicons.glyphMap; action: string };

// Personal (non-verified): Create Activity only (1/week limit enforced at action time)
const PERSONAL_ACTIONS: FabAction[] = [
  { label: 'Create Activity', icon: 'add-circle-outline', action: 'create_activity' },
];

// Personal verified: + Suggest Spot
const PERSONAL_VERIFIED_ACTIONS: FabAction[] = [
  ...PERSONAL_ACTIONS,
  { label: 'Suggest Spot', icon: 'pin-outline', action: 'suggest_spot' },
];

// Pro Creator: same as personal verified
const CREATOR_ACTIONS: FabAction[] = [
  ...PERSONAL_VERIFIED_ACTIONS,
];

// Pro Creator Premium: + Share Live on Map
const CREATOR_PREMIUM_ACTIONS: FabAction[] = [
  ...CREATOR_ACTIONS,
  ...(FEATURES.GO_LIVE ? [{ label: 'Share Live', icon: 'videocam-outline' as const, action: 'share_live' }] : []),
];

// Pro Business (non-premium): Create Activity only (locked to business location, no paid, no revenue)
const BUSINESS_ACTIONS: FabAction[] = [
  { label: 'Create Activity', icon: 'add-circle-outline', action: 'create_activity' },
];

// Pro Business Premium: Create Activity + Suggest Spot (NO live)
const BUSINESS_PREMIUM_ACTIONS: FabAction[] = [
  { label: 'Create Activity', icon: 'add-circle-outline', action: 'create_activity' },
  { label: 'Suggest Spot', icon: 'pin-outline', action: 'suggest_spot' },
];

// ============================================

interface MapMarker {
  id: string;
  type: string;
  subcategory: string;
  category: string;
  name: string;
  avatar: string;
  bio?: string;
  fans: number;
  posts?: number;
  coordinate: { latitude: number; longitude: number };
  coverImage?: string;
  address?: string;
  hours?: string;
  expertise?: string[];
}

// Default center (Montreal)
const DEFAULT_CENTER: [number, number] = [-73.5673, 45.5017];

// ============================================
// COMPONENT
// ============================================

interface XplorerFeedProps {
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void };
  isActive: boolean;
}

export default function XplorerFeed({ navigation, isActive }: XplorerFeedProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { showAlert } = useSmuppyAlert();
  const cameraRef = useRef<Camera>(null);
  const hasRequestedPermission = useRef(false);
  const { setBottomBarHidden, showBars, xplorerFullscreen, toggleXplorerFullscreen, setXplorerFullscreen } = useTabBar();

  // User info
  const accountType = useUserStore((s) => s.user?.accountType);
  const isVerified = useUserStore((s) => s.user?.isVerified);
  const isPremium = useUserStore((s) => s.user?.isPremium);

  const [userCoords, setUserCoords] = useState<[number, number]>(DEFAULT_CENTER);
  const [hasLocation, setHasLocation] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [activeSubFilters, setActiveSubFilters] = useState<Record<string, string[]>>({});
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<NominatimSearchResult[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [subFilterSheet, setSubFilterSheet] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [mapError, setMapError] = useState(false);

  // Business location fields (individual selectors for stable references)
  const businessAddress = useUserStore((s) => s.user?.businessAddress);
  const businessLatitude = useUserStore((s) => s.user?.businessLatitude);
  const businessLongitude = useUserStore((s) => s.user?.businessLongitude);
  const userId = useUserStore((s) => s.user?.id);
  const businessCategory = useUserStore((s) => s.user?.businessCategory);
  const businessName = useUserStore((s) => s.user?.businessName);
  const userAvatar = useUserStore((s) => s.user?.avatar);
  const userBio = useUserStore((s) => s.user?.bio);
  const userFans = useUserStore((s) => s.user?.stats?.fans);
  const userPosts = useUserStore((s) => s.user?.stats?.posts);

  // Business marker: only visible for premium business accounts with coordinates
  const businessMarker = useMemo((): MapMarker | null => {
    if (accountType !== 'pro_business' || !isPremium) return null;
    if (businessLatitude == null || businessLongitude == null) return null;
    if (!userId) return null;
    return {
      id: `business_${userId}`,
      type: 'business',
      subcategory: businessCategory || 'Business',
      category: 'business',
      name: businessName || 'My Business',
      avatar: userAvatar || '',
      bio: userBio || '',
      fans: userFans || 0,
      posts: userPosts || 0,
      coordinate: { latitude: businessLatitude, longitude: businessLongitude },
      address: businessAddress,
    };
  }, [accountType, isPremium, businessLatitude, businessLongitude, userId, businessCategory, businessName, userAvatar, userBio, userFans, userPosts, businessAddress]);

  // Event/Group/Live markers loaded from API
  const [eventGroupMarkers, setEventGroupMarkers] = useState<MapMarker[]>([]);
  const [liveMarkers, setLiveMarkers] = useState<MapMarker[]>([]);
  // Event or Group detail data for popup display
  const [selectedEventData, setSelectedEventData] = useState<{
    id?: string;
    title?: string;
    name?: string;
    description?: string;
    cover_image_url?: string;
    coverImageUrl?: string;
    location_name?: string;
    locationName?: string;
    address?: string;
    starts_at?: string;
    startsAt?: string;
    is_public?: boolean;
    category_slug?: string;
    categorySlug?: string;
    sport_type?: string;
    category?: string;
    max_participants?: number;
    maxParticipants?: number;
    current_participants?: number;
    currentParticipants?: number;
    is_joined?: boolean;
    isJoined?: boolean;
  } | null>(null);
  const [joiningEvent, setJoiningEvent] = useState(false);

  // Pre-fetch creation limits (non-blocking)
  const creationLimitsRef = useRef<{ canCreateEvent: boolean; canCreateGroup: boolean } | null>(null);
  useEffect(() => {
    if (accountType === 'personal' && !isVerified) {
      awsAPI.checkCreationLimits()
        .then((limits) => { creationLimitsRef.current = limits; })
        .catch(() => { creationLimitsRef.current = { canCreateEvent: true, canCreateGroup: true }; });
    }
  }, [accountType, isVerified]);

  // Filter distance for events/groups fetch radius
  const [filterDistance] = useState(25);

  // Fetch events/groups when location is available
  useEffect(() => {
    if (!hasLocation) return;
    const fetchEventsGroups = async () => {
      try {
        const [eventsRes, groupsRes] = await Promise.all([
          awsAPI.getEvents({
            filter: 'nearby',
            latitude: userCoords[1],
            longitude: userCoords[0],
            radiusKm: filterDistance,
            limit: 50,
          }),
          awsAPI.getGroups({
            filter: 'nearby',
            latitude: userCoords[1],
            longitude: userCoords[0],
            radiusKm: filterDistance,
            limit: 50,
          }),
        ]);

        const markers: MapMarker[] = [];

        if (eventsRes.success && eventsRes.events) {
          for (const rawEvt of eventsRes.events) {
            const evt = rawEvt as unknown as Record<string, unknown>;
            const lat = evt.latitude as number | undefined;
            const lng = evt.longitude as number | undefined;
            if (lat != null && lng != null) {
              markers.push({
                id: `event_${evt.id as string}`,
                type: 'events',
                subcategory: (evt.category_slug || evt.categorySlug || 'Other') as string,
                category: 'event',
                name: evt.title as string,
                avatar: (evt.cover_image_url || evt.coverImageUrl || '') as string,
                bio: evt.description as string | undefined,
                fans: (evt.current_participants || evt.currentParticipants || 0) as number,
                posts: (evt.max_participants || evt.maxParticipants || 0) as number,
                coordinate: { latitude: lat, longitude: lng },
                coverImage: (evt.cover_image_url || evt.coverImageUrl) as string | undefined,
                address: (evt.location_name || evt.locationName) as string | undefined,
              });
            }
          }
        }

        if (groupsRes.success && groupsRes.groups) {
          for (const grp of groupsRes.groups) {
            if (grp.latitude != null && grp.longitude != null) {
              markers.push({
                id: `group_${grp.id}`,
                type: 'groups',
                subcategory: grp.sport_type || grp.category || 'Other',
                category: 'group',
                name: grp.name,
                avatar: grp.cover_image_url || '',
                bio: grp.description,
                fans: grp.current_participants || 0,
                posts: grp.max_participants || 0,
                coordinate: { latitude: grp.latitude, longitude: grp.longitude },
                coverImage: grp.cover_image_url,
                address: grp.address,
              });
            }
          }
        }

        setEventGroupMarkers(markers);
      } catch (error) {
        if (__DEV__) console.warn('[XplorerFeed] Failed to fetch events/groups:', error);
      }
    };
    fetchEventsGroups();
  }, [hasLocation, userCoords, filterDistance]);

  // Fetch active live streams (poll every 30s)
  useEffect(() => {
    if (!isActive) return;
    const fetchLiveStreams = async () => {
      try {
        const res = await awsAPI.getActiveLiveStreams();
        if (res.success && res.data) {
          // Live markers use the host's location (approximate — centered on user for now)
          const markers: MapMarker[] = res.data.map((stream) => ({
            id: `live_${stream.host.id}`,
            type: 'live',
            subcategory: 'Live',
            category: 'live',
            name: `${stream.host.displayName || stream.host.username} — LIVE`,
            avatar: stream.host.avatarUrl || '',
            bio: stream.title,
            fans: stream.viewerCount,
            coordinate: { latitude: userCoords[1], longitude: userCoords[0] },
          }));
          setLiveMarkers(markers);
        }
      } catch (error) {
        if (__DEV__) console.warn('[XplorerFeed] Failed to fetch live streams:', error);
      }
    };
    fetchLiveStreams();
    const interval = setInterval(fetchLiveStreams, 30000);
    return () => clearInterval(interval);
  }, [isActive, userCoords]);

  // FAB visibility & actions based on account type
  const fabActions = useMemo((): FabAction[] => {
    if (accountType === 'pro_business' && isPremium) return BUSINESS_PREMIUM_ACTIONS;
    if (accountType === 'pro_business') return BUSINESS_ACTIONS;
    if (accountType === 'pro_creator' && isPremium) return CREATOR_PREMIUM_ACTIONS;
    if (accountType === 'pro_creator') return CREATOR_ACTIONS;
    if (isVerified) return PERSONAL_VERIFIED_ACTIONS;
    return PERSONAL_ACTIONS;
  }, [accountType, isVerified, isPremium]);

  // ============================================
  // LOCATION
  // ============================================

  const requestLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setShowPermissionModal(true);
      return;
    }

    try {
      const lastKnown = await Location.getLastKnownPositionAsync({});
      if (lastKnown) {
        const coords: [number, number] = [lastKnown.coords.longitude, lastKnown.coords.latitude];
        setUserCoords(coords);
        setHasLocation(true);
      }
    } catch (_e) { /* Location unavailable */ }

    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords: [number, number] = [current.coords.longitude, current.coords.latitude];
      setUserCoords(coords);
      setHasLocation(true);
    } catch (err) {
      if (__DEV__) console.log('[XplorerFeed] Could not get position:', err);
    }
  }, []);

  // ============================================
  // LIFECYCLE
  // ============================================

  useEffect(() => {
    if (isActive) {
      setBottomBarHidden(true);
      if (!hasRequestedPermission.current) {
        hasRequestedPermission.current = true;
        requestLocation();
      }
    } else {
      setBottomBarHidden(false);
      setXplorerFullscreen(false);
      showBars();
    }
  }, [isActive, setBottomBarHidden, setXplorerFullscreen, showBars, requestLocation]);

  // Debounced geocoding search for addresses
  useEffect(() => {
    const query = searchQuery.trim();

    // Only search if query looks like an address (3+ chars, contains letters)
    if (query.length < 3 || !/[a-zA-Z]/.test(query)) {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      return;
    }

    setIsSearchingAddress(true);
    const timeoutId = setTimeout(async () => {
      try {
        const results = await searchNominatim(query, { limit: 5 });
        // Filter to only valid coordinates
        const validResults = results.filter(r => {
          const lat = parseFloat(r.lat);
          const lon = parseFloat(r.lon);
          return isValidCoordinate(lat, lon);
        });
        setAddressSuggestions(validResults);
        setShowAddressSuggestions(validResults.length > 0);
      } catch (error) {
        console.error('Address search error:', error);
        setAddressSuggestions([]);
        setShowAddressSuggestions(false);
      } finally {
        setIsSearchingAddress(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // ============================================
  // ACTIONS
  // ============================================

  const handleAddressSelect = useCallback((result: NominatimSearchResult) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);

    if (!isValidCoordinate(lat, lon) || !cameraRef.current) return;

    // Dismiss keyboard
    Keyboard.dismiss();

    // Move camera to selected location
    cameraRef.current.setCamera({
      centerCoordinate: [lon, lat],
      zoomLevel: 15,
      animationDuration: 800,
    });

    // Clear search and suggestions
    setSearchQuery('');
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }, []);

  const centerOnUser = useCallback(() => {
    if (!cameraRef.current) return;
    if (hasLocation) {
      cameraRef.current.setCamera({
        centerCoordinate: userCoords,
        zoomLevel: 14,
        animationDuration: 600,
      });
    } else {
      requestLocation();
    }
  }, [hasLocation, userCoords, requestLocation]);

  const toggleFilter = useCallback((filterKey: string) => {
    setActiveFilters(prev => {
      if (prev.includes(filterKey)) {
        // Also clear sub-filters when deactivating
        setActiveSubFilters(sub => {
          const next = { ...sub };
          delete next[filterKey];
          return next;
        });
        return prev.filter(f => f !== filterKey);
      }
      if (prev.length >= MAX_ACTIVE_FILTERS) return prev; // Block instead of rotating
      return [...prev, filterKey];
    });
  }, []);

  const handleLongPress = useCallback((filterKey: string) => {
    if (activeFilters.includes(filterKey)) {
      setSubFilterSheet(filterKey);
    }
  }, [activeFilters]);

  const toggleSubFilter = useCallback((filterKey: string, sub: string) => {
    setActiveSubFilters(prev => {
      const current = prev[filterKey] || [];
      const next = current.includes(sub)
        ? current.filter(s => s !== sub)
        : [...current, sub];
      return { ...prev, [filterKey]: next };
    });
  }, []);

  const handleMarkerPress = useCallback((marker: MapMarker) => {
    // Live markers: go directly to viewer stream
    if (marker.category === 'live') {
      const hostId = marker.id.replace('live_', '');
      navigation.navigate('ViewerLiveStream', {
        channelName: `live_${hostId}`,
        hostId,
        hostName: marker.name.replace(' — LIVE', ''),
        hostAvatar: marker.avatar,
      });
      return;
    }

    setSelectedMarker(marker);
    // For event/group markers, also load full detail
    if (marker.category === 'event') {
      const eventId = marker.id.replace('event_', '');
      if (!UUID_REGEX.test(eventId)) {
        if (__DEV__) console.warn('[XplorerFeed] Invalid event UUID:', eventId);
        return;
      }
      awsAPI.getEventDetail(eventId).then(res => {
        if (res.success && res.event) setSelectedEventData(res.event);
      }).catch((err) => { if (__DEV__) console.warn('[XplorerFeed]', err); });
    } else if (marker.category === 'group') {
      const groupId = marker.id.replace('group_', '');
      if (!UUID_REGEX.test(groupId)) {
        if (__DEV__) console.warn('[XplorerFeed] Invalid group UUID:', groupId);
        return;
      }
      awsAPI.getGroup(groupId).then(res => {
        if (res.success && res.group) setSelectedEventData(res.group);
      }).catch((err) => { if (__DEV__) console.warn('[XplorerFeed]', err); });
    } else {
      setSelectedEventData(null);
    }
  }, [navigation]);

  const closePopup = useCallback(() => {
    setSelectedMarker(null);
    setSelectedEventData(null);
  }, []);

  const goToProfile = useCallback((marker: MapMarker) => {
    closePopup();
    navigation.navigate('UserProfile', { userId: marker.id });
  }, [closePopup, navigation]);

  const handleFabAction = useCallback((action: string) => {
    setFabOpen(false);
    switch (action) {
      case 'create_activity': {
        // Personal non-verified: check pre-fetched limits (instant, no network wait)
        if (accountType === 'personal' && !isVerified) {
          const limits = creationLimitsRef.current;
          if (limits && !limits.canCreateEvent) {
            showAlert({
              title: 'Weekly Limit Reached',
              message: 'Free accounts can create 1 event per week. Verify your identity to create unlimited events and groups.',
              type: 'info',
              buttons: [
                { text: 'OK', style: 'cancel' },
                { text: 'Get Verified', onPress: () => navigation.navigate('IdentityVerification') },
              ],
            });
            return;
          }
        }

        if (accountType === 'pro_business' && businessLatitude != null && businessLongitude != null) {
          // Pro Business: locked to business address + business category
          navigation.navigate('CreateActivity', {
            lockedLocation: { lat: businessLatitude, lng: businessLongitude },
          });
        } else {
          navigation.navigate('CreateActivity');
        }
        break;
      }
      case 'suggest_spot':
        navigation.navigate('SuggestSpot');
        break;
      case 'share_live':
        if (!isVerified) {
          showAlert({
            title: 'Verified Account Required',
            message: 'You need to verify your identity to go live and access channel features.',
            type: 'info',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Get Verified', onPress: () => navigation.navigate('IdentityVerification') },
            ],
          });
          return;
        }
        navigation.navigate('GoLiveIntro');
        break;
    }
  }, [navigation, accountType, isVerified, businessLatitude, businessLongitude, showAlert]);

  const allMarkers = useMemo(() => {
    return [...liveMarkers, ...eventGroupMarkers];
  }, [liveMarkers, eventGroupMarkers]);

  const filteredMarkers = useMemo(() => {
    let markers = allMarkers;

    if (activeFilters.length > 0) {
      markers = markers.filter(m => {
        if (!activeFilters.includes(m.type)) return false;
        const subs = activeSubFilters[m.type];
        if (subs && subs.length > 0) {
          return subs.includes(m.subcategory);
        }
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      markers = markers.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.subcategory.toLowerCase().includes(q) ||
        (m.address && m.address.toLowerCase().includes(q))
      );
    }

    return markers;
  }, [activeFilters, activeSubFilters, allMarkers, searchQuery]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // ============================================
  // RENDERERS
  // ============================================

  const renderCustomMarker = useCallback((marker: MapMarker) => {
    const pinColor = PIN_COLORS[marker.type] || colors.primary;

    // Live markers: pulsing red dot with avatar
    if (marker.type === 'live') {
      return (
        <View style={styles.liveMarkerContainer}>
          <View style={styles.liveMarkerPulse} />
          <View style={styles.liveMarkerInner}>
            <AvatarImage source={marker.avatar} size={wp(8)} />
          </View>
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        </View>
      );
    }

    // Event/group markers: teardrop with icon
    if (marker.type === 'events' || marker.type === 'groups') {
      const iconName = marker.type === 'events' ? 'calendar' : 'people';
      return (
        <View style={styles.teardropContainer}>
          <View style={[styles.teardropPin, { backgroundColor: pinColor }]}>
            <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={normalize(16)} color={colors.white} />
          </View>
          <View style={[styles.teardropPointer, { borderTopColor: pinColor }]} />
        </View>
      );
    }

    // Default: avatar circle pin
    return (
      <View style={[styles.markerPin, { backgroundColor: pinColor }]}>
        <AvatarImage source={marker.avatar} size={wp(9)} />
      </View>
    );
  }, [colors, styles]);

  const renderUserPopup = () => {
    if (!selectedMarker) return null;
    return (
      <View style={[styles.popupContainer, { bottom: insets.bottom + hp(2) }]}>
        <TouchableOpacity style={styles.popupClose} onPress={closePopup}>
          <Ionicons name="close" size={normalize(20)} color={colors.gray} />
        </TouchableOpacity>
        <View style={styles.popupContent}>
          <AvatarImage source={selectedMarker.avatar} size={wp(15)} style={styles.popupAvatar} />
          <View style={styles.popupInfo}>
            <Text style={styles.popupName}>{sanitizeText(selectedMarker.name)}</Text>
            <View style={styles.popupStats}>
              <Text style={styles.popupStatText}><Text style={styles.popupStatNumber}>{selectedMarker.fans}</Text> fans</Text>
              <Text style={styles.popupStatDot}>·</Text>
              <Text style={styles.popupStatText}><Text style={styles.popupStatNumber}>{selectedMarker.posts}</Text> posts</Text>
            </View>
            <Text style={styles.popupBio} numberOfLines={2}>{sanitizeText(selectedMarker.bio)}</Text>
          </View>
        </View>
        <LiquidButton
          label="See Profile"
          onPress={() => goToProfile(selectedMarker)}
          size="md"
          style={styles.popupButton}
          icon={<Ionicons name="arrow-forward" size={normalize(16)} color={colors.white} />}
        />
      </View>
    );
  };

  const renderBusinessPopup = () => {
    if (!selectedMarker) return null;
    return (
      <View style={[styles.businessPopupContainer, { bottom: insets.bottom + hp(2) }]}>
        <TouchableOpacity style={styles.businessPopupClose} onPress={closePopup}>
          <Ionicons name="close" size={normalize(22)} color={colors.white} />
        </TouchableOpacity>
        <OptimizedImage source={selectedMarker.coverImage} style={styles.businessCover} />
        <View style={styles.businessContent}>
          <Text style={styles.businessName}>{sanitizeText(selectedMarker.name)}</Text>
          <View style={styles.businessRow}>
            <Ionicons name="location-outline" size={normalize(16)} color={colors.gray} />
            <Text style={styles.businessText}>{sanitizeText(selectedMarker.address)}</Text>
          </View>
          <View style={styles.businessRow}>
            <Ionicons name="time-outline" size={normalize(16)} color={colors.gray} />
            <Text style={styles.businessText}>{sanitizeText(selectedMarker.hours)}</Text>
          </View>
          <View style={styles.expertiseTags}>
            {selectedMarker.expertise?.map((tag, index) => (
              <View key={index} style={styles.expertiseTag}>
                <Text style={styles.expertiseTagText}>{sanitizeText(tag)}</Text>
              </View>
            ))}
          </View>
          <LiquidButton
            label="See Profile"
            onPress={() => goToProfile(selectedMarker)}
            size="md"
            style={styles.popupButton}
            icon={<Ionicons name="arrow-forward" size={normalize(16)} color={colors.white} />}
          />
        </View>
      </View>
    );
  };

  // ============================================
  // SUB-FILTER BOTTOM SHEET
  // ============================================

  const renderSubFilterSheet = () => {
    if (!subFilterSheet) return null;
    const filter = FILTERS.find(f => f.key === subFilterSheet);
    if (!filter) return null;
    const activeSubs = activeSubFilters[subFilterSheet] || [];

    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => setSubFilterSheet(null)}>
        <TouchableOpacity style={styles.sheetOverlay} activeOpacity={1} onPress={() => setSubFilterSheet(null)}>
          <View style={[styles.sheetContainer, { paddingBottom: insets.bottom + hp(3) }]} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetIconCircle, { backgroundColor: filter.color + '20' }]}>
                <Ionicons name={filter.icon} size={normalize(22)} color={filter.color} />
              </View>
              <Text style={styles.sheetTitle}>{filter.label}</Text>
            </View>
            <Text style={styles.sheetSubtitle}>Filter by subcategory</Text>
            <View style={styles.sheetChips}>
              {filter.subcategories.map(sub => {
                const isActive = activeSubs.includes(sub);
                return (
                  <TouchableOpacity key={sub} activeOpacity={0.8} onPress={() => toggleSubFilter(subFilterSheet, sub)}>
                    <View style={isActive ? styles.sheetChipActive : styles.sheetChipInactive}>
                      <Text style={styles.sheetChipText}>{sub}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <LiquidButton
              label="Done"
              onPress={() => setSubFilterSheet(null)}
              size="md"
              style={styles.sheetApplyButton}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  // ============================================
  // PERMISSION MODAL
  // ============================================

  const renderPermissionModal = () => (
    <Modal visible={showPermissionModal} transparent animationType="fade">
      <View style={styles.permissionOverlay}>
        <View style={styles.permissionModal}>
          <LinearGradient colors={['#E7FCF6', '#E0F7FA']} style={styles.permissionIcon}>
            <Ionicons name="location" size={normalize(40)} color={colors.primary} />
          </LinearGradient>
          <Text style={styles.permissionTitle}>Enable your location</Text>
          <Text style={styles.permissionText}>Discover what your friends nearby are up to</Text>
          <LiquidButton
            label="Activate"
            onPress={async () => {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status === 'granted') {
                setShowPermissionModal(false);
                requestLocation();
              }
            }}
            size="md"
            style={styles.permissionButton}
          />
        </View>
      </View>
    </Modal>
  );

  // ============================================
  // EVENT/GROUP DETAIL POPUP
  // ============================================

  const handleJoinEvent = useCallback(async () => {
    if (!selectedMarker || joiningEvent) return;
    setJoiningEvent(true);
    try {
      const id = selectedMarker.id.replace(/^(event_|group_)/, '');
      if (selectedMarker.category === 'event') {
        await awsAPI.joinEvent(id);
      } else {
        await awsAPI.joinGroup(id);
      }
      // Refresh detail
      if (selectedMarker.category === 'event') {
        const res = await awsAPI.getEventDetail(id);
        if (res.success && res.event) setSelectedEventData(res.event);
      } else {
        const res = await awsAPI.getGroup(id);
        if (res.success && res.group) setSelectedEventData(res.group);
      }
    } catch (error) {
      if (__DEV__) console.warn('Join error:', error);
    } finally {
      setJoiningEvent(false);
    }
  }, [selectedMarker, joiningEvent]);

  const handleLeaveEvent = useCallback(async () => {
    if (!selectedMarker || joiningEvent) return;
    setJoiningEvent(true);
    try {
      const id = selectedMarker.id.replace(/^(event_|group_)/, '');
      if (selectedMarker.category === 'event') {
        await awsAPI.leaveEvent(id);
      } else {
        await awsAPI.leaveGroup(id);
      }
      if (selectedMarker.category === 'event') {
        const res = await awsAPI.getEventDetail(id);
        if (res.success && res.event) setSelectedEventData(res.event);
      } else {
        const res = await awsAPI.getGroup(id);
        if (res.success && res.group) setSelectedEventData(res.group);
      }
    } catch (error) {
      if (__DEV__) console.warn('Leave error:', error);
    } finally {
      setJoiningEvent(false);
    }
  }, [selectedMarker, joiningEvent]);

  const renderEventDetailPopup = () => {
    if (!selectedMarker || (selectedMarker.category !== 'event' && selectedMarker.category !== 'group')) return null;
    const data = selectedEventData;
    const isJoined = data?.is_joined || data?.isJoined || false;
    const coverUrl = data?.cover_image_url || data?.coverImageUrl || selectedMarker.coverImage;
    const eventTitle = sanitizeText(data?.title || data?.name || selectedMarker.name);
    const location = sanitizeText(data?.location_name || data?.locationName || data?.address || selectedMarker.address || '');
    const startsAt = data?.starts_at || data?.startsAt;
    const isPublic = data?.is_public !== false;
    const category = sanitizeText(data?.category_slug || data?.categorySlug || data?.sport_type || data?.category || '');
    const maxPart = data?.max_participants || data?.maxParticipants;
    const currentPart = data?.current_participants || data?.currentParticipants || 0;
    const desc = sanitizeText(data?.description || selectedMarker.bio || '');

    return (
      <View style={[styles.eventDetailContainer, { bottom: insets.bottom + hp(2) }]}>
        <TouchableOpacity style={styles.eventDetailClose} onPress={closePopup}>
          <Ionicons name="close" size={normalize(22)} color={colors.white} />
        </TouchableOpacity>

        {/* Cover image */}
        {coverUrl ? (
          <OptimizedImage source={coverUrl} style={styles.eventDetailCover} />
        ) : (
          <View style={[styles.eventDetailCover, { backgroundColor: colors.backgroundSecondary, justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name={selectedMarker.category === 'event' ? 'calendar' : 'people'} size={normalize(40)} color={colors.gray} />
          </View>
        )}

        <View style={styles.eventDetailContent}>
          {/* Title + Join */}
          <View style={styles.eventDetailTitleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eventDetailTitle} numberOfLines={2}>{eventTitle}</Text>
              {location ? (
                <View style={styles.eventDetailLocationRow}>
                  <Ionicons name="location-outline" size={normalize(14)} color={colors.gray} />
                  <Text style={styles.eventDetailLocationText} numberOfLines={1}>{location}</Text>
                </View>
              ) : null}
            </View>
            {isJoined ? (
              <TouchableOpacity
                style={styles.eventLeaveBtn}
                onPress={handleLeaveEvent}
                disabled={joiningEvent}
              >
                <Text style={styles.eventLeaveBtnText}>Leave</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleJoinEvent} disabled={joiningEvent} activeOpacity={0.85}>
                <LinearGradient
                  colors={GRADIENTS.primary}
                  style={styles.eventJoinBtn}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.eventJoinBtnText}>Join</Text>
                  <Ionicons name="arrow-forward" size={normalize(14)} color={colors.white} />
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          {/* Badges */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.eventBadgesScroll}>
            {startsAt && (
              <View style={styles.eventBadge}>
                <Ionicons name="calendar-outline" size={normalize(12)} color={colors.dark} />
                <Text style={styles.eventBadgeText}>
                  {new Date(startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
            )}
            {startsAt && (
              <View style={styles.eventBadge}>
                <Ionicons name="time-outline" size={normalize(12)} color={colors.dark} />
                <Text style={styles.eventBadgeText}>
                  {new Date(startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
            <View style={styles.eventBadge}>
              <Ionicons name={isPublic ? 'globe-outline' : 'lock-closed-outline'} size={normalize(12)} color={colors.dark} />
              <Text style={styles.eventBadgeText}>{isPublic ? 'Public' : 'Private'}</Text>
            </View>
            {category ? (
              <View style={styles.eventBadge}>
                <Text style={styles.eventBadgeText}>{category}</Text>
              </View>
            ) : null}
            <View style={styles.eventBadge}>
              <Ionicons name="people-outline" size={normalize(12)} color={colors.dark} />
              <Text style={styles.eventBadgeText}>{currentPart}{maxPart ? `/${maxPart}` : ''}</Text>
            </View>
          </ScrollView>

          {/* Description */}
          {desc ? (
            <Text style={styles.eventDetailDesc} numberOfLines={3}>{desc}</Text>
          ) : null}
        </View>
      </View>
    );
  };

  // ============================================
  // GRADIENT MAP BUTTON
  // ============================================

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* MAP */}
      {mapError ? (
        <View style={[styles.map, { backgroundColor: isDark ? '#1a1a2e' : '#e8f4f8', justifyContent: 'center', alignItems: 'center' }]}>
          <Ionicons name="map-outline" size={normalize(48)} color={colors.gray} />
          <Text style={{ color: colors.gray, fontSize: normalize(14), marginTop: 12, textAlign: 'center' }}>
            Map unavailable{'\n'}Please rebuild the app with native modules
          </Text>
        </View>
      ) : null}
      <MapView
        style={[styles.map, mapError && { display: 'none' }]}
        styleURL={isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'}
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
        onDidFailLoadingMap={() => setMapError(true)}
        onPress={() => {
          Keyboard.dismiss();
          setShowAddressSuggestions(false);
        }}
      >
        <Camera
          ref={cameraRef}
          zoomLevel={12}
          centerCoordinate={userCoords}
          animationMode="flyTo"
          animationDuration={500}
        />
        <LocationPuck
          puckBearing="heading"
          puckBearingEnabled
          pulsing={{ isEnabled: true, color: colors.primary }}
        />
        {filteredMarkers.map((marker) => (
          <PointAnnotation
            key={marker.id}
            id={marker.id}
            coordinate={[marker.coordinate.longitude, marker.coordinate.latitude]}
            onSelected={() => handleMarkerPress(marker)}
          >
            {renderCustomMarker(marker)}
          </PointAnnotation>
        ))}
        {businessMarker && (
          <PointAnnotation
            key={businessMarker.id}
            id={businessMarker.id}
            coordinate={[businessMarker.coordinate.longitude, businessMarker.coordinate.latitude]}
            onSelected={() => handleMarkerPress(businessMarker)}
          >
            <View style={[styles.markerPin, { backgroundColor: colors.primary }]}>
              <Ionicons name="business" size={normalize(20)} color={colors.white} />
            </View>
          </PointAnnotation>
        )}
      </MapView>

      {/* SEARCH BAR */}
      <View style={[
        styles.searchContainer,
        { top: xplorerFullscreen ? insets.top + 8 : insets.top + 44 + 38 + 8 }
      ]}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={normalize(18)} color={colors.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search places or type an address..."
            placeholderTextColor={colors.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={() => addressSuggestions.length > 0 && setShowAddressSuggestions(true)}
          />
          {isSearchingAddress && (
            <View style={styles.searchLoading}>
              <Ionicons name="ellipsis-horizontal" size={normalize(18)} color={colors.grayMuted} />
            </View>
          )}
          {searchQuery.length > 0 && !isSearchingAddress && (
            <TouchableOpacity onPress={() => {
              setSearchQuery('');
              setAddressSuggestions([]);
              setShowAddressSuggestions(false);
            }}>
              <Ionicons name="close-circle" size={normalize(18)} color={colors.grayMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Address Suggestions Dropdown */}
        {showAddressSuggestions && addressSuggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {addressSuggestions.map((result, index) => (
              <TouchableOpacity
                key={result.place_id}
                style={[
                  styles.suggestionRow,
                  index < addressSuggestions.length - 1 && styles.suggestionRowBorder
                ]}
                onPress={() => handleAddressSelect(result)}
              >
                <Ionicons name="location-outline" size={normalize(18)} color={colors.primary} />
                <View style={styles.suggestionTextContainer}>
                  <Text style={styles.suggestionText} numberOfLines={2}>
                    {result.display_name}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* HORIZONTAL FILTER CHIPS - Below search bar */}
      <View style={[
        styles.chipsContainer,
        { top: xplorerFullscreen ? insets.top + 8 + normalize(44) + 8 : insets.top + 44 + 38 + 8 + normalize(44) + 8 }
      ]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {FILTERS.map(filter => {
            const isActive = activeFilters.includes(filter.key);
            const subCount = (activeSubFilters[filter.key] || []).length;
            return (
              <Pressable
                key={filter.key}
                onPress={() => toggleFilter(filter.key)}
                onLongPress={() => handleLongPress(filter.key)}
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              >
                {isActive ? (
                  <View style={styles.chipActive}>
                    <Ionicons name={filter.icon} size={normalize(16)} color={filter.color} />
                    <Text style={styles.chipText}>{filter.label}</Text>
                    {subCount > 0 && (
                      <View style={styles.chipSubBadge}>
                        <Text style={styles.chipSubBadgeText}>{subCount}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.chipInactive}>
                    <Ionicons name={filter.icon} size={normalize(16)} color={filter.color} />
                    <Text style={styles.chipText}>{filter.label}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* MAP BUTTONS - Bottom right */}
      <View style={[styles.mapButtonsRight, { bottom: insets.bottom + hp(2) }]}>
        <LiquidButton
          label=""
          onPress={toggleXplorerFullscreen}
          size="md"
          iconOnly
          icon={<Ionicons name={xplorerFullscreen ? 'contract-outline' : 'expand-outline'} size={normalize(20)} color={colors.white} />}
        />
        <LiquidButton
          label=""
          onPress={centerOnUser}
          size="md"
          iconOnly
          icon={<Ionicons name="navigate" size={normalize(20)} color={colors.white} />}
        />
      </View>

      {/* FAB overlay to close */}
      {fabOpen && (
        <TouchableOpacity
          style={[StyleSheet.absoluteFill, { zIndex: 15 }]}
          activeOpacity={1}
          onPress={() => setFabOpen(false)}
        />
      )}

      {/* FAB - Bottom left */}
      {fabActions.length > 0 && (
        <View style={[styles.fabContainer, { bottom: insets.bottom + hp(2) }]}>
          {fabOpen ? (
            <View style={styles.fabPanel}>
              <BlurView intensity={60} tint="light" style={styles.fabPanelBlur}>
                {fabActions.map((item, index) => (
                  <TouchableOpacity
                    key={item.action}
                    style={[
                      styles.fabPanelRow,
                      index < fabActions.length - 1 && styles.fabPanelRowBorder,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => handleFabAction(item.action)}
                  >
                    <View style={styles.fabPanelIcon}>
                      <Ionicons name={item.icon} size={normalize(20)} color={colors.primary} />
                    </View>
                    <Text style={styles.fabPanelLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={normalize(16)} color={colors.grayMuted} />
                  </TouchableOpacity>
                ))}
              </BlurView>
            </View>
          ) : null}

          {/* Main FAB — LiquidButton */}
          <LiquidButton
            label={fabOpen ? '' : 'Create'}
            onPress={() => {
              if (fabActions.length === 1) {
                handleFabAction(fabActions[0].action);
              } else {
                setFabOpen(prev => !prev);
              }
            }}
            size="md"
            colorScheme="green"
            icon={<Ionicons name={fabOpen ? 'close' : 'add'} size={normalize(20)} color={colors.white} />}
            iconPosition="left"
            style={styles.fab}
          />
        </View>
      )}

      {/* POPUP */}
      {selectedMarker && (selectedMarker.category === 'event' || selectedMarker.category === 'group') && (
        renderEventDetailPopup()
      )}
      {selectedMarker && selectedMarker.category !== 'event' && selectedMarker.category !== 'group' && (
        selectedMarker.category === 'business' || selectedMarker.category === 'spot'
          ? renderBusinessPopup()
          : renderUserPopup()
      )}

      {/* MODALS */}
      {renderSubFilterSheet()}
      {renderPermissionModal()}
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const createStyles = (colors: typeof import('../../config/theme').COLORS, isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  // Search Bar
  searchContainer: {
    position: 'absolute',
    left: wp(4),
    right: wp(4),
    zIndex: 20,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: normalize(14),
    paddingHorizontal: wp(3.5),
    height: normalize(44),
    shadowColor: isDark ? '#fff' : '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)',
  },
  searchInput: {
    flex: 1,
    marginLeft: wp(2.5),
    fontSize: normalize(15),
    color: colors.dark,
    paddingVertical: 0,
  },
  searchLoading: {
    marginLeft: wp(2),
  },

  // Address Suggestions
  suggestionsContainer: {
    marginTop: normalize(4),
    backgroundColor: colors.background,
    borderRadius: normalize(14),
    shadowColor: isDark ? '#fff' : '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(3.5),
    paddingVertical: hp(1.5),
    gap: wp(2.5),
  },
  suggestionRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  },
  suggestionTextContainer: {
    flex: 1,
  },
  suggestionText: {
    fontSize: normalize(13),
    color: colors.dark,
    lineHeight: normalize(18),
  },

  // Horizontal filter chips
  chipsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  chipsScroll: {
    paddingHorizontal: wp(4),
    gap: wp(2),
  },
  chipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(3.5),
    paddingVertical: hp(1),
    borderRadius: normalize(20),
    gap: wp(1.5),
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.10)',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  chipInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(3.5),
    paddingVertical: hp(1),
    borderRadius: normalize(20),
    gap: wp(1.5),
    backgroundColor: colors.background,
    shadowColor: isDark ? '#fff' : '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  chipText: {
    fontSize: normalize(13),
    fontWeight: '600',
    color: colors.dark,
  },
  chipSubBadge: {
    backgroundColor: colors.primary,
    borderRadius: normalize(8),
    width: normalize(16),
    height: normalize(16),
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSubBadgeText: {
    fontSize: normalize(10),
    fontWeight: '700',
    color: colors.white,
  },

  // Map Buttons
  mapButtonsRight: {
    position: 'absolute',
    right: wp(4),
    gap: normalize(10),
    zIndex: 20,
  },

  // FAB
  fabContainer: {
    position: 'absolute',
    left: wp(4),
    alignItems: 'flex-start',
    zIndex: 20,
  },
  fab: {
    // LiquidButton handles internal styling; only position/shadow overrides here
  },
  fabLabel: {
    fontSize: normalize(15),
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.3,
  },
  fabPanel: {
    marginBottom: normalize(12),
    borderRadius: normalize(20),
    overflow: 'hidden',
    shadowColor: isDark ? '#fff' : '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)',
  },
  fabPanelBlur: {
    paddingVertical: hp(0.5),
    paddingHorizontal: wp(1),
    overflow: 'hidden',
    borderRadius: normalize(20),
  },
  fabPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: hp(1.6),
    paddingHorizontal: wp(3.5),
    gap: wp(3),
  },
  fabPanelRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
  },
  fabPanelIcon: {
    width: normalize(36),
    height: normalize(36),
    borderRadius: normalize(12),
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabPanelLabel: {
    flex: 1,
    fontSize: normalize(15),
    fontWeight: '600',
    color: colors.dark,
  },

  // Marker
  markerContainer: { alignItems: 'center' },
  markerShadow: { position: 'absolute', bottom: -2, width: wp(4), height: hp(0.5), backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)', borderRadius: wp(2) },
  markerPin: {
    width: wp(11), height: wp(11), borderRadius: wp(5.5),
    borderWidth: 3, borderColor: colors.background,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: isDark ? '#fff' : '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  markerAvatar: { width: wp(9), height: wp(9), borderRadius: wp(4.5) },
  markerPointer: {
    width: 0, height: 0,
    borderLeftWidth: wp(2), borderRightWidth: wp(2), borderTopWidth: hp(1.2),
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -2,
  },

  // User Popup
  popupContainer: {
    position: 'absolute', left: wp(4), right: wp(4),
    backgroundColor: colors.background, borderRadius: normalize(20),
    padding: wp(4),
    shadowColor: isDark ? '#fff' : '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 10,
    zIndex: 30,
  },
  popupClose: { position: 'absolute', top: hp(1.5), right: wp(3), zIndex: 10 },
  popupContent: { flexDirection: 'row' },
  popupAvatar: { width: wp(15), height: wp(15), borderRadius: wp(7.5), marginRight: wp(3) },
  popupInfo: { flex: 1 },
  popupName: { fontSize: normalize(17), fontWeight: '600', color: colors.dark, marginBottom: hp(0.5) },
  popupStats: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(0.8) },
  popupStatText: { fontSize: normalize(13), color: colors.gray },
  popupStatNumber: { fontWeight: '600', color: colors.dark },
  popupStatDot: { marginHorizontal: wp(1.5), color: colors.grayMuted },
  popupBio: { fontSize: normalize(13), color: colors.gray, lineHeight: normalize(18) },
  popupButton: {
    marginTop: hp(1.8),
    alignSelf: 'stretch',
  },
  popupButtonText: { fontSize: normalize(15), fontWeight: '600', color: colors.white, marginRight: wp(1.5) },

  // Business Popup
  businessPopupContainer: {
    position: 'absolute', left: wp(4), right: wp(4),
    backgroundColor: colors.background, borderRadius: normalize(20), overflow: 'hidden',
    shadowColor: isDark ? '#fff' : '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 10,
    zIndex: 30,
  },
  businessPopupClose: {
    position: 'absolute', top: hp(1.5), right: wp(3), zIndex: 10,
    backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)', borderRadius: wp(4), padding: wp(1),
  },
  businessCover: { width: '100%', height: hp(15) },
  businessContent: { padding: wp(4) },
  businessName: { fontSize: normalize(18), fontWeight: '700', color: colors.dark, marginBottom: hp(1.2) },
  businessRow: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(0.8) },
  businessText: { fontSize: normalize(14), color: colors.gray, marginLeft: wp(2), flex: 1 },
  expertiseTags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: hp(1.2), marginBottom: hp(0.8) },
  expertiseTag: { backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : '#E7FCF6', paddingHorizontal: wp(3), paddingVertical: hp(0.8), borderRadius: normalize(16), marginRight: wp(2), marginBottom: hp(1) },
  expertiseTagText: { fontSize: normalize(12), color: colors.primary, fontWeight: '500' },

  // Sub-filter bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: normalize(28), borderTopRightRadius: normalize(28),
    padding: wp(5),
  },
  sheetHandle: {
    width: wp(10), height: 4,
    backgroundColor: colors.grayBorder, borderRadius: 2,
    alignSelf: 'center', marginBottom: hp(2),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(0.5),
  },
  sheetIconCircle: {
    width: normalize(36),
    height: normalize(36),
    borderRadius: normalize(18),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: wp(2.5),
  },
  sheetTitle: { fontSize: normalize(22), fontWeight: '700', color: colors.dark },
  sheetSubtitle: { fontSize: normalize(14), color: colors.gray, marginBottom: hp(2) },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(2.5) },
  sheetChipActive: {
    paddingHorizontal: wp(4), paddingVertical: hp(1.2),
    borderRadius: normalize(14),
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.10)',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  sheetChipInactive: {
    paddingHorizontal: wp(4), paddingVertical: hp(1.2),
    borderRadius: normalize(14),
    backgroundColor: colors.backgroundSecondary,
  },
  sheetChipText: { fontSize: normalize(14), fontWeight: '500', color: colors.dark },
  sheetApplyButton: {
    marginTop: hp(3),
    alignSelf: 'stretch',
  },
  sheetApplyText: { fontSize: normalize(16), fontWeight: '600', color: colors.white },

  // Teardrop marker (events/groups)
  teardropContainer: { alignItems: 'center' },
  teardropPin: {
    width: normalize(36),
    height: normalize(36),
    borderRadius: normalize(18),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2.5,
    borderColor: colors.background,
    shadowColor: isDark ? '#fff' : '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  teardropPointer: {
    width: 0,
    height: 0,
    borderLeftWidth: wp(2),
    borderRightWidth: wp(2),
    borderTopWidth: hp(1),
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
  liveMarkerContainer: {
    alignItems: 'center',
  },
  liveMarkerPulse: {
    position: 'absolute',
    width: normalize(48),
    height: normalize(48),
    borderRadius: normalize(24),
    backgroundColor: 'rgba(255, 0, 0, 0.25)',
  },
  liveMarkerInner: {
    width: normalize(40),
    height: normalize(40),
    borderRadius: normalize(20),
    borderWidth: 3,
    borderColor: '#FF0000',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  liveBadge: {
    backgroundColor: '#FF0000',
    borderRadius: normalize(6),
    paddingHorizontal: normalize(4),
    paddingVertical: normalize(1),
    marginTop: normalize(2),
  },
  liveBadgeText: {
    color: '#FFFFFF',
    fontSize: normalize(8),
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Event/Group detail popup
  eventDetailContainer: {
    position: 'absolute',
    left: wp(4),
    right: wp(4),
    backgroundColor: colors.background,
    borderRadius: normalize(20),
    overflow: 'hidden',
    shadowColor: isDark ? '#fff' : '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 30,
    maxHeight: hp(55),
  },
  eventDetailClose: {
    position: 'absolute',
    top: hp(1.5),
    right: wp(3),
    zIndex: 10,
    backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)',
    borderRadius: wp(4),
    padding: wp(1),
  },
  eventDetailCover: {
    width: '100%',
    height: hp(15),
  },
  eventDetailContent: {
    padding: wp(4),
  },
  eventDetailTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: wp(3),
    marginBottom: hp(1.2),
  },
  eventDetailTitle: {
    fontSize: normalize(18),
    fontWeight: '700',
    color: colors.dark,
  },
  eventDetailLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1),
    marginTop: hp(0.4),
  },
  eventDetailLocationText: {
    fontSize: normalize(13),
    color: colors.gray,
    flex: 1,
  },
  eventJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(4),
    paddingVertical: hp(1),
    borderRadius: normalize(20),
    gap: wp(1.5),
  },
  eventJoinBtnText: {
    fontSize: normalize(14),
    fontWeight: '600',
    color: colors.white,
  },
  eventLeaveBtn: {
    paddingHorizontal: wp(4),
    paddingVertical: hp(1),
    borderRadius: normalize(20),
    backgroundColor: isDark ? 'rgba(255, 68, 68, 0.2)' : '#FFE5E5',
    borderWidth: 1,
    borderColor: '#FF4444',
  },
  eventLeaveBtnText: {
    fontSize: normalize(14),
    fontWeight: '600',
    color: '#FF4444',
  },
  eventBadgesScroll: {
    marginBottom: hp(1),
  },
  eventBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(1),
    paddingHorizontal: wp(2.5),
    paddingVertical: hp(0.6),
    borderRadius: normalize(14),
    borderWidth: 1,
    borderColor: colors.grayBorder,
    backgroundColor: colors.background,
    marginRight: wp(2),
  },
  eventBadgeText: {
    fontSize: normalize(12),
    fontWeight: '500',
    color: colors.dark,
  },
  eventDetailDesc: {
    fontSize: normalize(13),
    color: colors.gray,
    lineHeight: normalize(19),
  },

  // Permission Modal
  permissionOverlay: { flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: wp(5) },
  permissionModal: {
    backgroundColor: colors.background, borderRadius: normalize(24), padding: wp(6),
    width: '85%', alignItems: 'center',
    shadowColor: isDark ? '#fff' : '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  permissionIcon: {
    width: wp(18), height: wp(18), borderRadius: wp(9),
    justifyContent: 'center', alignItems: 'center', marginBottom: hp(2),
  },
  permissionTitle: { fontSize: normalize(20), fontWeight: '700', color: colors.dark, marginBottom: hp(1), textAlign: 'center' },
  permissionText: { fontSize: normalize(14), color: colors.gray, textAlign: 'center', marginBottom: hp(2.5), lineHeight: normalize(20) },
  permissionButton: { alignSelf: 'center' },
  permissionButtonText: { fontSize: normalize(15), fontWeight: '600', color: colors.white },
});
