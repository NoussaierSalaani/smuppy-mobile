import React, { useState, useCallback, useEffect } from 'react';
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
import { COLORS, GRADIENTS, SIZES, SPACING } from '../../config/theme';
import { getPendingFollowRequestsCount } from '../../services/database';
import { awsAPI } from '../../services/aws-api';

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

  // User notifications (follow, like, peak_reply, live, etc.)
  const userData = apiNotif.data?.user || {};
  return {
    ...baseNotif,
    type: apiNotif.type || 'like',
    user: {
      id: userData.id || apiNotif.data?.actorId || '',
      name: userData.name || userData.username || 'User',
      avatar: userData.avatar || userData.avatarUrl || null,
      isVerified: userData.isVerified || false,
    },
    message: apiNotif.body || getDefaultMessage(apiNotif.type),
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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [followRequestsCount, setFollowRequestsCount] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Fetch notifications from API
  const fetchNotifications = useCallback(async (isRefresh = false) => {
    try {
      const response = await awsAPI.getNotifications({
        limit: 20,
        cursor: isRefresh ? undefined : cursor || undefined,
      });

      const transformed = (response as any).notifications?.map(transformNotification) || [];

      if (isRefresh) {
        setNotifications(transformed);
      } else {
        setNotifications(prev => [...prev, ...transformed]);
      }

      setCursor((response as any).cursor || null);
      setHasMore((response as any).hasMore || false);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      // Keep existing notifications on error
    }
  }, [cursor]);

  // Load follow requests count
  const loadFollowRequestsCount = useCallback(async () => {
    const count = await getPendingFollowRequestsCount();
    setFollowRequestsCount(count);
  }, []);

  // Initial load
  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      await fetchNotifications(true);
      setLoading(false);
    };
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadFollowRequestsCount();
      fetchNotifications(true);
    }, [loadFollowRequestsCount, fetchNotifications])
  );

  const filters: Filter[] = [
    { key: 'all', label: 'All' },
    { key: 'follow', label: 'New Fans' },
    { key: 'like', label: 'Likes' },
    { key: 'peak_reply', label: 'Peak Replies' },
  ];

  // Navigate to user profile
  const goToUserProfile = (userId: string): void => {
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

  const toggleFollow = (id: number | string): void => {
    setNotifications(
      notifications.map((notif) => {
        if (notif.id === id && 'isFollowing' in notif) {
          return { ...notif, isFollowing: !notif.isFollowing };
        }
        return notif;
      })
    );
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
      console.error('Error marking notification as read:', error);
    }
  };

  const filteredNotifications =
    activeFilter === 'all'
      ? notifications
      : notifications.filter((n) => n.type === activeFilter);

  const _unreadCount = notifications.filter((n) => !n.isRead).length;

  const getNotificationIcon = (
    type: string
  ): { name: keyof typeof Ionicons.glyphMap; color: string } => {
    switch (type) {
      case 'like':
        return { name: 'heart', color: '#FF6B6B' };
      case 'follow':
        return { name: 'person-add', color: COLORS.blue };
      case 'peak_reply':
        return { name: 'videocam', color: COLORS.primary };
      case 'live':
        return { name: 'radio', color: '#FF5E57' };
      default:
        return { name: 'notifications', color: COLORS.primary };
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
          <View style={[styles.systemIcon, { backgroundColor: COLORS.backgroundFocus }]}>
            <Ionicons
              name={(item as SystemNotification).icon as keyof typeof Ionicons.glyphMap}
              size={24}
              color={COLORS.primary}
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
            <Image
              source={{ uri: (item as UserNotification).user.avatar }}
              style={styles.avatar}
            />
            <View
              style={[
                styles.typeIcon,
                { backgroundColor: getNotificationIcon(item.type).color },
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
          <Ionicons name="chevron-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('NotificationSettings')}
        >
          <Ionicons name="settings-outline" size={24} color={COLORS.dark} />
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
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
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
              <Ionicons name="person-add" size={20} color={COLORS.primaryGreen} />
            </View>
            <View style={styles.followRequestsContent}>
              <Text style={styles.followRequestsTitle}>Follow Requests</Text>
              <Text style={styles.followRequestsSubtitle}>
                {followRequestsCount} {followRequestsCount === 1 ? 'person wants' : 'people want'} to follow you
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
          </TouchableOpacity>
        )}

        <Text style={styles.sectionTitle}>Today</Text>
        {filteredNotifications
          .filter((n) => n.time.includes('m ago') || n.time.includes('h ago'))
          .map(renderNotification)}

        <Text style={styles.sectionTitle}>Earlier</Text>
        {filteredNotifications.filter((n) => n.time.includes('d ago')).map(renderNotification)}

        {loading && notifications.length === 0 && (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading notifications...</Text>
          </View>
        )}

        {!loading && filteredNotifications.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={60} color={COLORS.grayLight} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
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
    color: COLORS.dark,
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
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 20,
    marginRight: SPACING.sm,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterChipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: COLORS.gray,
  },
  filterChipTextActive: {
    color: COLORS.white,
  },
  notificationsList: {
    flex: 1,
    paddingTop: SPACING.md,
  },
  sectionTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: COLORS.gray,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.backgroundSecondary,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
  },
  notificationUnread: {
    backgroundColor: COLORS.backgroundFocus,
  },
  unreadDot: {
    position: 'absolute',
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
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
    borderColor: COLORS.white,
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
    color: COLORS.dark,
    lineHeight: 20,
  },
  userName: {
    fontFamily: 'Poppins-SemiBold',
  },
  systemTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: COLORS.dark,
  },
  systemMessage: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  timeText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: COLORS.grayMuted,
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
    color: COLORS.dark,
  },
  followingButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: SIZES.radiusSm,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  followingButtonText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: COLORS.gray,
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
    color: COLORS.white,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
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
    color: COLORS.dark,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
  // Follow Requests Banner
  followRequestsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: SPACING.sm,
  },
  followRequestsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
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
    color: COLORS.dark,
  },
  followRequestsSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 1,
  },
});
