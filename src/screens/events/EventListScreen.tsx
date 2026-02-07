/**
 * EventListScreen
 * Browse and discover events on map
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  FlatList,
  RefreshControl,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Mapbox, { MapView, Camera, MarkerView, LocationPuck } from '@rnmapbox/maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { MapListSkeleton } from '../../components/skeleton';
import { formatDateTimeRelative } from '../../utils/dateFormatters';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
if (mapboxToken) Mapbox.setAccessToken(mapboxToken);

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

interface EventCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

interface Event {
  id: string;
  title: string;
  description?: string;
  category: EventCategory;
  organizer: {
    id: string;
    username: string;
    full_name?: string;
    profile_picture_url?: string;
    is_verified: boolean;
  };
  location_name: string;
  coordinates: { lat: number; lng: number };
  route_points?: { lat: number; lng: number }[];
  distance_km?: number;
  start_date: string;
  end_date?: string;
  price_cents?: number;
  max_participants?: number;
  participant_count: number;
  cover_image_url?: string;
  is_free: boolean;
  difficulty_level?: 'easy' | 'moderate' | 'hard' | 'expert';
  created_at: string;
}

// Main visible categories (max 3 shown + More button)
const VISIBLE_CATEGORIES: EventCategory[] = [
  { id: '1', name: 'All', slug: 'all', icon: 'grid', color: '#FF6B35' },
  { id: '2', name: 'Running', slug: 'running', icon: 'walk', color: '#4CAF50' },
  { id: '3', name: 'Cycling', slug: 'cycling', icon: 'bicycle', color: '#2196F3' },
];

// All categories for the expanded filter drawer
const ALL_CATEGORIES: EventCategory[] = [
  { id: '1', name: 'All', slug: 'all', icon: 'grid', color: '#FF6B35' },
  { id: '2', name: 'Running', slug: 'running', icon: 'walk', color: '#4CAF50' },
  { id: '3', name: 'Hiking', slug: 'hiking', icon: 'trail-sign', color: '#8BC34A' },
  { id: '4', name: 'Cycling', slug: 'cycling', icon: 'bicycle', color: '#2196F3' },
  { id: '5', name: 'Soccer', slug: 'soccer', icon: 'football', color: '#4CAF50' },
  { id: '6', name: 'Tennis', slug: 'tennis', icon: 'tennisball', color: '#CDDC39' },
  { id: '7', name: 'Padel', slug: 'padel', icon: 'tennisball', color: '#00BCD4' },
  { id: '8', name: 'Yoga', slug: 'yoga', icon: 'body', color: '#9C27B0' },
  { id: '9', name: 'CrossFit', slug: 'crossfit', icon: 'barbell', color: '#F44336' },
  { id: '10', name: 'Swimming', slug: 'swimming', icon: 'water', color: '#00ACC1' },
  { id: '11', name: 'Basketball', slug: 'basketball', icon: 'basketball', color: '#FF9800' },
  { id: '12', name: 'Martial Arts', slug: 'martial-arts', icon: 'hand-left', color: '#E91E63' },
];

const DIFFICULTY_COLORS = {
  easy: '#4CAF50',
  moderate: '#FF9800',
  hard: '#F44336',
  expert: '#9C27B0',
};

export default function EventListScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const { formatAmount } = useCurrency();
  const { showError } = useSmuppyAlert();

  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<EventCategory>(ALL_CATEGORIES[0]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Filter drawer state
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const filterDrawerAnim = useRef(new Animated.Value(0)).current;

  const mapRef = useRef<MapView>(null);
  const cardScrollX = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Check if selected category is in visible list
  const isSelectedInVisible = VISIBLE_CATEGORIES.some(c => c.id === selectedCategory.id);

  // Toggle filter drawer with animation
  const toggleFilterDrawer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (showFilterDrawer) {
      Animated.spring(filterDrawerAnim, {
        toValue: 0,
        damping: 20,
        stiffness: 200,
        useNativeDriver: true,
      }).start(() => setShowFilterDrawer(false));
    } else {
      setShowFilterDrawer(true);
      Animated.spring(filterDrawerAnim, {
        toValue: 1,
        damping: 20,
        stiffness: 200,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleSelectCategory = (category: EventCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedCategory(category);
    setIsLoading(true);
    if (showFilterDrawer) {
      toggleFilterDrawer();
    }
  };

  useEffect(() => {
    getUserLocation();
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showError('Permission needed', 'Please allow location access to discover nearby events.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (error) {
      if (__DEV__) console.warn('Get location error:', error);
    }
  };

  const loadEvents = async () => {
    try {
      const params: Record<string, unknown> = {
        limit: 20,
      };

      if (selectedCategory.slug !== 'all') {
        params.category = selectedCategory.slug;
      }

      if (userLocation) {
        params.lat = userLocation.lat;
        params.lng = userLocation.lng;
        params.radius = 50; // 50km radius
      }

      const response = await awsAPI.getEvents(params);

      if (response.success) {
        setEvents((response.events || []) as unknown as Event[]);
      }
    } catch (error) {
      if (__DEV__) console.warn('Load events error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadEvents();
  };

  const handleMarkerPress = (event: Event) => {
    setSelectedEvent(event);
    const index = events.findIndex((e) => e.id === event.id);
    if (index !== -1 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index, animated: true });
    }
  };

  // Glass-morphism filter chip
  const renderGlassFilterChip = (item: EventCategory, compact: boolean = false) => {
    const isSelected = selectedCategory.id === item.id;
    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.glassChip,
          isSelected && styles.glassChipSelected,
          compact && styles.glassChipCompact,
        ]}
        onPress={() => handleSelectCategory(item)}
        activeOpacity={0.8}
      >
        <BlurView
          intensity={isSelected ? 40 : 25}
          tint="dark"
          style={[
            styles.glassChipBlur,
            isSelected && { backgroundColor: `${item.color}40` },
          ]}
        >
          <View style={[styles.glassChipIcon, { backgroundColor: `${item.color}30` }]}>
            <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={compact ? 14 : 16} color={isSelected ? '#fff' : item.color} />
          </View>
          <Text style={[
            styles.glassChipText,
            isSelected && styles.glassChipTextSelected,
            compact && styles.glassChipTextCompact,
          ]}>
            {item.name}
          </Text>
          {isSelected && (
            <View style={[styles.glassChipIndicator, { backgroundColor: item.color }]} />
          )}
        </BlurView>
      </TouchableOpacity>
    );
  };

  // More button for expanding filters
  const renderMoreButton = () => (
    <TouchableOpacity
      style={[styles.glassChip, styles.moreButton]}
      onPress={toggleFilterDrawer}
      activeOpacity={0.8}
    >
      <BlurView intensity={25} tint="dark" style={styles.glassChipBlur}>
        <Ionicons
          name={showFilterDrawer ? 'close' : 'options'}
          size={18}
          color="#FF6B35"
        />
        <Text style={styles.moreButtonText}>
          {showFilterDrawer ? 'Close' : 'More'}
        </Text>
      </BlurView>
    </TouchableOpacity>
  );

  // Filter Drawer Modal
  const renderFilterDrawer = () => {
    const translateY = filterDrawerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [300, 0],
    });

    const opacity = filterDrawerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    });

    if (!showFilterDrawer) return null;

    return (
      <Modal transparent visible={showFilterDrawer} animationType="none">
        <Animated.View style={[styles.filterDrawerOverlay, { opacity }]}>
          <TouchableOpacity
            style={styles.filterDrawerBackdrop}
            activeOpacity={1}
            onPress={toggleFilterDrawer}
          />
          <Animated.View style={[styles.filterDrawer, { transform: [{ translateY }] }]}>
            <BlurView intensity={80} tint="dark" style={styles.filterDrawerBlur}>
              {/* Handle */}
              <View style={styles.filterDrawerHandle} />

              {/* Header */}
              <View style={styles.filterDrawerHeader}>
                <Text style={styles.filterDrawerTitle}>Filter by Activity</Text>
                <TouchableOpacity onPress={toggleFilterDrawer}>
                  <Ionicons name="close-circle" size={28} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Categories Grid */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.filterDrawerContent}
              >
                <View style={styles.filterDrawerGrid}>
                  {ALL_CATEGORIES.map((category) => {
                    const isSelected = selectedCategory.id === category.id;
                    return (
                      <TouchableOpacity
                        key={category.id}
                        style={[
                          styles.filterDrawerItem,
                          isSelected && styles.filterDrawerItemSelected,
                        ]}
                        onPress={() => handleSelectCategory(category)}
                        activeOpacity={0.8}
                      >
                        <View style={[
                          styles.filterDrawerItemIcon,
                          { backgroundColor: `${category.color}20` },
                          isSelected && { backgroundColor: category.color },
                        ]}>
                          <Ionicons
                            name={category.icon as keyof typeof Ionicons.glyphMap}
                            size={24}
                            color={isSelected ? '#fff' : category.color}
                          />
                        </View>
                        <Text style={[
                          styles.filterDrawerItemText,
                          isSelected && styles.filterDrawerItemTextSelected,
                        ]}>
                          {category.name}
                        </Text>
                        {isSelected && (
                          <View style={[styles.filterDrawerCheckmark, { backgroundColor: category.color }]}>
                            <Ionicons name="checkmark" size={12} color="#fff" />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </BlurView>
          </Animated.View>
        </Animated.View>
      </Modal>
    );
  };

  const renderEventCard = ({ item, index }: { item: Event; index: number }) => {
    const inputRange = [(index - 1) * CARD_WIDTH, index * CARD_WIDTH, (index + 1) * CARD_WIDTH];

    const scale = cardScrollX.interpolate({
      inputRange,
      outputRange: [0.9, 1, 0.9],
      extrapolate: 'clamp',
    });

    const isFull = item.max_participants && item.participant_count >= item.max_participants;

    return (
      <Animated.View style={[styles.eventCard, viewMode === 'map' ? { transform: [{ scale }] } : undefined]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ActivityDetail', { activityId: item.id, activityType: 'event' })}
        >
          {/* Cover Image */}
          <View style={styles.cardImageContainer}>
            {item.cover_image_url ? (
              <Image source={{ uri: item.cover_image_url }} style={styles.cardImage} />
            ) : (
              <LinearGradient
                colors={[item.category.color, `${item.category.color}66`]}
                style={styles.cardImage}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.cardImageOverlay}
            />

            {/* Category Badge */}
            <View style={styles.categoryBadge}>
              <Ionicons name={item.category.icon as keyof typeof Ionicons.glyphMap} size={14} color="#fff" />
              <Text style={styles.categoryBadgeText}>{item.category.name}</Text>
            </View>

            {/* Difficulty */}
            {item.difficulty_level && (
              <View
                style={[
                  styles.difficultyBadge,
                  { backgroundColor: DIFFICULTY_COLORS[item.difficulty_level] },
                ]}
              >
                <Text style={styles.difficultyText}>
                  {item.difficulty_level.charAt(0).toUpperCase() + item.difficulty_level.slice(1)}
                </Text>
              </View>
            )}

            {/* Price/Free */}
            <View style={styles.priceBadge}>
              <Text style={styles.priceText}>
                {item.is_free ? 'Free' : formatAmount(item.price_cents || 0)}
              </Text>
            </View>
          </View>

          {/* Card Content */}
          <View style={styles.cardContent}>
            {/* Title */}
            <Text style={styles.eventTitle} numberOfLines={2}>
              {item.title}
            </Text>

            {/* Organizer */}
            <View style={styles.organizerRow}>
              <Image
                source={{
                  uri:
                    item.organizer.profile_picture_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(item.organizer.username)}&background=random`,
                }}
                style={styles.organizerAvatar}
              />
              <Text style={styles.organizerName}>{item.organizer.full_name || item.organizer.username}</Text>
              {item.organizer.is_verified && (
                <Ionicons name="checkmark-circle" size={12} color="#00BFFF" />
              )}
            </View>

            {/* Details */}
            <View style={styles.detailsRow}>
              <View style={styles.detail}>
                <Ionicons name="calendar" size={14} color="#888" />
                <Text style={styles.detailText}>{formatDateTimeRelative(item.start_date)}</Text>
              </View>

              <View style={styles.detail}>
                <Ionicons name="location" size={14} color="#888" />
                <Text style={styles.detailText} numberOfLines={1}>
                  {item.location_name}
                </Text>
              </View>
            </View>

            {/* Distance if route event */}
            {item.distance_km && (
              <View style={styles.distanceRow}>
                <Ionicons name="map" size={14} color={item.category.color} />
                <Text style={[styles.distanceText, { color: item.category.color }]}>
                  {item.distance_km.toFixed(1)} km
                </Text>
              </View>
            )}

            {/* Footer */}
            <View style={styles.cardFooter}>
              <View style={styles.participantsInfo}>
                <Ionicons name="people" size={16} color="#FF6B35" />
                <Text style={styles.participantsText}>
                  {item.participant_count}
                  {item.max_participants ? ` / ${item.max_participants}` : ''} going
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.joinButton, isFull ? styles.joinButtonDisabled : undefined]}
                disabled={isFull ? true : false}
                onPress={() => navigation.navigate('ActivityDetail', { activityId: item.id, activityType: 'event' })}
              >
                <LinearGradient
                  colors={isFull ? ['#666', '#444'] : ['#FF6B35', '#FF4500']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.joinGradient}
                >
                  <Text style={styles.joinText}>{isFull ? 'Full' : 'Join'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderMapMarker = (event: Event) => (
    <MarkerView
      key={event.id}
      coordinate={[event.coordinates.lng, event.coordinates.lat]}
    >
      <TouchableOpacity onPress={() => handleMarkerPress(event)}>
        <View
          style={[
            styles.mapMarker,
            { backgroundColor: event.category.color },
            selectedEvent?.id === event.id && styles.mapMarkerSelected,
          ]}
        >
          <Ionicons name={event.category.icon as keyof typeof Ionicons.glyphMap} size={16} color="#fff" />
        </View>
      </TouchableOpacity>
    </MarkerView>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Xplorer</Text>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.viewToggle, viewMode === 'map' && styles.viewToggleActive]}
              onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
            >
              <Ionicons name={viewMode === 'list' ? 'map' : 'list'} size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.createButton}
              onPress={() => navigation.navigate('CreateActivity')}
            >
              <LinearGradient
                colors={['#FF6B35', '#FF4500']}
                style={styles.createGradient}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* Glass-morphism Filter Bar */}
        <View style={styles.filterBar}>
          <BlurView intensity={30} tint="dark" style={styles.filterBarBlur}>
            {/* Visible Categories (max 3) */}
            {VISIBLE_CATEGORIES.map((category) => renderGlassFilterChip(category, true))}

            {/* Show selected category if it's not in visible list */}
            {!isSelectedInVisible && renderGlassFilterChip(selectedCategory, true)}

            {/* More Button */}
            {renderMoreButton()}
          </BlurView>
        </View>

        {/* Active Filter Indicator */}
        {selectedCategory.slug !== 'all' && (
          <View style={styles.activeFilterIndicator}>
            <View style={[styles.activeFilterDot, { backgroundColor: selectedCategory.color }]} />
            <Text style={styles.activeFilterText}>
              Showing: <Text style={{ color: selectedCategory.color, fontWeight: '700' }}>{selectedCategory.name}</Text>
            </Text>
            <TouchableOpacity
              style={styles.clearFilterButton}
              onPress={() => handleSelectCategory(ALL_CATEGORIES[0])}
            >
              <Ionicons name="close-circle" size={18} color="#666" />
            </TouchableOpacity>
          </View>
        )}

        {/* Filter Drawer */}
        {renderFilterDrawer()}

        {viewMode === 'map' ? (
          /* Map View */
          <View style={styles.mapContainer}>
            <MapView
              ref={mapRef}
              style={styles.map}
            >
              <Camera
                centerCoordinate={[userLocation?.lng || 2.3522, userLocation?.lat || 48.8566]}
                zoomLevel={12}
              />
              <LocationPuck />
              {events.map(renderMapMarker)}
            </MapView>

            {/* Event Cards Carousel */}
            <View style={styles.mapCarousel}>
              <Animated.FlatList
                ref={flatListRef}
                data={events}
                keyExtractor={(item) => item.id}
                renderItem={renderEventCard}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={CARD_WIDTH + 16}
                decelerationRate="fast"
                contentContainerStyle={styles.mapCarouselContent}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: cardScrollX } } }],
                  { useNativeDriver: true }
                )}
              />
            </View>
          </View>
        ) : (
          /* List View */
          <FlatList
            data={events}
            keyExtractor={(item) => item.id}
            renderItem={renderEventCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews={true}
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={8}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FF6B35"
              />
            }
            ListEmptyComponent={
              isLoading ? (
                <MapListSkeleton />
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="calendar-outline" size={64} color="#444" />
                  <Text style={styles.emptyTitle}>No Events Found</Text>
                  <Text style={styles.emptySubtitle}>
                    Be the first to create an event in this area!
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={() => navigation.navigate('CreateActivity')}
                  >
                    <LinearGradient
                      colors={['#FF6B35', '#FF4500']}
                      style={styles.emptyButtonGradient}
                    >
                      <Text style={styles.emptyButtonText}>Create Event</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleActive: {
    backgroundColor: 'rgba(255,107,53,0.3)',
  },
  createButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  createGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Glass-morphism Filter Bar
  filterBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  filterBarBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: 'rgba(30,30,50,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  glassChip: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  glassChipCompact: {
    flex: 1,
  },
  glassChipSelected: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  glassChipBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
  },
  glassChipIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  glassChipTextCompact: {
    fontSize: 11,
  },
  glassChipTextSelected: {
    color: '#fff',
  },
  glassChipIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
  moreButton: {
    minWidth: 70,
  },
  moreButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B35',
  },

  // Active Filter Indicator
  activeFilterIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  activeFilterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeFilterText: {
    fontSize: 13,
    color: '#888',
  },
  clearFilterButton: {
    padding: 4,
  },

  // Filter Drawer
  filterDrawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filterDrawerBackdrop: {
    flex: 1,
  },
  filterDrawer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    maxHeight: height * 0.6,
  },
  filterDrawerBlur: {
    backgroundColor: 'rgba(20,20,35,0.95)',
    paddingBottom: 40,
  },
  filterDrawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  filterDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  filterDrawerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  filterDrawerContent: {
    padding: 16,
  },
  filterDrawerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterDrawerItem: {
    width: (width - 56) / 3,
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    position: 'relative',
  },
  filterDrawerItemSelected: {
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  filterDrawerItemIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  filterDrawerItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    textAlign: 'center',
  },
  filterDrawerItemTextSelected: {
    color: '#fff',
  },
  filterDrawerCheckmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 16,
  },
  eventCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    overflow: 'hidden',
    width: CARD_WIDTH,
  },
  cardImageContainer: {
    height: 140,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  categoryBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  difficultyBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  difficultyText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
  },
  cardContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 6,
  },
  organizerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  organizerName: {
    fontSize: 12,
    color: '#888',
  },
  detailsRow: {
    gap: 6,
    marginBottom: 8,
  },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 13,
    color: '#888',
    flex: 1,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  distanceText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  participantsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  participantsText: {
    fontSize: 13,
    color: '#888',
  },
  joinButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  joinButtonDisabled: {
    opacity: 0.6,
  },
  joinGradient: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  joinText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  mapMarkerSelected: {
    transform: [{ scale: 1.2 }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  mapCarousel: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
  },
  mapCarouselContent: {
    paddingHorizontal: 24,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 24,
    borderRadius: 25,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
