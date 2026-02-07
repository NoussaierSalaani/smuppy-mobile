/**
 * SpotDetailScreen
 * Display spot details with map, route, reviews, and qualities.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AvatarImage } from '../../components/OptimizedImage';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MapView, Camera, MarkerView, ShapeSource, LineLayer } from '@rnmapbox/maps';
import { GRADIENTS, COLORS } from '../../config/theme';

const STAR_COLOR = COLORS.gold;
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores';
import { formatDistance, formatDuration } from '../../services/mapbox-directions';
import AddReviewSheet from '../../components/AddReviewSheet';
import type { ReviewData } from '../../components/AddReviewSheet';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { isValidUUID } from '../../utils/formatters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const normalize = (size: number) => Math.round(size * (SCREEN_WIDTH / 390));

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: COLORS.teal,
  medium: COLORS.gold,
  hard: COLORS.heartRed,
  expert: COLORS.purple,
};

interface SpotData {
  name: string;
  description?: string;
  category?: string;
  subcategory?: string;
  sport_type?: string;
  latitude: number;
  longitude: number;
  is_route?: boolean;
  route_geojson?: { type: string; coordinates: number[][] };
  route_distance_km?: number;
  route_duration_min?: number;
  difficulty?: string;
  qualities?: string[];
  rating_average?: number;
  rating_count?: number;
  creator?: { avatar_url?: string; full_name?: string };
  creator_id?: string;
}

interface SpotReview {
  id: string;
  rating: number;
  comment?: string;
  user?: { avatar_url?: string; full_name?: string };
}

const SpotDetailScreen: React.FC<{ navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }; route: { params: { spotId: string } } }> = ({ navigation, route }) => {
  const { spotId } = route.params;
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();

  // SECURITY: Validate UUID on mount
  useEffect(() => {
    if (!spotId || !isValidUUID(spotId)) {
      if (__DEV__) console.warn('[SpotDetailScreen] Invalid spotId:', spotId);
      showError('Error', 'Invalid spot');
      navigation.goBack();
    }
  }, [spotId, showError, navigation]);
  const accountType = useUserStore((s) => s.user?.accountType);
  const isVerified = useUserStore((s) => s.user?.isVerified);
  const isPremium = useUserStore((s) => s.user?.isPremium);
  const canReview = isVerified || accountType === 'pro_creator' || (accountType === 'pro_business' && isPremium);

  const [spot, setSpot] = useState<SpotData | null>(null);
  const [reviews, setReviews] = useState<SpotReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showReviewSheet, setShowReviewSheet] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [spotRes, reviewsRes] = await Promise.all([
        awsAPI.getSpot(spotId),
        awsAPI.getReviews({ target_id: spotId, target_type: 'spot', limit: 20 }),
      ]);
      if (spotRes.success) setSpot((spotRes.spot || null) as unknown as SpotData | null);
      if (reviewsRes.success) setReviews((reviewsRes.reviews || []) as unknown as SpotReview[]);
    } catch (err) {
      if (__DEV__) console.warn('Failed to load spot:', err);
    } finally {
      setIsLoading(false);
    }
  }, [spotId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmitReview = useCallback(async (data: ReviewData) => {
    setIsSubmittingReview(true);
    try {
      const response = await awsAPI.createReview({
        target_id: spotId,
        target_type: 'spot',
        rating: data.rating,
        comment: data.comment,
        qualities: data.qualities,
      });
      if (response.success) {
        setShowReviewSheet(false);
        loadData();
      }
    } catch (err) {
      if (__DEV__) console.warn('Failed to submit review:', err);
    } finally {
      setIsSubmittingReview(false);
    }
  }, [spotId, loadData]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!spot) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Spot not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.linkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const routeGeoJSON = spot.route_geojson ? {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: spot.route_geojson as GeoJSON.Geometry,
    }],
  } : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
            <Ionicons name="arrow-back" size={normalize(24)} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{spot.name}</Text>
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            styleURL="mapbox://styles/mapbox/streets-v12"
            logoEnabled={false}
            attributionEnabled={false}
            scaleBarEnabled={false}
          >
            <Camera
              zoomLevel={spot.is_route ? 12 : 14}
              centerCoordinate={[spot.longitude, spot.latitude]}
              animationDuration={0}
            />
            <MarkerView coordinate={[spot.longitude, spot.latitude]}>
              <LinearGradient colors={GRADIENTS.primary} style={styles.pin}>
                <Ionicons name="location" size={normalize(18)} color={colors.white} />
              </LinearGradient>
            </MarkerView>
            {routeGeoJSON && (
              <ShapeSource id="routeLine" shape={routeGeoJSON}>
                <LineLayer
                  id="routeLineLayer"
                  style={{ lineColor: colors.primary, lineWidth: 4, lineCap: 'round', lineJoin: 'round', lineOpacity: 0.85 }}
                />
              </ShapeSource>
            )}
          </MapView>
        </View>

        <View style={styles.content}>
          {/* Name + Rating */}
          <Text style={styles.spotName}>{spot.name}</Text>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={normalize(16)} color={STAR_COLOR} />
            <Text style={styles.ratingText}>
              {spot.rating_average?.toFixed(1) || 'N/A'} ({spot.rating_count || 0} reviews)
            </Text>
            <Text style={styles.categoryBadge}>
              {spot.category}{spot.subcategory ? ` · ${spot.subcategory}` : ''}
            </Text>
          </View>

          {/* Creator */}
          {spot.creator && spot.creator_id && isValidUUID(spot.creator_id) && (
            <TouchableOpacity
              style={styles.creatorRow}
              onPress={() => navigation.navigate('UserProfile', { userId: spot.creator_id })}
            >
              <AvatarImage source={spot.creator.avatar_url} size={normalize(32)} />
              <Text style={styles.creatorName}>Suggested by {spot.creator.full_name}</Text>
            </TouchableOpacity>
          )}

          {/* Route info */}
          {spot.is_route && spot.route_distance_km && (
            <View style={styles.routeCard}>
              <View style={styles.routeStatsRow}>
                <View style={styles.routeStat}>
                  <Text style={styles.routeStatValue}>{formatDistance(spot.route_distance_km)}</Text>
                  <Text style={styles.routeStatLabel}>Distance</Text>
                </View>
                <View style={styles.routeStatDivider} />
                <View style={styles.routeStat}>
                  <Text style={styles.routeStatValue}>{formatDuration(spot.route_duration_min || 0)}</Text>
                  <Text style={styles.routeStatLabel}>Est. Time</Text>
                </View>
                <View style={styles.routeStatDivider} />
                <View style={styles.routeStat}>
                  <Text style={[styles.routeStatValue, { color: (spot.difficulty && DIFFICULTY_COLORS[spot.difficulty]) || colors.dark }]}>
                    {spot.difficulty ? spot.difficulty.charAt(0).toUpperCase() + spot.difficulty.slice(1) : 'N/A'}
                  </Text>
                  <Text style={styles.routeStatLabel}>Difficulty</Text>
                </View>
              </View>
            </View>
          )}

          {/* Description */}
          {spot.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.descriptionText}>{spot.description}</Text>
            </View>
          )}

          {/* Qualities */}
          {spot.qualities && spot.qualities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Qualities</Text>
              <View style={styles.qualitiesRow}>
                {spot.qualities.map((q: string) => (
                  <View key={q} style={styles.qualityChip}>
                    <Ionicons name="checkmark-circle" size={normalize(14)} color={colors.primary} />
                    <Text style={styles.qualityText}>{q}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Reviews */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Reviews ({reviews.length})</Text>
              {canReview && (
                <TouchableOpacity onPress={() => setShowReviewSheet(true)}>
                  <LinearGradient colors={GRADIENTS.primary} style={styles.addReviewBtn}>
                    <Ionicons name="add" size={normalize(16)} color={colors.white} />
                    <Text style={styles.addReviewText}>Add</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            {reviews.length === 0 ? (
              <Text style={styles.emptyText}>No reviews yet. Be the first!</Text>
            ) : (
              reviews.map((rev) => (
                <View key={rev.id} style={styles.reviewItem}>
                  <View style={styles.reviewHeader}>
                    <AvatarImage source={rev.user?.avatar_url} size={normalize(30)} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reviewName}>{rev.user?.full_name}</Text>
                      <View style={styles.reviewStars}>
                        {[1, 2, 3, 4, 5].map(s => (
                          <Ionicons
                            key={s}
                            name={s <= rev.rating ? 'star' : 'star-outline'}
                            size={normalize(12)}
                            color={s <= rev.rating ? STAR_COLOR : colors.grayBorder}
                          />
                        ))}
                      </View>
                    </View>
                  </View>
                  {rev.comment && <Text style={styles.reviewComment}>{rev.comment}</Text>}
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <AddReviewSheet
        visible={showReviewSheet}
        onClose={() => setShowReviewSheet(false)}
        onSubmit={handleSubmitReview}
        targetName={spot.name}
        category={spot.sport_type || spot.category}
        isSubmitting={isSubmittingReview}
      />
    </SafeAreaView>
  );
};

export default SpotDetailScreen;

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: normalize(16), color: colors.gray, marginBottom: 12 },
  linkText: { fontSize: normalize(14), color: colors.primary, fontWeight: '500' },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: normalize(18), fontWeight: '700', color: colors.dark, marginLeft: 12 },

  mapContainer: { height: 220, marginHorizontal: 16, borderRadius: normalize(16), overflow: 'hidden' },
  map: { flex: 1 },
  pin: { width: normalize(36), height: normalize(36), borderRadius: normalize(18), justifyContent: 'center', alignItems: 'center' },

  content: { padding: 20 },
  spotName: { fontSize: normalize(24), fontWeight: '700', color: colors.dark, marginBottom: 8 },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  ratingText: { fontSize: normalize(14), fontWeight: '600', color: colors.dark },
  categoryBadge: { fontSize: normalize(12), color: colors.gray, marginLeft: 8 },

  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  creatorAvatar: { width: normalize(32), height: normalize(32), borderRadius: normalize(16) },
  creatorName: { fontSize: normalize(13), color: colors.gray },

  routeCard: { backgroundColor: colors.gray50, borderRadius: normalize(14), padding: 16, marginBottom: 16 },
  routeStatsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  routeStat: { alignItems: 'center', gap: 4 },
  routeStatValue: { fontSize: normalize(16), fontWeight: '700', color: colors.dark },
  routeStatLabel: { fontSize: normalize(11), color: colors.gray },
  routeStatDivider: { width: 1, height: 30, backgroundColor: colors.grayBorder },

  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: normalize(16), fontWeight: '600', color: colors.dark, marginBottom: 8 },
  descriptionText: { fontSize: normalize(14), color: colors.gray, lineHeight: normalize(20) },

  qualitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  qualityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#E7FCF6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: normalize(16),
  },
  qualityText: { fontSize: normalize(12), color: colors.primary, fontWeight: '500' },

  addReviewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: normalize(20),
  },
  addReviewText: { fontSize: normalize(13), fontWeight: '600', color: colors.white },
  emptyText: { fontSize: normalize(14), color: colors.gray, fontStyle: 'italic' },

  reviewItem: {
    backgroundColor: colors.gray50, borderRadius: normalize(12), padding: 14, marginBottom: 10,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  reviewAvatar: { width: normalize(30), height: normalize(30), borderRadius: normalize(15) },
  reviewName: { fontSize: normalize(13), fontWeight: '600', color: colors.dark },
  reviewStars: { flexDirection: 'row', gap: 2, marginTop: 2 },
  reviewComment: { fontSize: normalize(13), color: colors.gray, lineHeight: normalize(18) },
});
