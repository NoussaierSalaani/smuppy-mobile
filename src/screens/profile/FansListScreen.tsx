import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { AccountBadge } from '../../components/Badge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import {
  getFollowers,
  getFollowing,
  followUser,
  unfollowUser,
  getCurrentProfile,
  Profile,
} from '../../services/database';

// Types
interface User {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
  isFanOfMe: boolean;
  iAmFanOf: boolean;
  unfollowCount: number;
  lastUnfollowAt: number | null;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Transform Profile to User
const profileToUser = (
  profile: Profile,
  isFanOfMe: boolean,
  iAmFanOf: boolean
): User => ({
  id: profile.id,
  name: profile.full_name || profile.username || 'User',
  username: `@${profile.username || 'user'}`,
  avatar: profile.avatar_url || null,
  isVerified: profile.is_verified || false,
  accountType: profile.account_type || 'personal',
  isFanOfMe,
  iAmFanOf,
  unfollowCount: 0,
  lastUnfollowAt: null,
});

interface FansListScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
  };
  route: {
    params?: {
      initialTab?: 'fans' | 'tracking';
      userId?: string;
    };
  };
}

export default function FansListScreen({ navigation, route }: FansListScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showError, showWarning } = useSmuppyAlert();
  const initialTab = route?.params?.initialTab || 'fans';
  const userId = route?.params?.userId; // Optional: view another user's fans

  // State
  const [activeTab, setActiveTab] = useState<'fans' | 'tracking'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [fans, setFans] = useState<User[]>([]);
  const [tracking, setTracking] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUnfollowPopup, setShowUnfollowPopup] = useState(false);
  const [showWarningPopup, setShowWarningPopup] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Get current user ID
      const { data: currentProfile, error: profileError } = await getCurrentProfile();
      if (!currentProfile) {
        if (__DEV__) console.warn('[FansListScreen] No current profile:', profileError);
        // Show empty state instead of crashing
        setFans([]);
        setTracking([]);
        setIsLoading(false);
        return;
      }

      const targetUserId = userId || currentProfile.id;

      // Load followers (fans) and following (tracking) in parallel
      const [fansResult, trackingResult] = await Promise.all([
        getFollowers(targetUserId, 0, 100),
        getFollowing(targetUserId, 0, 100),
      ]);

      // Get IDs of people I follow for mutual check
      const myFollowingIds = new Set(
        trackingResult.data?.map((p) => p.id) || []
      );

      // Get IDs of people who follow me for mutual check
      const myFansIds = new Set(
        fansResult.data?.map((p) => p.id) || []
      );

      // Transform fans
      const transformedFans: User[] = (fansResult.data || []).map((profile) =>
        profileToUser(profile, true, myFollowingIds.has(profile.id))
      );

      // Transform tracking
      const transformedTracking: User[] = (trackingResult.data || []).map((profile) =>
        profileToUser(profile, myFansIds.has(profile.id), true)
      );

      setFans(transformedFans);
      setTracking(transformedTracking);
    } catch (error) {
      if (__DEV__) console.warn('[FansListScreen] Error loading data:', error);
      showError('Error', 'Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter by search
  const filteredList = useMemo(() => {
    const list = activeTab === 'fans' ? fans : tracking;
    if (!searchQuery.trim()) return list;

    const query = searchQuery.toLowerCase();
    return list.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query)
    );
  }, [activeTab, fans, tracking, searchQuery]);

  // Cooldown helpers (stored locally for now - could be moved to backend)
  const canRefollow = useCallback((user: User): boolean => {
    if (!user.unfollowCount || user.unfollowCount < 2) return true;
    if (!user.lastUnfollowAt) return true;
    return Date.now() - user.lastUnfollowAt >= SEVEN_DAYS_MS;
  }, []);

  const getDaysRemaining = useCallback((lastUnfollowAt: number | null): number => {
    if (!lastUnfollowAt) return 0;
    const timeRemaining = SEVEN_DAYS_MS - (Date.now() - lastUnfollowAt);
    return Math.max(0, Math.ceil(timeRemaining / (24 * 60 * 60 * 1000)));
  }, []);

  // Actions
  const handleFollow = useCallback(
    async (targetUserId: string) => {
      const user = [...fans, ...tracking].find((u) => u.id === targetUserId);
      if (!user) return;

      if (!canRefollow(user)) {
        const days = getDaysRemaining(user.lastUnfollowAt);
        showWarning(
          'Cannot become a fan yet',
          `Wait ${days} more day${days > 1 ? 's' : ''} before becoming a fan of ${user.name} again.`
        );
        return;
      }

      setActionLoading(targetUserId);

      try {
        const { error } = await followUser(targetUserId);
        if (error) {
          showError('Error', error);
          return;
        }

        // Update local state
        setFans((prev) =>
          prev.map((u) => (u.id === targetUserId ? { ...u, iAmFanOf: true } : u))
        );
        setTracking((prev) => {
          // Add to tracking if not already there
          if (!prev.find((u) => u.id === targetUserId)) {
            return [...prev, { ...user, iAmFanOf: true }];
          }
          return prev.map((u) =>
            u.id === targetUserId ? { ...u, iAmFanOf: true } : u
          );
        });
      } catch (error) {
        if (__DEV__) console.warn('[FansListScreen] Follow error:', error);
        showError('Error', 'Failed to follow. Please try again.');
      } finally {
        setActionLoading(null);
      }
    },
    [fans, tracking, canRefollow, getDaysRemaining, showError, showWarning]
  );

  const handleUnfollowPress = useCallback((user: User) => {
    setSelectedUser(user);
    if (user.unfollowCount === 1) {
      setShowWarningPopup(true);
    } else {
      setShowUnfollowPopup(true);
    }
  }, []);

  const confirmUnfollow = useCallback(async () => {
    if (!selectedUser) return;

    setActionLoading(selectedUser.id);

    try {
      const { error } = await unfollowUser(selectedUser.id);
      if (error) {
        showError('Error', error);
        return;
      }

      // Update local state
      setFans((prev) =>
        prev.map((user) =>
          user.id === selectedUser.id
            ? {
                ...user,
                iAmFanOf: false,
                unfollowCount: (user.unfollowCount || 0) + 1,
                lastUnfollowAt: Date.now(),
              }
            : user
        )
      );
      setTracking((prev) =>
        prev.filter((user) => user.id !== selectedUser.id)
      );

      closePopups();
    } catch (error) {
      if (__DEV__) console.warn('[FansListScreen] Unfollow error:', error);
      showError('Error', 'Failed to unfollow. Please try again.');
    } finally {
      setActionLoading(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, showError]);

  const closePopups = useCallback(() => {
    setShowUnfollowPopup(false);
    setShowWarningPopup(false);
    setSelectedUser(null);
  }, []);

  // Create styles with theme (must be before callbacks that reference styles)
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Render badge
  const renderBadge = useCallback(
    (item: User) => {
      const isMutual = item.isFanOfMe && item.iAmFanOf;
      const isLoadingThis = actionLoading === item.id;

      if (isLoadingThis) {
        return (
          <View style={styles.loadingBadge}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        );
      }

      if (activeTab === 'fans') {
        // Fans tab: show Track button if not following back
        if (!item.iAmFanOf) {
          return (
            <TouchableOpacity
              style={styles.trackBadge}
              onPress={() => handleFollow(item.id)}
            >
              <Ionicons name="add" size={14} color="#FFFFFF" />
              <Text style={styles.trackBadgeText}>Track</Text>
            </TouchableOpacity>
          );
        }
        // Mutual - show small indicator
        if (isMutual) {
          return (
            <View style={styles.mutualBadge}>
              <Ionicons name="swap-horizontal" size={14} color={colors.primary} />
            </View>
          );
        }
      } else {
        // Tracking tab: show unfollow option
        return (
          <TouchableOpacity
            style={styles.fanBadge}
            onPress={() => handleUnfollowPress(item)}
          >
            <SmuppyHeartIcon size={12} color={colors.heartRed} filled />
            <Text style={styles.fanBadgeText}>Fan</Text>
          </TouchableOpacity>
        );
      }
      return null;
    },
    [activeTab, handleFollow, handleUnfollowPress, actionLoading, styles, colors]
  );

  // Render user item
  const renderUserItem = useCallback(
    ({ item }: { item: User }) => (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
        activeOpacity={0.7}
      >
        <AvatarImage source={item.avatar} size={50} />

        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
            <AccountBadge
              size={16}
              style={styles.verifiedBadge}
              isVerified={item.isVerified}
              accountType={item.accountType}
            />
          </View>
          <Text style={styles.userUsername} numberOfLines={1}>{item.username}</Text>
        </View>

        {renderBadge(item)}
      </TouchableOpacity>
    ),
    [navigation, renderBadge, styles]
  );

  const keyExtractor = useCallback((item: User) => item.id, []);

  // Render tabs
  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'fans' && styles.tabActive]}
        onPress={() => setActiveTab('fans')}
      >
        <Text style={[styles.tabText, activeTab === 'fans' && styles.tabTextActive]}>
          Fans
        </Text>
        <Text style={[styles.tabCount, activeTab === 'fans' && styles.tabCountActive]}>
          {fans.length}
        </Text>
        {activeTab === 'fans' && (
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tabIndicator}
          />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.tab, activeTab === 'tracking' && styles.tabActive]}
        onPress={() => setActiveTab('tracking')}
      >
        <Text style={[styles.tabText, activeTab === 'tracking' && styles.tabTextActive]}>
          Tracking
        </Text>
        <Text style={[styles.tabCount, activeTab === 'tracking' && styles.tabCountActive]}>
          {tracking.length}
        </Text>
        {activeTab === 'tracking' && (
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.tabIndicator}
          />
        )}
      </TouchableOpacity>
    </View>
  );

  // Render empty state
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name={activeTab === 'fans' ? 'people-outline' : 'heart-outline'}
        size={60}
        color={colors.gray}
      />
      <Text style={styles.emptyTitle}>
        {activeTab === 'fans' ? 'No fans yet' : 'Not tracking anyone'}
      </Text>
      <Text style={styles.emptyDesc}>
        {activeTab === 'fans'
          ? 'Share your content to attract fans'
          : 'Discover and become a fan of creators you love'}
      </Text>
    </View>
  );

  // Only show full loading state on first load when no cached data exists
  if (isLoading && fans.length === 0 && tracking.length === 0) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>

        <Text style={styles.headerText}>Community</Text>

        <View style={styles.backButton} />
      </View>

      {/* Tabs */}
      {renderTabs()}

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.gray} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${activeTab}...`}
            placeholderTextColor={colors.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      <FlashList
        data={filteredList}
        renderItem={renderUserItem}
        keyExtractor={keyExtractor}
        extraData={styles}
        drawDistance={300}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      />

      {/* Unfollow Popup */}
      <Modal
        visible={showUnfollowPopup}
        transparent
        animationType="fade"
        onRequestClose={closePopups}
      >
        <TouchableWithoutFeedback onPress={closePopups}>
          <View style={styles.popupOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.popupContainer}>
                {selectedUser && (
                  <>
                    <AvatarImage source={selectedUser.avatar} size={70} />
                    <Text style={styles.popupName}>{selectedUser.name}</Text>
                    <Text style={styles.popupInfo}>
                      Are you sure you want to unfan?
                    </Text>
                    <TouchableOpacity
                      style={styles.unfollowButton}
                      onPress={confirmUnfollow}
                      disabled={actionLoading === selectedUser.id}
                    >
                      {actionLoading === selectedUser.id ? (
                        <ActivityIndicator size="small" color={'#FF6B6B'} />
                      ) : (
                        <>
                          <Ionicons name="heart-dislike-outline" size={18} color={'#FF6B6B'} />
                          <Text style={styles.unfollowButtonText}>Unfan</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Warning Popup (2nd unfollow) */}
      <Modal
        visible={showWarningPopup}
        transparent
        animationType="fade"
        onRequestClose={closePopups}
      >
        <TouchableWithoutFeedback onPress={closePopups}>
          <View style={styles.popupOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.popupContainer}>
                {selectedUser && (
                  <>
                    <View style={styles.warningIconContainer}>
                      <Ionicons name="warning" size={40} color={'#FFA500'} />
                    </View>
                    <Text style={styles.popupName}>{selectedUser.name}</Text>
                    <Text style={styles.popupWarning}>
                      If you unfan now, you'll have to wait 7 days before becoming a fan again.
                    </Text>
                    <View style={styles.popupButtons}>
                      <TouchableOpacity style={styles.cancelButton} onPress={closePopups}>
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.unfollowButton}
                        onPress={confirmUnfollow}
                        disabled={actionLoading === selectedUser.id}
                      >
                        {actionLoading === selectedUser.id ? (
                          <ActivityIndicator size="small" color={'#FF6B6B'} />
                        ) : (
                          <>
                            <Ionicons name="heart-dislike-outline" size={18} color={'#FF6B6B'} />
                            <Text style={styles.unfollowButtonText}>Unfan</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.gray,
  },
  loadingBadge: {
    width: 60,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2C2C2E' : colors.grayBorder,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    position: 'relative',
  },
  tabActive: {},
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.gray,
  },
  tabTextActive: {
    color: colors.dark,
  },
  tabCount: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray,
    backgroundColor: isDark ? '#2C2C2E' : colors.gray100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tabCountActive: {
    color: '#FFFFFF',
    backgroundColor: colors.primary,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 20,
    right: 20,
    height: 2,
    borderRadius: 1,
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#1C1C1E' : colors.gray100,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.dark,
    marginLeft: 10,
  },

  // List
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },

  // User Item
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2C2C2E' : colors.grayBorder,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  userUsername: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 2,
  },
  verifiedBadge: {
    marginLeft: 6,
  },

  // Badges
  trackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  trackBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 2,
  },
  fanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  fanBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginLeft: 4,
  },
  mutualBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // Popup
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupContainer: {
    backgroundColor: isDark ? '#1C1C1E' : colors.background,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '80%',
    maxWidth: 300,
  },
  popupName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
    marginTop: 12,
    marginBottom: 4,
  },
  popupInfo: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 16,
  },
  popupWarning: {
    fontSize: 13,
    color: '#FFA500',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  warningIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 165, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: isDark ? '#2C2C2E' : colors.gray100,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  unfollowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#FF6B6B',
    minWidth: 100,
    justifyContent: 'center',
  },
  unfollowButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF6B6B',
    marginLeft: 8,
  },
});
