/**
 * ActivityDetailScreen
 * Unified screen for viewing activity details (merges Events + Groups)
 * Handles both route activities (running, cycling, hiking) and location activities
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { MapView, Camera, MarkerView, ShapeSource, LineLayer } from '../../utils/mapbox-safe';
import * as Haptics from 'expo-haptics';
import OptimizedImage from '../../components/OptimizedImage';
import { GRADIENTS } from '../../config/theme';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatDistance, formatDuration } from '../../services/mapbox-directions';
import { isValidUUID } from '../../utils/formatters';
import { AvatarImage } from '../../components/OptimizedImage';
import { formatLongDateTime } from '../../utils/dateFormatters';
import SharePostModal from '../../components/SharePostModal';
import type { ShareContentData } from '../../hooks/useModalState';

import { resolveDisplayName } from '../../types/profile';
const { width: _width } = Dimensions.get('window');

// Route categories that should display route info
const ROUTE_CATEGORIES = ['running', 'cycling', 'hiking', 'skating', 'trail'];

type ActivityDetailScreenProps = Readonly<{
  route: { params: { activityId: string; activityType: 'event' | 'group' } };
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void };
}>;


interface Activity {
  id: string;
  title: string;
  name?: string; // groups use 'name'
  description?: string;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    color: string;
  };
  organizer?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
    is_verified: boolean;
  };
  creator?: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
    is_verified?: boolean;
  };
  creator_id?: string;
  location_name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  coordinates?: { lat: number; lng: number };
  routeWaypoints?: { lat: number; lng: number }[];
  routeGeojson?: { type: string; coordinates: number[][] };
  routeDistanceKm?: number;
  routeDurationMin?: number;
  routeDifficulty?: 'easy' | 'medium' | 'moderate' | 'hard' | 'expert';
  difficulty?: 'easy' | 'medium' | 'moderate' | 'hard' | 'expert';
  starts_at: string;
  ends_at?: string;
  is_free: boolean;
  price?: number;
  price_cents?: number;
  currency?: string;
  max_participants?: number;
  current_participants?: number;
  participant_count?: number;
  participants?: Array<{
    id: string;
    username: string;
    avatar_url?: string;
  }>;
  is_public: boolean;
  is_fans_only?: boolean;
  cover_image_url?: string;
  created_at: string;
  is_participating?: boolean;
  is_organizer?: boolean;
  isRoute?: boolean;
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4ECDC4',
  medium: '#FFD700',
  moderate: '#FF9800',
  hard: '#FF6B6B',
  expert: '#9B59B6',
};

export default function ActivityDetailScreen({ route, navigation }: ActivityDetailScreenProps) {
  const { showError, showSuccess, showAlert, showDestructiveConfirm } = useSmuppyAlert();
  const { activityId, activityType } = route.params;
  const { formatAmount } = useCurrency();
  const { openCheckout } = useStripeCheckout();
  const user = useUserStore((state) => state.user);
  const { colors, isDark } = useTheme();

  const [activity, setActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareContent, setShareContent] = useState<ShareContentData | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<InstanceType<typeof MapView>>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Determine if this is a route-based activity
  const isRouteActivity = useMemo(() => {
    if (!activity) return false;
    if (activity.isRoute) return true;
    const categorySlug = activity.category?.slug?.toLowerCase() || '';
    return ROUTE_CATEGORIES.includes(categorySlug);
  }, [activity]);

  // Normalize activity data
  const normalizedActivity = useMemo(() => {
    if (!activity) return null;
    return {
      ...activity,
      title: activity.title || activity.name || 'Untitled Activity',
      organizer: activity.organizer || activity.creator,
      organizerId: activity.organizer?.id || activity.creator?.id || activity.creator_id,
      coordinates: activity.coordinates || (activity.latitude && activity.longitude
        ? { lat: activity.latitude, lng: activity.longitude }
        : null),
      participantCount: activity.participant_count ?? activity.current_participants ?? 0,
      priceAmount: activity.price_cents ?? (activity.price ? activity.price * 100 : 0),
      difficulty: activity.routeDifficulty || activity.difficulty,
    };
  }, [activity]);

  // SECURITY: Validate UUID on mount
  useEffect(() => {
    if (!activityId || !isValidUUID(activityId)) {
      if (__DEV__) console.warn('[ActivityDetailScreen] Invalid activityId:', activityId);
      showError('Error', 'Invalid activity');
      navigation.goBack();
      return;
    }
    loadActivityDetails().catch((err) => {
      if (__DEV__) console.warn('loadActivityDetails error:', err);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, activityType]);

  const loadActivityDetails = async () => {
    try {
      let response;
      if (activityType === 'event') {
        response = await awsAPI.getEventDetail(activityId);
        if (response.success && response.event) {
          setActivity(response.event as unknown as Activity);
          setHasJoined(!!(response.event as unknown as Activity & { is_participating?: boolean }).is_participating);
        } else {
          throw new Error(response.message || 'Failed to load event');
        }
      } else {
        response = await awsAPI.getGroup(activityId);
        if (response.success && response.group) {
          const group = response.group as unknown as Record<string, unknown>;
          // Normalize group to activity format (backend returns camelCase, Activity type uses snake_case)
          setActivity({
            ...(group as unknown as Activity),
            title: (group.name as string) || '',
            category: (group.category as Activity['category']) || { id: '0', name: 'Activity', slug: (group.subcategory as string) || 'other', icon: 'people', color: '#0EBF8A' },
            organizer: group.creator as Activity['organizer'],
            routeGeojson: group.routeGeojson as Activity['routeGeojson'],
            routeWaypoints: group.routeWaypoints as Activity['routeWaypoints'],
            routeDistanceKm: group.routeDistanceKm as number | undefined,
            routeDurationMin: group.routeDurationMin as number | undefined,
            routeDifficulty: (group.difficulty as Activity['routeDifficulty']),
            isRoute: group.isRoute as boolean,
          });
          setHasJoined(((group.participants as Array<{ id: string }>) || []).some((p) => p.id === user?.id));
        } else {
          throw new Error('Failed to load activity');
        }
      }
    } catch (error: unknown) {
      if (__DEV__) console.warn('Load activity error:', error);
      showError('Error', 'Failed to load activity details');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinActivity = async () => {
    if (!normalizedActivity) return;

    // Check if already participating
    if (hasJoined) {
      showError('Already Joined', 'You are already participating in this activity.');
      return;
    }

    // Check if activity is full
    if (normalizedActivity.max_participants && normalizedActivity.participantCount >= normalizedActivity.max_participants) {
      showError('Activity Full', 'This activity has reached maximum capacity.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Free activity - join directly
    if (normalizedActivity.is_free) {
      await joinActivityFree();
    } else {
      // Paid activity - initiate payment (only for events)
      if (activityType === 'event') {
        await initiateActivityPayment();
      } else {
        // Groups are always free for now
        await joinActivityFree();
      }
    }
  };

  const joinActivityFree = async () => {
    setIsJoining(true);
    try {
      const response = activityType === 'event'
        ? await awsAPI.joinEvent(activityId)
        : await awsAPI.joinGroup(activityId);

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess('Joined!', 'You are now participating in this activity.');
        setHasJoined(true);
        loadActivityDetails();
      } else {
        throw new Error(response.message || 'Failed to join activity');
      }
    } catch (error: unknown) {
      if (__DEV__) console.warn('Join activity error:', error);
      // SECURITY: Never expose raw error to users
      showError('Error', 'Failed to join activity. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const initiateActivityPayment = async () => {
    if (!normalizedActivity) return;

    setIsJoining(true);
    try {
      const response = await awsAPI.createEventPayment({
        eventId: normalizedActivity.id,
        amount: normalizedActivity.priceAmount,
        currency: normalizedActivity.currency || 'eur',
      });

      if (!response.success || !response.checkoutUrl || !response.sessionId) {
        throw new Error(response.message || 'Failed to create payment');
      }

      const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

      if (checkoutResult.status === 'cancelled') {
        return;
      }

      if (checkoutResult.status === 'failed') {
        throw new Error(checkoutResult.message);
      }

      if (checkoutResult.status === 'pending') {
        showAlert({
          title: 'Payment Processing',
          message: checkoutResult.message,
          type: 'info',
          buttons: [{ text: 'OK', onPress: () => { void loadActivityDetails(); } }],
        });
        return;
      }

      showAlert({
        title: 'Payment Successful!',
        message: `You're now registered for "${normalizedActivity.title}".\n\nSee you there!`,
        type: 'success',
        buttons: [{ text: 'View Details', onPress: () => { void loadActivityDetails(); } }],
      });
      setHasJoined(true);
      await loadActivityDetails();
    } catch (error: unknown) {
      if (__DEV__) console.warn('Activity payment error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // SECURITY: Never expose raw error to users
      showError('Payment Failed', 'Something went wrong. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveActivity = async () => {
    if (!normalizedActivity) return;

    showDestructiveConfirm(
      'Leave Activity',
      'Are you sure you want to leave this activity?',
      async () => {
        setIsJoining(true);
        try {
          const response = activityType === 'event'
            ? await awsAPI.leaveEvent(activityId)
            : await awsAPI.leaveGroup(activityId);

          if (response.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setHasJoined(false);
            loadActivityDetails();
          } else {
            throw new Error(response.message);
          }
        } catch (error: unknown) {
          if (__DEV__) console.warn('Leave activity error:', error);
          // SECURITY: Never expose raw error to users
          showError('Error', 'Failed to leave activity. Please try again.');
        } finally {
          setIsJoining(false);
        }
      },
      'Leave'
    );
  };

  const handleShare = () => {
    if (!normalizedActivity) return;

    const shareUrl = `https://smuppy.app/${activityType}s/${normalizedActivity.id}`;
    const priceText = normalizedActivity.is_free ? 'Free!' : formatAmount(normalizedActivity.priceAmount);
    const shareMessage = `Join "${normalizedActivity.title}" on Smuppy!\n\n${formatLongDateTime(normalizedActivity.starts_at)}\n${normalizedActivity.location_name || normalizedActivity.address || ''}\n${priceText}\n\n${shareUrl}`;

    setShareContent({
      id: normalizedActivity.id,
      type: 'text',
      title: normalizedActivity.title,
      subtitle: `${formatLongDateTime(normalizedActivity.starts_at)} - ${normalizedActivity.location_name || 'See details'}`,
      shareText: shareMessage,
    });
    setShareModalVisible(true);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!normalizedActivity) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color={colors.gray} />
        <Text style={styles.errorText}>Activity not found</Text>
        <TouchableOpacity style={styles.backButtonLarge} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFull = normalizedActivity.max_participants && normalizedActivity.participantCount >= normalizedActivity.max_participants;
  const isPast = new Date(normalizedActivity.starts_at) < new Date();
  const isOrganizer = normalizedActivity.is_organizer || normalizedActivity.organizerId === user?.id;
  const categoryColor = normalizedActivity.category?.color || '#0EBF8A';

  // Build route GeoJSON if available
  const routeGeoJSON = normalizedActivity.routeGeojson ? {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: normalizedActivity.routeGeojson as { type: 'LineString'; coordinates: number[][] },
    }],
  } : normalizedActivity.routeWaypoints && normalizedActivity.routeWaypoints.length > 1 ? {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: normalizedActivity.routeWaypoints.map((p) => [p.lng, p.lat]),
      },
    }],
  } : null;

  return (
    <View style={styles.container}>
      <LinearGradient colors={isDark ? ['#1a1a2e', '#0f0f1a'] : ['#f8f9fa', '#ffffff']} style={StyleSheet.absoluteFill} />

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
        <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.headerBlur}>
          <SafeAreaView edges={['top']}>
            <View style={styles.headerContent}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
                <Ionicons name="arrow-back" size={24} color={colors.dark} />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.dark }]} numberOfLines={1}>
                {normalizedActivity.title}
              </Text>
              <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
                <Ionicons name="share-outline" size={24} color={colors.dark} />
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
        {/* Cover Image / Map */}
        <View style={styles.coverContainer}>
          {normalizedActivity.cover_image_url ? (
            <OptimizedImage source={normalizedActivity.cover_image_url} style={styles.coverImage} />
          ) : normalizedActivity.coordinates ? (
            <MapView
              ref={mapRef}
              style={styles.coverMap}
              scrollEnabled={false}
              zoomEnabled={false}
              styleURL={isDark ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12'}
              logoEnabled={false}
              attributionEnabled={false}
              scaleBarEnabled={false}
            >
              <Camera
                centerCoordinate={[normalizedActivity.coordinates.lng, normalizedActivity.coordinates.lat]}
                zoomLevel={isRouteActivity && routeGeoJSON ? 12 : 15}
              />
              <MarkerView
                coordinate={[normalizedActivity.coordinates.lng, normalizedActivity.coordinates.lat]}
              >
                <View style={[styles.mapMarker, { backgroundColor: categoryColor }]}>
                  <Ionicons
                    name={(normalizedActivity.category?.icon || 'flash') as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color="#fff"
                  />
                </View>
              </MarkerView>
              {routeGeoJSON && (
                <ShapeSource id="routeLine" shape={routeGeoJSON}>
                  <LineLayer
                    id="routeLineLayer"
                    style={{
                      lineColor: categoryColor,
                      lineWidth: 4,
                      lineCap: 'round',
                      lineJoin: 'round',
                      lineOpacity: 0.85,
                    }}
                  />
                </ShapeSource>
              )}
            </MapView>
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: categoryColor }]}>
              <Ionicons
                name={(normalizedActivity.category?.icon || 'flash') as keyof typeof Ionicons.glyphMap}
                size={64}
                color="rgba(255,255,255,0.5)"
              />
            </View>
          )}

          <LinearGradient
            colors={['transparent', isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)']}
            style={styles.coverGradient}
          />

          {/* Floating Back Button */}
          <SafeAreaView edges={['top']} style={styles.floatingHeader}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.floatingButton}>
              <BlurView intensity={50} tint="dark" style={styles.floatingButtonBlur}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </BlurView>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShare} style={styles.floatingButton}>
              <BlurView intensity={50} tint="dark" style={styles.floatingButtonBlur}>
                <Ionicons name="share-outline" size={24} color="#fff" />
              </BlurView>
            </TouchableOpacity>
          </SafeAreaView>

          {/* Category Badge */}
          <View style={[styles.categoryBadge, { backgroundColor: categoryColor }]}>
            <Ionicons
              name={(normalizedActivity.category?.icon || 'flash') as keyof typeof Ionicons.glyphMap}
              size={16}
              color="#fff"
            />
            <Text style={styles.categoryText}>{normalizedActivity.category?.name || 'Activity'}</Text>
          </View>

          {/* Price Badge */}
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>
              {normalizedActivity.is_free ? 'FREE' : formatAmount(normalizedActivity.priceAmount)}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title & Organizer */}
          <Text style={[styles.title, { color: colors.dark }]}>{normalizedActivity.title}</Text>

          {normalizedActivity.organizer && (
            <TouchableOpacity
              style={[styles.organizerRow, { backgroundColor: colors.gray50 }]}
              onPress={() => navigation.navigate('UserProfile', { userId: normalizedActivity.organizerId })}
            >
              <AvatarImage
                source={normalizedActivity.organizer.avatar_url}
                size={48}
                style={styles.organizerAvatar}
              />
              <View style={styles.organizerInfo}>
                <View style={styles.organizerNameRow}>
                  <Text style={[styles.organizerName, { color: colors.dark }]}>
                    {resolveDisplayName(normalizedActivity.organizer)}
                  </Text>
                  {normalizedActivity.organizer.is_verified && (
                    <Ionicons name="checkmark-circle" size={14} color="#00BFFF" />
                  )}
                </View>
                <Text style={[styles.organizerUsername, { color: colors.gray }]}>Organizer</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.gray} />
            </TouchableOpacity>
          )}

          {/* Details Card */}
          <View style={[styles.detailsCard, { backgroundColor: colors.gray50 }]}>
            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="calendar" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailText}>
                <Text style={[styles.detailLabel, { color: colors.gray }]}>Date & Time</Text>
                <Text style={[styles.detailValue, { color: colors.dark }]}>{formatLongDateTime(normalizedActivity.starts_at)}</Text>
              </View>
            </View>

            <View style={[styles.detailDivider, { backgroundColor: colors.grayBorder }]} />

            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="location" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailText}>
                <Text style={[styles.detailLabel, { color: colors.gray }]}>Location</Text>
                <Text style={[styles.detailValue, { color: colors.dark }]}>
                  {normalizedActivity.location_name || normalizedActivity.address || 'Location TBD'}
                </Text>
                {normalizedActivity.address && normalizedActivity.location_name && (
                  <Text style={[styles.detailSubvalue, { color: colors.gray }]}>{normalizedActivity.address}</Text>
                )}
              </View>
            </View>

            {/* Route Info (for route activities) */}
            {isRouteActivity && normalizedActivity.routeDistanceKm && (
              <>
                <View style={[styles.detailDivider, { backgroundColor: colors.grayBorder }]} />
                <View style={styles.routeStatsRow}>
                  <View style={styles.routeStat}>
                    <Text style={[styles.routeStatValue, { color: colors.dark }]}>
                      {formatDistance(normalizedActivity.routeDistanceKm)}
                    </Text>
                    <Text style={[styles.routeStatLabel, { color: colors.gray }]}>Distance</Text>
                  </View>
                  <View style={[styles.routeStatDivider, { backgroundColor: colors.grayBorder }]} />
                  <View style={styles.routeStat}>
                    <Text style={[styles.routeStatValue, { color: colors.dark }]}>
                      {formatDuration(normalizedActivity.routeDurationMin || 0)}
                    </Text>
                    <Text style={[styles.routeStatLabel, { color: colors.gray }]}>Est. Time</Text>
                  </View>
                  {normalizedActivity.difficulty && (
                    <>
                      <View style={[styles.routeStatDivider, { backgroundColor: colors.grayBorder }]} />
                      <View style={styles.routeStat}>
                        <Text style={[styles.routeStatValue, { color: DIFFICULTY_COLORS[normalizedActivity.difficulty] || colors.dark }]}>
                          {normalizedActivity.difficulty.charAt(0).toUpperCase() + normalizedActivity.difficulty.slice(1)}
                        </Text>
                        <Text style={[styles.routeStatLabel, { color: colors.gray }]}>Difficulty</Text>
                      </View>
                    </>
                  )}
                </View>
              </>
            )}

            <View style={[styles.detailDivider, { backgroundColor: colors.grayBorder }]} />

            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="people" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailText}>
                <Text style={[styles.detailLabel, { color: colors.gray }]}>Participants</Text>
                <Text style={[styles.detailValue, { color: colors.dark }]}>
                  {normalizedActivity.participantCount}
                  {normalizedActivity.max_participants ? ` / ${normalizedActivity.max_participants}` : ''} going
                </Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {normalizedActivity.description && (
            <View style={styles.descriptionSection}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>About</Text>
              <Text
                style={[styles.description, { color: colors.grayLight }]}
                numberOfLines={showFullDescription ? undefined : 4}
              >
                {normalizedActivity.description}
              </Text>
              {normalizedActivity.description.length > 200 && (
                <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)}>
                  <Text style={[styles.readMore, { color: colors.primary }]}>
                    {showFullDescription ? 'Show less' : 'Read more'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Participants Preview */}
          {normalizedActivity.participants && normalizedActivity.participants.length > 0 && (
            <View style={styles.participantsSection}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Participants</Text>
              <View style={styles.participantsRow}>
                {normalizedActivity.participants.slice(0, 5).map((participant, index) => (
                  <TouchableOpacity
                    key={participant.id}
                    style={[styles.participantAvatar, { marginLeft: index > 0 ? -10 : 0, borderColor: colors.background }]}
                    onPress={() => navigation.navigate('UserProfile', { userId: participant.id })}
                  >
                    <OptimizedImage
                      source={participant.avatar_url ||
                        `https://ui-avatars.com/api/?name=${participant.username}&background=random`}
                      style={styles.participantImage}
                    />
                  </TouchableOpacity>
                ))}
                {normalizedActivity.participantCount > 5 && (
                  <View style={[styles.participantAvatar, styles.participantMore]}>
                    <Text style={styles.participantMoreText}>+{normalizedActivity.participantCount - 5}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Bottom Spacing */}
          <View style={{ height: 120 }} />
        </View>
      </Animated.ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <BlurView intensity={80} tint={isDark ? 'dark' : 'light'} style={styles.bottomBarBlur}>
          {/* Price Info */}
          <View style={styles.bottomPriceInfo}>
            {normalizedActivity.is_free ? (
              <Text style={[styles.bottomPriceText, { color: colors.primary }]}>Free Activity</Text>
            ) : (
              <>
                <Text style={[styles.bottomPriceLabel, { color: colors.gray }]}>Entry fee</Text>
                <Text style={styles.bottomPriceAmount}>
                  {formatAmount(normalizedActivity.priceAmount)}
                </Text>
              </>
            )}
          </View>

          {/* Action Button */}
          {isOrganizer ? (
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => {
                if (activityType === 'event') {
                  navigation.navigate('EventManage', { eventId: normalizedActivity.id });
                }
              }}
            >
              <Ionicons name="settings-outline" size={20} color="#fff" />
              <Text style={styles.manageButtonText}>Manage</Text>
            </TouchableOpacity>
          ) : hasJoined ? (
            <View style={styles.joinedActions}>
              <View style={[styles.joinedBadge, { backgroundColor: `${colors.primary}20` }]}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={[styles.joinedText, { color: colors.primary }]}>Joined</Text>
              </View>
              <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveActivity}>
                <Text style={styles.leaveButtonText}>Leave</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.joinButton,
                (isFull || isPast) && styles.joinButtonDisabled,
              ]}
              onPress={handleJoinActivity}
              disabled={isFull || isPast || isJoining}
            >
              <LinearGradient
                colors={isFull || isPast ? ['#444', '#333'] : GRADIENTS.primary}
                style={styles.joinGradient}
              >
                {isJoining ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={isFull ? 'close-circle' : isPast ? 'time' : normalizedActivity.is_free ? 'add-circle' : 'card'}
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.joinButtonText}>
                      {isFull ? 'Full' : isPast ? 'Activity Ended' : normalizedActivity.is_free ? 'Join Activity' : 'Pay & Join'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </BlurView>
      </View>

      <SharePostModal
        visible={shareModalVisible}
        content={shareContent}
        onClose={() => setShareModalVisible(false)}
      />
    </View>
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
  backButtonLarge: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
  },

  // Animated Header
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
    textAlign: 'center',
    marginHorizontal: 8,
  },

  // Cover
  coverContainer: {
    height: 280,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverMap: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
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
  mapMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  categoryBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  priceBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFD700',
  },

  // Content
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 16,
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 20,
  },
  organizerAvatar: {
    marginRight: 12,
  },
  organizerInfo: {
    flex: 1,
  },
  organizerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  organizerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  organizerUsername: {
    fontSize: 13,
    marginTop: 2,
  },

  // Details Card
  detailsCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailText: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  detailSubvalue: {
    fontSize: 13,
    marginTop: 2,
  },
  detailDivider: {
    height: 1,
  },

  // Route Stats
  routeStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 16,
  },
  routeStat: {
    alignItems: 'center',
    gap: 4,
  },
  routeStatValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  routeStatLabel: {
    fontSize: 11,
  },
  routeStatDivider: {
    width: 1,
    height: 30,
  },

  // Description
  descriptionSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
  },
  readMore: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },

  // Participants
  participantsSection: {
    marginBottom: 20,
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  participantAvatar: {
    borderRadius: 20,
    borderWidth: 2,
  },
  participantImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  participantMore: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
  participantMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBarBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34,
    backgroundColor: isDark ? 'rgba(15,15,26,0.9)' : 'rgba(255,255,255,0.9)',
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
  },
  bottomPriceInfo: {
    flex: 1,
  },
  bottomPriceLabel: {
    fontSize: 12,
  },
  bottomPriceAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFD700',
  },
  bottomPriceText: {
    fontSize: 18,
    fontWeight: '600',
  },
  joinButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
  },
  joinButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  manageButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  joinedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  joinedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  joinedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  leaveButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,59,48,0.15)',
  },
  leaveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF3B30',
  },
});
