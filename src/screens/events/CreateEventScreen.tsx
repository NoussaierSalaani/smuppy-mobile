/**
 * CreateEventScreen
 * Create sports/fitness events with route planning
 * 4-step wizard matching mockup design:
 *   Step 1: Name, Description, Category dropdown, Date, Time
 *   Step 2: Public/Private, Max capacity, Cover image
 *   Step 3: Location / Route
 *   Step 4: Review with cover hero
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
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
import { COLORS, GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { searchNominatim, NominatimSearchResult, formatNominatimResult } from '../../config/api';
import { LiquidTabs } from '../../components/LiquidTabs';
import RouteMapPicker from '../../components/RouteMapPicker';
import type { RouteResult } from '../../services/mapbox-directions';
import type { RouteProfile } from '../../types';

const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
if (mapboxToken) Mapbox.setAccessToken(mapboxToken);

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TEAL_BORDER = COLORS.primary;
const INACTIVE_BORDER = '#B5E8DC';
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
const ProgressSegments: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  const segmentWidth = (SCREEN_WIDTH - 32 - SEGMENT_GAP * (total - 1)) / total;
  return (
    <View style={progressStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            progressStyles.segment,
            { width: segmentWidth },
            i < current ? progressStyles.segmentFilled : progressStyles.segmentEmpty,
          ]}
        />
      ))}
    </View>
  );
};

const progressStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SEGMENT_GAP, paddingHorizontal: 16, marginBottom: 8 },
  segment: { height: 4, borderRadius: 2 },
  segmentFilled: { backgroundColor: TEAL_BORDER },
  segmentEmpty: { backgroundColor: COLORS.gray200 },
});

// ─── Component ───────────────────────────────────────────────────
const CreateEventScreen: React.FC<{ navigation: any; route?: any }> = ({ navigation, route }) => {
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

  const lockedLocation = route?.params?.lockedLocation || null;

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
  const [groupRouteData, setGroupRouteData] = useState<(RouteResult & { start: any; end: any; waypoints: any[]; profile: RouteProfile }) | null>(null);

  // Derived: is this a route-type group activity?
  const isGroupRouteActivity = mode === 'group' && (selectedCategory?.isRouteActivity || false);

  // Active categories list based on mode
  const activeCategories = mode === 'event' ? EVENT_CATEGORIES : GROUP_CATEGORIES;

  // UI
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [endDate, setEndDate] = useState<Date | null>(null);

  const mapRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView>(null);

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
        console.error('Error checking limits:', error);
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

  useEffect(() => { getUserLocation(); }, []);

  useEffect(() => {
    return () => { if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current); };
  }, []);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({ lat: location.coords.latitude, lng: location.coords.longitude });
      if (!coordinates) {
        setCoordinates({ lat: location.coords.latitude, lng: location.coords.longitude });
      }
    } catch (error) {
      console.log('Location error:', error);
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
  const handleMapPress = async (e: any) => {
    const [longitude, latitude] = e.geometry.coordinates;
    if (hasRoute && selectedCategory && ROUTE_CATEGORIES.includes(selectedCategory.slug)) {
      const newPoints = [...routePoints, { latitude, longitude }];
      setRoutePoints(newPoints);
      calculateRouteDistance(newPoints);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      setCoordinates({ lat: latitude, lng: longitude });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const [reverseResult] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (reverseResult) {
          const parts = [reverseResult.street, reverseResult.city, reverseResult.country].filter(Boolean);
          if (parts.length > 0) { setLocationName(parts.join(', ')); setLocationSuggestions([]); }
        }
      } catch { /* silent */ }
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
      const message = error instanceof Error ? error.message : `Failed to create ${mode}`;
      console.error(`Create ${mode} error:`, error);
      showError('Error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEvent = async () => {
    if (!selectedCategory || !coordinates) return;
    const eventData = {
      title: title.trim(),
      description: description.trim() || undefined,
      categorySlug: selectedCategory.slug,
      locationName: locationName.trim() || 'Event Location',
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
      const eventId = response.event.id;
      const shareUrl = `https://smuppy.app/events/${eventId}`;
      const shareEvent = async (audience: 'fans' | 'public') => {
        try {
          const audienceText = audience === 'fans' ? '🔒 Exclusive for my fans!' : '🌍 Open to everyone!';
          const shareMessage = `Join me at "${title}"!\n\n📅 ${startDate.toLocaleDateString()}\n📍 ${locationName || 'Location on map'}\n${isFree ? '🆓 Free event!' : `💰 ${currency.symbol}${price}`}\n\n${audienceText}\n\n${shareUrl}`;
          await Share.share({ message: shareMessage, title: `Join: ${title}`, url: shareUrl });
        } catch { /* cancelled */ }
        navigation.replace('EventDetail', { eventId });
      };
      showAlert({
        title: 'Event Created!',
        message: 'Your event is now live. How would you like to share it?',
        type: 'success',
        buttons: [
          { text: 'View Event', style: 'cancel', onPress: () => navigation.replace('EventDetail', { eventId }) },
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
      name: title.trim(),
      description: description.trim(),
      category: selectedCategory.slug as any,
      subcategory: '',
      sport_type: selectedCategory.slug,
      latitude: coordinates?.lat || groupRouteData?.start?.lat,
      longitude: coordinates?.lng || groupRouteData?.start?.lng,
      address: locationName,
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
      route_geojson: groupRouteData?.geojson as any,
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
          { text: 'View', onPress: () => navigation.replace('GroupDetail', { groupId: response.group?.id }) },
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
    <View style={s.stepContainer}>
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
        style={s.liquidToggle}
      />

      {/* Name */}
      <Text style={s.label}>Name</Text>
      <TextInput
        style={s.capsuleInput}
        value={title}
        onChangeText={setTitle}
        placeholder="Type Here ..."
        placeholderTextColor={COLORS.gray400}
        maxLength={100}
      />

      {/* Description */}
      <Text style={s.label}>Detailed description</Text>
      <TextInput
        style={[s.capsuleInput, s.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Type Here ..."
        placeholderTextColor={COLORS.gray400}
        multiline
        maxLength={500}
      />

      {/* Category dropdown */}
      <Text style={s.label}>Category</Text>
      <TouchableOpacity style={s.capsuleInput} onPress={() => setShowCategoryModal(true)}>
        <View style={s.dropdownRow}>
          <Text style={selectedCategory ? s.dropdownValue : s.dropdownPlaceholder}>
            {selectedCategory?.name || 'Sport'}
          </Text>
          <Ionicons name="chevron-down" size={20} color={COLORS.gray400} />
        </View>
      </TouchableOpacity>

      {/* Date */}
      <Text style={s.label}>Date</Text>
      <TouchableOpacity style={s.capsuleInput} onPress={() => setShowDatePicker(true)}>
        <View style={s.iconInputRow}>
          <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
          <Text style={startDate ? s.dropdownValue : s.dropdownPlaceholder}>
            {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Time */}
      <Text style={s.label}>Time</Text>
      <TouchableOpacity style={s.capsuleInput} onPress={() => setShowTimePicker(true)}>
        <View style={s.iconInputRow}>
          <Ionicons name="time-outline" size={20} color={COLORS.primary} />
          <Text style={s.dropdownValue}>
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
    <View style={s.stepContainer}>
      {/* Public / Private */}
      <View style={s.visibilityRow}>
        <TouchableOpacity
          style={[s.radioChip, isPublic && s.radioChipActive]}
          onPress={() => setIsPublic(true)}
        >
          <Ionicons name="people-outline" size={18} color={isPublic ? COLORS.primary : COLORS.gray} />
          <Text style={[s.radioChipText, isPublic && s.radioChipTextActive]}>Public</Text>
          <View style={[s.radioCircle, isPublic && s.radioCircleFilled]}>
            {isPublic && <View style={s.radioInner} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.radioChip, !isPublic && s.radioChipActive]}
          onPress={() => setIsPublic(false)}
        >
          <Ionicons name="lock-closed-outline" size={18} color={!isPublic ? COLORS.primary : COLORS.gray} />
          <Text style={[s.radioChipText, !isPublic && s.radioChipTextActive]}>Private</Text>
          <View style={[s.radioCircle, !isPublic && s.radioCircleFilled]}>
            {!isPublic && <View style={s.radioInner} />}
          </View>
        </TouchableOpacity>
      </View>

      {/* Max capacity */}
      <Text style={s.label}>Maximum capacity</Text>
      <TextInput
        style={s.capsuleInput}
        value={maxParticipants}
        onChangeText={setMaxParticipants}
        placeholder="Type Here ..."
        placeholderTextColor={COLORS.gray400}
        keyboardType="number-pad"
      />

      {/* Cover image */}
      <Text style={s.label}>Cover image</Text>
      <TouchableOpacity style={s.coverUpload} onPress={pickCoverImage}>
        {coverImage ? (
          <Image source={{ uri: coverImage }} style={s.coverPreview} />
        ) : (
          <View style={s.coverPlaceholder}>
            <Ionicons name="cloud-upload-outline" size={32} color={COLORS.primary} />
            <Text style={s.coverPlaceholderText}>Add File Here ...</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Pricing (keep existing logic) */}
      <Text style={s.label}>Pricing</Text>
      <View style={s.visibilityRow}>
        <TouchableOpacity
          style={[s.radioChip, isFree && s.radioChipActive]}
          onPress={() => setIsFree(true)}
        >
          <Text style={[s.radioChipText, isFree && s.radioChipTextActive]}>Free</Text>
          <View style={[s.radioCircle, isFree && s.radioCircleFilled]}>
            {isFree && <View style={s.radioInner} />}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.radioChip, !isFree && s.radioChipActive]}
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
                  { text: 'Get Verified', onPress: () => navigation.navigate('IdentityVerificationScreen') },
                ],
              });
            }
          }}
        >
          <Text style={[s.radioChipText, !isFree && s.radioChipTextActive]}>Paid</Text>
          {!canUsePaid && (
            <View style={s.proBadge}>
              <Text style={s.proBadgeText}>{isBusinessNonPremium ? 'PREMIUM' : 'VERIFIED'}</Text>
            </View>
          )}
          <View style={[s.radioCircle, !isFree && s.radioCircleFilled]}>
            {!isFree && <View style={s.radioInner} />}
          </View>
        </TouchableOpacity>
      </View>
      {!isFree && canUsePaid && (
        <TextInput
          style={s.capsuleInput}
          value={price}
          onChangeText={setPrice}
          placeholder={`Price (${currency.symbol})`}
          placeholderTextColor={COLORS.gray400}
          keyboardType="decimal-pad"
        />
      )}
    </View>
  );

  // ─────────────────────────────────────────────────────────────
  // STEP 3 — Location / Route
  // ─────────────────────────────────────────────────────────────
  const renderStep3 = () => (
    <View style={s.stepContainer}>
      <Text style={s.sectionLabel}>Location</Text>

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
          <View style={s.locationSearchRow}>
            <Ionicons name="search" size={18} color={COLORS.gray400} />
            <TextInput
              style={s.locationSearchInput}
              value={locationName}
              onChangeText={handleLocationNameChange}
              placeholder="Search address or place..."
              placeholderTextColor={COLORS.gray400}
            />
            {isLoadingLocationSearch && <ActivityIndicator size="small" color={COLORS.primary} />}
          </View>

          {/* Suggestions */}
          {locationSuggestions.length > 0 && (
            <View style={s.suggestions}>
              {locationSuggestions.map((result) => {
                const formatted = formatNominatimResult(result);
                return (
                  <TouchableOpacity
                    key={result.place_id.toString()}
                    style={s.suggestionItem}
                    onPress={() => selectLocationSuggestion(result)}
                  >
                    <Ionicons name="location" size={16} color={COLORS.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.suggestionMain} numberOfLines={1}>{formatted.mainText}</Text>
                      {formatted.secondaryText ? (
                        <Text style={s.suggestionSub} numberOfLines={1}>{formatted.secondaryText}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Map */}
          <View style={s.mapContainer}>
            <MapView ref={mapRef} style={s.map} onPress={handleMapPress}>
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
                  <View style={s.mapMarker}>
                    <View style={[s.mapMarkerInner, { backgroundColor: selectedCategory?.color || COLORS.primary }]} />
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
                    style={{ lineColor: selectedCategory?.color || COLORS.primary, lineWidth: 4 }}
                  />
                </ShapeSource>
              )}
              {hasRoute && routePoints.map((point, index) => (
                <MarkerView key={index} coordinate={[point.longitude, point.latitude]}>
                  <View style={[s.routeMarker, {
                    backgroundColor: index === 0 ? '#4CAF50' : index === routePoints.length - 1 ? '#F44336' : selectedCategory?.color || COLORS.primary,
                  }]}>
                    <Text style={s.routeMarkerText}>
                      {index === 0 ? 'S' : index === routePoints.length - 1 ? 'E' : index}
                    </Text>
                  </View>
                </MarkerView>
              ))}
            </MapView>

            {hasRoute && (
              <View style={s.routeControls}>
                <View style={s.routeControlsBar}>
                  <View style={s.routeInfo}>
                    <Ionicons name="navigate" size={18} color={COLORS.primary} />
                    <Text style={s.routeInfoText}>{routeDistance.toFixed(2)} km</Text>
                  </View>
                  <TouchableOpacity style={s.routeBtn} onPress={handleUndoRoutePoint}>
                    <Ionicons name="arrow-undo" size={18} color={COLORS.dark} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.routeBtn} onPress={handleClearRoute}>
                    <Ionicons name="trash" size={18} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {hasRoute && (
            <>
              <Text style={s.label}>Difficulty</Text>
              <View style={s.difficultyRow}>
                {(['easy', 'moderate', 'hard', 'expert'] as const).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[s.difficultyBtn, routeDifficulty === level && s.difficultyBtnActive]}
                    onPress={() => setRouteDifficulty(level)}
                  >
                    <Text style={[s.difficultyText, routeDifficulty === level && s.difficultyTextActive]}>
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
    <View style={s.stepContainer}>
      {/* Cover hero */}
      {coverImage ? (
        <View style={s.reviewHero}>
          <Image source={{ uri: coverImage }} style={s.reviewHeroImage} />
          <View style={s.reviewHeroOverlay}>
            <Text style={s.reviewHeroTitle}>{title}</Text>
            <View style={s.reviewHeroLocation}>
              <Ionicons name="location" size={14} color={COLORS.white} />
              <Text style={s.reviewHeroLocationText}>{locationName || 'Location on map'}</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={s.reviewNoImage}>
          <Text style={s.reviewNoImageTitle}>{title}</Text>
          <View style={s.reviewHeroLocation}>
            <Ionicons name="location" size={14} color={COLORS.gray} />
            <Text style={s.reviewNoImageLocation}>{locationName || 'Location on map'}</Text>
          </View>
        </View>
      )}

      {/* Info badges row */}
      <View style={s.reviewBadgesRow}>
        <View style={s.reviewBadge}>
          <Ionicons name="calendar-outline" size={14} color={COLORS.dark} />
          <Text style={s.reviewBadgeText}>
            {startDate.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </Text>
        </View>
        <View style={s.reviewBadge}>
          <Ionicons name="time-outline" size={14} color={COLORS.dark} />
          <Text style={s.reviewBadgeText}>
            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={s.reviewBadge}>
          <Ionicons name={isPublic ? 'globe-outline' : 'lock-closed-outline'} size={14} color={COLORS.dark} />
          <Text style={s.reviewBadgeText}>{isPublic ? 'Public' : 'Private'}</Text>
        </View>
      </View>

      <View style={s.reviewBadgesRow}>
        <View style={s.reviewBadge}>
          <Ionicons name={selectedCategory?.icon as any || 'fitness'} size={14} color={COLORS.dark} />
          <Text style={s.reviewBadgeText}>{selectedCategory?.name || 'Sport'}</Text>
        </View>
        <View style={s.reviewBadge}>
          <Ionicons name="people-outline" size={14} color={COLORS.dark} />
          <Text style={s.reviewBadgeText}>{maxParticipants || '∞'}</Text>
        </View>
        {!isFree && (
          <View style={s.reviewBadge}>
            <Text style={s.reviewBadgeText}>{currency.symbol}{price}</Text>
          </View>
        )}
      </View>

      {/* Description */}
      {description.trim() ? (
        <>
          <Text style={s.reviewDescLabel}>Description</Text>
          <Text style={s.reviewDescText}>{description}</Text>
        </>
      ) : null}

      {/* Route info — event inline route */}
      {mode === 'event' && hasRoute && routeDistance > 0 && (
        <View style={s.reviewBadgesRow}>
          <View style={s.reviewBadge}>
            <Ionicons name="navigate" size={14} color={COLORS.dark} />
            <Text style={s.reviewBadgeText}>{routeDistance.toFixed(2)} km</Text>
          </View>
          <View style={s.reviewBadge}>
            <Text style={s.reviewBadgeText}>{routeDifficulty}</Text>
          </View>
        </View>
      )}

      {/* Route info — group RouteMapPicker data */}
      {mode === 'group' && groupRouteData && (
        <View style={s.reviewBadgesRow}>
          <View style={s.reviewBadge}>
            <Ionicons name="navigate" size={14} color={COLORS.dark} />
            <Text style={s.reviewBadgeText}>{groupRouteData.distanceKm} km</Text>
          </View>
          <View style={s.reviewBadge}>
            <Text style={s.reviewBadgeText}>{groupRouteData.durationMin} min</Text>
          </View>
          <View style={s.reviewBadge}>
            <Text style={s.reviewBadgeText}>{groupRouteData.difficulty}</Text>
          </View>
        </View>
      )}
    </View>
  );

  // ─── Loading / Limit screens ────────────────────────────────
  if (checkingLimits) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!canCreate && !isProCreator) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Create Groups and Events</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.limitContainer}>
          <Ionicons name="lock-closed" size={48} color={COLORS.gray300} />
          <Text style={s.limitTitle}>Monthly Limit Reached</Text>
          <Text style={s.limitText}>
            You've created {eventsThisMonth} event this month.{'\n'}
            Personal accounts can create 1 free event per month.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('UpgradeToPro')}>
            <LinearGradient colors={GRADIENTS.primary} style={s.limitUpgradeBtn}>
              <Text style={s.limitUpgradeBtnText}>Upgrade to Pro</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
            <Text style={{ color: COLORS.primary, fontWeight: '500', fontSize: 15 }}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Main render ────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={handlePrevStep}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Create Groups and Events</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress segments */}
      <ProgressSegments current={step} total={TOTAL_STEPS} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom button */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          onPress={step === TOTAL_STEPS ? handleCreate : handleNextStep}
          disabled={isLoading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={GRADIENTS.button}
            style={s.nextBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Text style={s.nextBtnText}>{step === TOTAL_STEPS ? 'Create' : 'Next'}</Text>
                <Ionicons name={step === TOTAL_STEPS ? 'checkmark' : 'arrow-forward'} size={18} color={COLORS.white} />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Category modal */}
      <Modal visible={showCategoryModal} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowCategoryModal(false)}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Select Category</Text>
            <FlatList
              data={activeCategories}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[s.modalItem, selectedCategory?.id === item.id && s.modalItemActive]}
                  onPress={() => {
                    setSelectedCategory(item);
                    if (mode === 'event') {
                      setHasRoute(ROUTE_CATEGORIES.includes(item.slug));
                    }
                    setShowCategoryModal(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons name={item.icon as any} size={22} color={item.color} />
                  <Text style={s.modalItemText}>{item.name}</Text>
                  {selectedCategory?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
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
    color: COLORS.dark,
  },

  // Scroll
  scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },
  stepContainer: { gap: 14, paddingTop: 8 },

  // Labels
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginTop: 4 },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: COLORS.dark },

  // Capsule input (matching mockup: rounded, teal border)
  capsuleInput: {
    height: INPUT_HEIGHT,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1.5,
    borderColor: INACTIVE_BORDER,
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    justifyContent: 'center',
    fontSize: 15,
    color: COLORS.dark,
  },
  textArea: {
    height: 110,
    paddingTop: 14,
    textAlignVertical: 'top',
  },

  // Dropdown inside capsule
  dropdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownValue: { fontSize: 15, color: COLORS.dark },
  dropdownPlaceholder: { fontSize: 15, color: COLORS.gray400 },

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
    borderColor: COLORS.gray200,
    paddingHorizontal: 16,
    backgroundColor: COLORS.white,
  },
  radioChipActive: { borderColor: COLORS.primary },
  radioChipText: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.gray },
  radioChipTextActive: { color: COLORS.dark, fontWeight: '600' },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.gray300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleFilled: { borderColor: COLORS.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary },

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
  coverPlaceholderText: { fontSize: 14, color: COLORS.gray400 },
  coverPreview: { width: '100%', height: '100%', borderRadius: 18 },

  // Pro badge
  proBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  proBadgeText: { fontSize: 9, fontWeight: '800', color: COLORS.white },

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
    backgroundColor: COLORS.white,
  },
  locationSearchInput: { flex: 1, fontSize: 15, color: COLORS.dark },
  suggestions: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayBorder,
  },
  suggestionMain: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  suggestionSub: { fontSize: 12, color: COLORS.gray, marginTop: 2 },

  // Map
  mapContainer: { height: 320, borderRadius: 20, overflow: 'hidden', marginTop: 4 },
  map: { flex: 1 },
  mapMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapMarkerInner: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: COLORS.white },

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
    borderColor: COLORS.grayBorder,
  },
  routeInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeInfoText: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  routeBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.gray100, justifyContent: 'center', alignItems: 'center' },
  routeMarker: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.white },
  routeMarkerText: { fontSize: 10, fontWeight: '700', color: COLORS.white },

  // Difficulty
  difficultyRow: { flexDirection: 'row', gap: 8 },
  difficultyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: CAPSULE_RADIUS,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  difficultyBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
  difficultyText: { fontSize: 13, fontWeight: '600', color: COLORS.gray },
  difficultyTextActive: { color: COLORS.primary },

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
  reviewHeroTitle: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  reviewHeroLocation: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  reviewHeroLocationText: { fontSize: 13, color: COLORS.white },

  reviewNoImage: {
    backgroundColor: COLORS.gray50,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
  },
  reviewNoImageTitle: { fontSize: 20, fontWeight: '700', color: COLORS.dark },
  reviewNoImageLocation: { fontSize: 13, color: COLORS.gray },

  reviewBadgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
    backgroundColor: COLORS.white,
  },
  reviewBadgeText: { fontSize: 13, fontWeight: '500', color: COLORS.dark },

  reviewDescLabel: { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginTop: 4 },
  reviewDescText: { fontSize: 14, color: COLORS.gray, lineHeight: 21 },

  // Bottom button
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: COLORS.white,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 26,
    gap: 8,
  },
  nextBtnText: { fontSize: 17, fontWeight: '600', color: COLORS.white },

  // Category modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.dark, paddingHorizontal: 20, marginBottom: 12 },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayBorder,
  },
  modalItemActive: { backgroundColor: COLORS.primary + '10' },
  modalItemText: { flex: 1, fontSize: 16, color: COLORS.dark },

  // Limit screen
  limitContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  limitTitle: { fontSize: 20, fontWeight: '700', color: COLORS.dark, marginTop: 16, marginBottom: 8 },
  limitText: { fontSize: 14, color: COLORS.gray, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  limitUpgradeBtn: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 26 },
  limitUpgradeBtnText: { fontSize: 16, fontWeight: '600', color: COLORS.white },
});

export default CreateEventScreen;
