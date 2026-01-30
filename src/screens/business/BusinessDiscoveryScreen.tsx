/**
 * BusinessDiscoveryScreen
 * Discover local businesses on map and list view
 * Integrated with app categories (Fitness, Wellness, Sports, etc.)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Mapbox, { MapView, Camera, MarkerView, LocationPuck } from '@rnmapbox/maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { DARK_COLORS as COLORS, GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';

const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
if (mapboxToken) Mapbox.setAccessToken(mapboxToken);

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width - 48;

// Business categories aligned with app's sports/wellness categories
interface BusinessCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
}

const BUSINESS_CATEGORIES: BusinessCategory[] = [
  { id: 'all', name: 'All', slug: 'all', icon: 'grid', color: '#FF6B35', description: 'All businesses' },
  { id: 'gym', name: 'Gym', slug: 'gym', icon: 'barbell', color: '#E74C3C', description: 'Fitness centers & gyms' },
  { id: 'yoga', name: 'Yoga Studio', slug: 'yoga', icon: 'body', color: '#9B59B6', description: 'Yoga & meditation' },
  { id: 'crossfit', name: 'CrossFit', slug: 'crossfit', icon: 'fitness', color: '#F39C12', description: 'CrossFit boxes' },
  { id: 'martial_arts', name: 'Martial Arts', slug: 'martial_arts', icon: 'hand-left', color: '#E91E63', description: 'MMA, Boxing, BJJ' },
  { id: 'swimming', name: 'Pool', slug: 'swimming', icon: 'water', color: '#00BCD4', description: 'Swimming pools' },
  { id: 'tennis', name: 'Tennis', slug: 'tennis', icon: 'tennisball', color: '#CDDC39', description: 'Tennis courts' },
  { id: 'padel', name: 'Padel', slug: 'padel', icon: 'tennisball', color: '#4CAF50', description: 'Padel courts' },
  { id: 'climbing', name: 'Climbing', slug: 'climbing', icon: 'trending-up', color: '#795548', description: 'Climbing gyms' },
  { id: 'spa', name: 'Spa & Wellness', slug: 'spa', icon: 'leaf', color: '#26A69A', description: 'Spa & recovery' },
  { id: 'nutrition', name: 'Nutrition', slug: 'nutrition', icon: 'nutrition', color: '#8BC34A', description: 'Nutrition stores' },
  { id: 'sports_shop', name: 'Sports Shop', slug: 'sports_shop', icon: 'shirt', color: '#FF5722', description: 'Equipment & gear' },
];

interface Business {
  id: string;
  name: string;
  username: string;
  logo_url?: string;
  cover_url?: string;
  category: BusinessCategory;
  location: {
    name: string;
    city: string;
    coordinates: { lat: number; lng: number };
    distance_km?: number;
  };
  stats: {
    rating: number;
    reviews: number;
    followers: number;
  };
  is_verified: boolean;
  is_open: boolean;
  price_range: 'budget' | 'moderate' | 'premium' | 'luxury';
  highlights?: string[];
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a3646' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#0e1626' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
];

export default function BusinessDiscoveryScreen({ navigation }: { navigation: any }) {
  const { formatAmount: _formatAmount } = useCurrency();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [selectedCategory, setSelectedCategory] = useState<BusinessCategory>(BUSINESS_CATEGORIES[0]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [filterOpen, setFilterOpen] = useState<boolean | null>(null);
  const [filterRating, setFilterRating] = useState<number>(0);
  const [filterPriceRange, setFilterPriceRange] = useState<string[]>([]);

  const mapRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);
  const cardScrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getUserLocation();
  }, []);

  useEffect(() => {
    loadBusinesses();
  }, [selectedCategory, userLocation, filterOpen, filterRating, filterPriceRange]);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (error) {
      console.error('Get location error:', error);
    }
  };

  const loadBusinesses = async () => {
    try {
      const params: any = {
        limit: 30,
      };

      if (selectedCategory.slug !== 'all') {
        params.category = selectedCategory.slug;
      }

      if (userLocation) {
        params.lat = userLocation.lat;
        params.lng = userLocation.lng;
        params.radius = 25; // 25km radius
      }

      if (filterOpen !== null) {
        params.is_open = filterOpen;
      }

      if (filterRating > 0) {
        params.min_rating = filterRating;
      }

      if (filterPriceRange.length > 0) {
        params.price_range = filterPriceRange;
      }

      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const response = await awsAPI.discoverBusinesses(params);

      if (response.success) {
        setBusinesses(response.businesses || []);
      }
    } catch (error) {
      console.error('Load businesses error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadBusinesses();
  };

  const handleSearch = useCallback(() => {
    setIsLoading(true);
    loadBusinesses();
  }, [searchQuery]);

  const handleSelectCategory = (category: BusinessCategory) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(category);
    setIsLoading(true);
  };

  const handleMarkerPress = (business: Business) => {
    setSelectedBusiness(business);
    const index = businesses.findIndex((b) => b.id === business.id);
    if (index !== -1 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index, animated: true });
    }
  };

  const handleBusinessPress = (business: Business) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('BusinessProfile', { businessId: business.id });
  };

  const renderStars = (rating: number, size: number = 12) => (
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= rating ? 'star' : star - 0.5 <= rating ? 'star-half' : 'star-outline'}
          size={size}
          color="#FFD700"
        />
      ))}
    </View>
  );

  const renderCategoryChip = (category: BusinessCategory) => {
    const isSelected = selectedCategory.id === category.id;
    return (
      <TouchableOpacity
        key={category.id}
        style={[styles.categoryChip, isSelected && { backgroundColor: category.color + '30', borderColor: category.color }]}
        onPress={() => handleSelectCategory(category)}
        activeOpacity={0.8}
      >
        <View style={[styles.categoryChipIcon, { backgroundColor: category.color + '20' }]}>
          <Ionicons name={category.icon as any} size={14} color={isSelected ? category.color : COLORS.gray} />
        </View>
        <Text style={[styles.categoryChipText, isSelected && { color: category.color }]}>
          {category.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderBusinessCard = ({ item, index }: { item: Business; index: number }) => {
    const inputRange = [(index - 1) * CARD_WIDTH, index * CARD_WIDTH, (index + 1) * CARD_WIDTH];

    const scale = viewMode === 'map' ? cardScrollX.interpolate({
      inputRange,
      outputRange: [0.9, 1, 0.9],
      extrapolate: 'clamp',
    }) : 1;

    return (
      <Animated.View style={[styles.businessCard, viewMode === 'map' && { transform: [{ scale }] }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handleBusinessPress(item)}
        >
          {/* Cover/Logo Header */}
          <View style={styles.cardHeader}>
            {item.cover_url ? (
              <Image source={{ uri: item.cover_url }} style={styles.cardCover} />
            ) : (
              <LinearGradient
                colors={[item.category.color, `${item.category.color}66`]}
                style={styles.cardCover}
              />
            )}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={styles.cardCoverOverlay}
            />

            {/* Logo */}
            <View style={styles.cardLogoContainer}>
              <Image
                source={{
                  uri: item.logo_url ||
                    `https://ui-avatars.com/api/?name=${item.name}&background=${item.category.color.replace('#', '')}&size=80`,
                }}
                style={styles.cardLogo}
              />
            </View>

            {/* Badges */}
            <View style={styles.cardBadges}>
              <View style={[styles.categoryBadge, { backgroundColor: item.category.color }]}>
                <Ionicons name={item.category.icon as any} size={10} color="#fff" />
                <Text style={styles.categoryBadgeText}>{item.category.name}</Text>
              </View>
              {item.is_verified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#00BFFF" />
                </View>
              )}
            </View>

            {/* Open/Closed Status */}
            <View style={[styles.statusBadge, item.is_open ? styles.statusOpen : styles.statusClosed]}>
              <View style={[styles.statusDot, { backgroundColor: item.is_open ? '#4CAF50' : '#F44336' }]} />
              <Text style={styles.statusText}>{item.is_open ? 'Open' : 'Closed'}</Text>
            </View>
          </View>

          {/* Card Content */}
          <View style={styles.cardContent}>
            <View style={styles.cardNameRow}>
              <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.cardPriceRange}>
                {item.price_range === 'budget' ? '€' :
                  item.price_range === 'moderate' ? '€€' :
                  item.price_range === 'premium' ? '€€€' : '€€€€'}
              </Text>
            </View>

            <Text style={styles.cardUsername}>@{item.username}</Text>

            {/* Rating & Location */}
            <View style={styles.cardMeta}>
              <View style={styles.cardMetaItem}>
                {renderStars(item.stats.rating)}
                <Text style={styles.cardRatingText}>
                  {item.stats.rating.toFixed(1)} ({item.stats.reviews})
                </Text>
              </View>
              <View style={styles.cardMetaDivider} />
              <View style={styles.cardMetaItem}>
                <Ionicons name="location-outline" size={14} color={COLORS.gray} />
                <Text style={styles.cardLocationText}>
                  {item.location.distance_km
                    ? `${item.location.distance_km.toFixed(1)} km`
                    : item.location.city}
                </Text>
              </View>
            </View>

            {/* Highlights */}
            {item.highlights && item.highlights.length > 0 && (
              <View style={styles.cardHighlights}>
                {item.highlights.slice(0, 3).map((highlight, i) => (
                  <View key={i} style={styles.highlightChip}>
                    <Text style={styles.highlightText}>{highlight}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Footer */}
            <View style={styles.cardFooter}>
              <View style={styles.cardFollowers}>
                <Ionicons name="people-outline" size={14} color={COLORS.gray} />
                <Text style={styles.cardFollowersText}>{item.stats.followers} followers</Text>
              </View>
              <TouchableOpacity
                style={styles.viewButton}
                onPress={() => handleBusinessPress(item)}
              >
                <LinearGradient colors={GRADIENTS.primary} style={styles.viewGradient}>
                  <Text style={styles.viewButtonText}>View</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderMapMarker = (business: Business) => (
    <MarkerView
      key={business.id}
      coordinate={[business.location.coordinates.lng, business.location.coordinates.lat]}
    >
      <TouchableOpacity onPress={() => handleMarkerPress(business)}>
        <View
          style={[
            styles.mapMarker,
            { backgroundColor: business.category.color },
            selectedBusiness?.id === business.id && styles.mapMarkerSelected,
          ]}
        >
          <Ionicons name={business.category.icon as any} size={16} color="#fff" />
        </View>
      </TouchableOpacity>
    </MarkerView>
  );

  const renderFiltersModal = () => (
    <Modal visible={showFilters} animationType="slide" transparent>
      <View style={styles.filtersOverlay}>
        <TouchableOpacity style={styles.filtersBackdrop} onPress={() => setShowFilters(false)} />
        <View style={styles.filtersSheet}>
          <BlurView intensity={80} tint="dark" style={styles.filtersBlur}>
            <View style={styles.filtersHandle} />
            <View style={styles.filtersHeader}>
              <Text style={styles.filtersTitle}>Filters</Text>
              <TouchableOpacity onPress={() => {
                setFilterOpen(null);
                setFilterRating(0);
                setFilterPriceRange([]);
              }}>
                <Text style={styles.filtersClear}>Clear All</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filtersContent} showsVerticalScrollIndicator={false}>
              {/* Open Now */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Status</Text>
                <View style={styles.filterOptions}>
                  <TouchableOpacity
                    style={[styles.filterOption, filterOpen === null && styles.filterOptionActive]}
                    onPress={() => setFilterOpen(null)}
                  >
                    <Text style={[styles.filterOptionText, filterOpen === null && styles.filterOptionTextActive]}>
                      All
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.filterOption, filterOpen === true && styles.filterOptionActive]}
                    onPress={() => setFilterOpen(true)}
                  >
                    <Text style={[styles.filterOptionText, filterOpen === true && styles.filterOptionTextActive]}>
                      Open Now
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Rating */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Minimum Rating</Text>
                <View style={styles.filterOptions}>
                  {[0, 3, 3.5, 4, 4.5].map((rating) => (
                    <TouchableOpacity
                      key={rating}
                      style={[styles.filterOption, filterRating === rating && styles.filterOptionActive]}
                      onPress={() => setFilterRating(rating)}
                    >
                      <Text style={[styles.filterOptionText, filterRating === rating && styles.filterOptionTextActive]}>
                        {rating === 0 ? 'Any' : `${rating}+`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Price Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Price Range</Text>
                <View style={styles.filterOptions}>
                  {[
                    { key: 'budget', label: '€' },
                    { key: 'moderate', label: '€€' },
                    { key: 'premium', label: '€€€' },
                    { key: 'luxury', label: '€€€€' },
                  ].map((price) => (
                    <TouchableOpacity
                      key={price.key}
                      style={[
                        styles.filterOption,
                        filterPriceRange.includes(price.key) && styles.filterOptionActive,
                      ]}
                      onPress={() => {
                        if (filterPriceRange.includes(price.key)) {
                          setFilterPriceRange(filterPriceRange.filter((p) => p !== price.key));
                        } else {
                          setFilterPriceRange([...filterPriceRange, price.key]);
                        }
                      }}
                    >
                      <Text style={[
                        styles.filterOptionText,
                        filterPriceRange.includes(price.key) && styles.filterOptionTextActive,
                      ]}>
                        {price.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Categories Grid */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Category</Text>
                <View style={styles.categoriesGrid}>
                  {BUSINESS_CATEGORIES.map((category) => {
                    const isSelected = selectedCategory.id === category.id;
                    return (
                      <TouchableOpacity
                        key={category.id}
                        style={[
                          styles.categoryGridItem,
                          isSelected && styles.categoryGridItemSelected,
                          isSelected && { borderColor: category.color },
                        ]}
                        onPress={() => {
                          handleSelectCategory(category);
                          setShowFilters(false);
                        }}
                      >
                        <View style={[styles.categoryGridIcon, { backgroundColor: category.color + '20' }]}>
                          <Ionicons
                            name={category.icon as any}
                            size={24}
                            color={isSelected ? category.color : COLORS.gray}
                          />
                        </View>
                        <Text style={[
                          styles.categoryGridText,
                          isSelected && { color: category.color },
                        ]}>
                          {category.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            {/* Apply Button */}
            <View style={styles.filtersFooter}>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => {
                  setShowFilters(false);
                  setIsLoading(true);
                  loadBusinesses();
                }}
              >
                <LinearGradient colors={GRADIENTS.primary} style={styles.applyGradient}>
                  <Text style={styles.applyButtonText}>Apply Filters</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </View>
    </Modal>
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
          <Text style={styles.headerTitle}>Discover</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[styles.viewToggle, viewMode === 'map' && styles.viewToggleActive]}
              onPress={() => setViewMode(viewMode === 'list' ? 'map' : 'list')}
            >
              <Ionicons name={viewMode === 'list' ? 'map' : 'list'} size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={COLORS.gray} />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search gyms, studios, shops..."
              placeholderTextColor={COLORS.gray}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.gray} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.filterButton, (filterOpen !== null || filterRating > 0 || filterPriceRange.length > 0) && styles.filterButtonActive]}
            onPress={() => setShowFilters(true)}
          >
            <Ionicons name="options" size={20} color={filterOpen !== null || filterRating > 0 || filterPriceRange.length > 0 ? COLORS.primary : '#fff'} />
          </TouchableOpacity>
        </View>

        {/* Category Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
        >
          {BUSINESS_CATEGORIES.slice(0, 6).map(renderCategoryChip)}
          <TouchableOpacity style={styles.moreChip} onPress={() => setShowFilters(true)}>
            <Ionicons name="ellipsis-horizontal" size={16} color={COLORS.primary} />
            <Text style={styles.moreChipText}>More</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Active Filters Indicator */}
        {(filterOpen !== null || filterRating > 0 || filterPriceRange.length > 0) && (
          <View style={styles.activeFilters}>
            <Text style={styles.activeFiltersText}>
              Filters active: {[
                filterOpen === true && 'Open Now',
                filterRating > 0 && `${filterRating}+ stars`,
                filterPriceRange.length > 0 && filterPriceRange.map(p => p === 'budget' ? '€' : p === 'moderate' ? '€€' : p === 'premium' ? '€€€' : '€€€€').join(', '),
              ].filter(Boolean).join(' • ')}
            </Text>
            <TouchableOpacity onPress={() => {
              setFilterOpen(null);
              setFilterRating(0);
              setFilterPriceRange([]);
              setIsLoading(true);
            }}>
              <Ionicons name="close-circle" size={18} color={COLORS.gray} />
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        {viewMode === 'map' ? (
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
              {businesses.map(renderMapMarker)}
            </MapView>

            {/* Map Cards Carousel */}
            <View style={styles.mapCarousel}>
              <Animated.FlatList
                ref={flatListRef}
                data={businesses}
                keyExtractor={(item) => item.id}
                renderItem={renderBusinessCard}
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
          <FlatList
            data={businesses}
            keyExtractor={(item) => item.id}
            renderItem={renderBusinessCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={COLORS.primary}
              />
            }
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="business-outline" size={64} color={COLORS.gray} />
                  <Text style={styles.emptyTitle}>No businesses found</Text>
                  <Text style={styles.emptySubtitle}>Try adjusting your filters</Text>
                </View>
              )
            }
          />
        )}
      </SafeAreaView>

      {/* Filters Modal */}
      {renderFiltersModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  safeArea: {
    flex: 1,
  },

  // Header
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
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
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

  // Search
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    paddingVertical: 12,
  },
  filterButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterButtonActive: {
    backgroundColor: 'rgba(14,191,138,0.2)',
  },

  // Categories
  categoriesScroll: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryChipIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray,
  },
  moreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,53,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  moreChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Active Filters
  activeFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(14,191,138,0.1)',
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  activeFiltersText: {
    fontSize: 12,
    color: COLORS.primary,
    flex: 1,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 16,
  },

  // Business Card
  businessCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    overflow: 'hidden',
    width: CARD_WIDTH,
  },
  cardHeader: {
    height: 120,
    position: 'relative',
  },
  cardCover: {
    width: '100%',
    height: '100%',
  },
  cardCoverOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  cardLogoContainer: {
    position: 'absolute',
    bottom: -24,
    left: 16,
  },
  cardLogo: {
    width: 60,
    height: 60,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#0f0f1a',
  },
  cardBadges: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    gap: 6,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  verifiedBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 2,
  },
  statusBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  statusOpen: {
    backgroundColor: 'rgba(76,175,80,0.2)',
  },
  statusClosed: {
    backgroundColor: 'rgba(244,67,54,0.2)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  cardContent: {
    padding: 16,
    paddingTop: 32,
  },
  cardNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  cardPriceRange: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
  },
  cardUsername: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 12,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardMetaDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 10,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 1,
  },
  cardRatingText: {
    fontSize: 12,
    color: COLORS.gray,
    marginLeft: 4,
  },
  cardLocationText: {
    fontSize: 12,
    color: COLORS.gray,
  },
  cardHighlights: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  highlightChip: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  highlightText: {
    fontSize: 11,
    color: COLORS.lightGray,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  cardFollowers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardFollowersText: {
    fontSize: 12,
    color: COLORS.gray,
  },
  viewButton: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  viewGradient: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  viewButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },

  // Map
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

  // Empty/Loading
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
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.gray,
  },

  // Filters Modal
  filtersOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  filtersBackdrop: {
    flex: 1,
  },
  filtersSheet: {
    maxHeight: height * 0.75,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  filtersBlur: {
    backgroundColor: 'rgba(20,20,35,0.95)',
  },
  filtersHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  filtersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  filtersTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  filtersClear: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  filtersContent: {
    padding: 20,
    maxHeight: height * 0.5,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterOptionActive: {
    backgroundColor: 'rgba(14,191,138,0.15)',
    borderColor: COLORS.primary,
  },
  filterOptionText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  filterOptionTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryGridItem: {
    width: (width - 60) / 3,
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  categoryGridItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  categoryGridIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  categoryGridText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gray,
    textAlign: 'center',
  },
  filtersFooter: {
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  applyButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  applyGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
