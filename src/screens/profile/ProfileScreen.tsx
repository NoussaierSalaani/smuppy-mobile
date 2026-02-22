import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Modal,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  InteractionManager,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
// FlashList import removed - not used
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { resolveDisplayName } from '../../types/profile';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useUserStore } from '../../stores/userStore';
import { useFeedStore } from '../../stores/feedStore';
import { useCurrentProfile, useUserPosts, useSavedPosts, useProfile, useIsFollowing } from '../../hooks/queries';
import { useProfileEventsGroups } from '../../hooks/useProfileEventsGroups';
import EventGroupCard from '../../components/EventGroupCard';
import { ProfileDataSource, UserProfile, INITIAL_USER_PROFILE, resolveProfile } from '../../types/profile';

import { AccountBadge, PremiumBadge } from '../../components/Badge';
import { FEATURES } from '../../config/featureFlags';
import SmuppyActionSheet from '../../components/SmuppyActionSheet';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { unsavePost, updateProfile as updateDbProfile } from '../../services/database';
import { uploadProfileImage } from '../../services/imageUpload';
import { uploadCoverImage } from '../../services/mediaUpload';
import { LiquidTabsWithMore } from '../../components/LiquidTabs';
import RippleVisualization from '../../components/RippleVisualization';
import GradeFrame from '../../components/GradeFrame';
import { getGrade } from '../../utils/gradeSystem';
import { useVibeStore } from '../../stores/vibeStore';
import { createProfileStyles, AVATAR_SIZE } from './ProfileScreen.styles';
import { useTheme } from '../../hooks/useTheme';
import { getMasonryHeight } from '../../utils/postTransformers';
import { sanitizeOptionalText } from '../../utils/sanitize';
import { HIT_SLOP } from '../../config/theme';
import { ProfileSkeleton } from '../../components/skeleton';
import { awsAPI, type Peak as APIPeak } from '../../services/aws-api';
import { ACCOUNT_TYPE } from '../../config/accountTypes';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Business program types (matching aws-api camelCase response) */
interface BusinessActivity {
  id: string;
  name: string;
  description?: string;
  category?: string;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  maxCapacity?: number;
}

interface BusinessScheduleSlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  activityId?: string;
  maxCapacity?: number;
  activityName?: string;
  color?: string;
}

const PLANNING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Memoized wrapper to prevent inline arrow functions from defeating EventGroupCard memo */
type MemoizedEventGroupCardProps = Readonly<{
  type: 'event' | 'group';
  id: string;
  title: string;
  location: string;
  coverImage?: string;
  startDate?: string;
  participantCount: number;
  maxParticipants?: number;
  isOwner: boolean;
  onCardPress: (type: 'event' | 'group', id: string) => void;
  onCardMenuPress: (type: 'event' | 'group', id: string) => void;
}>;


const MemoizedEventGroupCard = React.memo(({
  type,
  id,
  title,
  location,
  coverImage,
  startDate,
  participantCount,
  maxParticipants,
  isOwner,
  onCardPress,
  onCardMenuPress,
}: MemoizedEventGroupCardProps) => {
  const handlePress = useCallback(() => {
    onCardPress(type, id);
  }, [onCardPress, type, id]);

  const handleMenuPress = useCallback(() => {
    onCardMenuPress(type, id);
  }, [onCardMenuPress, type, id]);

  return (
    <EventGroupCard
      type={type}
      id={id}
      title={title}
      location={location}
      coverImage={coverImage}
      startDate={startDate}
      participantCount={participantCount}
      maxParticipants={maxParticipants}
      isOwner={isOwner}
      onPress={handlePress}
      onMenuPress={handleMenuPress}
    />
  );
});
const BIO_MAX_LINES = 2;

const BIO_EXPANDED_MAX_LINES = 6;
const PEAK_PLACEHOLDER = 'https://dummyimage.com/600x800/0b0b0b/ffffff&text=Peak';


type ProfileScreenProps = Readonly<{
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
  };
  route: { params?: { userId?: string } };
}>;


const ProfileScreen = ({ navigation, route }: ProfileScreenProps) => {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useSmuppyAlert();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createProfileStyles(colors, isDark), [colors, isDark]);
  const storeUser = useUserStore((state) => state.user);
  const updateStoreProfile = useUserStore((state) => state.updateProfile);
  const routeUserId = route?.params?.userId || null;
  const currentUserId = storeUser?.id || null;

  // Fetch profile data: route user if provided, otherwise current user
  const { data: currentProfileData, isLoading: isCurrentProfileLoading, refetch: refetchCurrentProfile } = useCurrentProfile();
  const { data: otherProfileData, isLoading: isOtherProfileLoading, refetch: refetchOtherProfile } = useProfile(routeUserId);

  const profileData = routeUserId ? otherProfileData : currentProfileData;
  const isProfileLoading = routeUserId ? isOtherProfileLoading : isCurrentProfileLoading;
  const refetchProfile = routeUserId ? refetchOtherProfile : refetchCurrentProfile;
  const [activeTab, setActiveTab] = useState('posts');
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  // User state
  const [user, setUser] = useState<UserProfile>(INITIAL_USER_PROFILE);

  // Determine which user's data to show
  const viewedUserId = routeUserId || profileData?.id || currentUserId || null;
  const isOwnProfile = !routeUserId || routeUserId === currentUserId;

  // Get user's posts from database
  const userId = viewedUserId;
  const {
    data: userPostsData,
    refetch: refetchPosts,
  } = useUserPosts(userId);

  // Separate posts and peaks from the data
  const allUserPosts = useMemo(() => {
    if (!userPostsData?.pages) return [];
    return userPostsData.pages.flatMap(page => page.posts);
  }, [userPostsData]);

  // Filter: posts = not peaks, peaks = is_peak true
  // Use mock data if no real data
  const deletedPostIds = useFeedStore((s) => s.deletedPostIds);
  const deletedPeakIds = useFeedStore((s) => s.deletedPeakIds);

  const posts = useMemo(() => {
    const realPosts = allUserPosts.filter(post => !post.is_peak && !deletedPostIds[post.id]);
    return realPosts;
  }, [allUserPosts, deletedPostIds]);

  // Ref to avoid posts array in renderPostItem deps (prevents rebuild on every post change)
  const postsRef = useRef(posts);
  postsRef.current = posts;

  // Fallback peaks from posts table (if peaks API fails or filters incorrectly)
  const peaksFromPosts = useMemo(() => {
    const peaksOnly = allUserPosts.filter(post => post.is_peak);
    return peaksOnly.map(p => ({
      id: p.id,
      videoUrl: p.media_urls?.find(m => m?.endsWith('.mp4') || m?.includes('video')) || p.media_urls?.[0],
      media_urls: p.media_urls || [],
      media_type: p.media_type || 'video',
      is_peak: true,
      content: p.content || '',
      created_at: p.created_at,
      peak_duration: 15,
      likes_count: p.likes_count,
      comments_count: p.comments_count,
      views_count: p.views_count,
      author_id: p.author_id,
    }));
  }, [allUserPosts]);

  const peaksUserId = useMemo(() => {
    if (UUID_REGEX.test(routeUserId || '')) return routeUserId;
    if (UUID_REGEX.test(viewedUserId || '')) return viewedUserId;
    return viewedUserId;
  }, [routeUserId, viewedUserId]);

  interface ProfilePeak {
    id: string;
    videoUrl?: string;
    media_urls: string[];
    media_type: string;
    is_peak: boolean;
    content: string;
    created_at: string;
    peak_duration: number;
    likes_count?: number;
    is_liked?: boolean;
    comments_count?: number;
    views_count?: number;
    author_id: string | null;
  }
  const [peaks, setPeaks] = useState<ProfilePeak[]>([]);

  // Filter peaks by deletion tracking (same pattern as posts)
  const filteredPeaks = useMemo(() => {
    return peaks.filter(p => !deletedPeakIds[p.id]);
  }, [peaks, deletedPeakIds]);

  // Check if the VIEWED profile is business (not the logged-in user)
  const viewedAccountType = profileData?.account_type || (isOwnProfile ? storeUser?.accountType : null);
  const isViewedBusiness = viewedAccountType === ACCOUNT_TYPE.PRO_BUSINESS;

  useEffect(() => {
    if (!userId) return;
    // Pro business accounts don't have peaks — skip fetch only if VIEWED profile is business
    if (isViewedBusiness) return;
    let isMounted = true;
    const task = InteractionManager.runAfterInteractions(() => {
    const toCdn = (url?: string | null) => {
      if (!url) return null;
      return url.startsWith('http') ? url : awsAPI.getCDNUrl(url);
    };
    const mapPeaks = (list: APIPeak[]) => (list || []).map((p: APIPeak) => ({
      id: p.id,
      videoUrl: toCdn(p.videoUrl) || undefined,
      media_urls: [toCdn(p.thumbnailUrl) || toCdn(p.author?.avatarUrl) || PEAK_PLACEHOLDER],
      media_type: p.videoUrl ? 'video' : 'image',
      is_peak: true,
      content: p.caption || '',
      created_at: p.createdAt || new Date().toISOString(),
      peak_duration: p.duration || 15,
      likes_count: p.likesCount,
      is_liked: !!p.isLiked,
      comments_count: p.commentsCount,
      views_count: p.viewsCount,
      author_id: p.authorId || p.author?.id || null,
    }));

    const targetUserId = peaksUserId || userId;
    
    if (__DEV__) {
      console.log('[ProfileScreen] Fetching peaks for user:', targetUserId);
    }
    
    awsAPI.getPeaks({ userId: targetUserId, limit: 50 }).then((res) => {
      if (!isMounted) return;
      
      if (__DEV__) {
        console.log('[ProfileScreen] Peaks API response:', { 
          count: res.data?.length || 0,
          targetUserId 
        });
      }
      
      let list = mapPeaks(res.data || []);

      // STRICT: Only show peaks belonging to this user — never show other users' peaks
      if (targetUserId) {
        list = list.filter(p => p.author_id === targetUserId);
      }

      setPeaks(list);
    }).catch((err) => {
      if (__DEV__) console.warn('[Profile] Peaks fetch failed:', err);
    });

    }); // end runAfterInteractions
    return () => { isMounted = false; task.cancel(); };
  }, [userId, peaksUserId, isViewedBusiness]);

  // Get saved posts (collections) - only for own profile
  const {
    data: savedPostsData,
    refetch: refetchSavedPosts,
    fetchNextPage: fetchNextCollectionsPage,
    hasNextPage: hasNextCollectionsPage,
    isFetchingNextPage: isFetchingNextCollectionsPage,
  } = useSavedPosts();

  const collections = useMemo(() => {
    if (!savedPostsData?.pages) return [];
    const realCollections = savedPostsData.pages.flatMap(page => page.posts);
    return realCollections;
  }, [savedPostsData]);

  // Events & Groups
  const { events, groups, isLoading: isEventsGroupsLoading, refresh: refreshEventsGroups } = useProfileEventsGroups();

  // Follow/subscription status for video visibility filtering
  const { data: isFollowing } = useIsFollowing(isOwnProfile ? null : viewedUserId);
  const [isSubscribed, setIsSubscribed] = useState(false);
  useEffect(() => {
    if (isOwnProfile || !viewedUserId) return;
    awsAPI.getChannelSubscriptionStatus(viewedUserId)
      .then(res => { if (res.success) setIsSubscribed(res.isSubscribed); })
      .catch(() => {});
  }, [isOwnProfile, viewedUserId]);

  // Business program data (for pro_business)
  const [businessActivities, setBusinessActivities] = useState<BusinessActivity[]>([]);
  const [businessSchedule, setBusinessSchedule] = useState<BusinessScheduleSlot[]>([]);
  const [isLoadingPlanning, setIsLoadingPlanning] = useState(false);

  const loadBusinessProgram = useCallback(async () => {
    if (storeUser?.accountType !== 'pro_business' || !isOwnProfile) return;
    setIsLoadingPlanning(true);
    try {
      const res = await awsAPI.getMyBusinessProgram();
      if (res.success) {
        const activities = (res.activities || []).map(a => ({
          id: a.id,
          name: a.name,
          description: a.description,
          category: a.category,
          dayOfWeek: a.dayOfWeek,
          startTime: a.startTime,
          endTime: a.endTime,
          maxCapacity: a.maxCapacity,
        }));
        setBusinessActivities(activities);
        setBusinessSchedule((res.schedule || []).map(s => ({
          id: s.id,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          endTime: s.endTime,
          activityId: s.activityId,
          maxCapacity: s.maxCapacity,
          // Enrich with activity name/color from activities list
          activityName: activities.find(a => a.id === s.activityId)?.name,
          color: undefined,
        })));
      } else {
        setBusinessActivities([]);
        setBusinessSchedule([]);
      }
    } catch {
      // Expected: planning data fetch may fail — UI shows empty state gracefully
    } finally {
      setIsLoadingPlanning(false);
    }
  }, [isOwnProfile, storeUser?.accountType]);

  useEffect(() => {
    loadBusinessProgram();
  }, [loadBusinessProgram]);

  const activitiesCount = businessActivities.length;

  // Check if user has peaks (for avatar border indicator) — for pro_business, use activities instead
  const hasPeaks = isViewedBusiness ? businessActivities.length > 0 : (filteredPeaks.length > 0 || peaksFromPosts.length > 0);

  // Grade system — decorative frame for 1M+ fans
  const gradeInfo = useMemo(() => getGrade(user.stats.fans), [user.stats.fans]);

  // Vibe score
  const vibeScore = useVibeStore((s) => s.vibeScore);

  // Modal states
  const [showQRModal, setShowQRModal] = useState(false);
  const [showImageSheet, setShowImageSheet] = useState(false);
  const [imageSheetType, setImageSheetType] = useState<'avatar' | 'cover'>('avatar');
  const [collectionMenuVisible, setCollectionMenuVisible] = useState(false);
  const [selectedCollectionPost, setSelectedCollectionPost] = useState<{ id: string } | null>(null);
  const [menuItem, setMenuItem] = useState<{ type: 'event' | 'group'; id: string } | null>(null);

  // Use shared resolveProfile utility
  const resolvedProfile = useMemo(() =>
    resolveProfile(profileData as ProfileDataSource, storeUser as ProfileDataSource),
    [profileData, storeUser]
  );
  const displayProfile = useMemo(() => resolvedProfile || user, [resolvedProfile, user]);

  useEffect(() => {
    if (!resolvedProfile) return;
    setUser(prev => ({
      ...prev,
      ...resolvedProfile,
      stats: resolvedProfile.stats,
    }));
  }, [resolvedProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchProfile?.(),
        userId ? refetchPosts() : Promise.resolve(),
        isOwnProfile ? refetchSavedPosts() : Promise.resolve(),
        refreshEventsGroups(),
        loadBusinessProgram(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfile, refetchPosts, refetchSavedPosts, refreshEventsGroups, userId, isOwnProfile, loadBusinessProgram]);

  // ==================== IMAGE PICKER ====================
  const showImageOptions = useCallback((type: 'avatar' | 'cover') => {
    setImageSheetType(type);
    setShowImageSheet(true);
  }, []);

  const updateImage = useCallback(async (type: 'avatar' | 'cover', uri: string | null) => {
    const key = type === 'avatar' ? 'avatar' : 'coverImage';

    // Capture previous value via setter, then apply optimistic update
    let prevValue: string | null = null;
    setUser(prev => {
      prevValue = type === 'avatar' ? prev.avatar : prev.coverImage;
      return { ...prev, [key]: uri };
    });

    if (!uri || uri.startsWith('http')) return;

    const currentUserId = profileData?.id || storeUser?.id;
    if (!currentUserId) return;

    try {
      if (type === 'avatar') {
        const { url, error } = await uploadProfileImage(uri, currentUserId);
        if (error || !url) {
          setUser(prev => ({ ...prev, avatar: prevValue }));
          showError('Upload Failed', 'Could not upload avatar');
          return;
        }
        await updateDbProfile({ avatar_url: url });
        updateStoreProfile({ avatar: url });
        setUser(prev => ({ ...prev, avatar: url }));
      } else {
        const result = await uploadCoverImage(currentUserId, uri);
        if (!result.success || !result.cdnUrl) {
          setUser(prev => ({ ...prev, coverImage: prevValue }));
          showError('Upload Failed', 'Could not upload cover image');
          return;
        }
        const coverUrl = `${result.cdnUrl}?t=${Date.now()}`;
        await updateDbProfile({ cover_url: coverUrl });
        updateStoreProfile({ coverImage: coverUrl });
        setUser(prev => ({ ...prev, coverImage: coverUrl }));
      }
      refetchProfile();
    } catch {
      setUser(prev => ({ ...prev, [key]: prevValue }));
      showError('Upload Failed', 'Something went wrong');
    }
  }, [profileData?.id, storeUser?.id, showError, refetchProfile, updateStoreProfile]);

  const handleTakePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showError('Permission needed', 'Camera access is required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: imageSheetType === 'avatar' ? [1, 1] : [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) {
      updateImage(imageSheetType, result.assets[0].uri);
    }
  }, [imageSheetType, showError, updateImage]);

  const handleChooseLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError('Permission needed', 'Photo library access is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: imageSheetType === 'avatar' ? [1, 1] : [16, 9],
      quality: 0.8,
    });
    if (!result.canceled) {
      updateImage(imageSheetType, result.assets[0].uri);
    }
  }, [imageSheetType, showError, updateImage]);

  const handleRemovePhoto = useCallback(async () => {
    setUser(prev => ({
      ...prev,
      [imageSheetType === 'avatar' ? 'avatar' : 'coverImage']: null,
    }));
    try {
      if (imageSheetType === 'avatar') {
        await updateDbProfile({ avatar_url: '' });
        updateStoreProfile({ avatar: null });
      } else {
        await updateDbProfile({ cover_url: '' });
        updateStoreProfile({ coverImage: null });
      }
      refetchProfile();
    } catch {
      showError('Error', 'Failed to remove photo');
    }
  }, [imageSheetType, refetchProfile, showError, updateStoreProfile]);

  const getImageSheetOptions = useCallback(() => {
    const hasExisting = imageSheetType === 'avatar' ? !!user.avatar : !!user.coverImage;
    const options: Array<{ label: string; icon: string; onPress: () => Promise<void>; destructive?: boolean }> = [
      {
        label: 'Take Photo',
        icon: 'camera-outline',
        onPress: handleTakePhoto,
      },
      {
        label: 'Choose from Library',
        icon: 'images-outline',
        onPress: handleChooseLibrary,
      },
    ];

    if (hasExisting) {
      options.push({
        label: 'Remove Photo',
        icon: 'trash-outline',
        onPress: handleRemovePhoto,
        destructive: true,
      });
    }

    return options;
  }, [imageSheetType, user.avatar, user.coverImage, handleTakePhoto, handleChooseLibrary, handleRemovePhoto]);

  // --- Extracted inline handlers ---
  const handleShowQRModal = useCallback(() => setShowQRModal(true), []);
  const handleCloseQRModal = useCallback(() => setShowQRModal(false), []);
  const handleBioToggle = useCallback(() => setBioExpanded(prev => !prev), []);
  const handleCloseMoreTabs = useCallback(() => setShowMoreTabs(false), []);
  const handleCloseImageSheet = useCallback(() => setShowImageSheet(false), []);
  const handleCloseMenuItem = useCallback(() => setMenuItem(null), []);
  const handleCloseCollectionMenu = useCallback(() => setCollectionMenuVisible(false), []);
  const handleNavigateSettings = useCallback(() => navigation.navigate('Settings'), [navigation]);
  const handleNavigateMessages = useCallback(() => navigation.navigate('Messages'), [navigation]);
  const handleNavigateEditProfile = useCallback(() => navigation.navigate('EditProfile'), [navigation]);
  const handleNavigatePrescriptions = useCallback(() => navigation.navigate('Prescriptions'), [navigation]);
  const handleNavigateCreatePost = useCallback(() => navigation.navigate('CreatePost', { fromProfile: true }), [navigation]);
  const handleNavigateCreatePeak = useCallback(() => navigation.navigate('CreatePeak'), [navigation]);
  const handleNavigateBusinessProgram = useCallback(() => navigation.navigate('BusinessProgram'), [navigation]);
  const handleNavigateGoLive = useCallback(() => navigation.navigate('GoLive'), [navigation]);
  const handleCoverPress = useCallback(() => { if (isOwnProfile) showImageOptions('cover'); }, [isOwnProfile, showImageOptions]);
  const handleAvatarPress = useCallback(() => { if (isOwnProfile) showImageOptions('avatar'); }, [isOwnProfile, showImageOptions]);

  // Dynamic style for settings button position
  const settingsBtnFixedStyle = useMemo(() => ({ top: insets.top + 8 }), [insets.top]);

  // ==================== COPY PROFILE LINK ====================
  const getProfileUrl = useCallback(() => {
    const username = user.username || user.displayName.toLowerCase().replaceAll(/\s+/g, '');
    return `https://smuppy.app/u/${username}`;
  }, [user.username, user.displayName]);

  const handleCopyLink = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(getProfileUrl());
      showSuccess('Copied!', 'Profile link copied to clipboard');
    } catch (_error) {
      showError('Error', 'Failed to copy link');
    }
  }, [getProfileUrl, showSuccess, showError]);

  // ==================== FANS ====================
  const handleFansPress = useCallback(() => {
    navigation.navigate('FansList', { fansCount: user.stats.fans });
  }, [navigation, user.stats.fans]);

  // Collection menu handlers
  const handleCollectionMenu = useCallback((post: { id: string }, e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setSelectedCollectionPost(post);
    setCollectionMenuVisible(true);
  }, []);

  const handleRemoveFromCollection = useCallback(async () => {
    if (!selectedCollectionPost) return;
    // UUID validation per CLAUDE.md
    if (!UUID_REGEX.test(selectedCollectionPost.id)) {
      if (__DEV__) console.warn('[ProfileScreen] Invalid collection post ID');
      return;
    }

    setCollectionMenuVisible(false);

    const { error } = await unsavePost(selectedCollectionPost.id);
    if (error) {
      showError('Error', 'Failed to remove from collection');
    } else {
      refetchSavedPosts();
    }
    setSelectedCollectionPost(null);
  }, [selectedCollectionPost, showError, refetchSavedPosts]);

  // ==================== RENDER AVATAR ====================
  const renderAvatarContent = useCallback(() => {
    const avatarInner = (
      <RippleVisualization size={AVATAR_SIZE}>
        {hasPeaks ? (
          <LinearGradient
            colors={['#0EBF8A', '#00B5C1', '#0081BE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarGradientBorder}
          >
            <View style={styles.avatarInnerBorder}>
              {user.avatar ? (
                <AvatarImage source={user.avatar} size={AVATAR_SIZE - 8} style={styles.avatarWithPeaks} />
              ) : (
                <View style={styles.avatarEmptyWithPeaks}>
                  <Ionicons name="person" size={32} color={colors.gray400} />
                </View>
              )}
            </View>
          </LinearGradient>
        ) : (
          user.avatar ? (
            <AvatarImage source={user.avatar} size={AVATAR_SIZE} style={styles.avatar} />
          ) : (
            <View style={styles.avatarEmpty}>
              <Ionicons name="person" size={36} color={colors.gray400} />
            </View>
          )
        )}
      </RippleVisualization>
    );

    if (gradeInfo) {
      return (
        <GradeFrame grade={gradeInfo.grade} color={gradeInfo.color} size={AVATAR_SIZE}>
          {avatarInner}
        </GradeFrame>
      );
    }

    return avatarInner;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPeaks, user.avatar, gradeInfo]);

  // ==================== RENDER HEADER ====================
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Cover Image - extends behind content */}
      <View style={styles.coverAbsolute}>
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={handleCoverPress}
          style={styles.coverTouchable}
          accessibilityLabel={isOwnProfile ? "Change cover photo" : "Cover photo"}
          accessibilityRole={isOwnProfile ? "button" : "image"}
          accessibilityHint={isOwnProfile ? "Opens options to change your cover photo" : undefined}
        >
          {user.coverImage ? (
            <OptimizedImage source={user.coverImage} style={styles.coverImage} />
          ) : (
            <View style={styles.coverPlaceholder} />
          )}
        </TouchableOpacity>

        {/* Gradient that fades the cover into white */}
        <LinearGradient
          colors={['transparent', 'transparent', isDark ? 'rgba(13,13,13,0.5)' : 'rgba(255,255,255,0.5)', isDark ? 'rgba(13,13,13,0.85)' : 'rgba(255,255,255,0.85)', colors.background]}
          locations={[0, 0.35, 0.55, 0.75, 1]}
          style={styles.coverGradientOverlay}
          pointerEvents="none"
        />
      </View>

      {/* Settings Button moved to fixed position outside ScrollView */}

      {/* Spacer for cover height */}
      <View style={styles.coverSpacer} />

      {/* Avatar & Stats Row */}
      <View style={styles.avatarRow}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleAvatarPress}
          accessibilityLabel={isOwnProfile ? "Change profile photo" : `${user.displayName}'s profile photo`}
          accessibilityRole={isOwnProfile ? "button" : "image"}
          accessibilityHint={isOwnProfile ? "Opens options to change your profile photo" : undefined}
        >
          {renderAvatarContent()}
        </TouchableOpacity>

        {/* Stats - Glassmorphism Style */}
        <View style={styles.statsGlass}>
          <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={styles.statsBlurContainer}>
            <TouchableOpacity
              style={styles.statGlassItem}
              onPress={handleFansPress}
              accessibilityLabel={`${user.stats.fans} fans`}
              accessibilityRole="button"
              accessibilityHint="View list of fans"
            >
              <Text style={styles.statGlassValue}>{user.stats.fans}</Text>
              <Text style={styles.statGlassLabel}>Fans</Text>
            </TouchableOpacity>
            <View style={styles.statGlassDivider} />
            <View style={styles.statGlassItem}>
              <Text style={styles.statGlassValue}>
                {user.accountType === ACCOUNT_TYPE.PRO_BUSINESS ? (activitiesCount || 0) : (user.stats.peaks || 0)}
              </Text>
              <Text style={styles.statGlassLabel}>
                {user.accountType === ACCOUNT_TYPE.PRO_BUSINESS ? 'Activities' : 'Peaks'}
              </Text>
            </View>
            {user.accountType !== 'pro_business' && (
              <>
                <View style={styles.statGlassDivider} />
                <TouchableOpacity
                  style={styles.statGlassItem}
                  onPress={handleNavigatePrescriptions}
                  accessibilityLabel={`Vibe score ${vibeScore}`}
                  accessibilityRole="button"
                  accessibilityHint="View your prescriptions and vibe details"
                >
                  <Text style={styles.statGlassValue}>{vibeScore}</Text>
                  <Text style={styles.statGlassLabel}>Vibe</Text>
                </TouchableOpacity>
              </>
            )}
          </BlurView>
        </View>
      </View>

      {/* Name & Actions */}
      <View style={styles.nameRow}>
        <View style={styles.nameWithBadges}>
          <Text style={styles.displayName}>{sanitizeOptionalText(user.displayName)}</Text>
          <AccountBadge
            size={18}
            style={styles.badge}
            isVerified={user.isVerified}
            accountType={user.accountType as 'personal' | 'pro_creator' | 'pro_business'}
            followerCount={user.stats?.fans ?? 0}
          />
          {user.isPremium && <PremiumBadge size={18} style={styles.badge} />}
        </View>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleNavigateMessages}
          accessibilityLabel="Messages"
          accessibilityRole="button"
          accessibilityHint="Open your messages"
        >
          <Ionicons name="chatbubble-outline" size={18} color={colors.gray900} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleShowQRModal}
          accessibilityLabel="Show QR code"
          accessibilityRole="button"
          accessibilityHint="Opens your profile QR code to share"
        >
          <Ionicons name="qr-code-outline" size={18} color={colors.gray900} />
        </TouchableOpacity>
      </View>

      {/* Bio Section */}
      {user.bio ? (
        <View style={styles.bioSection}>
          <Text
            style={styles.bioText}
            numberOfLines={bioExpanded ? BIO_EXPANDED_MAX_LINES : BIO_MAX_LINES}
          >
            {sanitizeOptionalText(user.bio)}
          </Text>
          {(user.bio.length > 80 || user.bio.split('\n').length > BIO_MAX_LINES) && (
            <TouchableOpacity
              onPress={handleBioToggle}
              hitSlop={HIT_SLOP.medium}
              style={styles.seeMoreBtn}
              accessibilityLabel={bioExpanded ? "Show less bio" : "Show more bio"}
              accessibilityRole="button"
              accessibilityState={{ expanded: bioExpanded }}
            >
              <Text style={styles.seeMoreText}>
                {bioExpanded ? 'See less' : 'See more'}
              </Text>
            </TouchableOpacity>
          )}
          {user.location ? (
            <View style={styles.locationRow}>
              <Text style={styles.locationPin}>📍</Text>
              <Text style={styles.locationText}>{sanitizeOptionalText(user.location)}</Text>
            </View>
          ) : null}
        </View>
      ) : isOwnProfile ? (
        <TouchableOpacity
          style={styles.addBioBtn}
          onPress={handleNavigateEditProfile}
          accessibilityLabel="Add Bio"
          accessibilityRole="button"
          accessibilityHint="Opens your profile editor to add a bio"
        >
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.addBioText}>Add Bio</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  // ==================== RENDER TABS ====================
  // Dynamic tabs based on account type
  const isProCreator = user?.accountType === ACCOUNT_TYPE.PRO_CREATOR || resolvedProfile?.accountType === ACCOUNT_TYPE.PRO_CREATOR;
  const isProBusiness = user?.accountType === ACCOUNT_TYPE.PRO_BUSINESS || resolvedProfile?.accountType === ACCOUNT_TYPE.PRO_BUSINESS;

  // Stable callback for LiquidTabsWithMore (memoized component)
  const handleMoreTabsPress = useCallback(() => {
    setShowMoreTabs(true);
  }, []);

  // Primary tabs (always visible) - max 3 to keep labels readable
  const PRIMARY_TABS = useMemo(() => {
    if (isProBusiness) {
      return [
        { key: 'posts', label: 'Posts', icon: 'grid-outline' },
        { key: 'planning', label: 'Planning', icon: 'calendar-outline' },
        { key: 'groupevent', label: 'Activities', icon: 'flash-outline' },
      ];
    }
    return [
      { key: 'posts', label: 'Posts', icon: 'grid-outline' },
      { key: 'peaks', label: 'Peaks', icon: 'flash-outline' },
      { key: 'groupevent', label: 'Activities', icon: 'flash-outline' },
    ];
  }, [isProBusiness]) as { key: string; label: string; icon: string }[];

  // Extra tabs (shown in "•••" menu)
  const EXTRA_TABS = useMemo(() => {
    const tabs: { key: string; label: string; icon: string }[] = [];

    if (isOwnProfile) {
      tabs.push({ key: 'collections', label: 'Saved', icon: 'bookmark-outline' });
    }

    if (isProCreator) {
      tabs.push({ key: 'videos', label: 'Videos', icon: 'videocam-outline' });
      if (isOwnProfile) {
        if (FEATURES.PRIVATE_SESSIONS) tabs.push({ key: 'sessions', label: 'Sessions', icon: 'calendar-outline' });
        if (FEATURES.GO_LIVE) tabs.push({ key: 'lives', label: 'Lives', icon: 'radio-outline' });
      } else if (FEATURES.GO_LIVE) {
        tabs.push({ key: 'lives', label: 'Lives', icon: 'radio-outline' });
      }
    }

    return tabs;
  }, [isProCreator, isOwnProfile]) as { key: string; label: string; icon: string }[];

  const renderTabs = () => {
    return (
      <View style={styles.tabsContainer}>
        {/* Liquid Glass Tabs with More button */}
        <LiquidTabsWithMore
          tabs={PRIMARY_TABS}
          extraTabs={EXTRA_TABS}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onMorePress={handleMoreTabsPress}
          size="medium"
          style={styles.liquidProfileTabs}
        />

        {/* Extra Tabs Modal */}
        <Modal
          visible={showMoreTabs}
          transparent
          animationType="fade"
          onRequestClose={handleCloseMoreTabs}
        >
          <TouchableOpacity
            style={styles.moreTabsOverlay}
            activeOpacity={1}
            onPress={handleCloseMoreTabs}
          >
            <View style={styles.moreTabsContainer}>
              <Text style={styles.moreTabsTitle}>More</Text>
              {EXTRA_TABS.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.moreTabsItem,
                    activeTab === tab.key && styles.moreTabsItemActive,
                  ]}
                  onPress={() => {
                    setActiveTab(tab.key);
                    setShowMoreTabs(false);
                  }}
                  accessibilityLabel={tab.label}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activeTab === tab.key }}
                >
                  <Ionicons
                    name={tab.icon as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={activeTab === tab.key ? colors.primary : colors.gray500}
                  />
                  <Text
                    style={[
                      styles.moreTabsItemText,
                      activeTab === tab.key && styles.moreTabsItemTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {activeTab === tab.key && (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  };

  // ==================== RENDER EMPTY STATE ====================
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="images-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
      <Text style={styles.emptyTitle}>No posts yet</Text>
      <Text style={styles.emptyDesc}>
        You're one click away from your{'\n'}first post
      </Text>
      {isOwnProfile && (
        <TouchableOpacity
          style={styles.createBtn}
          onPress={handleNavigateCreatePost}
          accessibilityLabel="Create a post"
          accessibilityRole="button"
          accessibilityHint="Opens the post creator"
        >
          <Text style={styles.createBtnText}>Create a post</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );

  // Transform posts array for detail screen
  const transformPostsForDetail = useCallback((allPosts: typeof posts) => {
    return allPosts.map(p => {
      const allMedia = p.media_urls?.filter(Boolean) || [];
      return {
        id: p.id,
        type: (() => {
          if (p.media_type === 'video') return 'video' as const;
          return allMedia.length > 1 ? 'carousel' as const : 'image' as const;
        })(),
        media: allMedia[0] || '',
        thumbnail: allMedia[0] || '',
        description: p.content || '',
        likes: p.likes_count || 0,
        views: p.views_count || 0,
        location: p.location || null,
        taggedUsers: p.tagged_users || [],
        allMedia: allMedia.length > 1 ? allMedia : undefined,
        user: {
          id: user.id || '',
          name: user.displayName || '',
          avatar: user.avatar || '',
        },
      };
    });
  }, [user.id, user.displayName, user.avatar]);

  // ==================== RENDER POST ITEM (Simple grid style) ====================
  const renderPostItem = useCallback(({ item: post }: { item: { id: string; media_urls?: string[]; media_type?: string; likes_count?: number } }) => {
    const thumbnail = post.media_urls?.[0] || null;
    const isVideo = post.media_type === 'video';

    return (
      <TouchableOpacity
        style={styles.postCard}
        onPress={() => navigation.navigate('PostDetailProfile', {
          postId: post.id,
          profilePosts: transformPostsForDetail(postsRef.current) as unknown,
        })}
        accessibilityLabel={`Post with ${post.likes_count || 0} likes`}
        accessibilityRole="button"
        accessibilityHint="Opens the post details"
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.postThumb} />
        ) : (
          <View style={[styles.postThumb, styles.postThumbEmpty]}>
            <Ionicons name="image-outline" size={24} color={colors.gray400} />
          </View>
        )}
        {isVideo && (
          <View style={styles.postPlayIcon}>
            <Ionicons name="play" size={12} color="#FFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, transformPostsForDetail]);

  // Memoized peak time groups — avoids recomputing on every render
  const displayPeaks = useMemo(() => filteredPeaks.length > 0 ? filteredPeaks : peaksFromPosts, [filteredPeaks, peaksFromPosts]);

  const peakTimeGroups = useMemo(() => {
    if (displayPeaks.length === 0) return [];
    const groupMap = new Map<string, { key: string; peaks: ProfilePeak[]; totalLikes: number; totalViews: number }>();
    for (const p of displayPeaks) {
      const dateKey = (p.created_at || '').slice(0, 10);
      if (!dateKey) continue;
      const existing = groupMap.get(dateKey);
      if (existing) {
        existing.peaks.push(p);
        existing.totalLikes += (p.likes_count || 0);
        existing.totalViews += (p.views_count || 0);
      } else {
        groupMap.set(dateKey, { key: dateKey, peaks: [p], totalLikes: p.likes_count || 0, totalViews: p.views_count || 0 });
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return Array.from(groupMap.values())
      .sort((a, b) => b.key.localeCompare(a.key))
      .map(g => ({
        ...g,
        label: (() => {
          if (g.key === today) return 'Today';
          if (g.key === yesterday) return 'Yesterday';
          return g.key.slice(5);
        })(),
        latestThumbnail: g.peaks[0]?.media_urls?.[0],
        peakCount: g.peaks.length,
      }));
  }, [displayPeaks]);

  // ==================== RENDER PEAKS ====================
  const renderPeaks = () => {
    if (displayPeaks.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No peaks yet</Text>
          <Text style={styles.emptyDesc}>
            Share your best moments as Peaks
          </Text>
          {isOwnProfile && !isViewedBusiness && (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleNavigateCreatePeak}
              accessibilityLabel="Create a Peak"
              accessibilityRole="button"
              accessibilityHint="Opens the peak video creator"
            >
              <Text style={styles.createBtnText}>Create a Peak</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // Show peaks grouped by day in 2-column layout
    return (
      <View style={styles.peakGroupsGrid}>
        {peakTimeGroups.map((group) => (
          <TouchableOpacity
            key={`peak-group-${group.key}`}
            style={styles.peakGroupCard}
            onPress={() => {
              const transformed = group.peaks.map(p => ({
                id: p.id,
                videoUrl: p.videoUrl,
                thumbnail: p.media_urls?.[0],
                duration: p.peak_duration || 15,
                user: {
                  id: displayProfile?.id ?? user?.id ?? '',
                  name: displayProfile?.displayName ?? user?.displayName ?? 'Unknown',
                  avatar: displayProfile?.avatar ?? user?.avatar ?? '',
                },
                views: p.views_count || 0,
                likes: p.likes_count || 0,
                repliesCount: p.comments_count || 0,
                isLiked: !!(p as { is_liked?: boolean }).is_liked,
                isOwnPeak: isOwnProfile,
                createdAt: p.created_at,
              }));
              navigation.navigate('PeakView', { peaks: transformed, initialIndex: 0 });
            }}
          >
            {group.latestThumbnail ? (
              <OptimizedImage source={group.latestThumbnail} style={styles.peakGroupThumb} />
            ) : (
              <View style={[styles.peakGroupThumb, styles.postThumbEmpty]}>
                <Ionicons name="videocam-outline" size={24} color={colors.gray} />
              </View>
            )}
            {group.peakCount > 1 && (
              <View style={styles.peakGroupCountBadge}>
                <Text style={styles.peakGroupCountText}>{group.peakCount}</Text>
              </View>
            )}
            <View style={styles.peakGroupOverlay}>
              <Text style={styles.peakGroupLabel}>{group.label}</Text>
              <View style={styles.peakGroupStats}>
                <SmuppyHeartIcon size={10} color="#FF6B6B" filled />
                <Text style={styles.peakGroupStatText}>{group.totalLikes}</Text>
                <Ionicons name="eye" size={10} color="#FFF" />
                <Text style={styles.peakGroupStatText}>{group.totalViews}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // ==================== RENDER PLANNING (pro_business) ====================
  const renderPlanning = () => {
    if (isLoadingPlanning) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }

    if (businessSchedule.length === 0 && businessActivities.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No planning yet</Text>
          <Text style={styles.emptyDesc}>Set up your business schedule and activities</Text>
          {isOwnProfile && (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={handleNavigateBusinessProgram}
              accessibilityLabel="Manage Planning"
              accessibilityRole="button"
            >
              <Text style={styles.createBtnText}>Manage Planning</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // Group schedule slots by day
    const scheduleByDay = PLANNING_DAYS.map((day, idx) => ({
      day,
      slots: businessSchedule
        .filter(s => s.dayOfWeek === idx)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    })).filter(d => d.slots.length > 0);

    return (
      <View style={styles.planningContainer}>
        {isOwnProfile && (
          <TouchableOpacity
            style={styles.planningEditBtn}
            onPress={handleNavigateBusinessProgram}
            accessibilityLabel="Edit Planning"
            accessibilityRole="button"
          >
            <Ionicons name="create-outline" size={16} color="#FFF" />
            <Text style={styles.planningEditBtnText}>Edit Planning</Text>
          </TouchableOpacity>
        )}
        {scheduleByDay.length > 0 ? (
          scheduleByDay.map(({ day, slots }) => (
            <View key={day}>
              <Text style={styles.planningDayHeader}>{day}</Text>
              {slots.map(slot => (
                <View key={slot.id} style={styles.planningSlotCard}>
                  <View style={[styles.planningSlotDot, { backgroundColor: slot.color || colors.primary }]} />
                  <View style={styles.planningSlotInfo}>
                    <Text style={styles.planningSlotName}>{slot.activityName || 'Activity'}</Text>
                    <Text style={styles.planningSlotTime}>{slot.startTime} – {slot.endTime}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        ) : (
          /* Activities exist but no schedule slots — show activities list */
          businessActivities.map(activity => (
            <View key={activity.id} style={styles.planningSlotCard}>
              <View style={[styles.planningSlotDot, { backgroundColor: colors.primary }]} />
              <View style={styles.planningSlotInfo}>
                <Text style={styles.planningSlotName}>{activity.name}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  // ==================== RENDER COLLECTION ITEM (Detailed card style) ====================
  const renderCollectionItem = useCallback((post: { id: string; media_urls?: string[]; media_type?: string; content?: string; created_at?: string; likes_count?: number; author?: { id?: string; username?: string; full_name?: string; avatar_url?: string }; user?: { id?: string; username?: string; full_name?: string; avatar_url?: string } }) => {
    const thumbnail = post.media_urls?.[0] || null;
    const isVideo = post.media_type === 'video';

    return (
      <TouchableOpacity
        key={post.id}
        style={styles.collectionCard}
        onPress={() => {
          const collectionForDetail = collections.map(p => {
            const allMedia = p.media_urls?.filter(Boolean) || [];
            const author = p.author ?? (p['user'] as typeof p.author) ?? undefined;
            return {
              id: p.id,
              type: (() => {
                if (p.media_type === 'video') return 'video' as const;
                return allMedia.length > 1 ? 'carousel' as const : 'image' as const;
              })(),
              media: allMedia[0] || '',
              thumbnail: allMedia[0] || '',
              description: p.content || '',
              likes: p.likes_count ?? 0,
              views: p.views_count ?? 0,
              location: p.location ?? null,
              taggedUsers: p.tagged_users ?? [],
              allMedia: allMedia.length > 1 ? allMedia : undefined,
              user: {
                id: author?.id ?? '',
                name: resolveDisplayName(author, author?.full_name ?? author?.username ?? ''),
                avatar: author?.avatar_url ?? '',
              },
            };
          });
          navigation.navigate('PostDetailProfile', {
            postId: post.id,
            profilePosts: collectionForDetail as unknown,
          });
        }}
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.collectionThumb} />
        ) : (
          <View style={[styles.collectionThumb, styles.postThumbEmpty]}>
            <Ionicons name="image-outline" size={32} color="#6E6E73" />
          </View>
        )}
        {isVideo && (
          <View style={styles.collectionPlayIcon}>
            <Ionicons name="play" size={10} color="#FFF" />
          </View>
        )}
        <View style={styles.collectionSaveIcon}>
          <Ionicons name="bookmark" size={12} color="#FFF" />
        </View>
        <TouchableOpacity
          style={styles.collectionMenu}
          onPress={(e) => handleCollectionMenu(post, e)}
          accessibilityLabel="Collection options"
          accessibilityRole="button"
          accessibilityHint="Opens options for this saved post"
        >
          <Ionicons name="ellipsis-vertical" size={14} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.collectionInfo}>
          <Text style={styles.collectionTitle} numberOfLines={2}>
            {post.content || 'Saved post'}
          </Text>
          {post.author && (
            <View style={styles.collectionMeta}>
              <AvatarImage source={post.author.avatar_url} size={18} />
              <Text style={styles.collectionAuthorName}>{resolveDisplayName(post.author)}</Text>
              <SmuppyHeartIcon size={12} color="#FF6B6B" filled />
              <Text style={styles.collectionLikes}>{post.likes_count || 0}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, collections, handleCollectionMenu]);

  // ==================== RENDER COLLECTIONS ====================
  const renderCollections = () => {
    if (!isOwnProfile) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>Private</Text>
          <Text style={styles.emptyDesc}>
            Collections are only visible to the account owner
          </Text>
        </View>
      );
    }

    if (collections.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="bookmark-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No collections yet</Text>
          <Text style={styles.emptyDesc}>
            Save posts to find them easily later
          </Text>
        </View>
      );
    }

    return (
      <View>
        <View style={styles.collectionsGrid}>
          {collections.map((post) => renderCollectionItem(post as typeof post & { author?: { id?: string; username?: string; full_name?: string; avatar_url?: string } }))}
        </View>
        {hasNextCollectionsPage && (
          <TouchableOpacity
            style={styles.loadMoreBtn}
            onPress={() => fetchNextCollectionsPage()}
            disabled={isFetchingNextCollectionsPage}
            accessibilityLabel="Load more saved posts"
            accessibilityRole="button"
          >
            {isFetchingNextCollectionsPage ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={styles.loadMoreBtnText}>Load more</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ==================== RENDER VIDEO ITEM ====================
  const renderVideoItem = useCallback((video: { id: string; thumbnail: string; title: string; duration: string; views: number; visibility: string; scheduledAt?: string }) => {
    const getVisibilityIcon = (): 'globe-outline' | 'lock-closed-outline' | 'eye-off-outline' | 'star-outline' | 'people-outline' => {
      switch (video.visibility) {
        case 'public': return 'globe-outline';
        case 'subscribers': return 'star-outline';
        case 'fans': return 'people-outline';
        case 'private': return 'lock-closed-outline';
        case 'hidden': return 'eye-off-outline';
        default: return 'globe-outline';
      }
    };
    const getVisibilityColor = () => {
      switch (video.visibility) {
        case 'public': return colors.primary;
        case 'subscribers': return '#FFD700'; // Gold for premium/subscribers
        case 'fans': return '#0081BE';
        case 'private': return '#8E8E93';
        case 'hidden': return '#8E8E93';
        default: return colors.primary;
      }
    };
    const getVisibilityLabel = () => {
      switch (video.visibility) {
        case 'public': return 'Public';
        case 'subscribers': return 'Subscribers Only';
        case 'fans': return 'Fans Only';
        case 'private': return 'Private';
        case 'hidden': return video.scheduledAt ? `Scheduled ${new Date(video.scheduledAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}` : 'Hidden';
        default: return 'Public';
      }
    };

    return (
      <TouchableOpacity
        key={video.id}
        style={styles.videoCard}
        onPress={() => navigation.navigate('PostDetailProfile', { postId: video.id })}
        activeOpacity={0.8}
      >
        <OptimizedImage
          source={video.thumbnail}
          style={styles.videoThumbnail}
        />
        <View style={styles.videoDurationBadge}>
          <Ionicons name="play" size={10} color="white" />
          <Text style={styles.videoDurationText}>{video.duration}</Text>
        </View>
        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
          <View style={styles.videoMeta}>
            <View style={[styles.videoVisibilityBadge, { backgroundColor: `${getVisibilityColor()}15` }]}>
              <Ionicons name={getVisibilityIcon()} size={12} color={getVisibilityColor()} />
              <Text style={[styles.videoVisibilityText, { color: getVisibilityColor() }]}>
                {getVisibilityLabel()}
              </Text>
            </View>
            {video.views > 0 && (
              <Text style={styles.videoViews}>{video.views.toLocaleString()} views</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // ==================== RENDER VIDEOS ====================
  const renderVideos = () => {
    // Filter videos based on visibility for non-owners
    const allVideos: { id: string; thumbnail: string; title: string; duration: string; views: number; visibility: string; scheduledAt?: string }[] = [];
    const visibleVideos = isOwnProfile
      ? allVideos
      : allVideos.filter(v => {
          if (v.visibility === 'public') return true;
          if (v.visibility === 'fans' && isFollowing) return true;
          if (v.visibility === 'subscribers' && isSubscribed) return true;
          return false;
        });

    if (visibleVideos.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="film-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No videos yet</Text>
          <Text style={styles.emptyDesc}>
            {isOwnProfile
              ? 'Upload pre-recorded content for your fans'
              : 'This creator hasn\'t shared any videos yet'}
          </Text>
          {isOwnProfile && (
            <TouchableOpacity style={styles.createBtn}>
              <Text style={styles.createBtnText}>Upload Video</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View>
        {isOwnProfile && (
          <TouchableOpacity style={styles.uploadVideoBtn}>
            <LinearGradient
              colors={['#0081BE', '#00B5C1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.uploadVideoBtnGradient}
            >
              <Ionicons name="cloud-upload-outline" size={20} color="#FFF" />
              <Text style={styles.uploadVideoBtnText}>Upload New Video</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
        <View style={styles.videosGrid}>
          {visibleVideos.map(renderVideoItem)}
        </View>
      </View>
    );
  };

  // ==================== RENDER LIVES ====================
  const renderLives = () => {
    if (!isOwnProfile) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No lives yet</Text>
          <Text style={styles.emptyDesc}>
            This creator hasn't shared any recorded lives yet
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="videocam-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
        <Text style={styles.emptyTitle}>No lives yet</Text>
        <Text style={styles.emptyDesc}>
          Go live to connect with your fans in real-time
        </Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={handleNavigateGoLive}
          accessibilityLabel="Go Live"
          accessibilityRole="button"
          accessibilityHint="Start a live video broadcast"
        >
          <Text style={styles.createBtnText}>Go Live</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>
    );
  };

  // ==================== RENDER SESSIONS ====================
  const renderSessions = () => {
    if (!isOwnProfile) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>Private</Text>
          <Text style={styles.emptyDesc}>
            Sessions are only visible to the creator
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="calendar-outline" size={48} color={colors.grayMuted} style={styles.emptyIconMargin} />
        <Text style={styles.emptyTitle}>No sessions yet</Text>
        <Text style={styles.emptyDesc}>
          Your 1:1 sessions with fans will appear here
        </Text>
      </View>
    );
  };

  // ==================== QR CODE MODAL ====================
  const renderQRModal = () => (
    <Modal
      visible={showQRModal}
      animationType="fade"
      transparent
      onRequestClose={handleCloseQRModal}
    >
      <View style={styles.qrModalOverlay}>
        <View style={styles.qrModalContent}>
          <TouchableOpacity
            style={styles.qrCloseBtn}
            onPress={handleCloseQRModal}
            accessibilityLabel="Close QR code"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.qrContainer}>
            {/* Simple QR placeholder - replace with actual QR library if needed */}
            <View style={styles.qrCode}>
              <Ionicons name="qr-code" size={150} color={colors.dark} />
            </View>
          </View>

          <Text style={styles.qrUsername}>{sanitizeOptionalText(user.displayName)}</Text>
          <Text style={styles.qrHint}>Scan to be my fan!</Text>

          {/* Profile Link */}
          <View style={styles.profileLinkContainer}>
            <Text style={styles.profileLinkText} numberOfLines={1}>
              {getProfileUrl()}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.qrCopyBtn}
            onPress={handleCopyLink}
            accessibilityLabel="Copy profile link"
            accessibilityRole="button"
            accessibilityHint="Copies your profile link to the clipboard"
          >
            <Ionicons name="copy-outline" size={20} color="#FFF" />
            <Text style={styles.qrCopyText}>Copy profile link</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ==================== GROUP/EVENT HANDLERS ====================
  const handleEventGroupCardPress = useCallback((type: 'event' | 'group', id: string) => {
    if (!UUID_REGEX.test(id)) {
      if (__DEV__) console.warn('[ProfileScreen] Invalid activity ID:', id);
      return;
    }
    navigation.navigate('ActivityDetail', { activityId: id, activityType: type });
  }, [navigation]);

  const handleEventGroupMenuPress = useCallback((type: 'event' | 'group', id: string) => {
    setMenuItem({ type, id });
  }, []);

  const handleEventGroupMenuAction = useCallback((action: 'edit' | 'delete') => {
    if (!menuItem) return;
    if (action === 'edit') {
      if (menuItem.type === 'event') {
        navigation.navigate('EventManage', { eventId: menuItem.id });
      }
    }
    setMenuItem(null);
  }, [menuItem, navigation]);

  const handleNewActivity = useCallback(() => {
    navigation.navigate('CreateActivity');
  }, [navigation]);

  // ==================== RENDER GROUP/EVENT ====================
  const renderGroupEvent = () => {
    // Build merged + filtered list
    const taggedEvents = events.map(e => ({ ...e, _type: 'event' as const, _title: e.title }));
    const taggedGroups = groups.map(g => ({ ...g, _type: 'group' as const, _title: g.name }));
    // Unified Activities - show all events and groups together
    const items = [...taggedEvents, ...taggedGroups].sort(
      (a, b) => new Date(b.starts_at || 0).getTime() - new Date(a.starts_at || 0).getTime()
    );

    return (
      <View style={styles.groupEventContainer}>
        {/* Header: New button only (no filter - unified as Activities) */}
        {isOwnProfile && (
          <View style={styles.groupEventHeader}>
            <View />
            <TouchableOpacity
              style={styles.newButton}
              onPress={handleNewActivity}
              accessibilityLabel="Create new activity"
              accessibilityRole="button"
            >
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Text style={styles.newButtonText}>New</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content */}
        {isEventsGroupsLoading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color={colors.grayMuted}
              style={styles.emptyIconMargin}
            />
            <Text style={styles.emptyTitle}>No activities yet</Text>
            <Text style={styles.emptyDesc}>Create your first activity to get started</Text>
            {isOwnProfile && (
              <TouchableOpacity
                style={styles.createBtn}
                onPress={handleNewActivity}
                accessibilityLabel="Create new event or group"
                accessibilityRole="button"
              >
                <Text style={styles.createBtnText}>Create New</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.groupEventList}>
            {items.map((item) => (
              <MemoizedEventGroupCard
                key={`${item._type}-${item.id}`}
                type={item._type}
                id={item.id}
                title={item._title}
                location={item.address || ''}
                coverImage={item.cover_image_url}
                startDate={item.starts_at}
                participantCount={item.current_participants}
                maxParticipants={item.max_participants}
                isOwner={item.creator_id === storeUser?.id}
                onCardPress={handleEventGroupCardPress}
                onCardMenuPress={handleEventGroupMenuPress}
              />
            ))}
          </View>
        )}
      </View>
    );
  };

  // ==================== RENDER TAB CONTENT ====================
  const renderTabContent = () => {
    if (activeTab === 'posts') {
      if (posts.length === 0) {
        return renderEmpty();
      }
      const leftColumn = posts.filter((_, i) => i % 2 === 0);
      const rightColumn = posts.filter((_, i) => i % 2 === 1);
      return (
        <View style={styles.masonryContainer}>
          <View style={styles.masonryColumn}>
            {leftColumn.map((post) => (
              <View key={post.id} style={[styles.masonryCard, { height: getMasonryHeight(post.id) }]}>
                {renderPostItem({ item: post })}
              </View>
            ))}
          </View>
          <View style={styles.masonryColumn}>
            {rightColumn.map((post) => (
              <View key={post.id} style={[styles.masonryCard, { height: getMasonryHeight(post.id) }]}>
                {renderPostItem({ item: post })}
              </View>
            ))}
          </View>
        </View>
      );
    }
    if (activeTab === 'peaks') {
      return renderPeaks();
    }
    if (activeTab === 'planning') {
      return renderPlanning();
    }
    if (activeTab === 'videos') {
      return renderVideos();
    }
    if (activeTab === 'lives') {
      return renderLives();
    }
    if (activeTab === 'sessions') {
      return renderSessions();
    }
    if (activeTab === 'groupevent') {
      return renderGroupEvent();
    }
    if (activeTab === 'collections') {
      return renderCollections();
    }
    return null;
  };

  // ==================== EARLY RETURNS (after all hooks) ====================
  // Show loading only on initial load when we have no data at all
  if (isProfileLoading && !profileData && !user.displayName) {
    return <ProfileSkeleton />;
  }

  // Note: We no longer show a hard error screen - instead, we show the profile
  // with whatever data we have (from profileData, storeUser, or defaults)
  // This ensures the user can always access their profile and settings

  // ==================== MAIN RENDER ====================
  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} translucent backgroundColor="transparent" />

      {/* Settings Button - Fixed on top */}
      {isOwnProfile && (
        <TouchableOpacity
          style={[styles.settingsBtnFixed, settingsBtnFixedStyle]}
          onPress={handleNavigateSettings}
          testID="settings-button"
          accessibilityLabel="Settings"
          accessibilityRole="button"
          accessibilityHint="Opens app settings"
        >
          <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
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
        stickyHeaderIndices={[1]} // Make tabs sticky when scrolling
      >
        {/* Scrollable Header */}
        {renderHeader()}

        {/* Sticky Tabs */}
        {renderTabs()}

        {/* Tab Content */}
        {renderTabContent()}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {renderQRModal()}

      {/* Image Picker Action Sheet */}
      <SmuppyActionSheet
        visible={showImageSheet}
        onClose={handleCloseImageSheet}
        title={imageSheetType === 'avatar' ? 'Profile Photo' : 'Cover Photo'}
        subtitle={imageSheetType === 'avatar'
          ? 'Choose how you want to update your profile picture'
          : 'Choose how you want to update your cover photo'
        }
        options={getImageSheetOptions()}
      />

      {/* Event/Group Menu */}
      <SmuppyActionSheet
        visible={!!menuItem}
        onClose={handleCloseMenuItem}
        title={menuItem?.type === 'event' ? 'Event Options' : 'Group Options'}
        options={[
          {
            label: 'Edit',
            icon: 'create-outline',
            onPress: () => { void handleEventGroupMenuAction('edit'); },
          },
          {
            label: 'Delete',
            icon: 'trash-outline',
            onPress: () => { void handleEventGroupMenuAction('delete'); },
            destructive: true,
          },
        ]}
      />

      {/* Collection Menu Modal */}
      <Modal
        visible={collectionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseCollectionMenu}
      >
        <TouchableOpacity
          style={styles.collectionMenuOverlay}
          activeOpacity={1}
          onPress={handleCloseCollectionMenu}
        >
          <View style={styles.collectionMenuContainer}>
            <TouchableOpacity
              style={styles.collectionMenuItem}
              onPress={handleRemoveFromCollection}
              accessibilityLabel="Remove from saved"
              accessibilityRole="button"
            >
              <Ionicons name="bookmark-outline" size={22} color={colors.dark} />
              <Text style={styles.collectionMenuText}>Remove from saved</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.collectionMenuItem, styles.collectionMenuItemLast]}
              onPress={handleCloseCollectionMenu}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={colors.grayMuted} />
              <Text style={[styles.collectionMenuText, styles.collectionMenuTextCancel]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};


export default ProfileScreen;
