import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Dimensions, ActivityIndicator, TextInput, StatusBar } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS } from '../../config/theme';
import { useTabBar } from '../../context/TabBarContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const baseWidth = 390;

const wp = (percentage: number) => (percentage * SCREEN_WIDTH) / 100;
const hp = (percentage: number) => (percentage * SCREEN_HEIGHT) / 100;
const normalize = (size: number) => Math.round(size * (SCREEN_WIDTH / baseWidth));

const PIN_COLORS = {
  coach: '#0EBF8A',
  gym: '#0EBF8A',
  restaurant: '#00B5C1',
  store: '#0081BE',
};

const MOCK_MARKERS = [
  { id: '1', type: 'coach', category: 'user', name: 'Darlene Robertson', avatar: 'https://randomuser.me/api/portraits/women/1.jpg', bio: 'Certified Personal Trainer | Helping you reach your fitness goals 💪', fans: 1234, posts: 89, coordinate: { latitude: 45.5017, longitude: -73.5673 } },
  { id: '2', type: 'coach', category: 'user', name: 'Marcus Johnson', avatar: 'https://randomuser.me/api/portraits/men/2.jpg', bio: 'Yoga & Meditation Coach | Find your inner peace 🧘', fans: 856, posts: 45, coordinate: { latitude: 45.5087, longitude: -73.5540 } },
  { id: '3', type: 'coach', category: 'user', name: 'Sophie Chen', avatar: 'https://randomuser.me/api/portraits/women/3.jpg', bio: 'CrossFit Level 2 Trainer', fans: 2341, posts: 156, coordinate: { latitude: 45.4950, longitude: -73.5780 } },
  { id: '4', type: 'gym', category: 'business', name: 'Oxygen Fitness', avatar: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400', coverImage: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600', address: '1234 Rue Saint-Denis, Montréal, QC', hours: 'Open 24/7', expertise: ['Bodybuilding', 'CrossFit', 'Cardio'], fans: 5420, coordinate: { latitude: 45.5100, longitude: -73.5600 } },
  { id: '5', type: 'gym', category: 'business', name: 'PowerHouse Gym', avatar: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=400', coverImage: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=600', address: '567 Boulevard René-Lévesque, Montréal, QC', hours: '6:00 AM - 11:00 PM', expertise: ['Powerlifting', 'Strength Training'], fans: 3200, coordinate: { latitude: 45.4980, longitude: -73.5650 } },
  { id: '6', type: 'restaurant', category: 'business', name: 'Green Bowl', avatar: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400', coverImage: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600', address: '890 Avenue du Parc, Montréal, QC', hours: '8:00 AM - 9:00 PM', expertise: ['Healthy Food', 'Smoothies', 'Meal Prep'], fans: 1890, coordinate: { latitude: 45.5050, longitude: -73.5720 } },
  { id: '7', type: 'store', category: 'business', name: 'FitWear MTL', avatar: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400', coverImage: 'https://images.unsplash.com/photo-1556906781-9a412961c28c?w=600', address: '432 Rue Sainte-Catherine, Montréal, QC', hours: '10:00 AM - 8:00 PM', expertise: ['Sportswear', 'Accessories', 'Shoes'], fans: 2100, coordinate: { latitude: 45.4990, longitude: -73.5800 } },
];

const FILTER_OPTIONS = [
  { key: 'coach', label: 'Coaches', icon: 'person' as const, color: PIN_COLORS.coach },
  { key: 'gym', label: 'Gyms', icon: 'barbell' as const, color: PIN_COLORS.gym },
  { key: 'restaurant', label: 'Restaurants', icon: 'restaurant' as const, color: PIN_COLORS.restaurant },
  { key: 'store', label: 'Stores', icon: 'bag-handle' as const, color: PIN_COLORS.store },
  { key: 'event', label: 'Events', icon: 'calendar' as const, color: '#FF6B6B' },
  { key: 'peak', label: 'Peaks', icon: 'videocam' as const, color: '#9B59B6' },
];

const MAX_ACTIVE_FILTERS = 4;

interface XplorerFeedProps {
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void };
  isActive: boolean;
}

export default function XplorerFeed({ navigation, isActive }: XplorerFeedProps) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const hasRequestedPermission = useRef(false);
  const { setBottomBarHidden, showBars } = useTabBar();

  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<string[]>(['coach', 'gym', 'restaurant']);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<typeof MOCK_MARKERS[0] | null>(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [region, setRegion] = useState({
    latitude: 45.5017,
    longitude: -73.5673,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  useEffect(() => {
    if (isActive) {
      // Always hide bottom nav in Xplorer
      setBottomBarHidden(true);

      if (!hasRequestedPermission.current) {
        hasRequestedPermission.current = true;
        requestLocationPermission();
      }
    } else {
      // Show bottom nav when leaving Xplorer
      setBottomBarHidden(false);
      showBars();
    }
     
  }, [isActive, setBottomBarHidden, showBars]);

  const requestLocationPermission = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setShowPermissionModal(true);
      setLoading(false);
      return;
    }
    let currentLocation = await Location.getCurrentPositionAsync({});
    setLocation(currentLocation);
    setRegion({
      latitude: currentLocation.coords.latitude,
      longitude: currentLocation.coords.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    });
    setLoading(false);
  };

  const toggleFilter = (filterKey: string) => {
    setActiveFilters(prev => {
      if (prev.includes(filterKey)) return prev.filter(f => f !== filterKey);
      if (prev.length >= MAX_ACTIVE_FILTERS) return [...prev.slice(1), filterKey];
      return [...prev, filterKey];
    });
  };

  const centerOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500);
    }
  };

  // Zoom out to see all markers (fullscreen/overview mode)
  const zoomToFitAll = () => {
    if (mapRef.current && filteredMarkers.length > 0) {
      const coords = filteredMarkers.map(m => m.coordinate);
      if (location) {
        coords.push({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      }
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 100, right: 50, bottom: 150, left: 50 },
        animated: true,
      });
    }
  };


  type MockMarker = typeof MOCK_MARKERS[0];

  const handleMarkerPress = (marker: MockMarker) => setSelectedMarker(marker);
  const closePopup = () => setSelectedMarker(null);

  const goToProfile = (marker: MockMarker) => {
    closePopup();
    navigation.navigate('UserProfile', { userId: marker.id });
  };

  const filteredMarkers = MOCK_MARKERS.filter(m => activeFilters.includes(m.type));

  const renderCustomMarker = (marker: MockMarker) => {
    const pinColor = PIN_COLORS[marker.type as keyof typeof PIN_COLORS] || PIN_COLORS.coach;
    return (
      <View style={styles.markerContainer}>
        <View style={styles.markerShadow} />
        <View style={[styles.markerPin, { backgroundColor: pinColor }]}>
          <Image source={{ uri: marker.avatar }} style={styles.markerAvatar} />
        </View>
        <View style={[styles.markerPointer, { borderTopColor: pinColor }]} />
      </View>
    );
  };

  const renderUserPopup = () => {
    if (!selectedMarker) return null;
    return (
      <View style={[styles.popupContainer, { bottom: insets.bottom + hp(3) }]}>
        <TouchableOpacity style={styles.popupClose} onPress={closePopup}>
          <Ionicons name="close" size={normalize(20)} color={COLORS.gray} />
        </TouchableOpacity>
        <View style={styles.popupContent}>
          <Image source={{ uri: selectedMarker.avatar }} style={styles.popupAvatar} />
          <View style={styles.popupInfo}>
            <Text style={styles.popupName}>{selectedMarker.name}</Text>
            <View style={styles.popupStats}>
              <Text style={styles.popupStatText}><Text style={styles.popupStatNumber}>{selectedMarker.fans}</Text> fans</Text>
              <Text style={styles.popupStatDot}>•</Text>
              <Text style={styles.popupStatText}><Text style={styles.popupStatNumber}>{selectedMarker.posts}</Text> posts</Text>
            </View>
            <Text style={styles.popupBio} numberOfLines={2}>{selectedMarker.bio}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.popupButton} onPress={() => goToProfile(selectedMarker)}>
          <Text style={styles.popupButtonText}>See Profile</Text>
          <Ionicons name="arrow-forward" size={normalize(18)} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderBusinessPopup = () => {
    if (!selectedMarker) return null;
    return (
      <View style={[styles.businessPopupContainer, { bottom: insets.bottom + hp(3) }]}>
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
          <TouchableOpacity style={styles.popupButton} onPress={() => goToProfile(selectedMarker)}>
            <Text style={styles.popupButtonText}>See Profile</Text>
            <Ionicons name="arrow-forward" size={normalize(18)} color={COLORS.white} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderPopup = () => {
    if (!selectedMarker) return null;
    return selectedMarker.category === 'business' ? renderBusinessPopup() : renderUserPopup();
  };

  const renderFilters = () => (
    <Modal visible={showFilters} transparent animationType="slide" onRequestClose={() => setShowFilters(false)}>
      <TouchableOpacity style={styles.filterModalOverlay} activeOpacity={1} onPress={() => setShowFilters(false)}>
        <View style={[styles.filterModal, { paddingBottom: insets.bottom + hp(3) }]}>
          <View style={styles.filterHandle} />
          <Text style={styles.filterTitle}>Filters</Text>
          <Text style={styles.filterSubtitle}>Select up to {MAX_ACTIVE_FILTERS} categories ({activeFilters.length}/{MAX_ACTIVE_FILTERS})</Text>
          <View style={styles.filterOptions}>
            {FILTER_OPTIONS.map((filter) => {
              const isFilterActive = activeFilters.includes(filter.key);
              return (
                <TouchableOpacity key={filter.key} style={[styles.filterOption, isFilterActive && { backgroundColor: filter.color }]} onPress={() => toggleFilter(filter.key)}>
                  <Ionicons name={filter.icon} size={normalize(24)} color={isFilterActive ? COLORS.white : COLORS.dark} />
                  <Text style={[styles.filterOptionText, isFilterActive && { color: COLORS.white }]}>{filter.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.filterApplyButton} onPress={() => setShowFilters(false)}>
            <Text style={styles.filterApplyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderPermissionModal = () => (
    <Modal visible={showPermissionModal} transparent animationType="fade">
      <View style={styles.permissionOverlay}>
        <View style={styles.permissionModal}>
          <View style={styles.permissionIcon}>
            <Ionicons name="location" size={normalize(40)} color={COLORS.primary} />
          </View>
          <Text style={styles.permissionTitle}>Enable your location</Text>
          <Text style={styles.permissionText}>Come see what your friends nearby are up to</Text>
          <TouchableOpacity style={styles.permissionButton} onPress={async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
              setShowPermissionModal(false);
              let currentLocation = await Location.getCurrentPositionAsync({});
              setLocation(currentLocation);
              setRegion({ latitude: currentLocation.coords.latitude, longitude: currentLocation.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
              setLoading(false);
            }
          }}>
            <Text style={styles.permissionButtonText}>Activate</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Gradient Button Component
  const GradientMapButton = ({ onPress, iconName }: { onPress: () => void; iconName: keyof typeof Ionicons.glyphMap }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <LinearGradient
        colors={GRADIENTS.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientMapButton}
      >
        <Ionicons name={iconName} size={normalize(22)} color={COLORS.white} />
      </LinearGradient>
    </TouchableOpacity>
  );

  if (loading && isActive) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading map...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* MAP - Plein écran */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {filteredMarkers.map((marker) => (
          <Marker key={marker.id} coordinate={marker.coordinate} onPress={() => handleMarkerPress(marker)}>
            {renderCustomMarker(marker)}
          </Marker>
        ))}
      </MapView>

      {/* SEARCH BAR + FILTER - Just below safe area */}
      <View style={[
        styles.searchContainer,
        { top: insets.top + 8 }
      ]}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={normalize(18)} color={COLORS.primary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Coaches, gyms, restos..."
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
        <TouchableOpacity
          style={[styles.filterButton, activeFilters.length > 0 && styles.filterButtonActive]}
          onPress={() => setShowFilters(true)}
        >
          <Ionicons
            name="options-outline"
            size={normalize(20)}
            color={activeFilters.length > 0 ? COLORS.white : COLORS.dark}
          />
          {activeFilters.length > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilters.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* BOUTONS COIN INFÉRIEUR DROIT */}
      <View style={[styles.mapButtonsRight, { bottom: insets.bottom + hp(3) }]}>
        <GradientMapButton onPress={zoomToFitAll} iconName="expand-outline" />
        <GradientMapButton onPress={centerOnUser} iconName="navigate" />
      </View>

      {/* POPUP */}
      {renderPopup()}

      {/* MODALS */}
      {renderFilters()}
      {renderPermissionModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.white },
  loadingText: { marginTop: hp(1.5), fontSize: normalize(16), color: COLORS.gray },
  map: { ...StyleSheet.absoluteFillObject },

  // Search Bar - Compact and elegant
  searchContainer: {
    position: 'absolute',
    left: wp(4),
    right: wp(4),
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: normalize(14),
    paddingHorizontal: wp(3.5),
    height: normalize(44),
    marginRight: wp(2),
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
    fontFamily: 'Poppins-Regular',
    color: COLORS.dark,
    paddingVertical: 0,
  },
  filterButton: {
    width: normalize(44),
    height: normalize(44),
    borderRadius: normalize(14),
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: normalize(18),
    height: normalize(18),
    borderRadius: normalize(9),
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  filterBadgeText: {
    fontSize: normalize(10),
    fontWeight: '700',
    color: COLORS.white,
  },

  // Map Buttons with Gradient
  mapButtonsRight: {
    position: 'absolute',
    right: wp(4),
    gap: normalize(10),
  },
  gradientMapButton: {
    width: normalize(46),
    height: normalize(46),
    borderRadius: normalize(23),
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },

  // Marker
  markerContainer: { alignItems: 'center' },
  markerShadow: { position: 'absolute', bottom: -2, width: wp(4), height: hp(0.5), backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: wp(2) },
  markerPin: { width: wp(11), height: wp(11), borderRadius: wp(5.5), borderWidth: 3, borderColor: COLORS.white, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  markerAvatar: { width: wp(9), height: wp(9), borderRadius: wp(4.5) },
  markerPointer: { width: 0, height: 0, borderLeftWidth: wp(2), borderRightWidth: wp(2), borderTopWidth: hp(1.2), borderLeftColor: 'transparent', borderRightColor: 'transparent', marginTop: -2 },

  // User Popup
  popupContainer: { position: 'absolute', left: wp(4), right: wp(4), backgroundColor: COLORS.white, borderRadius: normalize(16), padding: wp(4), shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
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
  popupButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, paddingVertical: hp(1.5), borderRadius: normalize(12), marginTop: hp(1.8) },
  popupButtonText: { fontSize: normalize(15), fontWeight: '600', color: COLORS.white, marginRight: wp(1.5) },

  // Business Popup
  businessPopupContainer: { position: 'absolute', left: wp(4), right: wp(4), backgroundColor: COLORS.white, borderRadius: normalize(16), overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  businessPopupClose: { position: 'absolute', top: hp(1.5), right: wp(3), zIndex: 10, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: wp(4), padding: wp(1) },
  businessCover: { width: '100%', height: hp(15) },
  businessContent: { padding: wp(4) },
  businessName: { fontSize: normalize(18), fontWeight: '700', color: COLORS.dark, marginBottom: hp(1.2) },
  businessRow: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(0.8) },
  businessText: { fontSize: normalize(14), color: COLORS.gray, marginLeft: wp(2), flex: 1 },
  expertiseTags: { flexDirection: 'row', flexWrap: 'wrap', marginTop: hp(1.2), marginBottom: hp(0.8) },
  expertiseTag: { backgroundColor: '#E7FCF6', paddingHorizontal: wp(3), paddingVertical: hp(0.8), borderRadius: normalize(16), marginRight: wp(2), marginBottom: hp(1) },
  expertiseTagText: { fontSize: normalize(12), color: COLORS.primary, fontWeight: '500' },

  // Filter Modal
  filterModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  filterModal: { backgroundColor: COLORS.white, borderTopLeftRadius: normalize(24), borderTopRightRadius: normalize(24), padding: wp(5) },
  filterHandle: { width: wp(10), height: hp(0.5), backgroundColor: COLORS.grayLight, borderRadius: normalize(2), alignSelf: 'center', marginBottom: hp(2.5) },
  filterTitle: { fontSize: normalize(20), fontWeight: '700', color: COLORS.dark, marginBottom: hp(0.5) },
  filterSubtitle: { fontSize: normalize(14), color: COLORS.gray, marginBottom: hp(2.5) },
  filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(3) },
  filterOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: wp(4), paddingVertical: hp(1.5), borderRadius: normalize(12), backgroundColor: '#F5F5F5', gap: wp(2) },
  filterOptionText: { fontSize: normalize(15), fontWeight: '500', color: COLORS.dark },
  filterApplyButton: { backgroundColor: COLORS.primary, paddingVertical: hp(1.8), borderRadius: normalize(12), alignItems: 'center', marginTop: hp(3) },
  filterApplyText: { fontSize: normalize(16), fontWeight: '600', color: COLORS.white },

  // Permission Modal
  permissionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: wp(5) },
  permissionModal: { backgroundColor: COLORS.white, borderRadius: normalize(20), padding: wp(6), width: '85%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  permissionIcon: { width: wp(16), height: wp(16), borderRadius: wp(8), backgroundColor: '#E7FCF6', justifyContent: 'center', alignItems: 'center', marginBottom: hp(2) },
  permissionTitle: { fontSize: normalize(20), fontWeight: '700', color: COLORS.dark, marginBottom: hp(1), textAlign: 'center' },
  permissionText: { fontSize: normalize(14), color: COLORS.gray, textAlign: 'center', marginBottom: hp(2.5), lineHeight: normalize(20) },
  permissionButton: { backgroundColor: COLORS.primary, paddingVertical: hp(1.5), paddingHorizontal: wp(10), borderRadius: normalize(25) },
  permissionButtonText: { fontSize: normalize(15), fontWeight: '600', color: COLORS.white },
});