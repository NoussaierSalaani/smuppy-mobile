/**
 * GroupDetailScreen
 * View group activity details, route, participants, join/leave.
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
import * as Haptics from 'expo-haptics';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { formatDistance, formatDuration } from '../../services/mapbox-directions';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const normalize = (size: number) => Math.round(size * (SCREEN_WIDTH / 390));

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4ECDC4',
  medium: '#FFD700',
  hard: '#FF6B6B',
  expert: '#9B59B6',
};

const GroupDetailScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { showError } = useSmuppyAlert();
  const { colors, isDark } = useTheme();
  const { groupId } = route.params;
  const userId = useUserStore((s) => s.user?.id);

  const [group, setGroup] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [hasJoined, setHasJoined] = useState(false);

  const loadGroup = useCallback(async () => {
    try {
      const response = await awsAPI.getGroup(groupId);
      if (response.success && response.group) {
        setGroup(response.group);
        setHasJoined(response.group.participants?.some((p: any) => p.id === userId) || false);
      }
    } catch (err) {
      if (__DEV__) console.warn('Failed to load group:', err);
    } finally {
      setIsLoading(false);
    }
  }, [groupId, userId]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  const handleJoin = useCallback(async () => {
    setIsJoining(true);
    try {
      const response = hasJoined
        ? await awsAPI.leaveGroup(groupId)
        : await awsAPI.joinGroup(groupId);

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setHasJoined(!hasJoined);
        loadGroup();
      } else {
        showError('Error', response.message || 'Something went wrong');
      }
    } catch (err: any) {
      showError('Error', err.message || 'Something went wrong');
    } finally {
      setIsJoining(false);
    }
  }, [groupId, hasJoined, loadGroup]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Group not found</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const startsAt = new Date(group.starts_at);
  const isCreator = group.creator_id === userId;
  const routeGeoJSON = group.route_geojson ? {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      properties: {},
      geometry: group.route_geojson,
    }],
  } : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={normalize(24)} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
          {isCreator && (
            <TouchableOpacity style={styles.headerButton}>
              <Ionicons name="settings-outline" size={normalize(22)} color={colors.dark} />
            </TouchableOpacity>
          )}
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
              zoomLevel={13}
              centerCoordinate={[group.longitude, group.latitude]}
              animationDuration={0}
            />

            {/* Location pin */}
            <MarkerView coordinate={[group.longitude, group.latitude]}>
              <View style={styles.pinContainer}>
                <LinearGradient colors={GRADIENTS.primary} style={styles.pin}>
                  <Ionicons name="people" size={normalize(18)} color={colors.white} />
                </LinearGradient>
              </View>
            </MarkerView>

            {/* Route line */}
            {routeGeoJSON && (
              <ShapeSource id="routeLine" shape={routeGeoJSON}>
                <LineLayer
                  id="routeLineLayer"
                  style={{
                    lineColor: colors.primary,
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
                    lineOpacity: 0.85,
                  }}
                />
              </ShapeSource>
            )}
          </MapView>
        </View>

        {/* Info */}
        <View style={styles.content}>
          <Text style={styles.groupName}>{group.name}</Text>

          {/* Creator */}
          {group.creator && (
            <TouchableOpacity
              style={styles.creatorRow}
              onPress={() => navigation.navigate('UserProfile', { userId: group.creator_id })}
            >
              <AvatarImage source={group.creator.avatar_url} size={normalize(40)} />
              <View>
                <Text style={styles.creatorName}>{group.creator.full_name}</Text>
                <Text style={styles.creatorLabel}>Organizer</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Details */}
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Ionicons name="calendar-outline" size={normalize(18)} color={colors.primary} />
              <Text style={styles.detailText}>
                {startsAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>

            {group.address && (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={normalize(18)} color={colors.primary} />
                <Text style={styles.detailText}>{group.address}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <Ionicons name="people-outline" size={normalize(18)} color={colors.primary} />
              <Text style={styles.detailText}>
                {group.current_participants || 0}{group.max_participants ? ` / ${group.max_participants}` : ''} participants
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Ionicons name="cash-outline" size={normalize(18)} color={colors.primary} />
              <Text style={styles.detailText}>
                {group.is_free ? 'Free' : `$${group.price} ${group.currency || 'CAD'}`}
              </Text>
            </View>
          </View>

          {/* Route info */}
          {group.is_route && group.route_distance_km && (
            <View style={styles.routeCard}>
              <Text style={styles.routeCardTitle}>Route Info</Text>
              <View style={styles.routeStatsRow}>
                <View style={styles.routeStat}>
                  <Text style={styles.routeStatValue}>{formatDistance(group.route_distance_km)}</Text>
                  <Text style={styles.routeStatLabel}>Distance</Text>
                </View>
                <View style={styles.routeStatDivider} />
                <View style={styles.routeStat}>
                  <Text style={styles.routeStatValue}>{formatDuration(group.route_duration_min || 0)}</Text>
                  <Text style={styles.routeStatLabel}>Est. Time</Text>
                </View>
                <View style={styles.routeStatDivider} />
                <View style={styles.routeStat}>
                  <Text style={[styles.routeStatValue, { color: DIFFICULTY_COLORS[group.difficulty] || colors.dark }]}>
                    {group.difficulty ? group.difficulty.charAt(0).toUpperCase() + group.difficulty.slice(1) : 'N/A'}
                  </Text>
                  <Text style={styles.routeStatLabel}>Difficulty</Text>
                </View>
              </View>
            </View>
          )}

          {/* Description */}
          {group.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.descriptionText}>{group.description}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom action */}
      {!isCreator && (
        <View style={styles.bottomBar}>
          <TouchableOpacity activeOpacity={0.85} onPress={handleJoin} disabled={isJoining}>
            <LinearGradient
              colors={hasJoined ? [colors.grayBorder, colors.grayBorder] : GRADIENTS.primary}
              style={styles.joinButton}
            >
              {isJoining ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name={hasJoined ? 'exit-outline' : 'enter-outline'} size={normalize(20)} color={colors.white} />
                  <Text style={styles.joinButtonText}>{hasJoined ? 'Leave Group' : 'Join Group'}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

export default GroupDetailScreen;

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: normalize(16), color: colors.gray, marginBottom: 12 },
  backLink: { fontSize: normalize(14), color: colors.primary, fontWeight: '500' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: normalize(18),
    fontWeight: '700',
    color: colors.dark,
    marginLeft: 12,
  },

  // Map
  mapContainer: {
    height: 220,
    marginHorizontal: 16,
    borderRadius: normalize(16),
    overflow: 'hidden',
  },
  map: { flex: 1 },
  pinContainer: { alignItems: 'center' },
  pin: {
    width: normalize(36),
    height: normalize(36),
    borderRadius: normalize(18),
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Content
  content: { padding: 20 },
  groupName: {
    fontSize: normalize(24),
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 12,
  },

  // Creator
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  creatorAvatar: {
    width: normalize(40),
    height: normalize(40),
    borderRadius: normalize(20),
  },
  creatorName: {
    fontSize: normalize(15),
    fontWeight: '600',
    color: colors.dark,
  },
  creatorLabel: {
    fontSize: normalize(12),
    color: colors.gray,
  },

  // Details card
  detailsCard: {
    backgroundColor: colors.gray50,
    borderRadius: normalize(14),
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    flex: 1,
    fontSize: normalize(14),
    color: colors.dark,
  },

  // Route card
  routeCard: {
    backgroundColor: colors.gray50,
    borderRadius: normalize(14),
    padding: 16,
    marginBottom: 16,
  },
  routeCardTitle: {
    fontSize: normalize(15),
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 12,
  },
  routeStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  routeStat: { alignItems: 'center', gap: 4 },
  routeStatValue: {
    fontSize: normalize(16),
    fontWeight: '700',
    color: colors.dark,
  },
  routeStatLabel: {
    fontSize: normalize(11),
    color: colors.gray,
  },
  routeStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: colors.grayBorder,
  },

  // Description
  descriptionSection: { marginBottom: 20 },
  sectionTitle: {
    fontSize: normalize(16),
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: normalize(14),
    color: colors.gray,
    lineHeight: normalize(20),
  },

  // Bottom
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.grayBorder,
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: normalize(14),
    gap: 8,
  },
  joinButtonText: {
    fontSize: normalize(16),
    fontWeight: '600',
    color: colors.white,
  },
});
