import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { awsAPI, type ActivityItem } from '../../services/aws-api';
import { AvatarImage } from '../../components/OptimizedImage';
import { SkeletonBase, SkeletonLine } from '../../components/skeleton';
import { formatTimeAgo } from '../../utils/dateFormatters';
import { isValidUUID } from '../../utils/formatters';
import { resolveDisplayName } from '../../types/profile';
import { SPACING, HIT_SLOP } from '../../config/theme';
import type { MainStackParamList } from '../../types';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'likes', label: 'Likes' },
  { key: 'follow', label: 'Follows' },
  { key: 'comments', label: 'Comments' },
] as const;

type FilterKey = typeof FILTER_OPTIONS[number]['key'];

/** Map filter chip key to API type param */
function filterToApiType(filter: FilterKey): string | undefined {
  switch (filter) {
    case 'all': return undefined;
    case 'likes': return undefined; // client-side: show post_like + peak_like
    case 'follow': return 'follow';
    case 'comments': return undefined; // client-side: show comment + peak_comment
  }
}

/** Client-side filter for combined types (likes = post_like + peak_like) */
function matchesFilter(item: ActivityItem, filter: FilterKey): boolean {
  switch (filter) {
    case 'all': return true;
    case 'likes': return item.activityType === 'post_like' || item.activityType === 'peak_like';
    case 'follow': return item.activityType === 'follow';
    case 'comments': return item.activityType === 'comment' || item.activityType === 'peak_comment';
  }
}

function getActivityIcon(type: ActivityItem['activityType']): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (type) {
    case 'post_like':
    case 'peak_like':
      return { name: 'heart', color: '#FF4458' };
    case 'follow':
      return { name: 'person-add', color: '#3B82F6' };
    case 'comment':
    case 'peak_comment':
    default:
      return { name: 'chatbubble', color: '#10B981' };
  }
}

function getActivityDescription(item: ActivityItem): string {
  const name = resolveDisplayName(item.targetUser, 'someone');
  switch (item.activityType) {
    case 'post_like': return `You liked ${name}'s post`;
    case 'peak_like': return `You liked ${name}'s Peak`;
    case 'follow': return `You started following ${name}`;
    case 'comment': return `You commented on ${name}'s post`;
    case 'peak_comment':
    default: return `You commented on ${name}'s Peak`;
  }
}

function getThumbnail(item: ActivityItem): string | null {
  if (!item.targetData) return null;
  return item.targetData.mediaUrl || item.targetData.thumbnailUrl || null;
}

// ============================================
// SKELETON
// ============================================

const skeletonStyles = StyleSheet.create({
  container: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarMargin: { marginRight: 12 },
  textCol: { flex: 1 },
  textGap: { marginBottom: 6 },
});

const ActivitySkeleton = React.memo(function ActivitySkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={i} style={skeletonStyles.row}>
          <SkeletonBase width={44} height={44} borderRadius={22} style={skeletonStyles.avatarMargin} />
          <View style={skeletonStyles.textCol}>
            <SkeletonLine width="75%" height={14} style={skeletonStyles.textGap} />
            <SkeletonLine width="40%" height={12} />
          </View>
          <SkeletonBase width={40} height={40} borderRadius={8} />
        </View>
      ))}
    </View>
  );
});

// ============================================
// ACTIVITY ITEM
// ============================================

type ActivityItemRowProps = Readonly<{
  item: ActivityItem;
  styles: ReturnType<typeof createStyles>;
  onPress: (item: ActivityItem) => void;
  onAvatarPress: (userId: string) => void;
}>;

const ActivityItemRow = React.memo(function ActivityItemRow({
  item,
  styles,
  onPress,
  onAvatarPress,
}: ActivityItemRowProps) {
  const icon = getActivityIcon(item.activityType);
  const description = getActivityDescription(item);
  const thumbnail = getThumbnail(item);
  const time = formatTimeAgo(new Date(item.createdAt));

  return (
    <TouchableOpacity
      style={styles.activityItem}
      onPress={() => onPress(item)}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.avatarContainer}
        onPress={() => item.targetUser?.id && onAvatarPress(item.targetUser.id)}
      >
        <AvatarImage source={item.targetUser?.avatarUrl} size={44} />
        <View style={[styles.typeIcon, { backgroundColor: icon.color }]}>
          <Ionicons name={icon.name} size={10} color="#fff" />
        </View>
      </TouchableOpacity>

      <View style={styles.activityContent}>
        <Text style={styles.activityText} numberOfLines={2}>
          {description}
        </Text>
        {item.targetData?.text && (
          <Text style={styles.previewText} numberOfLines={1}>
            "{item.targetData.text}"
          </Text>
        )}
        <Text style={styles.timeText}>{time}</Text>
      </View>

      {thumbnail ? (
        <Image
          source={{ uri: thumbnail }}
          style={styles.thumbnail}
        />
      ) : null}
    </TouchableOpacity>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================

export default function ActivityHistoryScreen(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const cursorRef = useRef<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loadingMoreRef = useRef(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const fetchActivity = useCallback(async (isRefresh = false) => {
    try {
      const apiType = filterToApiType(activeFilter);
      const response = await awsAPI.getActivityHistory({
        limit: 30,
        cursor: isRefresh ? undefined : cursorRef.current || undefined,
        type: apiType,
      });

      const items = response.data || [];

      if (isRefresh) {
        setActivities(items);
      } else {
        setActivities(prev => [...prev, ...items]);
      }

      cursorRef.current = response.nextCursor || null;
      setHasMore(response.hasMore || false);
    } catch (err) {
      if (__DEV__) console.warn('Error fetching activity:', err);
    }
  }, [activeFilter]);

  // Initial load
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (mounted) setLoading(true);
      cursorRef.current = null;
      await fetchActivity(true);
      if (mounted) setLoading(false);
    };
    load().catch(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [fetchActivity]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    cursorRef.current = null;
    await fetchActivity(true);
    setRefreshing(false);
  }, [fetchActivity]);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    await fetchActivity(false);
    loadingMoreRef.current = false;
  }, [hasMore, fetchActivity]);

  const navigateToContent = useCallback((item: ActivityItem) => {
    switch (item.activityType) {
      case 'post_like':
      case 'comment':
        if (item.targetData?.postId && isValidUUID(item.targetData.postId)) {
          navigation.navigate('PostDetailFanFeed', { postId: item.targetData.postId });
          return;
        }
        break;
      case 'peak_like':
      case 'peak_comment':
        if (item.targetData?.peakId && isValidUUID(item.targetData.peakId)) {
          navigation.navigate('PeakView', { peakId: item.targetData.peakId });
          return;
        }
        break;
      case 'follow':
        if (item.targetUser?.id && isValidUUID(item.targetUser.id)) {
          navigation.navigate('UserProfile', { userId: item.targetUser.id });
          return;
        }
        break;
    }
    // Fallback to user profile
    if (item.targetUser?.id && isValidUUID(item.targetUser.id)) {
      navigation.navigate('UserProfile', { userId: item.targetUser.id });
    }
  }, [navigation]);

  const goToUserProfile = useCallback((userId: string) => {
    if (isValidUUID(userId)) {
      navigation.navigate('UserProfile', { userId });
    }
  }, [navigation]);

  // Client-side filtering for combined types
  const filteredActivities = useMemo(() => {
    if (activeFilter === 'all') return activities;
    return activities.filter(item => matchesFilter(item, activeFilter));
  }, [activities, activeFilter]);

  const renderItem = useCallback(({ item }: { item: ActivityItem }) => (
    <ActivityItemRow
      item={item}
      styles={styles}
      onPress={navigateToContent}
      onAvatarPress={goToUserProfile}
    />
  ), [styles, navigateToContent, goToUserProfile]);

  const keyExtractor = useCallback((item: ActivityItem, index: number) =>
    `${item.activityType}-${item.createdAt}-${index}`, []);

  const ListEmptyComponent = useMemo(() => {
    if (loading) return <ActivitySkeleton />;
    return (
      <View style={styles.emptyState}>
        <Ionicons name="time-outline" size={60} color={colors.grayLight} />
        <Text style={styles.emptyTitle}>No activity yet</Text>
        <Text style={styles.emptySubtitle}>
          Your likes, follows, and comments will show up here
        </Text>
      </View>
    );
  }, [loading, styles, colors.grayLight]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP.medium}
        >
          <Ionicons name="chevron-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Activity</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {FILTER_OPTIONS.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[styles.filterChip, activeFilter === filter.key && styles.filterChipActive]}
            onPress={() => setActiveFilter(filter.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                activeFilter === filter.key && styles.filterChipTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Activity List */}
      <FlatList
        data={filteredActivities}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={<View style={styles.bottomSpacer} />}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  backButton: {
    padding: 8,
    marginRight: 4,
  },
  headerTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 24,
    color: colors.dark,
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  filtersContainer: {
    maxHeight: 50,
  },
  filtersContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  filterChip: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    marginRight: SPACING.sm,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.gray,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SPACING.md,
  },
  typeIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  activityContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  activityText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
  },
  previewText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  timeText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.grayMuted,
    marginTop: 4,
  },
  thumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.dark,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  bottomSpacer: {
    height: 100,
  },
});
