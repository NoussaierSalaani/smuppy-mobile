import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { AvatarImage } from '../../components/OptimizedImage';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { NavigationProp, useNavigation, useFocusEffect } from '@react-navigation/native';
import { GRADIENTS, SIZES, SPACING } from '../../config/theme';
import { getPendingFollowRequestsCount } from '../../services/database';
import { awsAPI } from '../../services/aws-api';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useAppStore } from '../../stores';
import { NotificationsSkeleton } from '../../components/skeleton';
import { usePrefetchProfile } from '../../hooks';

// ============================================
// TYPES
// ============================================

interface NotificationUser {
  id: string;
  name: string;
  avatar: string;
  isVerified: boolean;
}

interface BaseNotification {
  id: number | string;
  time: string;
  isRead: boolean;
}

interface UserNotification extends BaseNotification {
  type: 'follow' | 'like' | 'live' | 'peak_reply';
  user: NotificationUser;
  message: string;
  isFollowing?: boolean;
  postImage?: string;
}

interface SystemNotification extends BaseNotification {
  type: 'system' | 'reminder';
  icon: string;
  title: string;
  message: string;
}

type Notification = UserNotification | SystemNotification;

interface Filter {
  key: string;
  label: string;
}

type RootStackParamList = {
  UserProfile: { userId: string };
  NotificationSettings: undefined;
  FollowRequests: undefined;
  [key: string]: object | undefined;
};

// ============================================
// HELPERS
// ============================================

// Map backend notification types to frontend display types
function mapNotificationType(backendType: string): UserNotification['type'] {
  switch (backendType) {
    case 'new_follower':
    case 'follow_request':
      return 'follow';
    case 'like':
    case 'peak_like':
      return 'like';
    case 'comment':
    case 'peak_comment':
    case 'peak_reply':
      return 'peak_reply';
    case 'live':
      return 'live';
    default:
      return 'like';
  }
}

// Transform API notification to display format
function transformNotification(apiNotif: any): Notification {
  const baseNotif = {
    id: apiNotif.id,
    time: formatTimeAgo(new Date(apiNotif.createdAt)),
    isRead: apiNotif.read,
  };

  // System/reminder notifications
  if (apiNotif.type === 'system' || apiNotif.type === 'reminder') {
    return {
      ...baseNotif,
      type: apiNotif.type,
      icon: apiNotif.data?.icon || 'notifications',
      title: apiNotif.title || 'Notification',
      message: apiNotif.body || '',
    } as SystemNotification;
  }

  // User notifications (follow, like, comment, peak_comment, peak_reply, live, etc.)
  const userData = apiNotif.data?.user || {};
  const mappedType = mapNotificationType(apiNotif.type);
  return {
    ...baseNotif,
    type: mappedType,
    user: {
      id: userData.id || apiNotif.data?.actorId || '',
      name: userData.name || userData.username || 'User',
      avatar: userData.avatar || userData.avatarUrl || null,
      isVerified: userData.isVerified || false,
    },
    message: apiNotif.body || getDefaultMessage(mappedType),
    isFollowing: apiNotif.data?.isFollowing,
    postImage: apiNotif.data?.postImage || apiNotif.data?.thumbnailUrl,
  } as UserNotification;
}

function getDefaultMessage(type: string): string {
  switch (type) {
    case 'follow': return 'became your fan';
    case 'like': return 'liked your post';
    case 'peak_reply': return 'replied to your Peak';
    case 'live': return 'is live now';
    default: return 'interacted with your content';
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function NotificationsScreen(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [followRequestsCount, setFollowRequestsCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Fetch notifications from API — uses ref for cursor to avoid stale closure
  const fetchNotifications = useCallback(async (isRefresh = false) => {
    try {
      const response = await awsAPI.getNotifications({
        limit: 20,
        cursor: isRefresh ? undefined : cursorRef.current || undefined,
      });

      const items = response.data || [];
      const transformed = items.map(transformNotification);

      if (isRefresh) {
        setNotifications(transformed);
      } else {
        setNotifications(prev => [...prev, ...transformed]);
      }

      cursorRef.current = response.nextCursor || null;
      setHasMore(response.hasMore || false);
    } catch (error) {
      if (__DEV__) console.warn('Error fetching notifications:', error);
    }
  }, []);

  // Load follow requests count
  const loadFollowRequestsCount = useCallback(async () => {
    const count = await getPendingFollowRequestsCount();
    setFollowRequestsCount(count);
  }, []);

  // Initial load
  useEffect(() => {
    let mounted = true;
    const loadInitial = async () => {
      if (mounted) setLoading(true);
      await fetchNotifications(true);
      if (mounted) setLoading(false);
    };
    loadInitial().catch(err => {
      if (mounted && __DEV__) console.warn('[NotificationsScreen] Load error:', err);
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when screen comes into focus + mark all read and sync badge
  useFocusEffect(
    useCallback(() => {
      loadFollowRequestsCount();
      fetchNotifications(true);
      // Optimistically clear badge, then mark all read on server
      useAppStore.getState().setUnreadNotifications(0);
      awsAPI.markAllNotificationsRead()
        .then(() => {
          // Confirm accurate count from server (catches race with new notifications)
          awsAPI.getUnreadCount()
            .then(({ count }) => useAppStore.getState().setUnreadNotifications(count))
            .catch(() => { /* best-effort */ });
        })
        .catch(() => { /* best-effort */ });
    }, [loadFollowRequestsCount, fetchNotifications])
  );

  const filters: Filter[] = [
    { key: 'all', label: 'All' },
    { key: 'follow', label: 'New Fans' },
    { key: 'like', label: 'Likes' },
    { key: 'peak_reply', label: 'Peak Replies' },
  ];

  // Prefetch + navigate to user profile
  const prefetchProfile = usePrefetchProfile();
  const goToUserProfile = (userId: string): void => {
    prefetchProfile(userId);
    navigation.navigate('UserProfile', { userId });
  };

  const onRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await Promise.all([
      loadFollowRequestsCount(),
      fetchNotifications(true),
    ]);
    setRefreshing(false);
  };

  const toggleFollow = async (id: number | string): Promise<void> => {
    const notif = notifications.find(n => n.id === id);
    if (!notif || !('isFollowing' in notif)) return;
    const userNotif = notif as UserNotification;

    // Optimistic update
    setNotifications(prev =>
      prev.map(n => n.id === id && 'isFollowing' in n ? { ...n, isFollowing: !n.isFollowing } : n)
    );

    try {
      if (userNotif.isFollowing) {
        await awsAPI.unfollowUser(userNotif.user.id);
      } else {
        await awsAPI.followUser(userNotif.user.id);
      }
    } catch (err) {
      // Rollback
      setNotifications(prev =>
        prev.map(n => n.id === id && 'isFollowing' in n ? { ...n, isFollowing: userNotif.isFollowing } : n)
      );
      if (__DEV__) console.warn('Follow toggle error:', err);
    }
  };

  const markAsRead = async (id: number | string): Promise<void> => {
    // Optimistic update
    setNotifications(
      notifications.map((notif) => {
        if (notif.id === id) {
          return { ...notif, isRead: true };
        }
        return notif;
      })
    );
    // Call API in background
    try {
      await awsAPI.markNotificationRead(String(id));
    } catch (error) {
      if (__DEV__) console.warn('Error marking notification as read:', error);
    }
  };

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications;
    return notifications.filter((n) => n.type === activeFilter);
  }, [notifications, activeFilter]);

  const [recentNotifications, olderNotifications] = useMemo(() => {
    const recent = filteredNotifications.filter(
      (n) => n.time === 'Just now' || n.time.includes('ago')
    );
    const older = filteredNotifications.filter((n) => !recent.includes(n));
    return [recent, older];
  }, [filteredNotifications]);

  const getNotificationIcon = (
    type: string
  ): { name: keyof typeof Ionicons.glyphMap; color: string } => {
    switch (type) {
      case 'like':
        return { name: 'heart', color: '#FF6B6B' };
      case 'follow':
        return { name: 'person-add', color: colors.blue };
      case 'peak_reply':
        return { name: 'videocam', color: colors.primary };
      case 'live':
        return { name: 'radio', color: '#FF5E57' };
      default:
        return { name: 'notifications', color: colors.primary };
    }
  };

  const isSystemNotification = (notif: Notification): notif is SystemNotification => {
    return notif.type === 'system' || notif.type === 'reminder';
  };

  const renderNotification = (item: Notification): React.JSX.Element => {
    const isSystem = isSystemNotification(item);

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.notificationItem, !item.isRead && styles.notificationUnread]}
        onPress={() => {
          markAsRead(item.id);
          if (!isSystem && (item as UserNotification).user?.id) {
            goToUserProfile((item as UserNotification).user.id);
          }
        }}
        activeOpacity={0.7}
      >
        {!item.isRead && <View style={styles.unreadDot} />}

        {isSystem ? (
          <View style={[styles.systemIcon, { backgroundColor: colors.backgroundFocus }]}>
            <Ionicons
              name={(item as SystemNotification).icon as keyof typeof Ionicons.glyphMap}
              size={24}
              color={colors.primary}
            />
          </View>
        ) : (
          <TouchableOpacity
            style={styles.avatarContainer}
            onPress={() =>
              (item as UserNotification).user?.id &&
              goToUserProfile((item as UserNotification).user.id)
            }
          >
            <AvatarImage source={(item as UserNotification).user.avatar} size={50} />
            <View
              style={[
                styles.typeIcon,
                {
                  backgroundColor: getNotificationIcon(item.type).color,
                  borderColor: colors.white
                },
              ]}
            >
              <Ionicons name={getNotificationIcon(item.type).name} size={10} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.notificationContent}>
          {isSystem ? (
            <>
              <Text style={styles.systemTitle}>{(item as SystemNotification).title}</Text>
              <Text style={styles.systemMessage}>{(item as SystemNotification).message}</Text>
            </>
          ) : (
            <Text style={styles.notificationText}>
              <Text
                style={styles.userName}
                onPress={() =>
                  (item as UserNotification).user?.id &&
                  goToUserProfile((item as UserNotification).user.id)
                }
              >
                {(item as UserNotification).user.name}
              </Text>
              {(item as UserNotification).user.isVerified ? ' ✓ ' : ' '}{item.message}
            </Text>
          )}
          <Text style={styles.timeText}>{item.time}</Text>
        </View>

        {item.type === 'follow' && !isSystem && (
          <TouchableOpacity
            style={styles.followButtonContainer}
            onPress={() => toggleFollow(item.id)}
          >
            {(item as UserNotification).isFollowing ? (
              <View style={styles.followingButton}>
                <Text style={styles.followingButtonText}>Tracking</Text>
              </View>
            ) : (
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.followButton}
              >
                <Text style={styles.followButtonText}>Fan</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        )}

        {!isSystem && (item as UserNotification).postImage && (
          <Image
            source={{ uri: (item as UserNotification).postImage }}
            style={styles.postThumbnail}
          />
        )}

        {item.type === 'live' && (
          <View style={styles.liveButton}>
            <Text style={styles.liveButtonText}>Watch</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          onPress={async () => {
            try {
              await awsAPI.markAllNotificationsRead();
              setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            } catch (err) {
              if (__DEV__) console.warn('Mark all read error:', err);
            }
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="checkmark-done-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('NotificationSettings')}
        >
          <Ionicons name="settings-outline" size={24} color={colors.dark} />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersContainer}
        contentContainerStyle={styles.filtersContent}
      >
        {filters.map((filter) => (
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

      <ScrollView
        style={styles.notificationsList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Follow Requests Banner */}
        {followRequestsCount > 0 && (
          <TouchableOpacity
            style={styles.followRequestsBanner}
            onPress={() => navigation.navigate('FollowRequests')}
          >
            <View style={styles.followRequestsIcon}>
              <Ionicons name="person-add" size={20} color={colors.primaryGreen} />
            </View>
            <View style={styles.followRequestsContent}>
              <Text style={styles.followRequestsTitle}>Follow Requests</Text>
              <Text style={styles.followRequestsSubtitle}>
                {followRequestsCount} {followRequestsCount === 1 ? 'person wants' : 'people want'} to follow you
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.gray} />
          </TouchableOpacity>
        )}

        {recentNotifications.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Today</Text>
            {recentNotifications.map(renderNotification)}
          </>
        )}

        {olderNotifications.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Earlier</Text>
            {olderNotifications.map(renderNotification)}
          </>
        )}

        {loading && notifications.length === 0 && (
          <NotificationsSkeleton />
        )}

        {!loading && filteredNotifications.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={60} color={colors.grayLight} />
            <Text style={styles.emptyTitle}>No notifications</Text>
            <Text style={styles.emptySubtitle}>
              When you get notifications, they'll show up here
            </Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
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
  settingsButton: {
    padding: 4,
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
  notificationsList: {
    flex: 1,
    paddingTop: SPACING.md,
  },
  sectionTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.gray,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: colors.backgroundSecondary,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: colors.background,
  },
  notificationUnread: {
    backgroundColor: colors.backgroundFocus,
  },
  unreadDot: {
    position: 'absolute',
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SPACING.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
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
  },
  systemIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  notificationContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  notificationText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.dark,
    lineHeight: 20,
  },
  userName: {
    fontFamily: 'Poppins-SemiBold',
  },
  systemTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: colors.dark,
  },
  systemMessage: {
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
  followButtonContainer: {
    marginLeft: 'auto',
  },
  followButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: SIZES.radiusSm,
  },
  followButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    color: colors.dark,
  },
  followingButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: colors.grayLight,
  },
  followingButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: colors.gray,
  },
  postThumbnail: {
    width: 44,
    height: 44,
    borderRadius: SIZES.radiusSm,
    marginLeft: 'auto',
  },
  liveButton: {
    backgroundColor: '#FF5E57',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: SIZES.radiusSm,
    marginLeft: 'auto',
  },
  liveButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    color: colors.white,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    marginTop: SPACING.md,
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
  // Follow Requests Banner
  followRequestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: isDark ? 'rgba(15,45,30,0.3)' : 'rgba(240,253,244,1)',
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
    marginBottom: SPACING.sm,
  },
  followRequestsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(15,45,30,0.6)' : 'rgba(220,252,231,1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  followRequestsContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  followRequestsTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
    color: colors.dark,
  },
  followRequestsSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.gray,
    marginTop: 1,
  },
});
