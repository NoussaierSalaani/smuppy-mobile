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
  Image,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useUserStore } from '../../stores/userStore';
import { useUserSafetyStore } from '../../stores/userSafetyStore';
import { useVibeStore } from '../../stores/vibeStore';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, NavigationProp } from '@react-navigation/native';
import type { MainStackParamList } from '../../types';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { HIT_SLOP } from '../../config/theme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useProfile } from '../../hooks/queries';
import { queryKeys } from '../../lib/queryClient';
import { followUser, unfollowUser, getPostsByUser, Post, hasPendingFollowRequest, cancelFollowRequest, isFollowing as checkIsFollowing } from '../../services/database';
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
import { ProfileSkeleton } from '../../components/skeleton';

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
  displayName: 'User',
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
  // Fallback cover to avoid empty space on profiles without custom cover
   
  const resolved = Image.resolveAssetSource(require('../../../assets/images/bg.png'));
  return resolved?.uri || null;
};


const UserProfileScreen = () => {
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showAlert, showSuccess, showError, showDestructiveConfirm } = useSmuppyAlert();
  const queryClient = useQueryClient();

  // Determine if this is our profile or another user's
  const params = route?.params as { userId?: string } || {};
  const userId = params.userId;
  const currentUser = useUserStore((state) => state.user);
  const isOwnProfile = !userId || userId === currentUser?.id;
  const { data: profileData, isLoading, isError, refetch: _refetch } = useProfile(userId);

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
  
  // State
  // Initialize isFan from React Query cache so remounts show correct state instantly
  const cachedProfile = queryClient.getQueryData<ProfileApiData>(queryKeys.user.profile(userId || ''));
  const [isFan, setIsFan] = useState(cachedProfile?.is_following ?? false);
  const [isRequested, setIsRequested] = useState(false); // For private account follow requests
  const [isLoadingFollow, setIsLoadingFollow] = useState(false);
  const [fanToggleCount, setFanToggleCount] = useState(0);
  const [isVerifyingFollow, setIsVerifyingFollow] = useState(false);
  const followFalseStrikesRef = useRef(0); // require 2 consecutive authenticated false checks before dropping fan
  // Grace period: after follow/unfollow, ignore API responses for 10s to avoid read-replica-lag reversals
  const followGraceUntilRef = useRef<number>(0);
  const [localFanCount, setLocalFanCount] = useState<number | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockEndDate, setBlockEndDate] = useState<Date | null>(null);
  const [showUnfanModal, setShowUnfanModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showFanRequiredModal, setShowFanRequiredModal] = useState(false);
  const [showCancelRequestModal, setShowCancelRequestModal] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [refreshing, setRefreshing] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  // On mount, if cache says not fan, double-check with follow-check endpoint to avoid stale flashes
  useEffect(() => {
    if (!userId || isFan) return;
    let cancelled = false;
    setIsVerifyingFollow(true);
    checkIsFollowing(userId).then(({ isFollowing }) => {
      if (cancelled) return;
      if (isFollowing) {
        setIsFan(true);
        queryClient.setQueryData(queryKeys.user.profile(userId), (old: ProfileApiData | undefined) =>
          old ? { ...old, is_following: true } : old
        );
      }
    }).finally(() => {
      if (!cancelled) setIsVerifyingFollow(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
    }).catch((err) => {
      if (__DEV__) console.warn('[UserProfile] Live stream check failed:', err);
    });
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
  // During the grace period after a follow/unfollow, skip syncing from API to avoid
  // read-replica-lag reversals (the optimistic setQueryData value is already correct).
  useEffect(() => {
    if (!profileData) return;
    let cancelled = false;

    // Skip API sync during grace period — our optimistic cache update is authoritative
    if (Date.now() < followGraceUntilRef.current) return;

    // Use is_following from profile API response (or cache)
    const isFollowingFromApi = profileData.is_following;

    // If API doesn't include the field (unauthenticated/stale), don't overwrite local state.
    if (isFollowingFromApi === undefined) {
      // Opportunistic verification if we think we're a fan
      if (isFan && userId && !isVerifyingFollow) {
        setIsVerifyingFollow(true);
        checkIsFollowing(userId).then(({ isFollowing }) => {
          if (cancelled) return;
          setIsFan(isFollowing);
          if (!isFollowing) {
            hasPendingFollowRequest(userId).then(({ pending }) => {
              if (!cancelled) setIsRequested(pending);
            }).catch(() => { /* keep existing state */ });
          } else {
            setIsRequested(false);
          }
        }).catch(() => {
          // keep optimistic state on error
        }).finally(() => {
          if (!cancelled) setIsVerifyingFollow(false);
        });
      }
      return;
    }

    // If API says "not following" but local state says we are, double-check with the
    // dedicated endpoint to avoid false negatives from stale/anonymous responses.
    if (isFan && !isFollowingFromApi && userId && !isVerifyingFollow) {
      setIsVerifyingFollow(true);
      checkIsFollowing(userId).then(({ isFollowing }) => {
        if (cancelled) return;
        if (isFollowing) {
          followFalseStrikesRef.current = 0;
          setIsFan(true);
          setIsRequested(false);
          queryClient.setQueryData(queryKeys.user.profile(userId), (old: ProfileApiData | undefined) =>
            old ? { ...old, is_following: true } : old
          );
        } else {
          followFalseStrikesRef.current += 1;
          if (followFalseStrikesRef.current >= 2) {
            setIsFan(false);
            // Re-check pending requests when we're truly not following
            hasPendingFollowRequest(userId).then(({ pending }) => {
              if (!cancelled) setIsRequested(pending);
            }).catch(() => { /* keep existing state */ });
            queryClient.setQueryData(queryKeys.user.profile(userId), (old: ProfileApiData | undefined) =>
              old ? { ...old, is_following: false } : old
            );
          }
        }
      }).catch(() => {
        // If verification fails, keep existing optimistic state
      }).finally(() => {
        if (!cancelled) setIsVerifyingFollow(false);
      });
      return;
    }

    setIsFan(isFollowingFromApi);

    // If not following and profile is private, check for pending request
    if (!isFollowingFromApi && userId) {
      hasPendingFollowRequest(userId).then(({ pending }) => {
        if (!cancelled) setIsRequested(pending);
      }).catch(() => { /* keep existing state */ });
    } else {
      setIsRequested(false);
    }

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData, userId]);

  // Effective fan status: profileData.is_following is updated immediately by both
  // API responses and optimistic cache updates (setQueryData), while isFan state
  // lags by one render cycle due to useEffect. This prevents the "Become a fan"
  // button flash when navigating to a profile you already follow.
  const effectiveIsFan = profileData?.is_following ?? isFan;

  // Load user's posts
  const loadUserPosts = useCallback(async () => {
    if (!userId) return;

    setIsLoadingPosts(true);
    const { data, error } = await getPostsByUser(userId, 0, 50);
    if (!error && data) {
      setUserPosts(data);
    }
    setIsLoadingPosts(false);
  }, [userId]);

  useEffect(() => {
    loadUserPosts();
  }, [loadUserPosts]);

  // Silent refetch when returning from detail screens (PostDetailProfileScreen)
  // Ensures likes_count and views_count reflect changes made in the detail view
  const initialLoadDoneRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!initialLoadDoneRef.current) {
        initialLoadDoneRef.current = true;
        return; // Skip first focus — initial load handled by useEffect above
      }
      if (!userId) return;
      getPostsByUser(userId, 0, 50).then(({ data, error }) => {
        if (!error && data) setUserPosts(data);
      }).catch(() => { /* silent refetch failure — stale data remains */ });
    }, [userId])
  );

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUserPosts();
    setRefreshing(false);
  }, [loadUserPosts]);

  // Share profile
  const handleShareProfile = useCallback(async () => {
    try {
      const profileUrl = `https://smuppy.app/u/${profile.username}`;
      await Share.share({
        message: `Check out ${profile.displayName}'s profile on Smuppy! ${profileUrl}`,
        url: profileUrl,
      });
    } catch (error) {
      if (__DEV__) console.warn('Error sharing profile:', error);
    }
  }, [profile.username, profile.displayName]);

  // User safety store for block
  const { block, isBlocked: isUserBlocked } = useUserSafetyStore();

  // Report user
  const submitUserReport = useCallback((_reason: string) => {
    showSuccess('Report Submitted', 'Thank you for your report. We will review this user.');
  }, [showSuccess]);

  const handleReportUser = useCallback(() => {
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
  }, [showAlert, submitUserReport]);

  // Block user
  const handleBlockUser = useCallback(() => {
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
  }, [userId, profile.displayName, isUserBlocked, showDestructiveConfirm, showError, showSuccess, navigation, block]);

  // Fan button handler
  const handleFanPress = useCallback(() => {
    // Guard: don't allow on own profile or while loading
    if (isOwnProfile || isLoadingFollow) return;

    if (isBlocked) {
      setShowBlockedModal(true);
      return;
    }

    if (effectiveIsFan) {
      setShowUnfanModal(true);
    } else if (isRequested) {
      // Show cancel request modal
      setShowCancelRequestModal(true);
    } else {
      becomeFan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnProfile, isLoadingFollow, isBlocked, effectiveIsFan, isRequested]);

  // Cancel follow request
  const handleCancelRequest = useCallback(async () => {
    if (!userId || isLoadingFollow) return;

    setShowCancelRequestModal(false);
    setIsLoadingFollow(true);

    const { error } = await cancelFollowRequest(userId);

    if (!error) {
      setIsRequested(false);
    }

    setIsLoadingFollow(false);
  }, [userId, isLoadingFollow]);

  const registerToggleAndMaybeBlock = useCallback(() => {
    const next = fanToggleCount + 1;
    if (next > 2) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      setBlockEndDate(endDate);
      setIsBlocked(true);
      setShowBlockedModal(true);
      return true;
    }
    setFanToggleCount(next);
    return false;
  }, [fanToggleCount]);

  const becomeFan = useCallback(async () => {
    // Guard: require userId and not loading
    if (!userId || isLoadingFollow || isOwnProfile) return;

    setIsLoadingFollow(true);

    // Optimistic update for responsive UI (will revert on error)
    const wasPrivate = profile.isPrivate;
    if (wasPrivate) {
      setIsRequested(true);
    } else {
      setIsFan(true);
      setLocalFanCount(prev => (prev ?? 0) + 1);
      // Optimistically update React Query cache so navigating away/back persists fan state
      queryClient.setQueryData(queryKeys.user.profile(userId), (old: ProfileApiData | undefined) => {
        if (!old) return old;
        return { ...old, is_following: true, fan_count: (old.fan_count ?? 0) + 1 };
      });
    }

    try {
      const { error, requestCreated, cooldown } = await followUser(userId);

      if (error) {
        // Revert optimistic update on error
        if (wasPrivate) {
          setIsRequested(false);
        } else {
          setIsFan(false);
          setLocalFanCount(prev => Math.max((prev ?? 1) - 1, 0));
        }
        // Revert cache to server truth
        queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });

        if (cooldown?.blocked) {
          setBlockEndDate(new Date(cooldown.until));
          setIsBlocked(true);
          setShowBlockedModal(true);
        } else {
          showError('Follow Failed', 'Unable to follow this user. Please try again.');
        }
        if (__DEV__) console.warn('[UserProfile] Follow error:', error);
        return;
      }

      // Adjust state based on actual API response
      if (requestCreated) {
        // A follow request was created for a private account
        setIsRequested(true);
        setIsFan(false);
        // Revert fan count if we optimistically added it
        if (!wasPrivate) {
          setLocalFanCount(prev => Math.max((prev ?? 1) - 1, 0));
        }
        // Update cache: not following yet (pending request)
        queryClient.setQueryData(queryKeys.user.profile(userId), (old: ProfileApiData | undefined) => {
          if (!old) return old;
          return { ...old, is_following: false };
        });
      } else {
        // Direct follow was successful
        setIsFan(true);
        setIsRequested(false);
        // Ensure fan count is incremented (may already be from optimistic update)
        if (wasPrivate) {
          setLocalFanCount(prev => (prev ?? 0) + 1);
          // Update cache now that follow is confirmed
          queryClient.setQueryData(queryKeys.user.profile(userId), (old: ProfileApiData | undefined) => {
            if (!old) return old;
            return { ...old, is_following: true, fan_count: (old.fan_count ?? 0) + 1 };
          });
        }
        if (useUserStore.getState().user?.accountType !== 'pro_business') {
          useVibeStore.getState().addVibeAction('follow_user');
        }
      }

      registerToggleAndMaybeBlock();

      // Grace period: ignore API-sourced profileData updates for 10s to let the read
      // replica catch up. Our setQueryData above is authoritative during this window.
      followGraceUntilRef.current = Date.now() + 10_000;
    } catch (err) {
      // Revert optimistic update on unexpected error
      if (wasPrivate) {
        setIsRequested(false);
      } else {
        setIsFan(false);
        setLocalFanCount(prev => Math.max((prev ?? 1) - 1, 0));
      }
      // Revert cache to server truth
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });
      showError('Follow Failed', 'Something went wrong. Please try again.');
      if (__DEV__) console.warn('[UserProfile] becomeFan unexpected error:', err);
    } finally {
      setIsLoadingFollow(false);
    }
   
  }, [userId, isLoadingFollow, isOwnProfile, profile.isPrivate, queryClient, showError, registerToggleAndMaybeBlock]);

  const confirmUnfan = useCallback(async () => {
    // Guard: require userId and not loading
    if (!userId || isLoadingFollow || isOwnProfile) return;

    setShowUnfanModal(false);

    setIsLoadingFollow(true);
    // Optimistic update: local state + cache
    setIsFan(false);
    setLocalFanCount(prev => Math.max((prev ?? 1) - 1, 0));
    queryClient.setQueryData(queryKeys.user.profile(userId), (old: ProfileApiData | undefined) => {
      if (!old) return old;
      return { ...old, is_following: false, fan_count: Math.max((old.fan_count ?? 1) - 1, 0) };
    });

    try {
      const { error, cooldown } = await unfollowUser(userId);

      if (error) {
        // Revert on error: local state + cache
        setIsFan(true);
        setLocalFanCount(prev => (prev ?? 0) + 1);
        queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });
        showError('Unfollow Failed', 'Unable to unfollow this user. Please try again.');
        if (__DEV__) console.warn('[UserProfile] Unfollow error:', error);
        return;
      }

      if (cooldown?.blocked) {
        setBlockEndDate(new Date(cooldown.until));
        setIsBlocked(true);
        setTimeout(() => setShowBlockedModal(true), 300);
        return;
      }

      registerToggleAndMaybeBlock();

      // Grace period: ignore API-sourced profileData updates for 10s (read replica lag)
      followGraceUntilRef.current = Date.now() + 10_000;
    } catch (err) {
      // Revert on unexpected error: local state + cache
      setIsFan(true);
      setLocalFanCount(prev => (prev ?? 0) + 1);
      queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(userId) });
      showError('Unfollow Failed', 'Something went wrong. Please try again.');
      if (__DEV__) console.warn('[UserProfile] confirmUnfan unexpected error:', err);
    } finally {
      setIsLoadingFollow(false);
    }
   
  }, [userId, isLoadingFollow, isOwnProfile, queryClient, showError, registerToggleAndMaybeBlock]);

  const handleMessagePress = useCallback(() => {
    if (effectiveIsFan) {
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
  }, [effectiveIsFan, navigation, profile.id, profile.username, profile.displayName, profile.avatar, profile.isVerified, profile.accountType]);

  // Format the unblock date
  const formatBlockDate = useCallback(() => {
    if (!blockEndDate) return '';
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    return blockEndDate.toLocaleDateString('en-US', options);
  }, [blockEndDate]);

  // Create styles with theme (MUST BE BEFORE RENDER CALLBACKS)
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const fixedBtnTopStyle = useMemo(() => ({ top: insets.top + 8 }), [insets.top]);

  // ==================== EXTRACTED HANDLERS (from inline JSX) ====================
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleShowMenuModal = useCallback(() => setShowMenuModal(true), []);
  const handleCloseMenuModal = useCallback(() => setShowMenuModal(false), []);
  const handleCloseUnfanModal = useCallback(() => setShowUnfanModal(false), []);
  const handleCloseBlockedModal = useCallback(() => setShowBlockedModal(false), []);
  const handleCloseCancelRequestModal = useCallback(() => setShowCancelRequestModal(false), []);
  const handleCloseFanRequiredModal = useCallback(() => setShowFanRequiredModal(false), []);
  const handleShowSubscribeModal = useCallback(() => setShowSubscribeModal(true), []);
  const handleCloseSubscribeModal = useCallback(() => setShowSubscribeModal(false), []);
  const handleBioToggle = useCallback(() => setBioExpanded(prev => !prev), []);
  const handleEditProfile = useCallback(() => navigation.navigate('EditProfile' as never), [navigation]);
  const handleTabChange = useCallback((key: string) => setActiveTab(key as typeof activeTab), []);
  const handleBookSession = useCallback(() => {
    navigation.navigate('BookSession', {
      creatorId: profile.id,
      creator: {
        id: profile.id,
        name: profile.displayName,
        avatar: profile.avatar || '',
        specialty: profile.bio?.slice(0, 30) || 'Fitness Coach',
      }
    });
  }, [navigation, profile.id, profile.displayName, profile.avatar, profile.bio]);
  const handleViewOfferings = useCallback(() => {
    navigation.navigate('CreatorOfferings', { creatorId: profile.id });
  }, [navigation, profile.id]);
  const handleJoinLive = useCallback(() => {
    navigation.navigate('ViewerLiveStream', {
      channelName: `live_${profile.id}`,
      creatorId: profile.id,
      creatorName: profile.displayName,
      creatorAvatar: profile.avatar,
      liveTitle: creatorLiveStatus.liveTitle || 'Live Session',
      viewerCount: 127,
    });
  }, [navigation, profile.id, profile.displayName, profile.avatar, creatorLiveStatus.liveTitle]);
  const handleMenuShareProfile = useCallback(() => {
    setShowMenuModal(false);
    handleShareProfile();
  }, [handleShareProfile]);
  const handleMenuUnfan = useCallback(() => {
    setShowMenuModal(false);
    setShowUnfanModal(true);
  }, []);
  const handleFanRequiredConfirm = useCallback(() => {
    setShowFanRequiredModal(false);
    becomeFan();
  }, [becomeFan]);
  const handleSubscribe = useCallback((tierId: string) => {
    setShowSubscribeModal(false);
    const tierMap: Record<string, { id: string; name: string; price: number; perks: string[] }> = {
      basic: { id: 'basic', name: 'Fan', price: 4.99, perks: ['Access to exclusive posts', 'Join live streams', 'Fan badge on comments'] },
      premium: { id: 'premium', name: 'Super Fan', price: 9.99, perks: ['All Fan benefits', 'Access to exclusive videos', 'Priority in live chat', 'Monthly 1-on-1 Q&A'] },
      vip: { id: 'vip', name: 'VIP', price: 24.99, perks: ['All Super Fan benefits', 'Private Discord access', 'Early access to content', 'Personal shoutouts', '10% off private sessions'] },
    };
    const tier = tierMap[tierId] || tierMap.premium;
    navigation.navigate('ChannelSubscribe', { creatorId: profile.id, tier });
  }, [navigation, profile.id]);

  // ==================== RENDER POST ITEM (MUST BE BEFORE EARLY RETURNS) ====================
  const renderPostItem = useCallback((post: Post, allPosts: Post[]) => {
    // Support both media_urls array and legacy media_url string
    const thumbnail = post.media_urls?.[0] || post.media_url || null;
    const isVideo = post.media_type === 'video';

    // Transform posts for detail screen (matching PostDetailProfileScreen format)
    const transformedPosts = allPosts.map(p => {
      const pAllMedia = p.media_urls?.filter(Boolean) || [p.media_url].filter(Boolean);
      return {
        id: p.id,
        type: p.media_type === 'video' ? 'video' : pAllMedia.length > 1 ? 'carousel' : 'image',
        media: pAllMedia[0] || '',
        thumbnail: pAllMedia[0] || '',
        description: p.content || p.caption || '',
        likes: p.likes_count || 0,
        views: p.views_count || 0,
        location: p.location || null,
        taggedUsers: p.tagged_users || [],
        allMedia: pAllMedia.length > 1 ? pAllMedia : undefined,
        user: {
          id: profile.id,
          name: profile.displayName,
          avatar: profile.avatar || '',
        },
      };
    });

    return (
      <TouchableOpacity
        style={styles.postCard}
        onPress={() => navigation.navigate('PostDetailProfile', {
          postId: post.id,
          profilePosts: transformedPosts as never,
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
      <View style={styles.errorStateContainer}>
        <Text style={styles.displayName}>Profile not found</Text>
        <Text style={styles.errorBioText}>
          This profile is unavailable. Please try again.
        </Text>
        <TouchableOpacity style={styles.errorGoBackButton} onPress={handleGoBack}>
          <Text style={styles.fanButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (isError || !profileData) {
    return (
      <View style={styles.errorStateContainer}>
        <Text style={styles.displayName}>Unable to load profile</Text>
        <Text style={styles.errorBioText}>
          Please check your connection or try again later.
        </Text>
        <TouchableOpacity style={styles.errorGoBackButton} onPress={handleGoBack}>
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
        style={styles.emptyIconMargin}
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
    const isPrivateAndNotFan = profile.isPrivate && !effectiveIsFan && !isOwnProfile;

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
      const postColumns = posts.length === 1 ? 1 : posts.length === 2 ? 2 : 3;
      const cardAspect = postColumns === 1 ? 0.9 : 1;
      const gridPadding = 16 * 2;
      const gridGap = 12;
      const totalGaps = gridGap * (postColumns - 1);
      const cardWidth = (SCREEN_WIDTH - gridPadding - totalGaps) / postColumns;
      return (
        <View style={styles.postsGrid}>
          {posts.map((post, index) => (
            <View
              key={`post-${index}-${post.id}`}
              style={[
                styles.postCardWrapper,
                {
                  width: cardWidth,
                  aspectRatio: cardAspect,
                },
              ]}
            >
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
              onPress={() => {
                const transformed = peaks.map(p => ({
                  id: p.id,
                  videoUrl: p.media_urls?.find((u: string) => u.includes('.mp4') || u.includes('.mov')) || p.media_urls?.[0],
                  thumbnail: p.media_urls?.[0],
                  duration: p.peak_duration || 15,
                  user: {
                    id: profile.id,
                    name: profile.displayName || profile.username,
                    avatar: profile.avatar || '',
                  },
                  views: p.views_count || 0,
                  likes: p.likes_count || 0,
                  repliesCount: p.comments_count || 0,
                  isLiked: p.is_liked || false,
                  isOwnPeak: false,
                  createdAt: p.created_at,
                }));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                navigation.navigate('PeakView', { peaks: transformed as any[], initialIndex: index });
              }}
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
      // Unified Activities - no Event/Group toggle
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="flash-outline" size={48} color={colors.gray} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No activities yet</Text>
          <Text style={styles.emptyDesc}>This user hasn't created any activities yet</Text>
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
        onTabChange={handleTabChange}
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

      {/* Back & Menu buttons moved outside ScrollView for fixed positioning */}

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

      {/* Name & Action Icons */}
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
          {/* Fan badge when following */}
          {!isOwnProfile && effectiveIsFan && (
            <View style={styles.fanBadge}>
              <SmuppyHeartIcon size={10} color="#0EBF8A" filled />
              <Text style={styles.fanBadgeText}>Fan</Text>
            </View>
          )}
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
        <View style={styles.nameActions}>
          {/* Message icon — only when fan and not own profile */}
          {!isOwnProfile && effectiveIsFan && (
            <TouchableOpacity style={styles.actionBtn} onPress={handleMessagePress}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.dark} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionBtn} onPress={handleShareProfile}>
            <Ionicons name="share-outline" size={18} color={colors.dark} />
          </TouchableOpacity>
        </View>
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
              onPress={handleBioToggle}
              hitSlop={HIT_SLOP.medium}
              style={styles.seeMoreBtn}
            >
              <Text style={styles.seeMoreText}>
                {bioExpanded ? 'See less' : 'See more'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Action Buttons — only render when profile data loaded (avoids fan button flash on device) */}
      {(isOwnProfile || (!effectiveIsFan && !!profileData) || profile.accountType === 'pro_creator') && (
        <View style={styles.actionButtonsContainer}>
          {/* Row 1: Become a fan / Requested (hidden when already fan) — or Edit Profile if own */}
          {isOwnProfile ? (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={styles.editProfileButton}
                onPress={handleEditProfile}
              >
                <Ionicons name="pencil-outline" size={18} color={colors.dark} />
                <Text style={styles.editProfileText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>
          ) : !effectiveIsFan && !!profileData ? (
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.fanButton,
                  isRequested && styles.fanButtonRequested
                ]}
                onPress={handleFanPress}
                disabled={isLoadingFollow}
              >
                {isLoadingFollow ? (
                  <ActivityIndicator size="small" color={isRequested ? '#8E8E93' : '#0EBF8A'} />
                ) : (
                  <Text style={[
                    styles.fanButtonText,
                    isRequested && styles.fanButtonTextRequested
                  ]}>
                    {isRequested ? 'Requested' : 'Become a fan'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Row 2: Monetization buttons (pro_creator only, not own profile) */}
          {!isOwnProfile && profile.accountType === 'pro_creator' && (FEATURES.CHANNEL_SUBSCRIBE || FEATURES.PRIVATE_SESSIONS || FEATURES.TIPPING) && (
            <View style={styles.actionButtonsRow}>
              {FEATURES.CHANNEL_SUBSCRIBE && (
                <LiquidButton
                  label="Subscribe"
                  onPress={handleShowSubscribeModal}
                  size="sm"
                  variant="outline"
                  style={styles.flex1}
                  icon={<Ionicons name="star" size={14} color="#E74C3C" />}
                  iconPosition="left"
                  colorScheme="green"
                  textStyle={styles.subscribeTextStyle}
                />
              )}

              {FEATURES.PRIVATE_SESSIONS && (
                <LiquidButton
                  label="Book 1:1"
                  onPress={handleBookSession}
                  size="sm"
                  variant="outline"
                  style={styles.flex1}
                  icon={<Ionicons name="videocam" size={14} color="#3B82F6" />}
                  iconPosition="left"
                  colorScheme="green"
                  textStyle={styles.bookSessionTextStyle}
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

          {/* Row 3: Offerings button (pro_creator only, not own profile) */}
          {!isOwnProfile && profile.accountType === 'pro_creator' && (FEATURES.PRIVATE_SESSIONS || FEATURES.CHANNEL_SUBSCRIBE) && (
            <View style={styles.actionButtonsRow}>
              <LiquidButton
                label="View Offerings"
                onPress={handleViewOfferings}
                size="sm"
                variant="outline"
                style={styles.flex1}
                icon={<Ionicons name="pricetag" size={14} color="#0EBF8A" />}
                iconPosition="left"
                colorScheme="green"
              />
            </View>
          )}
        </View>
      )}

      {/* Pro Creator Live Section (not own profile) */}
      {!isOwnProfile && FEATURES.VIEWER_LIVE_STREAM && profile.accountType === 'pro_creator' && (
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
                  onPress={handleJoinLive}
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

      {/* Back Button - Fixed on top */}
      <TouchableOpacity
        style={[styles.backBtnFixed, fixedBtnTopStyle]}
        onPress={handleGoBack}
      >
        <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Menu Button - Fixed on top */}
      {!isOwnProfile && (
        <TouchableOpacity
          style={[styles.menuBtnFixed, fixedBtnTopStyle]}
          onPress={handleShowMenuModal}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Fully Scrollable Profile - Header, Tabs, and Content all scroll together */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        stickyHeaderIndices={[1]}
      >
        {/* Scrollable Header */}
        {renderHeader()}

        {/* Sticky Tabs */}
        {renderTabs()}

        {/* Tab Content */}
        {renderTabContent()}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Modal Unfan Confirmation */}
      <Modal
        visible={showUnfanModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseUnfanModal}
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
                onPress={handleCloseUnfanModal}
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
        onRequestClose={handleCloseBlockedModal}
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
              onPress={handleCloseBlockedModal}
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
        onRequestClose={handleCloseCancelRequestModal}
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
                onPress={handleCloseCancelRequestModal}
              >
                <Text style={styles.modalBtnCancelText}>Keep</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnConfirmDanger}
                onPress={handleCancelRequest}
              >
                <Text style={styles.modalBtnConfirmText}>Cancel Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal Fan Required (to comment) */}
      <Modal
        visible={showFanRequiredModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseFanRequiredModal}
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
                onPress={handleCloseFanRequiredModal}
              >
                <Text style={styles.modalBtnCancelText}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnConfirm}
                onPress={handleFanRequiredConfirm}
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
        onRequestClose={handleCloseMenuModal}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleCloseMenuModal}
        >
          <View style={styles.menuContent}>
            <View style={styles.menuHandle} />

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleMenuShareProfile}
            >
              <Ionicons name="share-outline" size={22} color={colors.dark} />
              <Text style={styles.menuItemText}>Share Profile</Text>
            </TouchableOpacity>

            {effectiveIsFan && (
              <TouchableOpacity
                style={styles.menuItem}
                onPress={handleMenuUnfan}
              >
                <Ionicons name="heart-dislike-outline" size={22} color={colors.dark} />
                <Text style={styles.menuItemText}>Unfan</Text>
              </TouchableOpacity>
            )}

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
              onPress={handleCloseMenuModal}
            >
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Subscribe Channel Modal */}
      <SubscribeChannelModal
        visible={showSubscribeModal}
        onClose={handleCloseSubscribeModal}
        creatorName={profile.displayName}
        creatorAvatar={profile.avatar || ''}
        creatorUsername={profile.username}
        onSubscribe={handleSubscribe}
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
  backBtnFixed: {
    position: 'absolute',
    left: 16,
    padding: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 10,
  },
  menuBtnFixed: {
    position: 'absolute',
    right: 16,
    padding: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 10,
  },

  // ===== AVATAR ROW =====
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 15,
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
    marginTop: 2,
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
  fanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
    backgroundColor: 'rgba(14, 191, 138, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
    flexShrink: 0,
  },
  fanBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0EBF8A',
  },
  nameActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  editProfileButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  editProfileText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
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
    paddingHorizontal: 16,
    paddingVertical: 2,
    paddingTop: 4,
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
  bottomSpacer: {
    height: 120,
  },

  // ===== POSTS GRID =====
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    columnGap: 12,
    rowGap: 12,
    alignItems: 'flex-start',
  },
  postCardWrapper: {
    // width is set dynamically via flexBasis/maxWidth inline styles
  },
  postCard: {
    width: '100%',
    height: '100%',
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

  // Extracted inline styles
  errorStateContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 24,
  },
  errorBioText: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: colors.dark,
    lineHeight: 18,
    textAlign: 'center' as const,
    marginTop: 8,
  },
  errorGoBackButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 16,
    width: '60%',
  },
  emptyIconMargin: {
    marginBottom: 16,
  },
  flex1: {
    flex: 1,
  },
  subscribeTextStyle: {
    color: '#E74C3C',
  },
  bookSessionTextStyle: {
    color: '#3B82F6',
  },
  modalBtnConfirmDanger: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center' as const,
  },
});

export default UserProfileScreen;
