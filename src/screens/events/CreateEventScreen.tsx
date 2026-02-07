/**
 * CreateEventScreen
 * Create sports/fitness events with route planning
 * 4-step wizard matching mockup design:
 *   Step 1: Name, Description, Category dropdown, Date, Time
 *   Step 2: Public/Private, Max capacity, Cover image
 *   Step 3: Location / Route
 *   Step 4: Review with cover hero
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  ActivityIndicator,
  Share,
  Modal,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Mapbox, { MapView, Camera, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { searchNominatim, NominatimSearchResult, formatNominatimResult } from '../../config/api';
import { LiquidTabs } from '../../components/LiquidTabs';
import RouteMapPicker from '../../components/RouteMapPicker';
import type { RouteResult } from '../../services/mapbox-directions';
import type { RouteProfile } from '../../types';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
if (mapboxToken) Mapbox.setAccessToken(mapboxToken);

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SEGMENT_GAP = 6;

type CreateMode = 'event' | 'group';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  isRouteActivity?: boolean;
}

const EVENT_CATEGORIES: CategoryItem[] = [
  { id: '1', name: 'Running', slug: 'running', icon: 'walk', color: '#FF6B6B' },
  { id: '2', name: 'Hiking', slug: 'hiking', icon: 'trail-sign', color: '#4ECDC4' },
  { id: '3', name: 'Cycling', slug: 'cycling', icon: 'bicycle', color: '#45B7D1' },
  { id: '4', name: 'Soccer', slug: 'soccer', icon: 'football', color: '#96CEB4' },
  { id: '5', name: 'Basketball', slug: 'basketball', icon: 'basketball', color: '#FFEAA7' },
  { id: '6', name: 'Tennis', slug: 'tennis', icon: 'tennisball', color: '#DDA0DD' },
  { id: '7', name: 'Padel', slug: 'padel', icon: 'tennisball', color: '#98D8C8' },
  { id: '8', name: 'Yoga', slug: 'yoga', icon: 'body', color: '#F7DC6F' },
  { id: '9', name: 'CrossFit', slug: 'crossfit', icon: 'barbell', color: '#E74C3C' },
  { id: '10', name: 'Swimming', slug: 'swimming', icon: 'water', color: '#3498DB' },
  { id: '11', name: 'Martial Arts', slug: 'martial-arts', icon: 'hand-left', color: '#9B59B6' },
  { id: '12', name: 'Other', slug: 'other', icon: 'ellipsis-horizontal', color: '#95A5A6' },
];

const GROUP_CATEGORIES: CategoryItem[] = [
  { id: 'g1', name: 'Running', slug: 'running', icon: 'walk', color: '#FF6B6B', isRouteActivity: true },
  { id: 'g2', name: 'Hiking', slug: 'hiking', icon: 'trail-sign', color: '#4ECDC4', isRouteActivity: true },
  { id: 'g3', name: 'Cycling', slug: 'cycling', icon: 'bicycle', color: '#45B7D1', isRouteActivity: true },
  { id: 'g4', name: 'Gym', slug: 'gym', icon: 'barbell', color: '#1E90FF', isRouteActivity: false },
  { id: 'g5', name: 'Yoga', slug: 'yoga', icon: 'body', color: '#9B59B6', isRouteActivity: false },
  { id: 'g6', name: 'Sports', slug: 'sports', icon: 'trophy', color: '#FFD700', isRouteActivity: false },
  { id: 'g7', name: 'Swimming', slug: 'swimming', icon: 'water', color: '#3498DB', isRouteActivity: false },
  { id: 'g8', name: 'Other', slug: 'other', icon: 'ellipsis-horizontal', color: '#95A5A6', isRouteActivity: false },
];

const ROUTE_CATEGORIES = ['running', 'hiking', 'cycling'];

const TOTAL_STEPS = 4;

// ─── Segmented progress bar (4 discrete segments with gaps) ──────
const ProgressSegments: React.FC<{ current: number; total: number; colors: ThemeColors }> = ({ current, total, colors }) => {
  const segmentWidth = (SCREEN_WIDTH - 32 - SEGMENT_GAP * (total - 1)) / total;
  return (
    <View style={{ flexDirection: 'row', gap: SEGMENT_GAP, paddingHorizontal: 16, marginBottom: 8 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            { height: 4, borderRadius: 2, width: segmentWidth },
            { backgroundColor: i < current ? colors.primary : colors.gray200 },
          ]}
        />
      ))}
    </View>
  );
};

// ─── Component ───────────────────────────────────────────────────
const CreateEventScreen: React.FC<{ navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void }; route?: { params?: { initialMode?: CreateMode; lockedLocation?: { lat: number; lng: number } | null } } }> = ({ navigation, route }) => {
  const { colors, isDark } = useTheme();
  const { currency } = useCurrency();
  const { showError, showAlert } = useSmuppyAlert();
  const user = useUserStore((state) => state.user);
  const isProCreator = user?.accountType === 'pro_creator' || user?.accountType === 'pro_business';
  const isVerified = user?.isVerified === true;
  const isBusinessNonPremium = user?.accountType === 'pro_business' && !user?.isPremium;
  // Paid access: verified + not business non-premium
  const canUsePaid = isVerified && !isBusinessNonPremium;

  // Mode toggle — 'event' or 'group', no navigation needed
  const [mode, setMode] = useState<CreateMode>(route?.params?.initialMode || 'event');

  const rawLockedLocation = route?.params?.lockedLocation;
  const lockedLocation = rawLockedLocation ? { latitude: rawLockedLocation.lat, longitude: rawLockedLocation.lng } : undefined;

  // Account limits
  const [canCreate, setCanCreate] = useState(true);
  const [eventsThisMonth, setEventsThisMonth] = useState(0);
  const [checkingLimits, setCheckingLimits] = useState(true);

  // Step 1 — form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryItem | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [startDate, setStartDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Step 2 — visibility & settings
  const [isPublic, setIsPublic] = useState(true);
  const [maxParticipants, setMaxParticipants] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('');
  const [isFansOnly] = useState(false);

  // Step 3 — location / route
  const [locationName, setLocationName] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [hasRoute, setHasRoute] = useState(false);
  const [routePoints, setRoutePoints] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeDistance, setRouteDistance] = useState(0);
  const [routeDifficulty, setRouteDifficulty] = useState<'easy' | 'moderate' | 'hard' | 'expert'>('moderate');
  const [locationSuggestions, setLocationSuggestions] = useState<NominatimSearchResult[]>([]);
  const [isLoadingLocationSearch, setIsLoadingLocationSearch] = useState(false);
  const locationSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Group route data (used when mode === 'group' and category is route activity)
  const [groupRouteData, setGroupRouteData] = useState<(RouteResult & { start: { lat: number; lng: number }; end: { lat: number; lng: number }; waypoints: { lat: number; lng: number }[]; profile: RouteProfile }) | null>(null);

  // Derived: is this a route-type group activity?
  const isGroupRouteActivity = mode === 'group' && (selectedCategory?.isRouteActivity || false);

  // Active categories list based on mode
  const activeCategories = mode === 'event' ? EVENT_CATEGORIES : GROUP_CATEGORIES;

  // UI
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [endDate, _setEndDate] = useState<Date | null>(null);

  const mapRef = useRef<MapView>(null);
  const scrollRef = useRef<ScrollView>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // ─── Effects ─────────────────────────────────────────────────
  useEffect(() => {
    const checkLimits = async () => {
      if (isProCreator) { setCheckingLimits(false); setCanCreate(true); return; }
      try {
        const response = await awsAPI.checkCreationLimits();
        const allowed = mode === 'group'
          ? response.canCreateGroup !== false
          : response.canCreateEvent;
        setCanCreate(allowed);
        setEventsThisMonth(response.eventsThisMonth || 0);
      } catch (error) {
        if (__DEV__) console.warn('Error checking limits:', error);
        setCanCreate(true);
      } finally {
        setCheckingLimits(false);
      }
    };
    checkLimits();
  }, [isProCreator, mode]);

  // Reset category when mode changes since category lists differ
  useEffect(() => {
    setSelectedCategory(null);
    setHasRoute(false);
    setRoutePoints([]);
    setRouteDistance(0);
    setGroupRouteData(null);
  }, [mode]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { getUserLocation(); }, []);

  useEffect(() => {
    return () => { if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current); };
  }, []);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showError('Permission needed', 'Please allow location access to set event location.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({ lat: location.coords.latitude, lng: location.coords.longitude });
      if (!coordinates) {
        setCoordinates({ lat: location.coords.latitude, lng: location.coords.longitude });
      }
    } catch (error) {
      if (__DEV__) console.log('Location error:', error);
    }
  };

  // ─── Location autocomplete ──────────────────────────────────
  const searchLocationName = useCallback(async (query: string) => {
    if (query.length < 3) { setLocationSuggestions([]); return; }
    setIsLoadingLocationSearch(true);
    try {
      const results = await searchNominatim(query, { limit: 5 });
      setLocationSuggestions(results);
    } catch { setLocationSuggestions([]); }
    finally { setIsLoadingLocationSearch(false); }
  }, []);

  const handleLocationNameChange = useCallback((text: string) => {
    setLocationName(text);
    if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current);
    locationSearchTimeout.current = setTimeout(() => searchLocationName(text), 300);
  }, [searchLocationName]);

  const selectLocationSuggestion = useCallback((result: NominatimSearchResult) => {
    const formatted = formatNominatimResult(result);
    setLocationName(formatted.fullAddress);
    setLocationSuggestions([]);
    if (result.lat && result.lon) {
      setCoordinates({ lat: parseFloat(result.lat), lng: parseFloat(result.lon) });
    }
    Keyboard.dismiss();
  }, []);

  // ─── Map / route ────────────────────────────────────────────
  const handleMapPress = (e: GeoJSON.Feature<GeoJSON.Geometry>) => {
    const coords = (e.geometry as GeoJSON.Point).coordinates;
    const [longitude, latitude] = coords;
    if (hasRoute && selectedCategory && ROUTE_CATEGORIES.includes(selectedCategory.slug)) {
      const newPoints = [...routePoints, { latitude, longitude }];
      setRoutePoints(newPoints);
      calculateRouteDistance(newPoints);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      setCoordinates({ lat: latitude, lng: longitude });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Location.reverseGeocodeAsync({ latitude, longitude }).then(([reverseResult]) => {
        if (reverseResult) {
          const parts = [reverseResult.street, reverseResult.city, reverseResult.country].filter(Boolean);
          if (parts.length > 0) { setLocationName(parts.join(', ')); setLocationSuggestions([]); }
        }
      }).catch(() => { /* silent */ });
    }
  };

  const calculateRouteDistance = (points: { latitude: number; longitude: number }[]) => {
    if (points.length < 2) { setRouteDistance(0); return; }
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += getDistanceKm(points[i - 1].latitude, points[i - 1].longitude, points[i].latitude, points[i].longitude);
    }
    setRouteDistance(distance);
  };

  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const handleUndoRoutePoint = () => {
    if (routePoints.length > 0) {
      const newPoints = routePoints.slice(0, -1);
      setRoutePoints(newPoints);
      calculateRouteDistance(newPoints);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleClearRoute = () => {
    setRoutePoints([]);
    setRouteDistance(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  // ─── Cover image picker ─────────────────────────────────────
  const pickCoverImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCoverImage(result.assets[0].uri);
    }
  };

  // ─── Navigation ─────────────────────────────────────────────
  const handleNextStep = () => {
    if (step === 1 && !title.trim()) { showError('Error', 'Please enter a name'); return; }
    if (step === 1 && !selectedCategory) { showError('Error', 'Please select a category'); return; }
    if (step === 3 && !coordinates && !groupRouteData) { showError('Error', 'Please select a location on the map'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(step + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handlePrevStep = () => {
    if (step > 1) { setStep(step - 1); scrollRef.current?.scrollTo({ y: 0, animated: true }); }
    else { navigation.goBack(); }
  };

  // ─── Submit ─────────────────────────────────────────────────
  // Sanitize inputs: strip HTML tags and control characters (CLAUDE.md compliance)
  const sanitize = useCallback((str: string) => str.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim(), []);

  const handleCreate = async () => {
    if (!selectedCategory || !title || (!coordinates && !groupRouteData)) {
      showError('Error', 'Please fill in all required fields');
      return;
    }
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      if (mode === 'group') {
        await handleCreateGroup();
      } else {
        await handleCreateEvent();
      }
    } catch (error: unknown) {
      if (__DEV__) console.warn(`Create ${mode} error:`, error);
      showError('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!selectedCategory || !coordinates) return;
    const eventData = {
      title: sanitize(title),
      description: sanitize(description) || undefined,
      categorySlug: selectedCategory.slug,
      locationName: sanitize(locationName) || 'Event Location',
      latitude: coordinates.lat,
      longitude: coordinates.lng,
      startsAt: startDate.toISOString(),
      endsAt: endDate?.toISOString(),
      maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
      isFree,
      price: !isFree && price ? parseFloat(price) : undefined,
      currency: currency.code,
      isPublic,
      isFansOnly: isPublic ? isFansOnly : false,
      hasRoute: hasRoute && routePoints.length > 1,
      routeDistanceKm: hasRoute ? routeDistance : undefined,
      routeDifficulty: hasRoute ? routeDifficulty : undefined,
      routeWaypoints: hasRoute ? routePoints.map((p) => ({ lat: p.latitude, lng: p.longitude })) : undefined,
      coverImageUri: coverImage || undefined,
    };

    const response = await awsAPI.createEvent(eventData);

    if (response.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const eventId = response.event?.id;
      const shareUrl = `https://smuppy.app/events/${eventId}`;
      const shareEvent = async (audience: 'fans' | 'public') => {
        try {
          const audienceText = audience === 'fans' ? '🔒 Exclusive for my fans!' : '🌍 Open to everyone!';
          const shareMessage = `Join me at "${title}"!\n\n📅 ${startDate.toLocaleDateString()}\n📍 ${locationName || 'Location on map'}\n${isFree ? '🆓 Free event!' : `💰 ${currency.symbol}${price}`}\n\n${audienceText}\n\n${shareUrl}`;
          await Share.share({ message: shareMessage, title: `Join: ${title}`, url: shareUrl });
        } catch { /* cancelled */ }
        navigation.replace('ActivityDetail', { activityId: eventId, activityType: 'event' });
      };
      showAlert({
        title: 'Event Created!',
        message: 'Your event is now live. How would you like to share it?',
        type: 'success',
        buttons: [
          { text: 'View Event', style: 'cancel', onPress: () => navigation.replace('ActivityDetail', { activityId: eventId, activityType: 'event' }) },
          { text: 'Share Publicly', onPress: () => shareEvent('public') },
        ],
      });
    } else {
      throw new Error(response.message || 'Failed to create event');
    }
  };

  const handleCreateGroup = async () => {
    if (!selectedCategory) return;
    const response = await awsAPI.createGroup({
      name: sanitize(title),
      description: sanitize(description),
      category: selectedCategory.slug,
      subcategory: '',
      sport_type: selectedCategory.slug,
      latitude: coordinates?.lat || groupRouteData?.start?.lat || 0,
      longitude: coordinates?.lng || groupRouteData?.start?.lng || 0,
      address: sanitize(locationName) || 'Location',
      starts_at: startDate.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      max_participants: maxParticipants ? parseInt(maxParticipants) : undefined,
      is_free: isFree,
      price: !isFree && price ? parseFloat(price) : undefined,
      currency: currency.code,
      is_public: isPublic,
      is_fans_only: false,
      is_route: !!groupRouteData,
      route_start: groupRouteData?.start,
      route_end: groupRouteData?.end,
      route_waypoints: groupRouteData?.waypoints,
      route_geojson: groupRouteData?.geojson as Record<string, unknown>,
      route_profile: groupRouteData?.profile,
      route_distance_km: groupRouteData?.distanceKm,
      route_duration_min: groupRouteData?.durationMin,
      route_elevation_gain: groupRouteData?.elevationGain,
      difficulty: groupRouteData?.difficulty,
      cover_image_url: coverImage || undefined,
    });

    if (response.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert({
        title: 'Group Created!',
        message: 'Your group activity is now visible on the map.',
        type: 'success',
        buttons: [
          { text: 'View', onPress: () => navigation.replace('ActivityDetail', { activityId: response.group?.id, activityType: 'group' }) },
          { text: 'Done', onPress: () => navigation.goBack() },
        ],
      });
    } else {
      throw new Error(response.message || 'Failed to create group');
    }
  };

  // ─────────────────────────────────────────────────────────────
  // STEP 1 — Name, Description, Category, Date, Time
  // ─────────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      {/* Groups / Events toggle — Liquid tabs */}
      <LiquidTabs
        tabs={[
          { key: 'group', label: 'Groups' },
          { key: 'event', label: 'Events' },
        ]}
        activeTab={mode}
        onTabChange={(key) => setMode(key as CreateMode)}
        size="medium"
        fullWidth={false}
        style={styles.liquidToggle}
      />

      {/* Name */}
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.capsuleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="Type Here ..."
        placeholderTextColor={colors.gray}
        maxLength={100}
      />

      {/* Description */}
      <Text style={styles.label}>Detailed description</Text>
      <TextInput
        style={[styles.capsuleInput, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Type Here ..."
        placeholderTextColor={colors.gray}
        multiline
        maxLength={500}
      />

      {/* Category dropdown */}
      <Text style={styles.label}>Category</Text>
      <TouchableOpacity style={styles.capsuleInput} onPress={() => setShowCategoryModal(true)}>
        <View style={styles.dropdownRow}>
          <Text style={selectedCategory ? styles.dropdownValue : styles.dropdownPlaceholder}>
            {selectedCategory?.name || 'Sport'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={colors.gray} />
        </View>
      </TouchableOpacity>

      {/* Date */}
      <Text style={styles.label}>Date</Text>
      <TouchableOpacity style={styles.capsuleInput} onPress={() => setShowDatePicker(true)}>
        <View style={styles.iconInputRow}>
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={startDate ? styles.dropdownValue : styles.dropdownPlaceholder}>
            {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Time */}
      <Text style={styles.label}>Time</Text>
      <TouchableOpacity style={styles.capsuleInput} onPress={() => setShowTimePicker(true)}>
        <View style={styles.iconInputRow}>
          <Ionicons name="time-outline" size={20} color={colors.primary} />
          <Text style={styles.dropdownValue}>
            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  // ─────────────────────────────────────────────────────────────
  // STEP 2 — Visibility, Capacity, Cover image
  // ─────────────────────────────────────────────────────────────
  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      {/* Public / Private */}
      <View style={styles.visibilityRow}>
        <TouchableOpacity
          style={[styles.radioChip, isPublic && styles.radioChipActive]}
          onPress={() => setIsPublic(true)}
        >
          <Ionicons name="people-outline" size={18} color={isPublic ? colors.primary : colors.gray} />
          <Text style={[styles.radioChipText, isPublic && styles.radioChipTextActive]}>Public</Text>
          <View style={[styles.radioCircle, isPublic && styles.radioCircleFilled]}>
            {isPublic && <View style={styles.radioInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.radioChip, !isPublic && styles.radioChipActive]}
          onPress={() => setIsPublic(false)}
        >
          <Ionicons name="lock-closed-outline" size={18} color={!isPublic ? colors.primary : colors.gray} />
          <Text style={[styles.radioChipText, !isPublic && styles.radioChipTextActive]}>Private</Text>
          <View style={[styles.radioCircle, !isPublic && styles.radioCircleFilled]}>
            {!isPublic && <View style={styles.radioInner} />}
          </View>
        </TouchableOpacity>
      </View>

      {/* Max capacity */}
      <Text style={styles.label}>Maximum capacity</Text>
      <TextInput
        style={styles.capsuleInput}
        value={maxParticipants}
        onChangeText={setMaxParticipants}
        placeholder="Type Here ..."
        placeholderTextColor={colors.gray}
        keyboardType="number-pad"
        maxLength={6}
      />

      {/* Cover image */}
      <Text style={styles.label}>Cover image</Text>
      <TouchableOpacity style={styles.coverUpload} onPress={pickCoverImage}>
        {coverImage ? (
          <Image source={{ uri: coverImage }} style={styles.coverPreview} />
        ) : (
          <View style={styles.coverPlaceholder}>
            <Ionicons name="cloud-upload-outline" size={32} color={colors.primary} />
            <Text style={styles.coverPlaceholderText}>Add File Here ...</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Pricing (keep existing logic) */}
      <Text style={styles.label}>Pricing</Text>
      <View style={styles.visibilityRow}>
        <TouchableOpacity
          style={[styles.radioChip, isFree && styles.radioChipActive]}
          onPress={() => setIsFree(true)}
        >
          <Text style={[styles.radioChipText, isFree && styles.radioChipTextActive]}>Free</Text>
          <View style={[styles.radioCircle, isFree && styles.radioCircleFilled]}>
            {isFree && <View style={styles.radioInner} />}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.radioChip, !isFree && styles.radioChipActive]}
          onPress={() => {
            if (canUsePaid) {
              setIsFree(false);
            } else if (isBusinessNonPremium) {
              showAlert({
                title: 'Business Premium Required',
                message: 'Upgrade to Business Premium to create paid events, receive payments, and access revenue tools.',
                type: 'info',
                buttons: [
                  { text: 'Maybe Later', style: 'cancel' },
                  { text: 'Upgrade', onPress: () => navigation.navigate('UpgradeToPro') },
                ],
              });
            } else {
              showAlert({
                title: 'Verified Account Required',
                message: 'Only verified accounts can create paid events and groups.\n\nGet verified to unlock:\n- Paid events & groups\n- Receive tips from fans\n- 80% revenue share\n- Trust badge on your profile',
                type: 'info',
                buttons: [
                  { text: 'Maybe Later', style: 'cancel' },
                  { text: 'Get Verified', onPress: () => navigation.navigate('IdentityVerification') },
                ],
              });
            }
          }}
        >
          <Text style={[styles.radioChipText, !isFree && styles.radioChipTextActive]}>Paid</Text>
          {!canUsePaid && (
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>{isBusinessNonPremium ? 'PREMIUM' : 'VERIFIED'}</Text>
            </View>
          )}
          <View style={[styles.radioCircle, !isFree && styles.radioCircleFilled]}>
            {!isFree && <View style={styles.radioInner} />}
          </View>
        </TouchableOpacity>
      </View>
      {!isFree && canUsePaid && (
        <TextInput
          style={styles.capsuleInput}
          value={price}
          onChangeText={setPrice}
          placeholder={`Price (${currency.symbol})`}
          placeholderTextColor={colors.gray}
          keyboardType="decimal-pad"
          maxLength={10}
        />
      )}
    </View>
  );

  // ─────────────────────────────────────────────────────────────
  // STEP 3 — Location / Route
  // ─────────────────────────────────────────────────────────────
  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.sectionLabel}>Location</Text>

      {/* Group mode with route activity → use RouteMapPicker */}
      {mode === 'group' ? (
        <RouteMapPicker
          mode={isGroupRouteActivity ? 'route' : 'location'}
          activityType={selectedCategory?.slug}
          lockedLocation={lockedLocation}
          locationName={locationName}
          onLocationNameChange={setLocationName}
          onCoordinateSelect={(coord) => setCoordinates(coord)}
          onRouteCalculated={(result) => {
            setGroupRouteData(result);
            setCoordinates(result.start);
          }}
          onRouteClear={() => setGroupRouteData(null)}
        />
      ) : (
        <>
          {/* Search bar */}
          <View style={styles.locationSearchRow}>
            <Ionicons name="search" size={18} color={colors.gray} />
            <TextInput
              style={styles.locationSearchInput}
              value={locationName}
              onChangeText={handleLocationNameChange}
              placeholder="Search address or place..."
              placeholderTextColor={colors.gray}
              maxLength={200}
            />
            {isLoadingLocationSearch && <ActivityIndicator size="small" color={colors.primary} />}
          </View>

          {/* Suggestions */}
          {locationSuggestions.length > 0 && (
            <View style={styles.suggestions}>
              {locationSuggestions.map((result) => {
                const formatted = formatNominatimResult(result);
                return (
                  <TouchableOpacity
                    key={result.place_id.toString()}
                    style={styles.suggestionItem}
                    onPress={() => selectLocationSuggestion(result)}
                  >
                    <Ionicons name="location" size={16} color={colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestionMain} numberOfLines={1}>{formatted.mainText}</Text>
                      {formatted.secondaryText ? (
                        <Text style={styles.suggestionSub} numberOfLines={1}>{formatted.secondaryText}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Map */}
          <View style={styles.mapContainer}>
            <MapView ref={mapRef} style={styles.map} onPress={handleMapPress}>
              <Camera
                centerCoordinate={[
                  coordinates?.lng || userLocation?.lng || 2.3522,
                  coordinates?.lat || userLocation?.lat || 48.8566,
                ]}
                zoomLevel={14}
                animationMode="flyTo"
                animationDuration={1000}
              />
              {coordinates && !hasRoute && (
                <MarkerView coordinate={[coordinates.lng, coordinates.lat]}>
                  <View style={styles.mapMarker}>
                    <View style={[styles.mapMarkerInner, { backgroundColor: selectedCategory?.color || colors.primary }]} />
                  </View>
                </MarkerView>
              )}
              {hasRoute && routePoints.length > 1 && (
                <ShapeSource
                  id="routeLine"
                  shape={{
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: routePoints.map(p => [p.longitude, p.latitude]) },
                  }}
                >
                  <LineLayer
                    id="routeLineLayer"
                    style={{ lineColor: selectedCategory?.color || colors.primary, lineWidth: 4 }}
                  />
                </ShapeSource>
              )}
              {hasRoute && routePoints.map((point, index) => (
                <MarkerView key={index} coordinate={[point.longitude, point.latitude]}>
                  <View style={[styles.routeMarker, {
                    backgroundColor: index === 0 ? '#4CAF50' : index === routePoints.length - 1 ? '#F44336' : selectedCategory?.color || colors.primary,
                  }]}>
                    <Text style={styles.routeMarkerText}>
                      {index === 0 ? 'S' : index === routePoints.length - 1 ? 'E' : index}
                    </Text>
                  </View>
                </MarkerView>
              ))}
            </MapView>

            {hasRoute && (
              <View style={styles.routeControls}>
                <View style={styles.routeControlsBar}>
                  <View style={styles.routeInfo}>
                    <Ionicons name="navigate" size={18} color={colors.primary} />
                    <Text style={styles.routeInfoText}>{routeDistance.toFixed(2)} km</Text>
                  </View>
                  <TouchableOpacity style={styles.routeBtn} onPress={handleUndoRoutePoint}>
                    <Ionicons name="arrow-undo" size={18} color={colors.dark} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.routeBtn} onPress={handleClearRoute}>
                    <Ionicons name="trash" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {hasRoute && (
            <>
              <Text style={styles.label}>Difficulty</Text>
              <View style={styles.difficultyRow}>
                {(['easy', 'moderate', 'hard', 'expert'] as const).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.difficultyBtn, routeDifficulty === level && styles.difficultyBtnActive]}
                    onPress={() => setRouteDifficulty(level)}
                  >
                    <Text style={[styles.difficultyText, routeDifficulty === level && styles.difficultyTextActive]}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );

  // ─────────────────────────────────────────────────────────────
  // STEP 4 — Review (mockup: cover hero + info badges)
  // ─────────────────────────────────────────────────────────────
  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      {/* Cover hero */}
      {coverImage ? (
        <View style={styles.reviewHero}>
          <Image source={{ uri: coverImage }} style={styles.reviewHeroImage} />
          <View style={styles.reviewHeroOverlay}>
            <Text style={styles.reviewHeroTitle}>{title}</Text>
            <View style={styles.reviewHeroLocation}>
              <Ionicons name="location" size={14} color={colors.white} />
              <Text style={styles.reviewHeroLocationText}>{locationName || 'Location on map'}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.reviewNoImage}>
          <Text style={styles.reviewNoImageTitle}>{title}</Text>
          <View style={styles.reviewHeroLocation}>
            <Ionicons name="location" size={14} color={colors.gray} />
            <Text style={styles.reviewNoImageLocation}>{locationName || 'Location on map'}</Text>
          </View>
        </View>
      )}

      {/* Info badges row */}
      <View style={styles.reviewBadgesRow}>
        <View style={styles.reviewBadge}>
          <Ionicons name="calendar-outline" size={14} color={colors.dark} />
          <Text style={styles.reviewBadgeText}>
            {startDate.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Text>
        </View>
        <View style={styles.reviewBadge}>
          <Ionicons name="time-outline" size={14} color={colors.dark} />
          <Text style={styles.reviewBadgeText}>
            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={styles.reviewBadge}>
          <Ionicons name={isPublic ? 'globe-outline' : 'lock-closed-outline'} size={14} color={colors.dark} />
          <Text style={styles.reviewBadgeText}>{isPublic ? 'Public' : 'Private'}</Text>
        </View>
      </View>

      <View style={styles.reviewBadgesRow}>
        <View style={styles.reviewBadge}>
          <Ionicons name={(selectedCategory?.icon || 'fitness') as keyof typeof Ionicons.glyphMap} size={14} color={colors.dark} />
          <Text style={styles.reviewBadgeText}>{selectedCategory?.name || 'Sport'}</Text>
        </View>
        <View style={styles.reviewBadge}>
          <Ionicons name="people-outline" size={14} color={colors.dark} />
          <Text style={styles.reviewBadgeText}>{maxParticipants || '∞'}</Text>
        </View>
        {!isFree && (
          <View style={styles.reviewBadge}>
            <Text style={styles.reviewBadgeText}>{currency.symbol}{price}</Text>
          </View>
        )}
      </View>

      {/* Description */}
      {description.trim() ? (
        <>
          <Text style={styles.reviewDescLabel}>Description</Text>
          <Text style={styles.reviewDescText}>{description}</Text>
        </>
      ) : null}

      {/* Route info — event inline route */}
      {mode === 'event' && hasRoute && routeDistance > 0 && (
        <View style={styles.reviewBadgesRow}>
          <View style={styles.reviewBadge}>
            <Ionicons name="navigate" size={14} color={colors.dark} />
            <Text style={styles.reviewBadgeText}>{routeDistance.toFixed(2)} km</Text>
          </View>
          <View style={styles.reviewBadge}>
            <Text style={styles.reviewBadgeText}>{routeDifficulty}</Text>
          </View>
        </View>
      )}

      {/* Route info — group RouteMapPicker data */}
      {mode === 'group' && groupRouteData && (
        <View style={styles.reviewBadgesRow}>
          <View style={styles.reviewBadge}>
            <Ionicons name="navigate" size={14} color={colors.dark} />
            <Text style={styles.reviewBadgeText}>{groupRouteData.distanceKm} km</Text>
          </View>
          <View style={styles.reviewBadge}>
            <Text style={styles.reviewBadgeText}>{groupRouteData.durationMin} min</Text>
          </View>
          <View style={styles.reviewBadge}>
            <Text style={styles.reviewBadgeText}>{groupRouteData.difficulty}</Text>
          </View>
        </View>
      )}
    </View>
  );

  // ─── Loading / Limit screens ────────────────────────────────
  if (checkingLimits) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!canCreate && !isProCreator) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Groups and Events</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.limitContainer}>
          <Ionicons name="lock-closed" size={48} color={colors.gray300} />
          <Text style={styles.limitTitle}>Monthly Limit Reached</Text>
          <Text style={styles.limitText}>
            You've created {eventsThisMonth} event this month.{'\n'}
            Personal accounts can create 1 free event per month.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('UpgradeToPro')}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.limitUpgradeBtn}>
              <Text style={styles.limitUpgradeBtnText}>Upgrade to Pro</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.primary, fontWeight: '500', fontSize: 15 }}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main render ────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePrevStep}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Groups and Events</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress segments */}
      <ProgressSegments current={step} total={TOTAL_STEPS} colors={colors} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={step === TOTAL_STEPS ? handleCreate : handleNextStep}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={GRADIENTS.button}
            style={styles.nextBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Text style={styles.nextBtnText}>{step === TOTAL_STEPS ? 'Create' : 'Next'}</Text>
                <Ionicons name={step === TOTAL_STEPS ? 'checkmark' : 'arrow-forward'} size={18} color={colors.white} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Category modal */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryModal(false)}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <FlatList
              data={activeCategories}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedCategory?.id === item.id && styles.modalItemActive]}
                  onPress={() => {
                    setSelectedCategory(item);
                    if (mode === 'event') {
                      setHasRoute(ROUTE_CATEGORIES.includes(item.slug));
                    }
                    setShowCategoryModal(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={22} color={item.color} />
                  <Text style={styles.modalItemText}>{item.name}</Text>
                  {selectedCategory?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Date picker */}
      {showDatePicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          display="spinner"
          minimumDate={new Date()}
          onChange={(_, date) => {
            setShowDatePicker(false);
            if (date) {
              const updated = new Date(startDate);
              updated.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
              setStartDate(updated);
            }
          }}
        />
      )}

      {/* Time picker */}
      {showTimePicker && (
        <DateTimePicker
          value={startDate}
          mode="time"
          display="spinner"
          onChange={(_, date) => {
            setShowTimePicker(false);
            if (date) {
              const updated = new Date(startDate);
              updated.setHours(date.getHours(), date.getMinutes());
              setStartDate(updated);
            }
          }}
        />
      )}
    </SafeAreaView>
  );
};

// ═══════════════════════════════════════════════════════════════
// STYLES — matching mockup: capsule inputs, teal borders,
//          segmented progress, gradient button
// ═══════════════════════════════════════════════════════════════

const CAPSULE_RADIUS = 28;
const INPUT_HEIGHT = 52;

const createStyles = (colors: ThemeColors, _isDark: boolean) => {
  const _TEAL_BORDER = colors.primary;
  const INACTIVE_BORDER = '#B5E8DC';

  return StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },

  // Scroll
  scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },
  stepContainer: { gap: 14, paddingTop: 8 },

  // Labels
  label: { fontSize: 14, fontWeight: '600', color: colors.dark, marginTop: 4 },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: colors.dark },

  // Capsule input (matching mockup: rounded, teal border)
  capsuleInput: {
    height: INPUT_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1.5,
    borderColor: INACTIVE_BORDER,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    justifyContent: 'center',
    fontSize: 15,
    color: colors.dark,
  },
  textArea: {
    height: 110,
    paddingTop: 14,
    textAlignVertical: 'top',
  },

  // Dropdown inside capsule
  dropdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownValue: { fontSize: 15, color: colors.dark },
  dropdownPlaceholder: { fontSize: 15, color: colors.gray },

  // Icon + text row inside capsule
  iconInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Liquid toggle (Groups / Events)
  liquidToggle: {
    alignSelf: 'center',
    marginBottom: 8,
  },

  // Visibility radio chips
  visibilityRow: { flexDirection: 'row', gap: 12 },
  radioChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: INPUT_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    paddingHorizontal: 16,
    backgroundColor: colors.background,
  },
  radioChipActive: { borderColor: colors.primary },
  radioChipText: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.gray },
  radioChipTextActive: { color: colors.dark, fontWeight: '600' },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.gray300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleFilled: { borderColor: colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },

  // Cover image upload
  coverUpload: {
    height: 160,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: INACTIVE_BORDER,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverPlaceholder: { alignItems: 'center', gap: 8 },
  coverPlaceholderText: { fontSize: 14, color: colors.gray },
  coverPreview: { width: '100%', height: '100%', borderRadius: 18 },

  // Pro badge
  proBadge: { backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  proBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white },

  // Location step
  locationSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: INPUT_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1.5,
    borderColor: INACTIVE_BORDER,
    paddingHorizontal: 16,
    gap: 10,
    backgroundColor: colors.background,
  },
  locationSearchInput: { flex: 1, fontSize: 15, color: colors.dark },
  suggestions: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.grayBorder,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  suggestionMain: { fontSize: 14, fontWeight: '600', color: colors.dark },
  suggestionSub: { fontSize: 12, color: colors.gray, marginTop: 2 },

  // Map
  mapContainer: { height: 320, borderRadius: 20, overflow: 'hidden', marginTop: 4 },
  map: { flex: 1 },
  mapMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapMarkerInner: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.white },

  // Route
  routeControls: { position: 'absolute', bottom: 16, left: 16, right: 16 },
  routeControlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: colors.grayBorder,
  },
  routeInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeInfoText: { fontSize: 16, fontWeight: '700', color: colors.dark },
  routeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.gray100, justifyContent: 'center', alignItems: 'center' },
  routeMarker: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.white },
  routeMarkerText: { fontSize: 10, fontWeight: '700', color: colors.white },

  // Difficulty
  difficultyRow: { flexDirection: 'row', gap: 8 },
  difficultyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1.5,
    borderColor: colors.gray200,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  difficultyBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  difficultyText: { fontSize: 13, fontWeight: '600', color: colors.gray },
  difficultyTextActive: { color: colors.primary },

  // Review step
  reviewHero: { height: 200, borderRadius: 20, overflow: 'hidden', position: 'relative' },
  reviewHeroImage: { width: '100%', height: '100%' },
  reviewHeroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  reviewHeroTitle: { fontSize: 20, fontWeight: '700', color: colors.white },
  reviewHeroLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  reviewHeroLocationText: { fontSize: 13, color: colors.white },

  reviewNoImage: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.grayBorder,
  },
  reviewNoImageTitle: { fontSize: 20, fontWeight: '700', color: colors.dark },
  reviewNoImageLocation: { fontSize: 13, color: colors.gray },

  reviewBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.grayBorder,
    backgroundColor: colors.backgroundSecondary,
  },
  reviewBadgeText: { fontSize: 13, fontWeight: '500', color: colors.dark },

  reviewDescLabel: { fontSize: 16, fontWeight: '700', color: colors.dark, marginTop: 4 },
  reviewDescText: { fontSize: 14, color: colors.gray, lineHeight: 21 },

  // Bottom button
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: colors.background,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 26,
    gap: 8,
  },
  nextBtnText: { fontSize: 17, fontWeight: '600', color: colors.white },

  // Category modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.dark, paddingHorizontal: 20, marginBottom: 12 },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  modalItemActive: { backgroundColor: colors.primary + '10' },
  modalItemText: { flex: 1, fontSize: 16, color: colors.dark },

  // Limit screen
  limitContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  limitTitle: { fontSize: 20, fontWeight: '700', color: colors.dark, marginTop: 16, marginBottom: 8 },
  limitText: { fontSize: 14, color: colors.gray, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  limitUpgradeBtn: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 26 },
  limitUpgradeBtnText: { fontSize: 16, fontWeight: '600', color: colors.white },
  });
};

export default CreateEventScreen;
