import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
  ListRenderItem,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import OptimizedImage from '../../components/OptimizedImage';
import { PeakGridSkeleton } from '../../components/skeleton';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useUserStore } from '../../stores/userStore';
import { awsAPI } from '../../services/aws-api';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

// Module-level cache — survives navigation but not app restart
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let peaksFeedCache: { peaks: Peak[]; timestamp: number } = {
  peaks: [],
  timestamp: 0,
};

/** Clear the module-level peaks feed cache (call on logout/account switch) */
export const clearPeaksFeedCache = () => {
  peaksFeedCache = { peaks: [], timestamp: 0 };
};

/** Sanitize text: strip HTML tags and control characters per CLAUDE.md */
const sanitizeText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
};

interface PeakUser {
  id: string;
  name: string;
  avatar: string;
}

interface Peak {
  id: string;
  videoUrl?: string;
  thumbnail: string;
  duration: number;
  user: PeakUser;
  views: number;
  likes: number;
  repliesCount?: number;
  createdAt: string; // ISO string for React Navigation serialization
  isLiked?: boolean;
  isChallenge?: boolean;
  challengeId?: string;
  challengeTitle?: string;
  textOverlay?: string;
  filterId?: string;
  filterIntensity?: number;
  overlays?: Array<{ id: string; type: string; position: { x: number; y: number; scale: number; rotation: number }; params: Record<string, unknown> }>;
  expiresAt?: string;
  isOwnPeak?: boolean;
}

/** Grouped peaks by user — one card per user, swipable when opened */
interface PeakGroupData {
  userId: string;
  userName: string;
  userAvatar: string;
  peakCount: number;
  latestThumbnail: string;
  totalViews: number;
  peaks: Peak[];
}

type RootStackParamList = {
  PeakView: { peaks: Peak[]; initialIndex: number };
  CreatePeak: undefined;
  Challenges: undefined;
  [key: string]: object | undefined;
};

const PeaksFeedScreen = (): React.JSX.Element => {
  // Use a lightweight remote placeholder to avoid require path issues in prod builds
  const placeholder = 'https://dummyimage.com/600x800/0b0b0b/ffffff&text=Peak';
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const user = useUserStore((state) => state.user);
  const isBusiness = user?.accountType === 'pro_business';
  const [refreshing, setRefreshing] = useState(false);
  const [peaks, setPeaks] = useState<Peak[]>(peaksFeedCache.peaks);
  const [loading, setLoading] = useState(() => peaksFeedCache.peaks.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPeaks = useCallback(async (reset = false) => {
    try {
      if (reset) setLoadError(null);
      if (__DEV__) {
        console.log('[PeaksFeedScreen] Fetching peaks...', { reset, cursor, userId: user?.id });
      }

      const params: { limit: number; cursor?: string } = { limit: 20 };
      if (!reset && cursor) params.cursor = cursor;
      const response = await awsAPI.getPeaks(params);

      if (__DEV__) {
        console.log('[PeaksFeedScreen] API response:', {
          count: response.data?.length || 0,
          nextCursor: response.nextCursor
        });
      }

      const toCdn = (url?: string | null) => {
        if (!url) return null;
        return url.startsWith('http') ? url : awsAPI.getCDNUrl(url);
      };
      const mapped: Peak[] = (response.data || []).map((p) => ({
        id: p.id,
        // Never use videoUrl as an image source; fallback to author avatar if no thumbnail
        videoUrl: toCdn(p.videoUrl) || undefined,
        thumbnail: toCdn(p.thumbnailUrl) || toCdn(p.author?.avatarUrl) || placeholder,
        duration: p.duration || 0,
        user: {
          id: p.author?.id || p.authorId,
          name: sanitizeText(p.author?.fullName || p.author?.username) || 'User',
          avatar: toCdn(p.author?.avatarUrl) || '',
        },
        views: p.viewsCount ?? 0,
        likes: p.likesCount ?? 0,
        repliesCount: p.commentsCount ?? 0,
        createdAt: p.createdAt || new Date().toISOString(),
        isLiked: p.isLiked || false,
        isChallenge: !!p.challenge?.id,
        challengeId: p.challenge?.id,
        challengeTitle: p.challenge?.title,
        textOverlay: p.caption || undefined,
        filterId: p.filterId || undefined,
        filterIntensity: p.filterIntensity ?? undefined,
        overlays: p.overlays || undefined,
        expiresAt: p.expiresAt || undefined,
        isOwnPeak: (p.author?.id || p.authorId) === user?.id,
      }));

      if (__DEV__) {
        console.log('[PeaksFeedScreen] Mapped peaks:', mapped.length);
      }

      if (reset) {
        setPeaks(mapped);
        peaksFeedCache = { peaks: mapped, timestamp: Date.now() };
      } else {
        setPeaks((prev) => {
          const updated = [...prev, ...mapped];
          peaksFeedCache = { peaks: updated, timestamp: Date.now() };
          return updated;
        });
      }
      setCursor(response.nextCursor);
      setHasMore(!!response.nextCursor);
    } catch (error) {
      if (__DEV__) console.warn('[PeaksFeedScreen] Failed to fetch peaks:', error);
      if (reset) {
        setPeaks([]);
        setLoadError('Unable to load peaks. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cursor, user?.id]);

  useEffect(() => {
    const isCacheStale = Date.now() - peaksFeedCache.timestamp > CACHE_TTL;
    if (peaksFeedCache.peaks.length > 0 && !isCacheStale) {
      setLoading(false);
      return;
    }
    fetchPeaks(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setCursor(null);
    fetchPeaks(true);
  }, [fetchPeaks]);

  const handleGroupPress = useCallback((group: PeakGroupData): void => {
    navigation.navigate('PeakView', {
      peaks: group.peaks,
      initialIndex: 0,
    });
  }, [navigation]);

  const handleCreatePeak = (): void => {
    navigation.navigate('CreatePeak');
  };

  const handleGoBack = (): void => {
    navigation.goBack();
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Group peaks by user — one card per user, sorted by most recent peak
  const peakGroups = useMemo((): PeakGroupData[] => {
    const groupMap = new Map<string, PeakGroupData>();
    for (const peak of peaks) {
      const uid = peak.user.id;
      const existing = groupMap.get(uid);
      if (existing) {
        existing.peaks.push(peak);
        existing.peakCount++;
        existing.totalViews += peak.views;
      } else {
        groupMap.set(uid, {
          userId: uid,
          userName: peak.user.name,
          userAvatar: peak.user.avatar,
          peakCount: 1,
          latestThumbnail: peak.thumbnail,
          totalViews: peak.views,
          peaks: [peak],
        });
      }
    }
    return Array.from(groupMap.values());
  }, [peaks]);

  const { leftColumn, rightColumn } = useMemo(() => {
    const left: PeakGroupData[] = [];
    const right: PeakGroupData[] = [];
    peakGroups.forEach((group, index) => {
      if (index % 2 === 0) left.push(group);
      else right.push(group);
    });
    return { leftColumn: left, rightColumn: right };
  }, [peakGroups]);

  const formatViews = useCallback((num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }, []);

  const renderGroupCard = useCallback((group: PeakGroupData): React.JSX.Element => (
    <View key={`peak-group-${group.userId}`} style={styles.peakCardWrapper}>
      <TouchableOpacity
        style={styles.groupCard}
        onPress={() => handleGroupPress(group)}
        activeOpacity={0.9}
      >
        {/* Thumbnail */}
        <OptimizedImage
          source={group.latestThumbnail || undefined}
          style={styles.groupThumbnail as StyleProp<ImageStyle>}
          contentFit="cover"
          priority="normal"
        />

        {/* Peak count badge */}
        {group.peakCount > 1 && (
          <View style={styles.peakCountBadge}>
            <Ionicons name="layers" size={12} color="#fff" />
            <Text style={styles.peakCountText}>{group.peakCount}</Text>
          </View>
        )}

        {/* Challenge badge — show if any peak in group is a challenge */}
        {group.peaks.some(p => p.isChallenge) && (
          <View style={styles.challengeBadge}>
            <Ionicons name="trophy" size={12} color={colors.gold} />
          </View>
        )}

        {/* Overlay with user info */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.groupOverlay}
        >
          <View style={styles.groupUserInfo}>
            <OptimizedImage
              source={group.userAvatar || undefined}
              style={styles.groupAvatar as StyleProp<ImageStyle>}
              contentFit="cover"
              priority="high"
            />
            <Text style={styles.groupUserName} numberOfLines={1}>
              {group.userName}
            </Text>
          </View>
          <View style={styles.groupViewsContainer}>
            <Ionicons name="eye-outline" size={12} color="#fff" />
            <Text style={styles.groupViewsText}>{formatViews(group.totalViews)}</Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  ), [handleGroupPress, formatViews, styles]);

  const renderColumn = useCallback((columnGroups: PeakGroupData[]): React.JSX.Element => (
    <View style={styles.column}>
      {columnGroups.map(renderGroupCard)}
    </View>
  ), [renderGroupCard, styles.column]);

  const renderItem: ListRenderItem<number> = useCallback(() => (
    <View style={styles.masonryContainer}>
      {renderColumn(leftColumn)}
      {renderColumn(rightColumn)}
    </View>
  ), [styles.masonryContainer, renderColumn, leftColumn, rightColumn]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Ionicons name="chevron-back" size={28} color={isDark ? colors.white : colors.dark} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Peaks</Text>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('Challenges')}
          >
            <Ionicons name="trophy" size={22} color={colors.gold} />
          </TouchableOpacity>

          {!isBusiness && peaks.length > 0 ? (
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={handleCreatePeak}
            >
              <Ionicons name="add" size={28} color={colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Loading skeleton */}
      {loading && peaks.length === 0 ? (
        <PeakGridSkeleton />
      ) : !loading && peaks.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name={loadError ? "cloud-offline-outline" : "videocam-outline"} size={56} color={loadError ? colors.grayMuted : colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>{loadError ? 'Connection Issue' : 'No Peaks yet'}</Text>
            <Text style={styles.emptySubtitle}>
              {loadError || 'Peaks are short videos from 6 to 60 seconds to share your fitness moments'}
            </Text>
            {loadError ? (
              <TouchableOpacity style={styles.emptyButton} onPress={() => { setLoading(true); fetchPeaks(true); }}>
                <Ionicons name="refresh" size={22} color={colors.white} />
                <Text style={styles.emptyButtonText}>Retry</Text>
              </TouchableOpacity>
            ) : !isBusiness ? (
              <TouchableOpacity style={styles.emptyButton} onPress={handleCreatePeak}>
                <Ionicons name="add-circle" size={22} color={colors.white} />
                <Text style={styles.emptyButtonText}>Create my first Peak</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>
      ) : (
        /* Grid */
        <FlatList
          data={[1]}
          keyExtractor={() => 'grid'}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.gridContainer}
          renderItem={renderItem}
          onEndReached={() => { if (hasMore && !loading) fetchPeaks(false); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <View style={{ height: 100 }} />
            )
          }
        />
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    paddingHorizontal: 16,
  },
  masonryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: {
    width: COLUMN_WIDTH,
  },
  peakCardWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  groupCard: {
    width: COLUMN_WIDTH,
    height: COLUMN_WIDTH * 1.6,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: isDark ? '#1C1C1E' : '#F5F5F5',
  },
  groupThumbnail: {
    width: '100%',
    height: '100%',
  },
  peakCountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  peakCountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  challengeBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingTop: 40,
  },
  groupUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  groupAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginRight: 8,
  },
  groupUserName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  groupViewsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupViewsText: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.9,
  },
  emptyScrollContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});

export default PeaksFeedScreen;
