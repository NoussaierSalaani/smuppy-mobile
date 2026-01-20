import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, SIZES, SHADOWS, SPACING } from '../../config/theme';

// Sample notifications data
const NOTIFICATIONS = [
  {
    id: 1,
    type: 'follow',
    user: {
      id: '1',
      name: 'Hannah Smith',
      avatar: 'https://i.pravatar.cc/100?img=1',
      isVerified: true,
    },
    message: 'started following you',
    time: '2m ago',
    isRead: false,
    isFollowing: false,
  },
  {
    id: 2,
    type: 'like',
    user: {
      id: '2',
      name: 'Thomas Lefèvre',
      avatar: 'https://i.pravatar.cc/100?img=3',
      isVerified: false,
    },
    message: 'liked your post',
    time: '15m ago',
    isRead: false,
    postImage: 'https://picsum.photos/100/100?random=1',
  },
  {
    id: 3,
    type: 'comment',
    user: {
      id: '3',
      name: 'Mariam Fiori',
      avatar: 'https://i.pravatar.cc/100?img=5',
      isVerified: true,
    },
    message: 'commented: "Amazing workout! 💪"',
    time: '1h ago',
    isRead: false,
    postImage: 'https://picsum.photos/100/100?random=2',
  },
  {
    id: 4,
    type: 'mention',
    user: {
      id: '4',
      name: 'Alex Johnson',
      avatar: 'https://i.pravatar.cc/100?img=8',
      isVerified: false,
    },
    message: 'mentioned you in a comment',
    time: '2h ago',
    isRead: true,
    postImage: 'https://picsum.photos/100/100?random=3',
  },
  {
    id: 5,
    type: 'follow',
    user: {
      id: '5',
      name: 'Emma Wilson',
      avatar: 'https://i.pravatar.cc/100?img=9',
      isVerified: true,
    },
    message: 'started following you',
    time: '3h ago',
    isRead: true,
    isFollowing: true,
  },
  {
    id: 6,
    type: 'like',
    user: {
      id: '6',
      name: 'James Chen',
      avatar: 'https://i.pravatar.cc/100?img=11',
      isVerified: false,
    },
    message: 'and 12 others liked your post',
    time: '5h ago',
    isRead: true,
    postImage: 'https://picsum.photos/100/100?random=4',
  },
  {
    id: 7,
    type: 'system',
    icon: 'trophy',
    title: 'Milestone reached!',
    message: 'You reached 100 followers! Keep it up! 🎉',
    time: '1d ago',
    isRead: true,
  },
  {
    id: 8,
    type: 'live',
    user: {
      id: '8',
      name: 'FitCoach Pro',
      avatar: 'https://i.pravatar.cc/100?img=12',
      isVerified: true,
    },
    message: 'is live now: "Morning HIIT Session"',
    time: '1d ago',
    isRead: true,
  },
  {
    id: 9,
    type: 'reminder',
    icon: 'calendar',
    title: 'Workout Reminder',
    message: "Don't forget your evening yoga session!",
    time: '2d ago',
    isRead: true,
  },
];

export default function NotificationsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState(NOTIFICATIONS);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'follow', label: 'Follows' },
    { key: 'like', label: 'Likes' },
    { key: 'comment', label: 'Comments' },
  ];

  // Navigate to user profile
  const goToUserProfile = (userId) => {
    navigation.navigate('UserProfile', { userId });
  };

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const toggleFollow = (id) => {
    setNotifications(notifications.map(notif => {
      if (notif.id === id) {
        return { ...notif, isFollowing: !notif.isFollowing };
      }
      return notif;
    }));
  };

  const markAsRead = (id) => {
    setNotifications(notifications.map(notif => {
      if (notif.id === id) {
        return { ...notif, isRead: true };
      }
      return notif;
    }));
  };

  const filteredNotifications = activeFilter === 'all' 
    ? notifications 
    : notifications.filter(n => n.type === activeFilter);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'like':
        return { name: 'heart', color: '#FF6B6B' };
      case 'comment':
        return { name: 'chatbubble', color: COLORS.primary };
      case 'follow':
        return { name: 'person-add', color: COLORS.blue };
      case 'mention':
        return { name: 'at', color: COLORS.cyanBlue };
      case 'live':
        return { name: 'radio', color: '#FF5E57' };
      default:
        return { name: 'notifications', color: COLORS.primary };
    }
  };

  const renderNotification = (item) => {
    const isSystemNotification = item.type === 'system' || item.type === 'reminder';

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.notificationItem,
          !item.isRead && styles.notificationUnread,
        ]}
        onPress={() => {
          markAsRead(item.id);
          if (item.user?.id) {
            goToUserProfile(item.user.id);
          }
        }}
        activeOpacity={0.7}
      >
        {!item.isRead && <View style={styles.unreadDot} />}

        {isSystemNotification ? (
          <View style={[styles.systemIcon, { backgroundColor: COLORS.backgroundFocus }]}>
            <Ionicons name={item.icon} size={24} color={COLORS.primary} />
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={() => item.user?.id && goToUserProfile(item.user.id)}
          >
            <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
            <View style={[
              styles.typeIcon,
              { backgroundColor: getNotificationIcon(item.type).color }
            ]}>
              <Ionicons name={getNotificationIcon(item.type).name} size={10} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        <View style={styles.notificationContent}>
          {isSystemNotification ? (
            <>
              <Text style={styles.systemTitle}>{item.title}</Text>
              <Text style={styles.systemMessage}>{item.message}</Text>
            </>
          ) : (
            <Text style={styles.notificationText}>
              <Text 
                style={styles.userName}
                onPress={() => item.user?.id && goToUserProfile(item.user.id)}
              >
                {item.user.name}
              </Text>
              {item.user.isVerified && ' ✓'}
              {' '}{item.message}
            </Text>
          )}
          <Text style={styles.timeText}>{item.time}</Text>
        </View>

        {item.type === 'follow' && (
          <TouchableOpacity
            style={styles.followButtonContainer}
            onPress={() => toggleFollow(item.id)}
          >
            {item.isFollowing ? (
              <View style={styles.followingButton}>
                <Text style={styles.followingButtonText}>Following</Text>
              </View>
            ) : (
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.followButton}
              >
                <Text style={styles.followButtonText}>Follow</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        )}

        {item.postImage && (
          <Image source={{ uri: item.postImage }} style={styles.postThumbnail} />
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
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
          </View>
        )}
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
            style={[
              styles.filterChip,
              activeFilter === filter.key && styles.filterChipActive,
            ]}
            onPress={() => setActiveFilter(filter.key)}
          >
            <Text style={[
              styles.filterChipText,
              activeFilter === filter.key && styles.filterChipTextActive,
            ]}>
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
        <Text style={styles.sectionTitle}>Today</Text>
        {filteredNotifications
          .filter(n => n.time.includes('m ago') || n.time.includes('h ago'))
          .map(renderNotification)}

        <Text style={styles.sectionTitle}>Earlier</Text>
        {filteredNotifications
          .filter(n => n.time.includes('d ago'))
          .map(renderNotification)}

        {filteredNotifications.length === 0 && (
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 28,
    color: COLORS.dark,
    flex: 1,
  },
  unreadBadge: {
    backgroundColor: COLORS.error,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: SPACING.md,
  },
  unreadBadgeText: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    color: COLORS.white,
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
});