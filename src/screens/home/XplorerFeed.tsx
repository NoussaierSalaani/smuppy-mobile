import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Dimensions, ScrollView, TextInput, StatusBar, Pressable } from 'react-native';
import Mapbox, { MapView, Camera, PointAnnotation, LocationPuck } from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { COLORS, GRADIENTS } from '../../config/theme';
import { FEATURES } from '../../config/featureFlags';
import { LiquidButton } from '../../components/LiquidButton';
import { BlurView } from 'expo-blur';
import { useTabBar } from '../../context/TabBarContext';
import { useUserStore } from '../../stores';

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
  spots: '#5D4037',
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
  { key: 'spots', label: 'Spots', icon: 'location', color: PIN_COLORS.spots, subcategories: ['Parks', 'Outdoor Gyms', 'Trails', 'Courts', 'Fields', 'Beaches'] },
];

const MAX_ACTIVE_FILTERS = 3;

// ============================================
// FAB ACTIONS BY ACCOUNT TYPE
// ============================================
type FabAction = { label: string; icon: keyof typeof Ionicons.glyphMap; action: string };

// Personal: Create Activity (unified event + group)
const PERSONAL_ACTIONS: FabAction[] = [
  { label: 'Create Activity', icon: 'add-circle-outline', action: 'create_activity' },
];

// Personal verified / Pro Creator: + Suggest Spot, Add Review
const VERIFIED_ACTIONS: FabAction[] = [
  ...PERSONAL_ACTIONS,
  { label: 'Suggest Spot', icon: 'pin-outline', action: 'suggest_spot' },
  { label: 'Add Review', icon: 'star-outline', action: 'add_review' },
];

// Pro Creator Premium: + Share Live on Map
const CREATOR_PREMIUM_ACTIONS: FabAction[] = [
  ...VERIFIED_ACTIONS,
  ...(FEATURES.GO_LIVE ? [{ label: 'Share Live', icon: 'videocam-outline' as const, action: 'share_live' }] : []),
];

// Pro Business: Create Activity (locked to business location)
const BUSINESS_ACTIONS: FabAction[] = [
  { label: 'Create Activity', icon: 'add-circle-outline', action: 'create_activity' },
];

// Pro Business Premium: All of Pro Creator + activity anywhere + planning indexed
const BUSINESS_PREMIUM_ACTIONS: FabAction[] = [
  ...CREATOR_PREMIUM_ACTIONS,
];

// ============================================
// MOCK MARKERS
// ============================================
const MOCK_MARKERS: { id: string; type: string; subcategory: string; category: string; name: string; avatar: string; bio?: string; fans: number; posts?: number; coordinate: { latitude: number; longitude: number }; coverImage?: string; address?: string; hours?: string; expertise?: string[] }[] = [];

interface MockMarker {
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
  const insets = useSafeAreaInsets();
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
  const [selectedMarker, setSelectedMarker] = useState<MockMarker | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [subFilterSheet, setSubFilterSheet] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(false);

  // Determine if business has a locked location
  const businessLocation = useUserStore((s) => {
    const u = s.user;
    if (u?.accountType !== 'pro_business') return null;
    // Business location from profile (latitude/longitude stored on profile)
    return u.businessAddress ? { address: u.businessAddress } : null;
  });

  // FAB visibility & actions based on account type
  const fabActions = useMemo((): FabAction[] => {
    if (accountType === 'pro_business' && isPremium) return BUSINESS_PREMIUM_ACTIONS;
    if (accountType === 'pro_business') return BUSINESS_ACTIONS;
    if (accountType === 'pro_creator' && isPremium) return CREATOR_PREMIUM_ACTIONS;
    if (accountType === 'pro_creator') return VERIFIED_ACTIONS;
    if (isVerified) return VERIFIED_ACTIONS;
    // Personal (non-verified) still gets basic actions
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
      console.log('[XplorerFeed] Could not get position:', err);
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
  }, [isActive, xplorerFullscreen, setBottomBarHidden, setXplorerFullscreen, showBars, requestLocation]);

  // ============================================
  // ACTIONS
  // ============================================

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

  const handleMarkerPress = useCallback((marker: MockMarker) => setSelectedMarker(marker), []);
  const closePopup = useCallback(() => setSelectedMarker(null), []);

  const goToProfile = useCallback((marker: MockMarker) => {
    closePopup();
    navigation.navigate('UserProfile', { userId: marker.id });
  }, [closePopup, navigation]);

  const handleFabAction = useCallback((action: string) => {
    setFabOpen(false);
    switch (action) {
      case 'create_activity':
        if (accountType === 'pro_business' && !isPremium && businessLocation) {
          navigation.navigate('CreateActivity', { lockedLocation: businessLocation });
        } else {
          navigation.navigate('CreateActivity');
        }
        break;
      case 'suggest_spot':
        navigation.navigate('SuggestSpot');
        break;
      case 'add_review':
        // Review is done via AddReviewSheet on a selected marker popup
        // For FAB, open spot suggestion which includes initial review
        navigation.navigate('SuggestSpot');
        break;
      case 'share_live':
        navigation.navigate('GoLiveIntro');
        break;
    }
  }, [navigation, accountType, isPremium, businessLocation]);

  const filteredMarkers = useMemo(() => {
    if (activeFilters.length === 0) return MOCK_MARKERS; // Show all when no filter
    return MOCK_MARKERS.filter(m => {
      if (!activeFilters.includes(m.type)) return false;
      const subs = activeSubFilters[m.type];
      if (subs && subs.length > 0) {
        return subs.includes(m.subcategory);
      }
      return true;
    });
  }, [activeFilters, activeSubFilters]);

  // ============================================
  // RENDERERS
  // ============================================

  const renderCustomMarker = useCallback((marker: MockMarker) => {
    const pinColor = PIN_COLORS[marker.type] || COLORS.primary;
    return (
      <View style={[styles.markerPin, { backgroundColor: pinColor }]}>
        <Image source={{ uri: marker.avatar }} style={styles.markerAvatar} />
      </View>
    );
  }, []);

  const renderUserPopup = () => {
    if (!selectedMarker) return null;
    return (
      <View style={[styles.popupContainer, { bottom: insets.bottom + hp(2) }]}>
        <TouchableOpacity style={styles.popupClose} onPress={closePopup}>
          <Ionicons name="close" size={normalize(20)} color={COLORS.gray} />
        </TouchableOpacity>
        <View style={styles.popupContent}>
          <Image source={{ uri: selectedMarker.avatar }} style={styles.popupAvatar} />
          <View style={styles.popupInfo}>
            <Text style={styles.popupName}>{selectedMarker.name}</Text>
            <View style={styles.popupStats}>
              <Text style={styles.popupStatText}><Text style={styles.popupStatNumber}>{selectedMarker.fans}</Text> fans</Text>
              <Text style={styles.popupStatDot}>·</Text>
              <Text style={styles.popupStatText}><Text style={styles.popupStatNumber}>{selectedMarker.posts}</Text> posts</Text>
            </View>
            <Text style={styles.popupBio} numberOfLines={2}>{selectedMarker.bio}</Text>
          </View>
        </View>
        <LiquidButton
          label="See Profile"
          onPress={() => goToProfile(selectedMarker)}
          size="md"
          style={styles.popupButton}
          icon={<Ionicons name="arrow-forward" size={normalize(16)} color={COLORS.white} />}
        />
      </View>
    );
  };

  const renderBusinessPopup = () => {
    if (!selectedMarker) return null;
    return (
      <View style={[styles.businessPopupContainer, { bottom: insets.bottom + hp(2) }]}>
        <TouchableOpacity style={styles.businessPopupClose} onPress={closePopup}>
          <Ionicons name="close" size={normalize(22)} color={COLORS.white} />
        </TouchableOpacity>
        <Image source={{ uri: selectedMarker.coverImage }} style={styles.businessCover} />
        <View style={styles.businessContent}>
          <Text style={styles.businessName}>{selectedMarker.name}</Text>
          <View style={styles.businessRow}>
            <Ionicons name="location-outline" size={normalize(16)} color={COLORS.gray} />
            <Text style={styles.businessText}>{selectedMarker.address}</Text>
          </View>
          <View style={styles.businessRow}>
            <Ionicons name="time-outline" size={normalize(16)} color={COLORS.gray} />
            <Text style={styles.businessText}>{selectedMarker.hours}</Text>
          </View>
          <View style={styles.expertiseTags}>
            {selectedMarker.expertise?.map((tag, index) => (
              <View key={index} style={styles.expertiseTag}>
                <Text style={styles.expertiseTagText}>{tag}</Text>
              </View>
            ))}
          </View>
          <LiquidButton
            label="See Profile"
            onPress={() => goToProfile(selectedMarker)}
            size="md"
            style={styles.popupButton}
            icon={<Ionicons name="arrow-forward" size={normalize(16)} color={COLORS.white} />}
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
            <Ionicons name="location" size={normalize(40)} color={COLORS.primary} />
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
  // GRADIENT MAP BUTTON
  // ============================================

  const GradientMapButton = useCallback(({ onPress, iconName, size = 46 }: { onPress: () => void; iconName: keyof typeof Ionicons.glyphMap; size?: number }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={GRADIENTS.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientMapButton, { width: normalize(size), height: normalize(size), borderRadius: normalize(size / 2) }]}
      >
        <Ionicons name={iconName} size={normalize(22)} color={COLORS.white} />
      </LinearGradient>
    </TouchableOpacity>
  ), []);

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* MAP */}
      <MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/streets-v12"
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
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
          pulsing={{ isEnabled: true, color: COLORS.primary }}
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
      </MapView>

      {/* SEARCH BAR */}
      <View style={[
        styles.searchContainer,
        { top: xplorerFullscreen ? insets.top + 8 : insets.top + 44 + 38 + 8 }
      ]}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={normalize(18)} color={COLORS.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Coaches, gyms, wellness..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={normalize(18)} color={COLORS.grayMuted} />
            </TouchableOpacity>
          )}
        </View>
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
                    <Ionicons name={filter.icon} size={normalize(16)} color={COLORS.dark} />
                    <Text style={styles.chipText}>{filter.label}</Text>
                    {subCount > 0 && (
                      <View style={styles.chipSubBadge}>
                        <Text style={styles.chipSubBadgeText}>{subCount}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.chipInactive}>
                    <Ionicons name={filter.icon} size={normalize(16)} color={COLORS.dark} />
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
        <GradientMapButton
          onPress={toggleXplorerFullscreen}
          iconName={xplorerFullscreen ? 'contract-outline' : 'expand-outline'}
        />
        <GradientMapButton
          onPress={centerOnUser}
          iconName="navigate"
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
                      <Ionicons name={item.icon} size={normalize(20)} color={COLORS.primary} />
                    </View>
                    <Text style={styles.fabPanelLabel}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={normalize(16)} color={COLORS.grayMuted} />
                  </TouchableOpacity>
                ))}
              </BlurView>
            </View>
          ) : null}

          {/* Main FAB pill */}
          <TouchableOpacity activeOpacity={0.85} onPress={() => {
            if (fabActions.length === 1) {
              handleFabAction(fabActions[0].action);
            } else {
              setFabOpen(prev => !prev);
            }
          }}>
            <LinearGradient
              colors={GRADIENTS.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fab}
            >
              <Ionicons name={fabOpen ? 'close' : 'add'} size={normalize(22)} color={COLORS.white} />
              {!fabOpen && <Text style={styles.fabLabel}>Create</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* POPUP */}
      {selectedMarker && (
        selectedMarker.category === 'business' || selectedMarker.category === 'event' || selectedMarker.category === 'spot'
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  // Search Bar
  searchContainer: {
    position: 'absolute',
    left: wp(4),
    right: wp(4),
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: normalize(14),
    paddingHorizontal: wp(3.5),
    height: normalize(44),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  searchInput: {
    flex: 1,
    marginLeft: wp(2.5),
    fontSize: normalize(15),
    color: COLORS.dark,
    paddingVertical: 0,
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
    backgroundColor: 'rgba(14, 191, 138, 0.10)',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  chipInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(3.5),
    paddingVertical: hp(1),
    borderRadius: normalize(20),
    gap: wp(1.5),
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 3,
  },
  chipText: {
    fontSize: normalize(13),
    fontWeight: '600',
    color: COLORS.dark,
  },
  chipSubBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: normalize(8),
    width: normalize(16),
    height: normalize(16),
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSubBadgeText: {
    fontSize: normalize(10),
    fontWeight: '700',
    color: COLORS.white,
  },

  // Map Buttons
  mapButtonsRight: {
    position: 'absolute',
    right: wp(4),
    gap: normalize(10),
    zIndex: 20,
  },
  gradientMapButton: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },

  // FAB
  fabContainer: {
    position: 'absolute',
    left: wp(4),
    alignItems: 'flex-start',
    zIndex: 20,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: normalize(48),
    paddingHorizontal: wp(5),
    borderRadius: normalize(24),
    gap: wp(2),
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabLabel: {
    fontSize: normalize(15),
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 0.3,
  },
  fabPanel: {
    marginBottom: normalize(12),
    borderRadius: normalize(20),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
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
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  fabPanelIcon: {
    width: normalize(36),
    height: normalize(36),
    borderRadius: normalize(12),
    backgroundColor: 'rgba(14, 191, 138, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabPanelLabel: {
    flex: 1,
    fontSize: normalize(15),
    fontWeight: '600',
    color: COLORS.dark,
  },

  // Marker
  markerContainer: { alignItems: 'center' },
  markerShadow: { position: 'absolute', bottom: -2, width: wp(4), height: hp(0.5), backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: wp(2) },
  markerPin: {
    width: wp(11), height: wp(11), borderRadius: wp(5.5),
    borderWidth: 3, borderColor: COLORS.white,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
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
    backgroundColor: COLORS.white, borderRadius: normalize(20),
    padding: wp(4),
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 10,
    zIndex: 30,
  },
  popupClose: { position: 'absolute', top: hp(1.5), right: wp(3), zIndex: 10 },
  popupContent: { flexDirection: 'row' },
  popupAvatar: { width: wp(15), height: wp(15), borderRadius: wp(7.5), marginRight: wp(3) },
  popupInfo: { flex: 1 },
  popupName: { fontSize: normalize(17), fontWeight: '600', color: COLORS.dark, marginBottom: hp(0.5) },
  popupStats: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(0.8) },
  popupStatText: { fontSize: normalize(13), color: COLORS.gray },
  popupStatNumber: { fontWeight: '600', color: COLORS.dark },
  popupStatDot: { marginHorizontal: wp(1.5), color: COLORS.grayMuted },
  popupBio: { fontSize: normalize(13), color: COLORS.gray, lineHeight: normalize(18) },
  popupButton: {
    marginTop: hp(1.8),
    alignSelf: 'stretch',
  },
  popupButtonText: { fontSize: normalize(15), fontWeight: '600', color: COLORS.white, marginRight: wp(1.5) },

  // Business Popup
  businessPopupContainer: {
    position: 'absolute', left: wp(4), right: wp(4),
    backgroundColor: COLORS.white, borderRadius: normalize(20), overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 10,
    zIndex: 30,
  },
  businessPopupClose: {
    position: 'absolute', top: hp(1.5), right: wp(3), zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: wp(4), padding: wp(1),
  },
  businessCover: { width: '100%', height: hp(15) },
  businessContent: { padding: wp(4) },
  businessName: { fontSize: normalize(18), fontWeight: '700', color: COLORS.dark, marginBottom: hp(1.2) },
  businessRow: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(0.8) },
  businessText: { fontSize: normalize(14), color: COLORS.gray, marginLeft: wp(2), flex: 1 },
  expertiseTags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: hp(1.2), marginBottom: hp(0.8) },
  expertiseTag: { backgroundColor: '#E7FCF6', paddingHorizontal: wp(3), paddingVertical: hp(0.8), borderRadius: normalize(16), marginRight: wp(2), marginBottom: hp(1) },
  expertiseTagText: { fontSize: normalize(12), color: COLORS.primary, fontWeight: '500' },

  // Sub-filter bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheetContainer: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: normalize(28), borderTopRightRadius: normalize(28),
    padding: wp(5),
  },
  sheetHandle: {
    width: wp(10), height: 4,
    backgroundColor: COLORS.grayLight, borderRadius: 2,
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
  sheetTitle: { fontSize: normalize(22), fontWeight: '700', color: COLORS.dark },
  sheetSubtitle: { fontSize: normalize(14), color: COLORS.gray, marginBottom: hp(2) },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(2.5) },
  sheetChipActive: {
    paddingHorizontal: wp(4), paddingVertical: hp(1.2),
    borderRadius: normalize(14),
    backgroundColor: 'rgba(14, 191, 138, 0.10)',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  sheetChipInactive: {
    paddingHorizontal: wp(4), paddingVertical: hp(1.2),
    borderRadius: normalize(14),
    backgroundColor: '#F5F5F5',
  },
  sheetChipText: { fontSize: normalize(14), fontWeight: '500', color: COLORS.dark },
  sheetApplyButton: {
    marginTop: hp(3),
    alignSelf: 'stretch',
  },
  sheetApplyText: { fontSize: normalize(16), fontWeight: '600', color: COLORS.white },

  // Permission Modal
  permissionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: wp(5) },
  permissionModal: {
    backgroundColor: COLORS.white, borderRadius: normalize(24), padding: wp(6),
    width: '85%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  permissionIcon: {
    width: wp(18), height: wp(18), borderRadius: wp(9),
    justifyContent: 'center', alignItems: 'center', marginBottom: hp(2),
  },
  permissionTitle: { fontSize: normalize(20), fontWeight: '700', color: COLORS.dark, marginBottom: hp(1), textAlign: 'center' },
  permissionText: { fontSize: normalize(14), color: COLORS.gray, textAlign: 'center', marginBottom: hp(2.5), lineHeight: normalize(20) },
  permissionButton: { alignSelf: 'center' },
  permissionButtonText: { fontSize: normalize(15), fontWeight: '600', color: COLORS.white },
});
