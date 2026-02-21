/**
 * BusinessProfileScreen
 * Public profile view for Pro Business accounts (gyms, stores, studios, etc.)
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ErrorBoundary from '../../components/ErrorBoundary';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { resolveDisplayName } from '../../types/profile';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { MapView, Camera, MarkerView } from '../../utils/mapbox-safe';
import * as Haptics from 'expo-haptics';
import OptimizedImage from '../../components/OptimizedImage';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { validate } from '../../utils/validation';
import { useCurrency } from '../../hooks/useCurrency';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width: _width, height: _height } = Dimensions.get('window');

type BusinessProfileScreenProps = Readonly<{
  route: { params: { businessId: string } };
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void };
}>;


interface BusinessProfile {
  id: string;
  name: string;
  username: string;
  logo_url?: string;
  cover_url?: string;
  bio?: string;
  category: {
    id: string;
    name: string;
    icon: string;
    color: string;
  };
  location: {
    name: string;
    address: string;
    city: string;
    coordinates: { lat: number; lng: number };
  };
  contact: {
    phone?: string;
    email?: string;
    website?: string;
  };
  hours: {
    day: string;
    open: string;
    close: string;
    is_closed: boolean;
  }[];
  stats: {
    followers: number;
    reviews: number;
    rating: number;
  };
  is_verified: boolean;
  is_following: boolean;
  features: string[];
  price_range?: 'budget' | 'moderate' | 'premium' | 'luxury';
}

interface Service {
  id: string;
  name: string;
  description?: string;
  price_cents: number;
  duration_minutes?: number;
  image_url?: string;
  is_subscription: boolean;
  subscription_period?: 'weekly' | 'monthly' | 'yearly';
}

interface Activity {
  id: string;
  name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  instructor?: string;
  spots_available?: number;
  category_color: string;
}

interface Review {
  id: string;
  user: {
    id: string;
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
  rating: number;
  comment: string;
  created_at: string;
}

const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function BusinessProfileScreen({ route, navigation }: BusinessProfileScreenProps) {
  const { businessId } = route.params;
  const { formatAmount } = useCurrency();
  const { colors, isDark } = useTheme();

  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [schedule, setSchedule] = useState<Activity[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'about' | 'services' | 'schedule' | 'reviews'>('about');
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1);

  const scrollY = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadBusinessProfile = useCallback(async () => {
    if (!businessId) {
      if (__DEV__) console.warn('BusinessProfileScreen: No businessId provided');
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      return;
    }

    try {
      setLoadError(null);
      const [profileRes, servicesRes, scheduleRes, reviewsRes] = await Promise.all([
        awsAPI.getBusinessProfile(businessId),
        awsAPI.getBusinessServices(businessId),
        awsAPI.getBusinessSchedule(businessId),
        awsAPI.getBusinessReviews(businessId, { limit: 10 }),
      ]);

      if (!isMountedRef.current) return;

      if (profileRes.success && profileRes.business) {
        setBusiness(profileRes.business as unknown as BusinessProfile);
        setIsFollowing((profileRes.business as unknown as { is_following?: boolean }).is_following ?? false);
      }
      if (servicesRes.success) setServices((servicesRes.services || []) as unknown as Service[]);
      if (scheduleRes.success) setSchedule((scheduleRes.activities || []) as unknown as Activity[]);
      if (reviewsRes.success) setReviews((reviewsRes.reviews || []) as unknown as Review[]);
    } catch (error) {
      if (__DEV__) console.warn('Load business profile error:', error);
      if (isMountedRef.current) {
        setLoadError('Failed to load business profile');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [businessId]);

  useEffect(() => {
    loadBusinessProfile();
  }, [loadBusinessProfile]);

  const handleFollow = useCallback(async () => {
    if (isFollowLoading) return;

    setIsFollowLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newFollowing = !isFollowing;
    setIsFollowing(newFollowing);

    try {
      if (newFollowing) {
        await awsAPI.followBusiness(businessId);
      } else {
        await awsAPI.unfollowBusiness(businessId);
      }
    } catch (_error) {
      if (isMountedRef.current) {
        setIsFollowing(!newFollowing); // Revert on error
      }
    } finally {
      if (isMountedRef.current) {
        setIsFollowLoading(false);
      }
    }
  }, [businessId, isFollowing, isFollowLoading]);

  const handleBookService = useCallback((service: Service) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (service.is_subscription) {
      navigation.navigate('BusinessSubscription', { businessId, serviceId: service.id });
    } else {
      navigation.navigate('BusinessBooking', { businessId, serviceId: service.id });
    }
  }, [businessId, navigation]);

  const handleCallBusiness = useCallback(async () => {
    if (business?.contact.phone) {
      const url = `tel:${business.contact.phone}`;
      try {
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
        } else {
          Alert.alert('Error', 'Unable to make a call from this device.');
        }
      } catch (error) {
        if (__DEV__) console.warn('Call business error:', error);
        Alert.alert('Error', 'Failed to open phone app.');
      }
    }
  }, [business?.contact.phone]);

  const handleOpenMaps = useCallback(async () => {
    if (business?.location.coordinates) {
      const { lat, lng } = business.location.coordinates;
      const url = Platform.select({
        ios: `maps:0,0?q=${business.name}@${lat},${lng}`,
        android: `geo:0,0?q=${lat},${lng}(${business.name})`,
      });
      if (url) {
        try {
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
          } else {
            Alert.alert('Error', 'Maps application is not available.');
          }
        } catch (error) {
          if (__DEV__) console.warn('Open maps error:', error);
          Alert.alert('Error', 'Failed to open maps.');
        }
      }
    }
  }, [business?.location.coordinates, business?.name]);

  const handleOpenWebsite = useCallback(async () => {
    if (business?.contact.website) {
      // SECURITY: Validate URL before opening (prevent javascript:, data:, etc.)
      if (!validate.safeExternalUrl(business.contact.website)) {
        Alert.alert('Error', 'Invalid website URL.');
        return;
      }
      try {
        const canOpen = await Linking.canOpenURL(business.contact.website);
        if (canOpen) {
          await Linking.openURL(business.contact.website);
        } else {
          Alert.alert('Error', 'Unable to open this website.');
        }
      } catch (error) {
        if (__DEV__) console.warn('Open website error:', error);
        Alert.alert('Error', 'Failed to open website.');
      }
    }
  }, [business?.contact.website]);

  const getTodayActivities = () => {
    return schedule.filter((a) => a.day_of_week === selectedDay);
  };

  const getStarIcon = (star: number, r: number): 'star' | 'star-half' | 'star-outline' => {
    if (star <= r) return 'star';
    if (star - 0.5 <= r) return 'star-half';
    return 'star-outline';
  };

  const renderStars = (rating: number) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={getStarIcon(star, rating)}
            size={14}
            color="#FFD700"
          />
        ))}
      </View>
    );
  };

  const renderServiceCard = ({ item }: { item: Service }) => (
    <TouchableOpacity
      style={styles.serviceCard}
      onPress={() => handleBookService(item)}
      activeOpacity={0.8}
    >
      {item.image_url && (
        <OptimizedImage source={item.image_url} style={styles.serviceImage} />
      )}
      <View style={styles.serviceContent}>
        <View style={styles.serviceHeader}>
          <Text style={styles.serviceName}>{item.name}</Text>
          {item.is_subscription && (
            <View style={styles.subscriptionBadge}>
              <Ionicons name="refresh" size={10} color="#fff" />
              <Text style={styles.subscriptionBadgeText}>
                {({ monthly: '/mo', yearly: '/yr' } as Record<string, string>)[item.subscription_period ?? ''] ?? '/wk'}
              </Text>
            </View>
          )}
        </View>
        {item.description && (
          <Text style={styles.serviceDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.serviceFooter}>
          <View style={styles.serviceMeta}>
            {item.duration_minutes && (
              <View style={styles.serviceMetaItem}>
                <Ionicons name="time-outline" size={14} color={colors.gray} />
                <Text style={styles.serviceMetaText}>{item.duration_minutes} min</Text>
              </View>
            )}
          </View>
          <View style={styles.servicePrice}>
            <Text style={styles.servicePriceText}>{formatAmount(item.price_cents)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderActivityItem = ({ item }: { item: Activity }) => (
    <View style={styles.activityItem}>
      <View style={[styles.activityTime, { borderLeftColor: item.category_color }]}>
        <Text style={styles.activityStartTime}>{item.start_time}</Text>
        <Text style={styles.activityEndTime}>{item.end_time}</Text>
      </View>
      <View style={styles.activityInfo}>
        <Text style={styles.activityName}>{item.name}</Text>
        {item.instructor && (
          <Text style={styles.activityInstructor}>with {item.instructor}</Text>
        )}
      </View>
      {item.spots_available !== undefined && (
        <View style={styles.activitySpots}>
          <Text style={[
            styles.activitySpotsText,
            item.spots_available === 0 && styles.activitySpotsFull,
          ]}>
            {item.spots_available === 0 ? 'Full' : `${item.spots_available} spots`}
          </Text>
        </View>
      )}
    </View>
  );

  const renderReviewItem = ({ item }: { item: Review }) => (
    <View style={styles.reviewItem}>
      <View style={styles.reviewHeader}>
        <OptimizedImage
          source={item.user.avatar_url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(resolveDisplayName(item.user))}&background=random`}
          style={styles.reviewAvatar}
        />
        <View style={styles.reviewUserInfo}>
          <Text style={styles.reviewUsername}>{resolveDisplayName(item.user)}</Text>
          {renderStars(item.rating)}
        </View>
        <Text style={styles.reviewDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <Text style={styles.reviewComment}>{item.comment}</Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="cloud-offline-outline" size={64} color={colors.gray} />
        <Text style={styles.errorText}>{loadError}</Text>
        <TouchableOpacity
          style={styles.errorButton}
          onPress={() => { setIsLoading(true); loadBusinessProfile(); }}
        >
          <Text style={styles.errorButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!business) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="business-outline" size={64} color={colors.gray} />
        <Text style={styles.errorText}>Business not found</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => navigation.goBack()}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ErrorBoundary name="BusinessProfileScreen" title="Error loading business profile">
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      {/* Animated Header */}
      <Animated.View
        style={[
          styles.animatedHeader,
          {
            opacity: scrollY.interpolate({
              inputRange: [0, 200],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <BlurView intensity={80} tint="dark" style={styles.headerBlur}>
          <SafeAreaView edges={['top']}>
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {business.name}
              </Text>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </BlurView>
      </Animated.View>

      <Animated.ScrollView
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover & Logo */}
        <View style={styles.coverContainer}>
          {business.cover_url ? (
            <OptimizedImage source={business.cover_url} style={styles.coverImage} />
          ) : (
            <LinearGradient
              colors={[business.category.color, `${business.category.color}66`]}
              style={styles.coverImage}
            />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.9)']}
            style={styles.coverGradient}
          />

          {/* Back Button */}
          <SafeAreaView edges={['top']} style={styles.floatingHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.floatingButton}>
              <BlurView intensity={50} tint="dark" style={styles.floatingButtonBlur}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </BlurView>
            </TouchableOpacity>
            <TouchableOpacity style={styles.floatingButton}>
              <BlurView intensity={50} tint="dark" style={styles.floatingButtonBlur}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </BlurView>
            </TouchableOpacity>
          </SafeAreaView>

          {/* Logo */}
          <View style={styles.logoContainer}>
            <OptimizedImage
              source={business.logo_url ||
                `https://ui-avatars.com/api/?name=${business.name}&background=${business.category.color.replace('#', '')}&size=200`}
              style={styles.logo}
            />
            {business.is_verified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark-circle" size={24} color="#00BFFF" />
              </View>
            )}
          </View>
        </View>

        {/* Business Info */}
        <View style={styles.infoSection}>
          <View style={styles.nameRow}>
            <Text style={styles.businessName}>{business.name}</Text>
            <View style={[styles.categoryBadge, { backgroundColor: business.category.color + '30' }]}>
              <Ionicons name={business.category.icon as keyof typeof Ionicons.glyphMap} size={14} color={business.category.color} />
              <Text style={[styles.categoryText, { color: business.category.color }]}>
                {business.category.name}
              </Text>
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{business.stats.followers}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.ratingValue}>
                <Ionicons name="star" size={16} color="#FFD700" />
                <Text style={styles.statValue}>{business.stats.rating.toFixed(1)}</Text>
              </View>
              <Text style={styles.statLabel}>{business.stats.reviews} reviews</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {({ budget: '€', moderate: '€€', premium: '€€€' } as Record<string, string>)[business.price_range ?? ''] ?? '€€€€'}
              </Text>
              <Text style={styles.statLabel}>Price Range</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followButtonActive]}
              onPress={handleFollow}
              disabled={isFollowLoading}
            >
              {isFollowLoading ? (
                <ActivityIndicator size="small" color={isFollowing ? colors.primary : '#fff'} />
              ) : (
                <>
                  <Ionicons
                    name={isFollowing ? 'checkmark' : 'add'}
                    size={20}
                    color={isFollowing ? colors.primary : '#fff'}
                  />
                  <Text style={[styles.followButtonText, isFollowing && styles.followButtonTextActive]}>
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconButton} onPress={handleCallBusiness}>
              <Ionicons name="call" size={20} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconButton} onPress={handleOpenMaps}>
              <Ionicons name="navigate" size={20} color="#fff" />
            </TouchableOpacity>

            {business.contact.website && (
              <TouchableOpacity style={styles.iconButton} onPress={handleOpenWebsite}>
                <Ionicons name="globe" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {(['about', 'services', 'schedule', 'reviews'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'about' && (
            <View style={styles.aboutTab}>
              {/* Bio */}
              {business.bio && (
                <View style={styles.bioSection}>
                  <Text style={styles.sectionTitle}>About</Text>
                  <Text style={styles.bioText}>{business.bio}</Text>
                </View>
              )}

              {/* Features */}
              {business.features.length > 0 && (
                <View style={styles.featuresSection}>
                  <Text style={styles.sectionTitle}>Amenities</Text>
                  <View style={styles.featuresGrid}>
                    {business.features.map((feature) => (
                      <View key={feature} style={styles.featureItem}>
                        <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
                        <Text style={styles.featureText}>{feature}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Location Map */}
              <View style={styles.locationSection}>
                <Text style={styles.sectionTitle}>Location</Text>
                <View style={styles.mapContainer}>
                  <MapView
                    style={styles.map}
                    scrollEnabled={false}
                    zoomEnabled={false}
                  >
                    <Camera
                      centerCoordinate={[business.location.coordinates.lng, business.location.coordinates.lat]}
                      zoomLevel={15}
                    />
                    <MarkerView
                      coordinate={[business.location.coordinates.lng, business.location.coordinates.lat]}
                    >
                      <View style={[styles.mapMarker, { backgroundColor: business.category.color }]}>
                        <Ionicons name={business.category.icon as keyof typeof Ionicons.glyphMap} size={16} color="#fff" />
                      </View>
                    </MarkerView>
                  </MapView>
                </View>
                <TouchableOpacity style={styles.addressRow} onPress={handleOpenMaps}>
                  <Ionicons name="location" size={18} color={colors.primary} />
                  <View style={styles.addressText}>
                    <Text style={styles.addressName}>{business.location.name}</Text>
                    <Text style={styles.addressDetail}>{business.location.address}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.gray} />
                </TouchableOpacity>
              </View>

              {/* Opening Hours */}
              <View style={styles.hoursSection}>
                <Text style={styles.sectionTitle}>Opening Hours</Text>
                {business.hours.map((hour) => (
                  <View key={hour.day} style={styles.hourRow}>
                    <Text style={styles.hourDay}>{hour.day}</Text>
                    <Text style={[styles.hourTime, hour.is_closed && styles.hourClosed]}>
                      {hour.is_closed ? 'Closed' : `${hour.open} - ${hour.close}`}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {activeTab === 'services' && (
            <View style={styles.servicesTab}>
              {services.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="pricetag-outline" size={48} color={colors.gray} />
                  <Text style={styles.emptyTitle}>No services available</Text>
                </View>
              ) : (
                <View style={styles.servicesList}>
                  {services.map((service) => (
                    <View key={service.id}>{renderServiceCard({ item: service })}</View>
                  ))}
                </View>
              )}
            </View>
          )}

          {activeTab === 'schedule' && (
            <View style={styles.scheduleTab}>
              {/* Day Selector */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.daySelector}
              >
                {DAYS_SHORT.map((day, index) => (
                  <TouchableOpacity
                    key={day}
                    style={[styles.dayButton, selectedDay === index && styles.dayButtonActive]}
                    onPress={() => setSelectedDay(index)}
                  >
                    <Text style={[styles.dayButtonText, selectedDay === index && styles.dayButtonTextActive]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Activities */}
              {getTodayActivities().length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={colors.gray} />
                  <Text style={styles.emptyTitle}>No activities scheduled</Text>
                  <Text style={styles.emptySubtitle}>Check another day</Text>
                </View>
              ) : (
                <View style={styles.activitiesList}>
                  {getTodayActivities().map((activity) => (
                    <View key={activity.id}>{renderActivityItem({ item: activity })}</View>
                  ))}
                </View>
              )}
            </View>
          )}

          {activeTab === 'reviews' && (
            <View style={styles.reviewsTab}>
              {/* Rating Summary */}
              <View style={styles.ratingSummary}>
                <Text style={styles.ratingBig}>{business.stats.rating.toFixed(1)}</Text>
                {renderStars(business.stats.rating)}
                <Text style={styles.ratingCount}>{business.stats.reviews} reviews</Text>
              </View>

              {/* Reviews List */}
              {reviews.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubble-outline" size={48} color={colors.gray} />
                  <Text style={styles.emptyTitle}>No reviews yet</Text>
                </View>
              ) : (
                <View style={styles.reviewsList}>
                  {reviews.map((review) => (
                    <View key={review.id}>{renderReviewItem({ item: review })}</View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        <View style={{ height: 100 }} />
      </Animated.ScrollView>

      {/* Bottom CTA */}
      {services.length > 0 && (
        <View style={styles.bottomCTA}>
          <BlurView intensity={80} tint="dark" style={styles.bottomCTABlur}>
            <TouchableOpacity
              style={styles.bookButton}
              onPress={() => navigation.navigate('BusinessBooking', { businessId })}
            >
              <LinearGradient colors={GRADIENTS.primary} style={styles.bookGradient}>
                <Ionicons name="calendar" size={20} color="#fff" />
                <Text style={styles.bookButtonText}>Book Now</Text>
              </LinearGradient>
            </TouchableOpacity>
          </BlurView>
        </View>
      )}
    </View>
    </ErrorBoundary>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: 16,
  },
  errorText: {
    fontSize: 18,
    color: colors.gray,
  },
  errorButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  errorButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Header
  animatedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerBlur: {
    backgroundColor: isDark ? 'rgba(15,15,26,0.8)' : 'rgba(255,255,255,0.8)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 8,
  },

  // Cover
  coverContainer: {
    height: 220,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  floatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  floatingButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  floatingButtonBlur: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  logoContainer: {
    position: 'absolute',
    bottom: -40,
    left: 20,
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: colors.background,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 2,
  },

  // Info Section
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  businessName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    flex: 1,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  username: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: colors.gray,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  ratingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  followButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  followButtonActive: {
    backgroundColor: 'rgba(14,191,138,0.15)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  followButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  followButtonTextActive: {
    color: colors.primary,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray,
  },
  tabTextActive: {
    color: '#fff',
  },
  tabContent: {
    paddingHorizontal: 20,
  },

  // About Tab
  aboutTab: {
    gap: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  bioSection: {},
  bioText: {
    fontSize: 15,
    color: colors.grayLight,
    lineHeight: 22,
  },
  featuresSection: {},
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  featureText: {
    fontSize: 13,
    color: colors.grayLight,
  },
  locationSection: {},
  mapContainer: {
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
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
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  addressText: {
    flex: 1,
  },
  addressName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  addressDetail: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  hoursSection: {},
  hourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  hourDay: {
    fontSize: 14,
    color: colors.grayLight,
  },
  hourTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  hourClosed: {
    color: colors.gray,
  },

  // Services Tab
  servicesTab: {},
  servicesList: {
    gap: 12,
  },
  serviceCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  serviceImage: {
    width: '100%',
    height: 120,
  },
  serviceContent: {
    padding: 16,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  subscriptionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 2,
  },
  subscriptionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  serviceDescription: {
    fontSize: 13,
    color: colors.gray,
    marginBottom: 12,
  },
  serviceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  serviceMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  serviceMetaText: {
    fontSize: 13,
    color: colors.gray,
  },
  servicePrice: {
    backgroundColor: 'rgba(14,191,138,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  servicePriceText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },

  // Schedule Tab
  scheduleTab: {},
  daySelector: {
    gap: 8,
    paddingBottom: 16,
  },
  dayButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
  },
  dayButtonActive: {
    backgroundColor: colors.primary,
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray,
  },
  dayButtonTextActive: {
    color: '#fff',
  },
  activitiesList: {
    gap: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  activityTime: {
    borderLeftWidth: 3,
    paddingLeft: 10,
  },
  activityStartTime: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  activityEndTime: {
    fontSize: 12,
    color: colors.gray,
  },
  activityInfo: {
    flex: 1,
  },
  activityName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  activityInstructor: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  activitySpots: {},
  activitySpotsText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  activitySpotsFull: {
    color: colors.gray,
  },

  // Reviews Tab
  reviewsTab: {},
  ratingSummary: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
  },
  ratingBig: {
    fontSize: 48,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 8,
  },
  ratingCount: {
    fontSize: 14,
    color: colors.gray,
  },
  reviewsList: {
    gap: 12,
  },
  reviewItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 14,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  reviewUserInfo: {
    flex: 1,
  },
  reviewUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.gray,
  },
  reviewComment: {
    fontSize: 14,
    color: colors.grayLight,
    lineHeight: 20,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
  },

  // Bottom CTA
  bottomCTA: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomCTABlur: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34,
    backgroundColor: isDark ? 'rgba(15,15,26,0.9)' : 'rgba(255,255,255,0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  bookButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  bookGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  bookButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
