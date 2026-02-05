/**
 * EventDetailScreen
 * View event details and join/pay to participate
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Share,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Mapbox, { MapView, Camera, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatLongDateTime } from '../../utils/dateFormatters';

const mapboxToken = Constants.expoConfig?.extra?.mapboxAccessToken;
if (mapboxToken) Mapbox.setAccessToken(mapboxToken);

const { width: _width, height: _height } = Dimensions.get('window');

interface EventDetailScreenProps {
  route: { params: { eventId: string } };
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void };
}

interface Event {
  id: string;
  title: string;
  description?: string;
  category: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    color: string;
  };
  organizer: {
    id: string;
    username: string;
    full_name: string;
    avatar_url?: string;
    is_verified: boolean;
  };
  location_name: string;
  address?: string;
  coordinates: { lat: number; lng: number };
  route_waypoints?: { lat: number; lng: number }[];
  route_distance_km?: number;
  route_difficulty?: 'easy' | 'moderate' | 'hard' | 'expert';
  starts_at: string;
  ends_at?: string;
  is_free: boolean;
  price_cents?: number;
  currency: string;
  max_participants?: number;
  participant_count: number;
  participants: Array<{
    id: string;
    username: string;
    avatar_url?: string;
  }>;
  is_public: boolean;
  is_fans_only: boolean;
  cover_image_url?: string;
  created_at: string;
  is_participating: boolean;
  is_organizer: boolean;
}

const DIFFICULTY_COLORS = {
  easy: '#4CAF50',
  moderate: '#FF9800',
  hard: '#F44336',
  expert: '#9C27B0',
};


export default function EventDetailScreen({ route, navigation }: EventDetailScreenProps) {
  const { showError, showSuccess, showAlert, showDestructiveConfirm } = useSmuppyAlert();
  const { eventId } = route.params;
  const { formatAmount, currency: _currency } = useCurrency();
  const _user = useUserStore((state) => state.user);
  const { colors, isDark } = useTheme();

  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const mapRef = useRef<MapView>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    loadEventDetails().catch((err) => {
      if (__DEV__) console.warn('loadEventDetails error:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const loadEventDetails = async () => {
    try {
      const response = await awsAPI.getEventDetail(eventId);
      if (response.success) {
        setEvent(response.event);
      } else {
        throw new Error(response.message || 'Failed to load event');
      }
    } catch (error: unknown) {
      if (__DEV__) console.warn('Load event error:', error);
      showError('Error', 'Failed to load event details');
      navigation.goBack();
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinEvent = async () => {
    if (!event) return;

    // Check if already participating
    if (event.is_participating) {
      showError('Already Joined', 'You are already participating in this event.');
      return;
    }

    // Check if event is full
    if (event.max_participants && event.participant_count >= event.max_participants) {
      showError('Event Full', 'This event has reached maximum capacity.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Free event - join directly
    if (event.is_free) {
      await joinEventFree();
    } else {
      // Paid event - initiate payment
      await initiateEventPayment();
    }
  };

  const joinEventFree = async () => {
    setIsJoining(true);
    try {
      const response = await awsAPI.joinEvent(eventId);
      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess('Joined!', 'You are now participating in this event.');
        loadEventDetails(); // Refresh to update participant count
      } else {
        throw new Error(response.message || 'Failed to join event');
      }
    } catch (error: unknown) {
      if (__DEV__) console.warn('Join event error:', error);
      const message = error instanceof Error ? error.message : 'Failed to join event';
      showError('Error', message);
    } finally {
      setIsJoining(false);
    }
  };

  const initiateEventPayment = async () => {
    if (!event) return;

    setIsJoining(true);
    try {
      // 1. Create Stripe Checkout session for event participation
      const response = await awsAPI.createEventPayment({
        eventId: event.id,
        amount: event.price_cents || 0,
        currency: event.currency || 'eur',
      });

      if (!response.success || !response.checkoutUrl) {
        throw new Error(response.message || 'Failed to create payment');
      }

      // 2. Open Stripe Checkout in browser
      const result = await WebBrowser.openBrowserAsync(response.checkoutUrl);

      if (result.type === 'cancel') {
        // User cancelled - do nothing
        return;
      }

      // 3. Payment successful
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert({
        title: 'Payment Successful!',
        message: `You're now registered for "${event.title}".

See you there!`,
        type: 'success',
        buttons: [{ text: 'View Details', onPress: loadEventDetails }],
      });
      await loadEventDetails();
    } catch (error: unknown) {
      if (__DEV__) console.warn('Event payment error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = error instanceof Error ? error.message : 'Please try again';
      showError('Payment Failed', message);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveEvent = async () => {
    if (!event) return;

    showDestructiveConfirm(
      'Leave Event',
      'Are you sure you want to leave this event?',
      async () => {
        setIsJoining(true);
        try {
          const response = await awsAPI.leaveEvent(eventId);
          if (response.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadEventDetails();
          } else {
            throw new Error(response.message);
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Failed to leave event';
          showError('Error', message);
        } finally {
          setIsJoining(false);
        }
      },
      'Leave'
    );
  };

  const handleShare = async () => {
    if (!event) return;

    try {
      const shareUrl = `https://smuppy.app/events/${event.id}`;
      const shareMessage = `Join "${event.title}" on Smuppy!\n\n📅 ${formatLongDateTime(event.starts_at)}\n📍 ${event.location_name}\n${event.is_free ? '🆓 Free!' : `💰 ${formatAmount(event.price_cents || 0)}`}\n\n${shareUrl}`;

      await Share.share({
        message: shareMessage,
        title: event.title,
        url: shareUrl,
      });
    } catch (error: unknown) {
      if (__DEV__) console.warn('Share error:', error);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color={colors.gray} />
        <Text style={styles.errorText}>Event not found</Text>
        <TouchableOpacity style={styles.backButtonLarge} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isFull = event.max_participants && event.participant_count >= event.max_participants;
  const isPast = new Date(event.starts_at) < new Date();

  return (
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
                {event.title}
              </Text>
              <TouchableOpacity onPress={handleShare} style={styles.headerButton}>
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
        {/* Cover Image / Map */}
        <View style={styles.coverContainer}>
          {event.cover_image_url ? (
            <Image source={{ uri: event.cover_image_url }} style={styles.coverImage} />
          ) : (
            <MapView
              ref={mapRef}
              style={styles.coverMap}
              scrollEnabled={false}
              zoomEnabled={false}
            >
              <Camera
                centerCoordinate={[event.coordinates.lng, event.coordinates.lat]}
                zoomLevel={15}
              />
              <MarkerView
                coordinate={[event.coordinates.lng, event.coordinates.lat]}
              >
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: event.category.color, borderWidth: 2, borderColor: '#fff' }} />
              </MarkerView>
              {event.route_waypoints && event.route_waypoints.length > 1 && (
                <ShapeSource
                  id="routeLine"
                  shape={{
                    type: 'Feature',
                    properties: {},
                    geometry: {
                      type: 'LineString',
                      coordinates: event.route_waypoints.map((p) => [p.lng, p.lat]),
                    },
                  }}
                >
                  <LineLayer
                    id="routeLineLayer"
                    style={{
                      lineColor: event.category.color,
                      lineWidth: 3,
                    }}
                  />
                </ShapeSource>
              )}
            </MapView>
          )}

          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
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
          <View style={[styles.categoryBadge, { backgroundColor: event.category.color }]}>
            <Ionicons name={(event.category.icon || 'help-circle') as keyof typeof Ionicons.glyphMap} size={16} color="#fff" />
            <Text style={styles.categoryText}>{event.category.name}</Text>
          </View>

          {/* Price Badge */}
          <View style={styles.priceBadge}>
            <Text style={styles.priceText}>
              {event.is_free ? 'FREE' : formatAmount(event.price_cents || 0)}
            </Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Title & Organizer */}
          <Text style={styles.title}>{event.title}</Text>

          <TouchableOpacity
            style={styles.organizerRow}
            onPress={() => navigation.navigate('UserProfile', { userId: event.organizer.id })}
          >
            <Image
              source={{
                uri: event.organizer.avatar_url ||
                  `https://ui-avatars.com/api/?name=${event.organizer.username}&background=random`,
              }}
              style={styles.organizerAvatar}
            />
            <View style={styles.organizerInfo}>
              <View style={styles.organizerNameRow}>
                <Text style={styles.organizerName}>{event.organizer.full_name || event.organizer.username}</Text>
                {event.organizer.is_verified && (
                  <Ionicons name="checkmark-circle" size={14} color="#00BFFF" />
                )}
              </View>
              <Text style={styles.organizerUsername}>Organizer</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.gray} />
          </TouchableOpacity>

          {/* Details Card */}
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="calendar" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Date & Time</Text>
                <Text style={styles.detailValue}>{formatLongDateTime(event.starts_at)}</Text>
              </View>
            </View>

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="location" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Location</Text>
                <Text style={styles.detailValue}>{event.location_name}</Text>
                {event.address && (
                  <Text style={styles.detailSubvalue}>{event.address}</Text>
                )}
              </View>
            </View>

            {event.route_distance_km && (
              <>
                <View style={styles.detailDivider} />
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="map" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.detailText}>
                    <Text style={styles.detailLabel}>Route</Text>
                    <Text style={styles.detailValue}>
                      {event.route_distance_km.toFixed(1)} km
                      {event.route_difficulty && (
                        <Text style={{ color: DIFFICULTY_COLORS[event.route_difficulty] }}>
                          {' • '}{event.route_difficulty.charAt(0).toUpperCase() + event.route_difficulty.slice(1)}
                        </Text>
                      )}
                    </Text>
                  </View>
                </View>
              </>
            )}

            <View style={styles.detailDivider} />

            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="people" size={20} color={colors.primary} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Participants</Text>
                <Text style={styles.detailValue}>
                  {event.participant_count}
                  {event.max_participants ? ` / ${event.max_participants}` : ''} going
                </Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {event.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text
                style={styles.description}
                numberOfLines={showFullDescription ? undefined : 4}
              >
                {event.description}
              </Text>
              {event.description.length > 200 && (
                <TouchableOpacity onPress={() => setShowFullDescription(!showFullDescription)}>
                  <Text style={styles.readMore}>
                    {showFullDescription ? 'Show less' : 'Read more'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Participants Preview */}
          {event.participants.length > 0 && (
            <View style={styles.participantsSection}>
              <Text style={styles.sectionTitle}>Participants</Text>
              <View style={styles.participantsRow}>
                {event.participants.slice(0, 5).map((participant, index) => (
                  <TouchableOpacity
                    key={participant.id}
                    style={[styles.participantAvatar, { marginLeft: index > 0 ? -10 : 0 }]}
                    onPress={() => navigation.navigate('UserProfile', { userId: participant.id })}
                  >
                    <Image
                      source={{
                        uri: participant.avatar_url ||
                          `https://ui-avatars.com/api/?name=${participant.username}&background=random`,
                      }}
                      style={styles.participantImage}
                    />
                  </TouchableOpacity>
                ))}
                {event.participant_count > 5 && (
                  <View style={[styles.participantAvatar, styles.participantMore]}>
                    <Text style={styles.participantMoreText}>+{event.participant_count - 5}</Text>
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
        <BlurView intensity={80} tint="dark" style={styles.bottomBarBlur}>
          {/* Price Info */}
          <View style={styles.bottomPriceInfo}>
            {event.is_free ? (
              <Text style={styles.bottomPriceText}>Free Event</Text>
            ) : (
              <>
                <Text style={styles.bottomPriceLabel}>Entry fee</Text>
                <Text style={styles.bottomPriceAmount}>
                  {formatAmount(event.price_cents || 0)}
                </Text>
              </>
            )}
          </View>

          {/* Action Button */}
          {event.is_organizer ? (
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => navigation.navigate('EventManage', { eventId: event.id })}
            >
              <Ionicons name="settings-outline" size={20} color="#fff" />
              <Text style={styles.manageButtonText}>Manage</Text>
            </TouchableOpacity>
          ) : event.is_participating ? (
            <View style={styles.joinedActions}>
              <View style={styles.joinedBadge}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.joinedText}>Joined</Text>
              </View>
              <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveEvent}>
                <Text style={styles.leaveButtonText}>Leave</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.joinButton,
                (isFull || isPast) && styles.joinButtonDisabled,
              ]}
              onPress={handleJoinEvent}
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
                      name={isFull ? 'close-circle' : isPast ? 'time' : event.is_free ? 'add-circle' : 'card'}
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.joinButtonText}>
                      {isFull ? 'Full' : isPast ? 'Event Ended' : event.is_free ? 'Join Event' : 'Pay & Join'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </BlurView>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
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
    backgroundColor: 'rgba(15,15,26,0.8)',
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
    color: '#fff',
    marginBottom: 16,
  },
  organizerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 16,
    marginBottom: 20,
  },
  organizerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
    color: '#fff',
  },
  organizerUsername: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },

  // Details Card
  detailsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: 'rgba(14,191,138,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailText: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  detailSubvalue: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  detailDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Description
  descriptionSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: colors.grayLight,
    lineHeight: 22,
  },
  readMore: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
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
    borderColor: '#0f0f1a',
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
    backgroundColor: 'rgba(15,15,26,0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  bottomPriceInfo: {
    flex: 1,
  },
  bottomPriceLabel: {
    fontSize: 12,
    color: colors.gray,
  },
  bottomPriceAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFD700',
  },
  bottomPriceText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
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
    backgroundColor: 'rgba(14,191,138,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  joinedText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
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
