import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  StatusBar,
  ActivityIndicator,
  Share,
  RefreshControl,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useUserStore, useUserSafetyStore } from '../../stores';
import { useVibeStore } from '../../stores/vibeStore';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useProfile } from '../../hooks';
import { queryKeys } from '../../lib/queryClient';
import { followUser, unfollowUser, getPostsByUser, Post, hasPendingFollowRequest, cancelFollowRequest } from '../../services/database';
import { LinearGradient } from 'expo-linear-gradient';
import { LiquidTabs } from '../../components/LiquidTabs';
import { LiquidButton } from '../../components/LiquidButton';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { AccountBadge } from '../../components/Badge';
import SubscribeChannelModal from '../../components/SubscribeChannelModal';
import { TipButton } from '../../components/tips';
import { awsAPI } from '../../services/aws-api';
import { FEATURES } from '../../config/featureFlags';
import GradeFrame from '../../components/GradeFrame';
import { getGrade } from '../../utils/gradeSystem';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_HEIGHT = 282;
const AVATAR_SIZE = 96;

// Type for profile data from API (uses Profile type from database.ts)
interface ProfileApiData {
  id?: string;
  username?: string;
  full_name?: string;
  display_name?: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string;
  fan_count?: number;
  following_count?: number;
  post_count?: number;
  peak_count?: number;
  is_verified?: boolean;
  is_bot?: boolean;
  is_team?: boolean;
  is_private?: boolean;
  interests?: string[];
  account_type?: 'personal' | 'pro_creator' | 'pro_business';
  business_name?: string;
  // Follow status from API (set in convertProfile from isFollowing)
  is_following?: boolean;
  is_followed_by?: boolean;
}

const DEFAULT_PROFILE = {
  id: 'unknown',
  username: 'user',
  displayName: 'Utilisateur',
  avatar: null,
  coverImage: null,
  bio: '',
  fanCount: 0,
  postCount: 0,
  isVerified: false,
  isBot: false,
  isTeam: false,
  isPrivate: false,
  interests: [] as string[],
  accountType: 'personal' as const,
};

// Get cover image based on interests
const getCoverImage = (_interests: string[] = []): string | null => {
  return null;
};


const UserProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showAlert, showSuccess, showError, showDestructiveConfirm } = useSmuppyAlert();
  const queryClient = useQueryClient();

  // Déterminer si c'est notre profil ou celui d'un autre
  const params = route?.params as { userId?: string } || {};
  const userId = params.userId;
  const isOwnProfile = !userId;
  const { data: profileData, isLoading, isError, refetch } = useProfile(userId);

  const profile = useMemo(() => {
    const data: ProfileApiData = profileData || {};
    const interests = data.interests || DEFAULT_PROFILE.interests;
    return {
      id: data.id || userId || DEFAULT_PROFILE.id,
      username: data.username || DEFAULT_PROFILE.username,
      displayName: (data.account_type === 'pro_business' && data.business_name) ? data.business_name : (data.full_name || data.display_name || data.username || DEFAULT_PROFILE.displayName),
      avatar: data.avatar_url || DEFAULT_PROFILE.avatar,
      coverImage: data.cover_url || getCoverImage(interests),
      bio: data.bio || DEFAULT_PROFILE.bio,
      fanCount: data.fan_count ?? DEFAULT_PROFILE.fanCount,
      postCount: data.post_count ?? DEFAULT_PROFILE.postCount,
      peakCount: data.peak_count ?? 0,
      isVerified: data.is_verified ?? DEFAULT_PROFILE.isVerified,
      isBot: data.is_bot ?? DEFAULT_PROFILE.isBot,
      isTeam: data.is_team ?? DEFAULT_PROFILE.isTeam,
      isPrivate: data.is_private ?? DEFAULT_PROFILE.isPrivate,
      accountType: data.account_type ?? DEFAULT_PROFILE.accountType,
      interests,
    };
  }, [profileData, userId]);
  
  // États
  const [isFan, setIsFan] = useState(false);
  const [isRequested, setIsRequested] = useState(false); // For private account follow requests
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const hasUserInteracted = useRef(false);
  const [fanToggleCount, setFanToggleCount] = useState(0);
  const [localFanCount, setLocalFanCount] = useState<number | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockEndDate, setBlockEndDate] = useState<Date | null>(null);
  const [showUnfanModal, setShowUnfanModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showFanRequiredModal, setShowFanRequiredModal] = useState(false);
  const [showCancelRequestModal, setShowCancelRequestModal] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [groupEventMode, setGroupEventMode] = useState<'group' | 'event'>('event');
  const [refreshing, setRefreshing] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  // Live status for pro_creator
  const [creatorLiveStatus, setCreatorLiveStatus] = useState<{
    isLive: boolean;
    liveTitle?: string;
    channelName?: string;
  }>({
    isLive: false,
  });

  // Check if this creator is currently live
  useEffect(() => {
    if (profile.accountType !== 'pro_creator') return;
    awsAPI.getActiveLiveStreams().then(res => {
      if (res.success && res.data) {
        const live = res.data.find(s => s.host.id === profile.id);
        if (live) {
          setCreatorLiveStatus({ isLive: true, liveTitle: live.title, channelName: live.channelName });
        }
      }
    }).catch(() => {});
  }, [profile.id, profile.accountType]);

  // Sync local fan count with profile data from server
  // Always update when profile.fanCount changes to get the latest value
  useEffect(() => {
    if (profile.fanCount !== undefined) {
      setLocalFanCount(profile.fanCount);
    }
  }, [profile.fanCount]);

  // Display fan count (local takes precedence for optimistic updates)
  const displayFanCount = localFanCount ?? profile.fanCount;

  // Grade system — decorative frame for 1M+ fans
  const gradeInfo = useMemo(() => getGrade(profile.fanCount), [profile.fanCount]);

  // User's posts
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);

  // Separate posts and peaks
  const posts = useMemo(() => userPosts.filter(p => !p.is_peak), [userPosts]);
  const peaks = useMemo(() => userPosts.filter(p => p.is_peak), [userPosts]);

  // Sync follow status from profile data (API returns is_following)
  useEffect(() => {
    const syncFollowStatus = async () => {
      if (!profileData || hasUserInteracted.current) return;

      // Use is_following from profile API response
      const isFollowingFromApi = profileData.is_following ?? false;
      setIsFan(isFollowingFromApi);

      // If not following and profile is private, check for pending request
      if (!isFollowingFromApi && userId) {
        const { pending } = await hasPendingFollowRequest(userId);
        if (hasUserInteracted.current) return;
        setIsRequested(pending);
      } else {
        setIsRequested(false);
      }
    };
    hasUserInteracted.current = false;
    syncFollowStatus();
  }, [profileData, userId]);

  // Load user's posts
  const loadUserPosts = useCallback(async () => {
    if (userId) {
      setIsLoadingPosts(true);
      const { data, error } = await getPostsByUser(userId, 0, 50);
      if (!error && data) {
        setUserPosts(data);
      }
      setIsLoadingPosts(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUserPosts();
  }, [loadUserPosts]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserPosts();
    setRefreshing(false);
  }, [loadUserPosts]);

  // Share profile
  const handleShareProfile = async () => {
    try {
      const profileUrl = `https://smuppy.app/u/${profile.username}`;
      await Share.share({
        message: `Check out ${profile.displayName}'s profile on Smuppy! ${profileUrl}`,
        url: profileUrl,
      });
    } catch (error) {
      if (__DEV__) console.warn('Error sharing profile:', error);
    }
  };

  // User safety store for block
  const { block, isBlocked: isUserBlocked } = useUserSafetyStore();

  // Report user
  const handleReportUser = () => {
    setShowMenuModal(false);
    showAlert({
      title: 'Report User',
      message: 'Why are you reporting this user?',
      type: 'warning',
      buttons: [
        { text: 'Spam', onPress: () => submitUserReport('spam') },
        { text: 'Harassment', onPress: () => submitUserReport('harassment') },
        { text: 'Inappropriate', onPress: () => submitUserReport('inappropriate') },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  };

  const submitUserReport = (_reason: string) => {
    showSuccess('Report Submitted', 'Thank you for your report. We will review this user.');
  };

  // Block user
  const handleBlockUser = () => {
    if (!userId) return;

    if (isUserBlocked(userId)) {
      setShowMenuModal(false);
      showError('Already Blocked', 'This user is already blocked.');
      return;
    }

    setShowMenuModal(false);
    showDestructiveConfirm(
      'Block User?',
      `You won't see ${profile.displayName}'s posts and they won't be able to interact with you.`,
      async () => {
        const { error } = await block(userId);
        if (error) {
          showError('Error', 'Failed to block user. Please try again.');
        } else {
          showSuccess('User Blocked', 'You will no longer see their content.');
          navigation.goBack();
        }
      },
      'Block'
    );
  };

  // Gestion du bouton Fan
  const handleFanPress = () => {
    if (isBlocked) {
      setShowBlockedModal(true);
      return;
    }

    if (isFan) {
      setShowUnfanModal(true);
    } else if (isRequested) {
      // Show cancel request modal
      setShowCancelRequestModal(true);
    } else {
      becomeFan();
    }
  };

  // Cancel follow request
  const handleCancelRequest = async () => {
    if (!userId || isLoadingFollow) return;
    hasUserInteracted.current = true;

    setShowCancelRequestModal(false);
    setIsLoadingFollow(true);

    const { error } = await cancelFollowRequest(userId);

    if (!error) {
      setIsRequested(false);
    }

    setIsLoadingFollow(false);
  };
  
  const becomeFan = async () => {
    if (!userId || isLoadingFollow) return;
    hasUserInteracted.current = true;

    const newCount = fanToggleCount + 1;
    setFanToggleCount(newCount);

    if (newCount > 2) {
      // Bloquer pour 7 jours
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      setBlockEndDate(endDate);
      setIsBlocked(true);
      setShowBlockedModal(true);
      return;
    }

    setIsLoadingFollow(true);

    const { error, requestCreated } = await followUser(userId);
    setIsLoadingFollow(false);

    if (error) {
      if (__DEV__) console.warn('[UserProfile] Follow error:', error);
      return;
    }

    if (requestCreated) {
      // A follow request was created for a private account
      setIsRequested(true);
    } else {
      // Direct follow was successful
      setIsFan(true);
      setLocalFanCount(prev => (prev ?? 0) + 1);
      if (useUserStore.getState().user?.accountType !== 'pro_business') {
        useVibeStore.getState().addVibeAction('follow_user');
      }
    }

    // Invalidate profile cache to get fresh follow status and fan count
    queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });
  };

  const confirmUnfan = async () => {
    if (!userId || isLoadingFollow) return;
    hasUserInteracted.current = true;

    setShowUnfanModal(false);

    const newCount = fanToggleCount + 1;
    setFanToggleCount(newCount);

    if (newCount > 2) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      setBlockEndDate(endDate);
      setIsBlocked(true);
      setTimeout(() => setShowBlockedModal(true), 300);
      return;
    }

    setIsLoadingFollow(true);
    // Optimistic update
    setIsFan(false);
    setLocalFanCount(prev => Math.max((prev ?? 1) - 1, 0));

    const { error } = await unfollowUser(userId);
    setIsLoadingFollow(false);

    if (error) {
      // Revert on error
      setIsFan(true);
      setLocalFanCount(prev => (prev ?? 0) + 1);
      if (__DEV__) console.warn('[UserProfile] Unfollow error:', error);
    }

    // Invalidate profile cache to get fresh follow status and fan count
    queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });
  };

  const handleMessagePress = () => {
    if (isFan) {
      // Pass userId so ChatScreen can get/create the real conversation
      navigation.navigate('Chat', {
        userId: profile.id,
        otherUser: {
          id: profile.id,
          username: profile.username,
          full_name: profile.displayName,
          avatar_url: profile.avatar || '',
          is_verified: profile.isVerified || false,
          account_type: profile.accountType,
        },
      });
    }
  };

  // Formater la date de déblocage
  const formatBlockDate = () => {
    if (!blockEndDate) return '';
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    return blockEndDate.toLocaleDateString('en-US', options);
  };

  // Create styles with theme (MUST BE BEFORE RENDER CALLBACKS)
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const geStyles = useMemo(() => createGeStyles(colors, isDark), [colors, isDark]);

  // ==================== RENDER POST ITEM (MUST BE BEFORE EARLY RETURNS) ====================
  const renderPostItem = useCallback((post: Post, allPosts: Post[]) => {
    // Support both media_urls array and legacy media_url string
    const thumbnail = post.media_urls?.[0] || (post as any).media_url || null;
    const isVideo = post.media_type === 'video' || post.media_type === 'multiple';

    // Transform posts for detail screen (matching PostDetailProfileScreen format)
    const transformedPosts = allPosts.map(p => ({
      id: p.id,
      type: p.media_type === 'video' ? 'video' : 'image',
      media: p.media_urls?.[0] || (p as any).media_url || '',
      thumbnail: p.media_urls?.[0] || (p as any).media_url || '',
      description: p.content || (p as any).caption || '',
      likes: p.likes_count || 0,
      views: p.views_count || 0,
      user: {
        id: profile.id,
        name: profile.displayName,
        avatar: profile.avatar || '',
      },
    }));

    return (
      <TouchableOpacity
        style={styles.postCard}
        onPress={() => navigation.navigate('PostDetailProfile', {
          postId: post.id,
          profilePosts: transformedPosts as any,
        })}
      >
        {/* Full image */}
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.postThumb} />
        ) : (
          <View style={[styles.postThumb, styles.postThumbEmpty]}>
            <Ionicons name="image-outline" size={28} color={colors.gray} />
          </View>
        )}
        {/* Video indicator */}
        {isVideo && (
          <View style={styles.postPlayIcon}>
            <Ionicons name="play" size={14} color="#FFF" />
          </View>
        )}
        {/* Stats overlay at bottom */}
        <View style={styles.postStatsOverlay}>
          <View style={styles.postStat}>
            <SmuppyHeartIcon size={12} color="#FFF" filled />
            <Text style={styles.postStatTextWhite}>{post.likes_count || 0}</Text>
          </View>
          <View style={styles.postStat}>
            <Ionicons name="eye" size={12} color="#FFF" />
            <Text style={styles.postStatTextWhite}>{post.views_count || 0}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [navigation, profile, colors, styles]);

  // States: missing userId or loading/error
  if (!userId) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
        <Text style={styles.displayName}>Profile not found</Text>
        <Text style={[styles.bioText, { textAlign: 'center', marginTop: 8 }]}>
          This profile is unavailable. Please try again.
        </Text>
        <TouchableOpacity style={[styles.fanButton, { marginTop: 16, width: '60%' }]} onPress={() => navigation.goBack()}>
          <Text style={styles.fanButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.bioText, { marginTop: 12 }]}>Loading profile...</Text>
      </View>
    );
  }

  if (isError || !profileData) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }]}>
        <Text style={styles.displayName}>Unable to load profile</Text>
        <Text style={[styles.bioText, { textAlign: 'center', marginTop: 8 }]}>
          Please check your connection or try again later.
        </Text>
        <TouchableOpacity style={[styles.fanButton, { marginTop: 16, width: '60%' }]} onPress={() => navigation.goBack()}>
          <Text style={styles.fanButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ==================== RENDER PRIVATE ACCOUNT STATE ====================
  const renderPrivateAccount = () => (
    <View style={styles.privateContainer}>
      <View style={styles.privateLockContainer}>
        <Ionicons name="lock-closed" size={48} color={colors.gray} />
      </View>
      <Text style={styles.privateTitle}>This Account is Private</Text>
      <Text style={styles.privateDesc}>
        Follow this account to see their photos and videos.
      </Text>
      <TouchableOpacity
        style={styles.privateFollowBtn}
        onPress={handleFanPress}
        disabled={isLoadingFollow}
      >
        {isLoadingFollow ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.privateFollowBtnText}>Become a Fan</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  // ==================== RENDER EMPTY STATE ====================
  const renderEmpty = (type: string) => (
    <View style={styles.emptyContainer}>
      <Ionicons
        name={type === 'posts' ? 'images-outline' : type === 'peaks' ? 'videocam-outline' : 'bookmark-outline'}
        size={48}
        color={colors.gray}
        style={{ marginBottom: 16 }}
      />
      <Text style={styles.emptyTitle}>
        {type === 'posts' ? 'No posts yet' : type === 'peaks' ? 'No peaks yet' : 'Private'}
      </Text>
      <Text style={styles.emptyDesc}>
        {type === 'posts'
          ? "This user hasn't shared any posts yet"
          : type === 'peaks'
          ? "This user hasn't shared any peaks yet"
          : 'Collections are only visible to the account owner'
        }
      </Text>
    </View>
  );

  // ==================== RENDER TAB CONTENT ====================
  const renderTabContent = () => {
    // Check if profile is private and user is not a fan
    const isPrivateAndNotFan = profile.isPrivate && !isFan && !isOwnProfile;

    if (isPrivateAndNotFan) {
      return renderPrivateAccount();
    }

    if (isLoadingPosts) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      );
    }

    if (activeTab === 'posts') {
      if (posts.length === 0) return renderEmpty('posts');
      return (
        <View style={styles.postsGrid}>
          {posts.map((post, index) => (
            <View key={`post-${index}-${post.id}`} style={styles.postCardWrapper}>
              {renderPostItem(post, posts)}
            </View>
          ))}
        </View>
      );
    }
    if (activeTab === 'peaks') {
      if (peaks.length === 0) return renderEmpty('peaks');
      return (
        <View style={styles.peaksGrid}>
          {peaks.map((peak, index) => (
            <TouchableOpacity
              key={`peak-${index}-${peak.id}`}
              style={styles.peakCard}
              onPress={() => navigation.navigate('PeakView', { peakId: peak.id })}
            >
              {peak.media_urls?.[0] ? (
                <OptimizedImage source={peak.media_urls[0]} style={styles.peakThumb} />
              ) : (
                <View style={[styles.peakThumb, styles.postThumbEmpty]}>
                  <Ionicons name="videocam-outline" size={24} color={colors.gray} />
                </View>
              )}
              <View style={styles.peakDuration}>
                <Text style={styles.peakDurationText}>{peak.peak_duration || 15}s</Text>
              </View>
              <View style={styles.peakStatsOverlay}>
                <View style={styles.peakStat}>
                  <SmuppyHeartIcon size={11} color="#FF6B6B" filled />
                  <Text style={styles.peakStatText}>{peak.likes_count || 0}</Text>
                </View>
                <View style={styles.peakStat}>
                  <Ionicons name="eye" size={11} color="#FFF" />
                  <Text style={styles.peakStatText}>{peak.views_count || 0}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      );
    }
    if (activeTab === 'groupevent') {
      // V1: API my-events/my-groups returns current user's data only.
      // For other users, show a placeholder until backend supports userId param.
      return (
        <View style={styles.emptyContainer}>
          <View style={geStyles.header}>
            <View style={geStyles.toggleRow}>
              <TouchableOpacity
                style={[geStyles.chip, groupEventMode === 'event' && geStyles.chipActive]}
                onPress={() => setGroupEventMode('event')}
              >
                <Text style={[geStyles.chipText, groupEventMode === 'event' && geStyles.chipTextActive]}>Event</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[geStyles.chip, groupEventMode === 'group' && geStyles.chipActive]}
                onPress={() => setGroupEventMode('group')}
              >
                <Text style={[geStyles.chipText, groupEventMode === 'group' && geStyles.chipTextActive]}>Group</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Ionicons name="calendar-outline" size={48} color={colors.gray} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>
            {groupEventMode === 'event' ? 'No events yet' : 'No groups yet'}
          </Text>
          <Text style={styles.emptyDesc}>
            {groupEventMode === 'event'
              ? "This user hasn't created any events yet"
              : "This user hasn't created any groups yet"}
          </Text>
        </View>
      );
    }
    if (activeTab === 'collections') {
      return renderEmpty('collections');
    }
    return null;
  };

  // ==================== TABS ====================
  const TABS = [
    { key: 'posts', label: 'Posts' },
    { key: 'peaks', label: 'Peaks' },
    { key: 'groupevent', label: 'Activities' },
    { key: 'collections', label: 'Collections' },
  ] as const;

  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <LiquidTabs
        tabs={TABS as unknown as { key: string; label: string }[]}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as typeof activeTab)}
        fullWidth
      />
    </View>
  );

  // ==================== RENDER HEADER ====================
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Cover Image */}
      <View style={styles.coverAbsolute}>
        <OptimizedImage source={profile.coverImage} style={styles.coverImage} />
        <LinearGradient
          colors={isDark
            ? ['transparent', 'transparent', 'rgba(13, 13, 13, 0.5)', 'rgba(13, 13, 13, 0.85)', '#0D0D0D']
            : ['transparent', 'transparent', 'rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.85)', '#FFFFFF']
          }
          locations={[0, 0.35, 0.55, 0.75, 1]}
          style={styles.coverGradientOverlay}
          pointerEvents="none"
        />
      </View>

      {/* Back Button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + 8 }]}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Menu Button */}
      <TouchableOpacity
        style={[styles.menuBtn, { top: insets.top + 8 }]}
        onPress={() => setShowMenuModal(true)}
      >
        <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Spacer for cover height */}
      <View style={styles.coverSpacer} />

      {/* Avatar & Stats Row */}
      <View style={styles.avatarRow}>
        <View>
          {gradeInfo ? (
            <GradeFrame grade={gradeInfo.grade} color={gradeInfo.color} size={AVATAR_SIZE}>
              {profile.avatar ? (
                <AvatarImage source={profile.avatar} size={AVATAR_SIZE} style={styles.avatar} />
              ) : (
                <View style={styles.avatarEmpty}>
                  <Ionicons name="person" size={36} color={colors.gray} />
                </View>
              )}
            </GradeFrame>
          ) : (
            profile.avatar ? (
              <AvatarImage source={profile.avatar} size={AVATAR_SIZE} style={styles.avatar} />
            ) : (
              <View style={styles.avatarEmpty}>
                <Ionicons name="person" size={36} color={colors.gray} />
              </View>
            )
          )}
        </View>

        {/* Stats - Glassmorphism Style */}
        <View style={styles.statsGlass}>
          <BlurView intensity={80} tint="light" style={styles.statsBlurContainer}>
            <View style={styles.statGlassItem}>
              <Text style={styles.statGlassValue}>{displayFanCount}</Text>
              <Text style={styles.statGlassLabel}>Fans</Text>
            </View>
            <View style={styles.statGlassDivider} />
            <View style={styles.statGlassItem}>
              <Text style={styles.statGlassValue}>{profile.peakCount}</Text>
              <Text style={styles.statGlassLabel}>Peaks</Text>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Name & Share Button */}
      <View style={styles.nameRow}>
        <View style={styles.nameWithBadges}>
          <Text style={styles.displayName}>{profile.displayName}</Text>
          <AccountBadge
            size={18}
            style={styles.badge}
            isVerified={profile.isVerified}
            accountType={profile.accountType}
            followerCount={localFanCount ?? profile.fanCount ?? 0}
          />
          {profile.isPrivate && (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={12} color={colors.gray} />
            </View>
          )}
          {(profile.isBot || profile.isTeam) && (
            <View style={styles.teamBadge}>
              <Text style={styles.teamBadgeText}>(Team Smuppy)</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShareProfile}>
          <Ionicons name="share-outline" size={18} color={colors.dark} />
        </TouchableOpacity>
      </View>


      {/* Bio Section */}
      {profile.bio ? (
        <View style={styles.bioSection}>
          <Text
            style={styles.bioText}
            numberOfLines={bioExpanded ? 6 : 2}
          >
            {profile.bio}
          </Text>
          {profile.bio.length > 80 && (
            <TouchableOpacity
              onPress={() => setBioExpanded(!bioExpanded)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.seeMoreBtn}
            >
              <Text style={styles.seeMoreText}>
                {bioExpanded ? 'See less' : 'See more'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionButtonsContainer}>
        {/* Row 1: Fan + Message */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={[
              styles.fanButton,
              isFan && styles.fanButtonActive,
              isRequested && styles.fanButtonRequested
            ]}
            onPress={handleFanPress}
            disabled={isLoadingFollow}
          >
            {isLoadingFollow ? (
              <ActivityIndicator size="small" color={isFan ? '#FFFFFF' : isRequested ? '#8E8E93' : '#0EBF8A'} />
            ) : (
              <Text style={[
                styles.fanButtonText,
                isFan && styles.fanButtonTextActive,
                isRequested && styles.fanButtonTextRequested
              ]}>
                {isFan ? 'Fan' : isRequested ? 'Requested' : 'Become a fan'}
              </Text>
            )}
          </TouchableOpacity>

          {(isFan || profile.accountType === 'pro_creator') && (
            <TouchableOpacity
              style={[styles.messageButton, !isFan && styles.messageButtonDisabled]}
              onPress={handleMessagePress}
              disabled={!isFan}
            >
              <Ionicons
                name={isFan ? 'chatbubble-outline' : 'lock-closed-outline'}
                size={18}
                color={colors.dark}
              />
              <Text style={styles.messageText}>Message</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Row 2: Monetization buttons (pro_creator only) */}
        {profile.accountType === 'pro_creator' && (FEATURES.CHANNEL_SUBSCRIBE || FEATURES.PRIVATE_SESSIONS || FEATURES.TIPPING) && (
          <View style={styles.actionButtonsRow}>
            {FEATURES.CHANNEL_SUBSCRIBE && (
              <LiquidButton
                label="Subscribe"
                onPress={() => setShowSubscribeModal(true)}
                size="sm"
                variant="outline"
                style={{ flex: 1 }}
                icon={<Ionicons name="star" size={14} color="#E74C3C" />}
                iconPosition="left"
                colorScheme="green"
                textStyle={{ color: '#E74C3C' }}
              />
            )}

            {FEATURES.PRIVATE_SESSIONS && (
              <LiquidButton
                label="Book 1:1"
                onPress={() => (navigation as any).navigate('BookSession', {
                  creator: {
                    id: profile.id,
                    name: profile.displayName,
                    avatar: profile.avatar || '',
                    specialty: profile.bio?.slice(0, 30) || 'Fitness Coach',
                  }
                })}
                size="sm"
                variant="outline"
                style={{ flex: 1 }}
                icon={<Ionicons name="videocam" size={14} color="#3B82F6" />}
                iconPosition="left"
                colorScheme="green"
                textStyle={{ color: '#3B82F6' }}
              />
            )}

            {FEATURES.TIPPING && (
              <TipButton
                recipient={{
                  id: profile.id,
                  username: profile.username,
                  displayName: profile.displayName,
                  avatarUrl: profile.avatar || undefined,
                }}
                contextType="profile"
                variant="compact"
              />
            )}
          </View>
        )}

        {/* Row 3: Offerings button (pro_creator only) */}
        {profile.accountType === 'pro_creator' && (FEATURES.PRIVATE_SESSIONS || FEATURES.CHANNEL_SUBSCRIBE) && (
          <View style={styles.actionButtonsRow}>
            <LiquidButton
              label="View Offerings"
              onPress={() => (navigation as any).navigate('CreatorOfferings', { creatorId: profile.id })}
              size="sm"
              variant="outline"
              style={{ flex: 1 }}
              icon={<Ionicons name="pricetag" size={14} color="#0EBF8A" />}
              iconPosition="left"
              colorScheme="green"
            />
          </View>
        )}
      </View>

      {/* Pro Creator Live Section */}
      {FEATURES.VIEWER_LIVE_STREAM && profile.accountType === 'pro_creator' && (
        <>
          {/* LIVE NOW Section */}
          {creatorLiveStatus.isLive && (
            <View style={styles.liveNowSection}>
              <LinearGradient
                colors={['rgba(255, 59, 48, 0.1)', 'rgba(255, 59, 48, 0.05)']}
                style={styles.liveNowGradient}
              >
                <View style={styles.liveNowHeader}>
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>LIVE NOW</Text>
                  </View>
                  <Text style={styles.liveViewers}>127 viewers</Text>
                </View>
                <Text style={styles.liveTitle}>{creatorLiveStatus.liveTitle}</Text>
                <TouchableOpacity
                  style={styles.joinLiveButton}
                  onPress={() => (navigation as any).navigate('ViewerLiveStream', {
                    channelName: `live_${profile.id}`,
                    creatorId: profile.id,
                    creatorName: profile.displayName,
                    creatorAvatar: profile.avatar,
                    liveTitle: creatorLiveStatus.liveTitle || 'Live Session',
                    viewerCount: 127,
                  })}
                >
                  <LinearGradient
                    colors={['#FF3B30', '#FF6B6B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.joinLiveGradient}
                  >
                    <Ionicons name="play" size={18} color="#FFFFFF" />
                    <Text style={styles.joinLiveText}>Join Live Stream</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          )}

        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />

      {/* Fixed Header */}
      {renderHeader()}

      {/* Fixed Tabs */}
      {renderTabs()}

      {/* Scrollable Content Area */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {renderTabContent()}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Modal Unfan Confirmation */}
      <Modal
        visible={showUnfanModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUnfanModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Stop being a fan?</Text>
            <Text style={styles.modalText}>
              You won't be able to comment or send messages to this user anymore.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalBtnCancel}
                onPress={() => setShowUnfanModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalBtnConfirm}
                onPress={confirmUnfan}
              >
                <Text style={styles.modalBtnConfirmText}>Unfan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Blocked (spam fan/unfan) */}
      <Modal
        visible={showBlockedModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBlockedModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalEmoji}>⚠️</Text>
            <Text style={styles.modalTitle}>Action Temporarily Blocked</Text>
            <Text style={styles.modalText}>
              You've changed your fan status too many times. To prevent spam, this action is blocked until {formatBlockDate()}.
            </Text>
            <TouchableOpacity 
              style={styles.modalBtnSingle}
              onPress={() => setShowBlockedModal(false)}
            >
              <Text style={styles.modalBtnSingleText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal Cancel Follow Request */}
      <Modal
        visible={showCancelRequestModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelRequestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalEmoji}>🔔</Text>
            <Text style={styles.modalTitle}>Cancel Follow Request?</Text>
            <Text style={styles.modalText}>
              {profile.displayName} won't be notified that you've cancelled your request.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setShowCancelRequestModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnConfirm, { backgroundColor: '#FF3B30' }]}
                onPress={handleCancelRequest}
              >
                <Text style={styles.modalBtnConfirmText}>Cancel Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Fan Required (pour commenter) */}
      <Modal
        visible={showFanRequiredModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFanRequiredModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalEmoji}>💚</Text>
            <Text style={styles.modalTitle}>Become a fan to comment</Text>
            <Text style={styles.modalText}>
              Join the community! Become a fan to interact with this creator's content.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalBtnCancel}
                onPress={() => setShowFanRequiredModal(false)}
              >
                <Text style={styles.modalBtnCancelText}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnConfirm}
                onPress={() => {
                  setShowFanRequiredModal(false);
                  becomeFan();
                }}
              >
                <Text style={styles.modalBtnConfirmText}>Become a fan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Menu (Share, Report, Block) */}
      <Modal
        visible={showMenuModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMenuModal(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setShowMenuModal(false)}
        >
          <View style={styles.menuContent}>
            <View style={styles.menuHandle} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowMenuModal(false);
                handleShareProfile();
              }}
            >
              <Ionicons name="share-outline" size={22} color={colors.dark} />
              <Text style={styles.menuItemText}>Share Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleReportUser}>
              <Ionicons name="flag-outline" size={22} color={colors.dark} />
              <Text style={styles.menuItemText}>Report</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleBlockUser}>
              <Ionicons name="ban-outline" size={22} color="#FF3B30" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Block</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCancel}
              onPress={() => setShowMenuModal(false)}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Subscribe Channel Modal */}
      <SubscribeChannelModal
        visible={showSubscribeModal}
        onClose={() => setShowSubscribeModal(false)}
        creatorName={profile.displayName}
        creatorAvatar={profile.avatar || ''}
        creatorUsername={profile.username}
        onSubscribe={(tierId) => {
          setShowSubscribeModal(false);
          const tierMap: Record<string, { id: string; name: string; price: number; perks: string[] }> = {
            basic: { id: 'basic', name: 'Fan', price: 4.99, perks: ['Access to exclusive posts', 'Join live streams', 'Fan badge on comments'] },
            premium: { id: 'premium', name: 'Super Fan', price: 9.99, perks: ['All Fan benefits', 'Access to exclusive videos', 'Priority in live chat', 'Monthly 1-on-1 Q&A'] },
            vip: { id: 'vip', name: 'VIP', price: 24.99, perks: ['All Super Fan benefits', 'Private Discord access', 'Early access to content', 'Personal shoutouts', '10% off private sessions'] },
          };
          const tier = tierMap[tierId] || tierMap.premium;
          (navigation as any).navigate('ChannelSubscribe', { creatorId: profile.id, tier });
        }}
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ===== HEADER =====
  headerContainer: {
    paddingBottom: 4,
  },
  coverAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT + 150,
    zIndex: 0,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverSpacer: {
    height: COVER_HEIGHT - 60,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    padding: 8,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 3,
  },
  menuBtn: {
    position: 'absolute',
    right: 16,
    padding: 8,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 3,
  },

  // ===== AVATAR ROW =====
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 2,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.white,
  },
  avatarEmpty: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.white,
  },

  // ===== STATS GLASSMORPHISM =====
  statsGlass: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  statsBlurContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.7)',
    backgroundColor: isDark ? 'rgba(26,26,26,0.8)' : 'rgba(255,255,255,0.4)',
  },
  statGlassItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  statGlassDivider: {
    width: 1,
    height: 20,
    backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
  },
  statGlassValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dark,
  },
  statGlassLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.gray,
  },

  // ===== NAME ROW =====
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 4,
    zIndex: 2,
  },
  nameWithBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    flexWrap: 'nowrap',
  },
  displayName: {
    fontFamily: 'WorkSans-SemiBold',
    fontSize: 20,
    color: colors.dark,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  badge: {
    marginLeft: 6,
  },
  teamBadge: {
    marginLeft: 6,
    backgroundColor: 'rgba(14, 191, 138, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  teamBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0EBF8A',
  },
  privateBadge: {
    marginLeft: 6,
    backgroundColor: colors.backgroundSecondary,
    padding: 4,
    borderRadius: 10,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontSize: 14,
    color: colors.gray,
    paddingHorizontal: 20,
    marginTop: 2,
    zIndex: 2,
  },

  // ===== BIO =====
  bioSection: {
    paddingHorizontal: 20,
    marginTop: 4,
    zIndex: 2,
  },
  bioText: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.dark,
    lineHeight: 18,
  },
  seeMoreBtn: {
    alignSelf: 'flex-start',
  },
  seeMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    paddingVertical: 1,
  },

  // ===== ACTION BUTTONS =====
  actionButtonsContainer: {
    paddingHorizontal: 20,
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
    zIndex: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fanButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanButtonActive: {
    backgroundColor: colors.primary,
  },
  fanButtonRequested: {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.gray,
  },
  fanButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  fanButtonTextActive: {
    color: colors.white,
  },
  fanButtonTextRequested: {
    color: colors.gray,
  },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  messageButtonDisabled: {
    opacity: 0.5,
  },
  sessionButton: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  sessionButtonGradient: {
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sessionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  subscribeButton: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  subscribeButtonGradient: {
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  subscribeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ===== LIVE SECTIONS =====
  liveNowSection: {
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  liveNowGradient: {
    padding: 16,
  },
  liveNowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  liveViewers: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray,
  },
  liveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 12,
  },
  joinLiveButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  joinLiveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  joinLiveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  nextLiveSection: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: 'rgba(14, 191, 138, 0.08)',
    borderRadius: 16,
    padding: 16,
  },
  nextLiveHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  nextLiveIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 191, 138, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  nextLiveInfo: {
    flex: 1,
  },
  nextLiveLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.gray,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nextLiveDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
    marginTop: 2,
  },
  nextLiveTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray,
    marginTop: 2,
  },
  reminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 191, 138, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  reminderButtonActive: {
    backgroundColor: '#0EBF8A',
  },
  reminderButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0EBF8A',
  },
  reminderButtonTextActive: {
    color: '#FFFFFF',
  },

  // ===== TABS (PILLS STYLE) =====
  tabsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  pillsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    padding: 3,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0EBF8A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray,
  },
  pillTextActive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ===== SCROLL CONTENT =====
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingTop: 0,
    paddingBottom: 20,
  },

  // ===== POSTS GRID =====
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  postCardWrapper: {
    width: (SCREEN_WIDTH - 44) / 2,
  },
  postCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  postThumb: {
    width: '100%',
    height: '100%',
  },
  postThumbEmpty: {
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postStatsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  postStatTextWhite: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  postPlayIcon: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  postStatText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.gray,
  },

  // ===== PEAKS GRID =====
  peaksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  peakCard: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.backgroundSecondary,
  },
  peakThumb: {
    width: '100%',
    height: '100%',
  },
  peakDuration: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  peakDurationText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  peakStatsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 6,
  },
  peakStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  peakStatText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },

  // ===== LOADING & EMPTY STATES =====
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 21,
  },

  // ===== PRIVATE ACCOUNT STATE =====
  privateContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  privateLockContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  privateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  privateDesc: {
    fontSize: 15,
    fontWeight: '400',
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  privateFollowBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 25,
    backgroundColor: colors.primary,
  },
  privateFollowBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },

  // ===== MODALS =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  modalBtnSingle: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  modalBtnSingleText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },

  // ===== MENU MODAL =====
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  menuHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.gray,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 16,
  },
  menuItemText: {
    fontSize: 16,
    color: colors.dark,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 24,
  },
  menuItemTextDanger: {
    color: '#FF3B30',
  },
  menuCancel: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
});

const createGeStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  header: {
    width: '100%',
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 10,
    padding: 3,
    alignSelf: 'center',
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  chipActive: {
    backgroundColor: isDark ? colors.backgroundSecondary : colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray,
  },
  chipTextActive: {
    color: colors.dark,
  },
});

export default UserProfileScreen;
