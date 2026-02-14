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
  ActivityIndicator,
  ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AvatarImage, ThumbnailImage } from '../../components/OptimizedImage';
import { PeakGridSkeleton } from '../../components/skeleton';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useUserStore } from '../../stores/userStore';
import { awsAPI } from '../../services/aws-api';
import { resolveDisplayName } from '../../types/profile';

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
  isViewed?: boolean;
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
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPeaks = useCallback(async (reset = false) => {
    try {
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
          name: resolveDisplayName(p.author),
          avatar: toCdn(p.author?.avatarUrl) || '',
        },
        views: p.viewsCount ?? 0,
        likes: p.likesCount ?? 0,
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
        isViewed: !!(p as unknown as { isViewed?: boolean }).isViewed,
      }));
      
      if (__DEV__) {
        console.log('[PeaksFeedScreen] Mapped peaks:', mapped.length);
      }
      
      setPeaks(reset ? mapped : (prev) => [...prev, ...mapped]);
      setCursor(response.nextCursor);
      setHasMore(!!response.nextCursor);
    } catch (error) {
      if (__DEV__) console.warn('[PeaksFeedScreen] Failed to fetch peaks:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cursor, user?.id]);

  useEffect(() => {
    fetchPeaks(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setCursor(null);
    fetchPeaks(true);
  }, [fetchPeaks]);

  // Group peaks by author for story circles (per PEAKS.md §3.3)
  const authorGroups = useMemo(() => {
    const groups = new Map<string, { user: PeakUser; peaks: Peak[]; hasUnwatched: boolean; latestCreatedAt: string }>();
    peaks.forEach(peak => {
      const userId = peak.user.id;
      const existing = groups.get(userId);
      if (existing) {
        existing.peaks.push(peak);
        if (!peak.isViewed) existing.hasUnwatched = true;
        if (peak.createdAt > existing.latestCreatedAt) {
          existing.latestCreatedAt = peak.createdAt;
        }
      } else {
        groups.set(userId, {
          user: peak.user,
          peaks: [peak],
          hasUnwatched: !peak.isViewed,
          latestCreatedAt: peak.createdAt,
        });
      }
    });
    // Sort: unviewed groups first, then by latest peak created_at DESC
    const sorted = Array.from(groups.values());
    sorted.sort((a, b) => {
      if (a.hasUnwatched !== b.hasUnwatched) return a.hasUnwatched ? -1 : 1;
      return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
    });
    // Sort peaks within each group by created_at ASC (oldest first = watch in order)
    for (const group of sorted) {
      group.peaks.sort((a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    return sorted;
  }, [peaks]);

  // Peaks reorganized into contiguous author groups for story navigation
  const groupedPeaks = useMemo(() => {
    return authorGroups.flatMap(g => g.peaks);
  }, [authorGroups]);

  const handleStoryPress = useCallback((group: { user: PeakUser; peaks: Peak[] }): void => {
    // Navigate to first peak of this author in the grouped list
    const index = groupedPeaks.findIndex(p => p.user.id === group.user.id);
    const safeIndex = index >= 0 ? index : 0;
    navigation.navigate('PeakView', {
      peaks: groupedPeaks,
      initialIndex: safeIndex,
    });
  }, [groupedPeaks, navigation]);

  const handleCreatePeak = (): void => {
    navigation.navigate('CreatePeak');
  };

  const handleGoBack = (): void => {
    navigation.goBack();
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Split author groups into 2 columns for Messenger Reels-style layout
  const { leftGroups, rightGroups } = useMemo(() => {
    const left: typeof authorGroups = [];
    const right: typeof authorGroups = [];
    authorGroups.forEach((group, index) => {
      if (index % 2 === 0) left.push(group);
      else right.push(group);
    });
    return { leftGroups: left, rightGroups: right };
  }, [authorGroups]);

  // Render a big author group card (Messenger Reels style)
  const renderGroupCard = useCallback((group: typeof authorGroups[0]) => {
    const latestPeak = group.peaks[group.peaks.length - 1];
    const thumbnail = latestPeak?.thumbnail;
    return (
      <TouchableOpacity
        key={group.user.id}
        style={styles.reelCard}
        onPress={() => handleStoryPress(group)}
        activeOpacity={0.9}
      >
        <ThumbnailImage source={thumbnail} style={styles.reelThumb} />

        {group.hasUnwatched && (
          <LinearGradient
            colors={['#0EBF8A', '#00B5C1', '#0081BE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.reelUnwatchedRing}
          />
        )}

        {group.peaks.length > 1 && (
          <View style={styles.reelCountBadge}>
            <Text style={styles.reelCountText}>{group.peaks.length}</Text>
          </View>
        )}

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={styles.reelOverlay}
        >
          <View style={styles.reelAuthorRow}>
            <AvatarImage source={group.user.avatar} size={28} />
            <Text style={styles.reelAuthorName} numberOfLines={1}>
              {sanitizeText(group.user.name)}
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }, [handleStoryPress, styles]);

  const renderColumns = useCallback((): React.JSX.Element => (
    <View style={styles.reelGrid}>
      <View style={styles.reelColumn}>
        {leftGroups.map(renderGroupCard)}
      </View>
      <View style={styles.reelColumn}>
        {rightGroups.map(renderGroupCard)}
      </View>
    </View>
  ), [styles, leftGroups, rightGroups, renderGroupCard]);

  const renderItem: ListRenderItem<number> = useCallback(() => renderColumns(), [renderColumns]);

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
          {!isBusiness && (
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('Challenges')}
          >
            <Ionicons name="trophy" size={22} color="#FFD700" />
          </TouchableOpacity>
          )}

          {peaks.length > 0 && !isBusiness ? (
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
              <Ionicons name="videocam-outline" size={56} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No Peaks yet</Text>
            <Text style={styles.emptySubtitle}>
              Peaks are short videos from 6 to 60 seconds to share your fitness moments
            </Text>
            {!isBusiness && (
            <TouchableOpacity style={styles.emptyButton} onPress={handleCreatePeak}>
              <Ionicons name="add-circle" size={22} color={colors.white} />
              <Text style={styles.emptyButtonText}>Create my first Peak</Text>
            </TouchableOpacity>
            )}
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
    paddingHorizontal: 12,
  },
  // Messenger Reels-style layout
  reelGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  reelColumn: {
    flex: 1,
    gap: 8,
  },
  reelCard: {
    width: '100%',
    aspectRatio: 0.65,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: isDark ? '#1C1C1E' : '#F0F0F0',
  },
  reelThumb: {
    width: '100%',
    height: '100%',
  },
  reelUnwatchedRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  reelCountBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 10,
    minWidth: 22,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  reelCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  reelOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingBottom: 12,
    paddingTop: 30,
  },
  reelAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reelAuthorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
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
