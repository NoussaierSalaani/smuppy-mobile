import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Alert,
} from 'react-native';
import { useUserSafetyStore } from '../../store/userSafetyStore';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS } from '../../config/theme';
import { useProfile } from '../../hooks';
import { followUser, unfollowUser, isFollowing, getPostsByUser, Post, hasPendingFollowRequest, cancelFollowRequest } from '../../services/database';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { AccountBadge } from '../../components/Badge';
import SubscribeChannelModal from '../../components/SubscribeChannelModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_HEIGHT = 282;
const AVATAR_SIZE = 96;

// Type for profile data from API
interface ProfileApiData {
  id?: string;
  username?: string;
  full_name?: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string;
  fan_count?: number;
  post_count?: number;
  is_verified?: boolean;
  is_bot?: boolean;
  is_team?: boolean;
  is_private?: boolean;
  interests?: string[];
  account_type?: 'personal' | 'pro_creator' | 'pro_local';
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

// Cover images by interest/category
const COVER_IMAGES_BY_INTEREST: Record<string, string> = {
  'Fitness': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
  'Gym': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
  'Yoga': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800',
  'Running': 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800',
  'Cardio': 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=800',
  'Wellness': 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=800',
  'Meditation': 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
  'Nutrition': 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800',
  'CrossFit': 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=800',
  'Swimming': 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800',
  'Cycling': 'https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800',
  'Basketball': 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800',
  'Football': 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
  'Tennis': 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800',
  'Boxing': 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800',
  'Martial Arts': 'https://images.unsplash.com/photo-1555597673-b21d5c935865?w=800',
  'Hiking': 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800',
  'Climbing': 'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=800',
  'Dance': 'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=800',
  'Pilates': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800',
};

const DEFAULT_COVER = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800';

// Get cover image based on interests
const getCoverImage = (interests: string[] = []): string => {
  for (const interest of interests) {
    if (COVER_IMAGES_BY_INTEREST[interest]) {
      return COVER_IMAGES_BY_INTEREST[interest];
    }
  }
  return DEFAULT_COVER;
};


const UserProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  
  // Déterminer si c'est notre profil ou celui d'un autre
  const params = route?.params as { userId?: string } || {};
  const userId = params.userId;
  const isOwnProfile = !userId;
  const { data: profileData, isLoading, isError } = useProfile(userId);

  const profile = useMemo(() => {
    const data: ProfileApiData = profileData || {};
    const interests = data.interests || DEFAULT_PROFILE.interests;
    return {
      id: data.id || userId || DEFAULT_PROFILE.id,
      username: data.username || DEFAULT_PROFILE.username,
      displayName: data.full_name || data.username || DEFAULT_PROFILE.displayName,
      avatar: data.avatar_url || DEFAULT_PROFILE.avatar,
      coverImage: data.cover_url || getCoverImage(interests),
      bio: data.bio || DEFAULT_PROFILE.bio,
      fanCount: data.fan_count ?? DEFAULT_PROFILE.fanCount,
      postCount: data.post_count ?? DEFAULT_PROFILE.postCount,
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
  const [refreshing, setRefreshing] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  // Live status for pro_creator (mock data - can be connected to real data later)
  const [creatorLiveStatus, setCreatorLiveStatus] = useState<{
    isLive: boolean;
    liveTitle?: string;
    nextLiveDate?: Date;
    nextLiveTitle?: string;
    hasReminder?: boolean;
  }>({
    isLive: false, // Set to true to show "LIVE NOW" section
    liveTitle: 'Morning Workout Session',
    nextLiveDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    nextLiveTitle: 'Full Body Training',
    hasReminder: false,
  });

  // Sync local fan count with profile data from server
  // Always update when profile.fanCount changes to get the latest value
  useEffect(() => {
    if (profile.fanCount !== undefined) {
      setLocalFanCount(profile.fanCount);
    }
  }, [profile.fanCount]);

  // Display fan count (local takes precedence for optimistic updates)
  const displayFanCount = localFanCount ?? profile.fanCount;

  // User's posts
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);

  // Separate posts and peaks
  const posts = useMemo(() => userPosts.filter(p => !p.is_peak), [userPosts]);
  const peaks = useMemo(() => userPosts.filter(p => p.is_peak), [userPosts]);

  // Check if current user is following this profile or has pending request
  useEffect(() => {
    const checkFollowStatus = async () => {
      if (userId) {
        const { following } = await isFollowing(userId);
        setIsFan(following);

        // If not following and profile is private, check for pending request
        if (!following) {
          const { pending } = await hasPendingFollowRequest(userId);
          setIsRequested(pending);
        } else {
          setIsRequested(false);
        }
      }
    };
    checkFollowStatus();
  }, [userId]);

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
      console.error('Error sharing profile:', error);
    }
  };

  // User safety store for block
  const { block, isBlocked: isUserBlocked } = useUserSafetyStore();

  // Report user
  const handleReportUser = () => {
    setShowMenuModal(false);
    Alert.alert(
      'Report User',
      'Why are you reporting this user?',
      [
        { text: 'Spam', onPress: () => submitUserReport('spam') },
        { text: 'Harassment', onPress: () => submitUserReport('harassment') },
        { text: 'Inappropriate', onPress: () => submitUserReport('inappropriate') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const submitUserReport = (_reason: string) => {
    Alert.alert(
      'Report Submitted',
      'Thank you for your report. We will review this user.',
      [{ text: 'OK' }]
    );
  };

  // Block user
  const handleBlockUser = () => {
    if (!userId) return;

    if (isUserBlocked(userId)) {
      setShowMenuModal(false);
      Alert.alert('Already Blocked', 'This user is already blocked.', [{ text: 'OK' }]);
      return;
    }

    setShowMenuModal(false);
    Alert.alert(
      'Block User?',
      `You won't see ${profile.displayName}'s posts and they won't be able to interact with you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error } = await block(userId);
            if (error) {
              Alert.alert('Error', 'Failed to block user. Please try again.', [{ text: 'OK' }]);
            } else {
              Alert.alert('User Blocked', 'You will no longer see their content.', [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
            }
          },
        },
      ]
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
      console.error('[UserProfile] Follow error:', error);
      return;
    }

    if (requestCreated) {
      // A follow request was created for a private account
      setIsRequested(true);
    } else {
      // Direct follow was successful
      setIsFan(true);
      setLocalFanCount(prev => (prev ?? 0) + 1);
    }
  };

  const confirmUnfan = async () => {
    if (!userId || isLoadingFollow) return;

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
      console.error('[UserProfile] Unfollow error:', error);
    }
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

  // ✅ CORRIGÉ - Gestion des commentaires avec bonne route
  const _handleCommentPress = (postId: string) => {
    if (!isFan && !isOwnProfile) {
      setShowFanRequiredModal(true);
    } else {
      navigation.navigate('PostDetailFanFeed', { postId });
    }
  };
  
  // Formater la date de déblocage
  const formatBlockDate = () => {
    if (!blockEndDate) return '';
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    return blockEndDate.toLocaleDateString('en-US', options);
  };

  // ==================== RENDER POST ITEM (MUST BE BEFORE EARLY RETURNS) ====================
  const renderPostItem = useCallback((post: Post, allPosts: Post[]) => {
    // Support both media_urls array and legacy media_url string
    const thumbnail = post.media_urls?.[0] || (post as any).media_url || null;
    const isVideo = post.media_type === 'video' || post.media_type === 'multiple';
    const _caption = post.content || (post as any).caption || '';

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
          <View style={[styles.postThumb, { backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name="image-outline" size={28} color="#6E6E73" />
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
  }, [navigation, profile]);

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
        <ActivityIndicator size="large" color={COLORS.primaryGreen} />
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
        <Ionicons name="lock-closed" size={48} color="#8E8E93" />
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
        color="#8E8E93"
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
          <ActivityIndicator size="small" color={COLORS.primary} />
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
                <View style={[styles.peakThumb, { backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="videocam-outline" size={24} color="#6E6E73" />
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
    if (activeTab === 'collections') {
      return renderEmpty('collections');
    }
    return null;
  };

  // ==================== TABS ====================
  const TABS = [
    { key: 'posts', label: 'Posts' },
    { key: 'peaks', label: 'Peaks' },
    { key: 'collections', label: 'Collections' },
  ] as const;

  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <View style={styles.pillsContainer}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
            style={{ flex: 1 }}
          >
            {activeTab === tab.key ? (
              <LinearGradient
                colors={['#0EBF8A', '#00B5C1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.pillActive}
              >
                <Text style={styles.pillTextActive}>{tab.label}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.pill}>
                <Text style={styles.pillText}>{tab.label}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ==================== RENDER HEADER ====================
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Cover Image */}
      <View style={styles.coverAbsolute}>
        <OptimizedImage source={profile.coverImage} style={styles.coverImage} />
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.85)', '#FFFFFF']}
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
          {profile.avatar ? (
            <AvatarImage source={profile.avatar} size={AVATAR_SIZE} style={styles.avatar} />
          ) : (
            <View style={styles.avatarEmpty}>
              <Ionicons name="person" size={36} color="#6E6E73" />
            </View>
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
              <Text style={styles.statGlassValue}>{profile.postCount}</Text>
              <Text style={styles.statGlassLabel}>Posts</Text>
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
          />
          {profile.isPrivate && (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={12} color="#8E8E93" />
            </View>
          )}
          {(profile.isBot || profile.isTeam) && (
            <View style={styles.teamBadge}>
              <Text style={styles.teamBadgeText}>(Team Smuppy)</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShareProfile}>
          <Ionicons name="share-outline" size={18} color="#0A0A0F" />
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
      <View style={styles.actionButtons}>
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

        {isFan && (
          <TouchableOpacity style={styles.messageButton} onPress={handleMessagePress}>
            <Ionicons name="chatbubble-outline" size={18} color="#0A0A0F" />
            <Text style={styles.messageText}>Message</Text>
          </TouchableOpacity>
        )}

        {/* Pro Creator Action Buttons */}
        {profile.accountType === 'pro_creator' && (
          <>
            {/* Subscribe Button */}
            <TouchableOpacity
              style={styles.subscribeButton}
              onPress={() => setShowSubscribeModal(true)}
            >
              <LinearGradient
                colors={['#0EBF8A', '#01B6C5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.subscribeButtonGradient}
              >
                <Ionicons name="star" size={16} color="#FFFFFF" />
                <Text style={styles.subscribeButtonText}>Subscribe</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Book 1:1 Session Button */}
            <TouchableOpacity
              style={styles.sessionButton}
              onPress={() => (navigation as any).navigate('BookSession', {
                creator: {
                  id: profile.id,
                  name: profile.displayName,
                  avatar: profile.avatar || '',
                  specialty: profile.bio?.slice(0, 30) || 'Fitness Coach',
                }
              })}
            >
              <LinearGradient
                colors={['#0081BE', '#00B5C1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sessionButtonGradient}
              >
                <Ionicons name="videocam" size={16} color="#FFFFFF" />
                <Text style={styles.sessionButtonText}>Book 1:1</Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Pro Creator Live Section */}
      {profile.accountType === 'pro_creator' && (
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

          {/* Next Live Session Section */}
          {!creatorLiveStatus.isLive && creatorLiveStatus.nextLiveDate && (
            <View style={styles.nextLiveSection}>
              <View style={styles.nextLiveHeader}>
                <View style={styles.nextLiveIconContainer}>
                  <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
                </View>
                <View style={styles.nextLiveInfo}>
                  <Text style={styles.nextLiveLabel}>Next Live Session</Text>
                  <Text style={styles.nextLiveDate}>
                    {creatorLiveStatus.nextLiveDate.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  {creatorLiveStatus.nextLiveTitle && (
                    <Text style={styles.nextLiveTitle}>{creatorLiveStatus.nextLiveTitle}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    styles.reminderButton,
                    creatorLiveStatus.hasReminder && styles.reminderButtonActive
                  ]}
                  onPress={() => {
                    setCreatorLiveStatus(prev => ({
                      ...prev,
                      hasReminder: !prev.hasReminder,
                    }));
                    Alert.alert(
                      creatorLiveStatus.hasReminder ? 'Reminder Removed' : 'Reminder Set',
                      creatorLiveStatus.hasReminder
                        ? "You won't be notified about this live."
                        : "We'll notify you when this live starts.",
                      [{ text: 'OK' }]
                    );
                  }}
                >
                  <Ionicons
                    name={creatorLiveStatus.hasReminder ? 'notifications' : 'notifications-outline'}
                    size={18}
                    color={creatorLiveStatus.hasReminder ? '#FFFFFF' : COLORS.primary}
                  />
                  <Text style={[
                    styles.reminderButtonText,
                    creatorLiveStatus.hasReminder && styles.reminderButtonTextActive
                  ]}>
                    {creatorLiveStatus.hasReminder ? 'Reminded' : 'Set Reminder'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
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
              <Ionicons name="share-outline" size={22} color="#0A0A0F" />
              <Text style={styles.menuItemText}>Share Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={handleReportUser}>
              <Ionicons name="flag-outline" size={22} color="#0A0A0F" />
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
        onSubscribe={(_tierId) => {
          // TODO: Implement subscription logic with payment
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
    borderColor: '#FFFFFF',
  },
  avatarEmpty: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFFFFF',
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
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  statGlassItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  statGlassDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  statGlassValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A252F',
  },
  statGlassLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#555',
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
    color: '#0A252F',
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
    backgroundColor: '#F3F4F6',
    padding: 4,
    borderRadius: 10,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  username: {
    fontSize: 14,
    color: '#8E8E93',
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
    color: '#0A252F',
    lineHeight: 18,
  },
  seeMoreBtn: {
    alignSelf: 'flex-start',
  },
  seeMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0EBF8A',
    paddingVertical: 1,
  },

  // ===== ACTION BUTTONS =====
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginTop: 12,
    marginBottom: 8,
    zIndex: 2,
  },
  fanButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#0EBF8A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fanButtonActive: {
    backgroundColor: '#0EBF8A',
  },
  fanButtonRequested: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E5E5',
  },
  fanButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0EBF8A',
  },
  fanButtonTextActive: {
    color: '#FFFFFF',
  },
  fanButtonTextRequested: {
    color: '#8E8E93',
  },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  messageText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A252F',
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
    color: 'rgba(10, 37, 47, 0.6)',
  },
  liveTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A252F',
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
    color: 'rgba(10, 37, 47, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nextLiveDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A252F',
    marginTop: 2,
  },
  nextLiveTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(10, 37, 47, 0.7)',
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
    backgroundColor: '#FFFFFF',
  },
  pillsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
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
    color: '#8E8E93',
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
    color: '#8E8E93',
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
    backgroundColor: '#1C1C1E',
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
    color: '#8E8E93',
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
    color: '#0A0A0F',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    fontWeight: '400',
    color: '#8E8E93',
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
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  privateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0A0A0F',
    marginBottom: 8,
  },
  privateDesc: {
    fontSize: 15,
    fontWeight: '400',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  privateFollowBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 25,
    backgroundColor: '#0EBF8A',
  },
  privateFollowBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
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
    color: '#0A0A0F',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    color: '#8E8E93',
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
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0A0A0F',
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0EBF8A',
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalBtnSingle: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0EBF8A',
    alignItems: 'center',
  },
  modalBtnSingleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ===== MENU MODAL =====
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  menuHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E5E5',
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
    color: '#0A0A0F',
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
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
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0F',
  },
});

export default UserProfileScreen;
