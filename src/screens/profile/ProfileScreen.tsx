import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Modal,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
// FlashList import removed - not used
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS } from '../../config/theme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useUserStore } from '../../stores';
import { useCurrentProfile, useUserPosts, useSavedPosts } from '../../hooks';
import { useProfileEventsGroups } from '../../hooks/useProfileEventsGroups';
import EventGroupCard from '../../components/EventGroupCard';
import { ProfileDataSource, UserProfile, INITIAL_USER_PROFILE, resolveProfile } from '../../types/profile';

import { AccountBadge, PremiumBadge } from '../../components/Badge';
import { FEATURES } from '../../config/featureFlags';
import SmuppyActionSheet from '../../components/SmuppyActionSheet';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { unsavePost } from '../../services/database';
import { LiquidTabsWithMore } from '../../components/LiquidTabs';
import RippleVisualization from '../../components/RippleVisualization';
import GradeFrame from '../../components/GradeFrame';
import { getGrade } from '../../utils/gradeSystem';
import { useVibeStore } from '../../stores/vibeStore';
import { styles, AVATAR_SIZE } from './ProfileScreen.styles';

// ProfileDataSource is now imported from ../../types/profile

// INITIAL_USER_PROFILE is now imported from ../../types/profile
// Using alias for backward compatibility
const INITIAL_USER = INITIAL_USER_PROFILE;

const BIO_MAX_LINES = 2;
const BIO_EXPANDED_MAX_LINES = 6;


interface ProfileScreenProps {
  navigation: {
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    goBack: () => void;
  };
  route: { params?: { userId?: string } };
}

const ProfileScreen = ({ navigation, route }: ProfileScreenProps) => {
  const insets = useSafeAreaInsets();
  const { showSuccess, showError } = useSmuppyAlert();
  const storeUser = useUserStore((state) => state.user);
  const { data: profileData, isLoading: isProfileLoading, refetch: refetchProfile } = useCurrentProfile();
  const [activeTab, setActiveTab] = useState('posts');
  const [showMoreTabs, setShowMoreTabs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  // User state
  const [user, setUser] = useState<UserProfile>(INITIAL_USER);

  // Get user's posts from database
  const userId = profileData?.id || storeUser?.id;
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
  const posts = useMemo(() => {
    const realPosts = allUserPosts.filter(post => !post.is_peak);
    return realPosts;
  }, [allUserPosts]);

  const peaks = useMemo(() => {
    const realPeaks = allUserPosts.filter(post => post.is_peak && post.save_to_profile !== false);
    return realPeaks;
  }, [allUserPosts]);

  // Get saved posts (collections) - only for own profile
  const {
    data: savedPostsData,
    refetch: refetchSavedPosts,
  } = useSavedPosts();

  const collections = useMemo(() => {
    if (!savedPostsData?.pages) return [];
    const realCollections = savedPostsData.pages.flatMap(page => page.posts);
    return realCollections;
  }, [savedPostsData]);

  // Events & Groups
  const { events, groups, isLoading: isEventsGroupsLoading, refresh: refreshEventsGroups } = useProfileEventsGroups();

  // Check if user has peaks (for avatar border indicator)
  const hasPeaks = peaks.length > 0;

  // Grade system — decorative frame for 1M+ fans
  const gradeInfo = useMemo(() => getGrade(user.stats.fans), [user.stats.fans]);

  // Vibe score
  const vibeScore = useVibeStore((s) => s.vibeScore);

  // Modal states
  const [showQRModal, setShowQRModal] = useState(false);
  const [showImageSheet, setShowImageSheet] = useState(false);
  const [imageSheetType, setImageSheetType] = useState<'avatar' | 'cover'>('avatar');
  const [collectionMenuVisible, setCollectionMenuVisible] = useState(false);
  const [selectedCollectionPost, setSelectedCollectionPost] = useState<any>(null);
  const [groupEventMode, setGroupEventMode] = useState<'group' | 'event'>('event');
  const [menuItem, setMenuItem] = useState<{ type: 'event' | 'group'; id: string } | null>(null);

  const isOwnProfile = route?.params?.userId === undefined;

  // Use shared resolveProfile utility
  const resolvedProfile = useMemo(() =>
    resolveProfile(profileData as ProfileDataSource, storeUser as ProfileDataSource),
    [profileData, storeUser]
  );

  useEffect(() => {
    setUser(prev => ({
      ...prev,
      ...resolvedProfile,
      stats: resolvedProfile.stats,
    }));
  }, [resolvedProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchProfile(), refetchPosts(), refetchSavedPosts(), refreshEventsGroups()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfile, refetchPosts, refetchSavedPosts, refreshEventsGroups]);

  // ==================== IMAGE PICKER ====================
  const showImageOptions = (type: 'avatar' | 'cover') => {
    setImageSheetType(type);
    setShowImageSheet(true);
  };

  const handleTakePhoto = async () => {
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
  };

  const handleChooseLibrary = async () => {
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
  };

  const handleRemovePhoto = async () => {
    updateImage(imageSheetType, null);
  };

  const getImageSheetOptions = () => {
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
  };

  const updateImage = (type: 'avatar' | 'cover', uri: string | null) => {
    setUser(prev => ({
      ...prev,
      [type === 'avatar' ? 'avatar' : 'coverImage']: uri,
    }));
  };

  // ==================== COPY PROFILE LINK ====================
  const getProfileUrl = () => {
    const username = user.username || user.displayName.toLowerCase().replace(/\s+/g, '');
    return `https://smuppy.app/u/${username}`;
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(getProfileUrl());
      showSuccess('Copied!', 'Profile link copied to clipboard');
    } catch (_error) {
      showError('Error', 'Failed to copy link');
    }
  };

  // ==================== FANS ====================
  const handleFansPress = () => {
    navigation.navigate('FansList', { fansCount: user.stats.fans });
  };

  // Collection menu handlers
  const handleCollectionMenu = (post: any, e: any) => {
    e.stopPropagation();
    setSelectedCollectionPost(post);
    setCollectionMenuVisible(true);
  };

  const handleRemoveFromCollection = async () => {
    if (!selectedCollectionPost) return;

    setCollectionMenuVisible(false);

    const { error } = await unsavePost(selectedCollectionPost.id);
    if (error) {
      showError('Error', 'Failed to remove from collection');
    } else {
      refetchSavedPosts();
    }
    setSelectedCollectionPost(null);
  };

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
                  <Ionicons name="person" size={32} color="#6E6E73" />
                </View>
              )}
            </View>
          </LinearGradient>
        ) : (
          user.avatar ? (
            <AvatarImage source={user.avatar} size={AVATAR_SIZE} style={styles.avatar} />
          ) : (
            <View style={styles.avatarEmpty}>
              <Ionicons name="person" size={36} color="#6E6E73" />
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
  }, [hasPeaks, user.avatar, gradeInfo]);

  // ==================== RENDER HEADER ====================
  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Cover Image - extends behind content */}
      <View style={styles.coverAbsolute}>
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={() => isOwnProfile && showImageOptions('cover')}
          style={styles.coverTouchable}
        >
          {user.coverImage ? (
            <OptimizedImage source={user.coverImage} style={styles.coverImage} />
          ) : (
            <View style={styles.coverPlaceholder} />
          )}
        </TouchableOpacity>

        {/* Gradient that fades the cover into white */}
        <LinearGradient
          colors={['transparent', 'transparent', 'rgba(255, 255, 255, 0.5)', 'rgba(255, 255, 255, 0.85)', '#FFFFFF']}
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
          onPress={() => isOwnProfile && showImageOptions('avatar')}
        >
          {renderAvatarContent()}
        </TouchableOpacity>

        {/* Stats - Glassmorphism Style */}
        <View style={styles.statsGlass}>
          <BlurView intensity={80} tint="light" style={styles.statsBlurContainer}>
            <TouchableOpacity style={styles.statGlassItem} onPress={handleFansPress}>
              <Text style={styles.statGlassValue}>{user.stats.fans}</Text>
              <Text style={styles.statGlassLabel}>Fans</Text>
            </TouchableOpacity>
            <View style={styles.statGlassDivider} />
            <View style={styles.statGlassItem}>
              <Text style={styles.statGlassValue}>{user.stats.peaks || 0}</Text>
              <Text style={styles.statGlassLabel}>Peaks</Text>
            </View>
            {user.accountType !== 'pro_business' && (
              <>
                <View style={styles.statGlassDivider} />
                <TouchableOpacity style={styles.statGlassItem} onPress={() => navigation.navigate('Prescriptions')}>
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
          <Text style={styles.displayName}>{user.displayName}</Text>
          <AccountBadge
            size={18}
            style={styles.badge}
            isVerified={user.isVerified}
            accountType={user.accountType as 'personal' | 'pro_creator' | 'pro_business'}
          />
          {user.isPremium && <PremiumBadge size={18} style={styles.badge} />}
        </View>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowQRModal(true)}>
          <Ionicons name="qr-code-outline" size={18} color="#0A0A0F" />
        </TouchableOpacity>
      </View>

      {/* Bio Section */}
      {user.bio ? (
        <View style={styles.bioSection}>
          <Text
            style={styles.bioText}
            numberOfLines={bioExpanded ? BIO_EXPANDED_MAX_LINES : BIO_MAX_LINES}
          >
            {user.bio}
          </Text>
          {(user.bio.length > 80 || user.bio.split('\n').length > BIO_MAX_LINES) && (
            <TouchableOpacity
              onPress={() => setBioExpanded(!bioExpanded)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.seeMoreBtn}
            >
              <Text style={styles.seeMoreText}>
                {bioExpanded ? 'Voir moins' : 'Voir plus'}
              </Text>
            </TouchableOpacity>
          )}
          {user.location ? (
            <View style={styles.locationRow}>
              <Text style={styles.locationPin}>📍</Text>
              <Text style={styles.locationText}>{user.location}</Text>
            </View>
          ) : null}
        </View>
      ) : isOwnProfile ? (
        <TouchableOpacity
          style={styles.addBioBtn}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Ionicons name="add" size={16} color="#0EBF8A" />
          <Text style={styles.addBioText}>Add Bio</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  // ==================== RENDER TABS ====================
  // Dynamic tabs based on account type
  const isProCreator = user?.accountType === 'pro_creator' || resolvedProfile?.accountType === 'pro_creator';

  // Primary tabs (always visible) - max 3 to keep labels readable
  const PRIMARY_TABS = useMemo(() => {
    return [
      { key: 'posts', label: 'Posts', icon: 'grid-outline' },
      { key: 'peaks', label: 'Peaks', icon: 'flash-outline' },
      { key: 'groupevent', label: 'Community', icon: 'people-outline' },
    ];
  }, []) as { key: string; label: string; icon: string }[];

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
      } else {
        if (FEATURES.GO_LIVE) tabs.push({ key: 'lives', label: 'Lives', icon: 'radio-outline' });
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
          onMorePress={() => setShowMoreTabs(true)}
          size="medium"
          style={styles.liquidProfileTabs}
        />

        {/* Extra Tabs Modal */}
        <Modal
          visible={showMoreTabs}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMoreTabs(false)}
        >
          <TouchableOpacity
            style={styles.moreTabsOverlay}
            activeOpacity={1}
            onPress={() => setShowMoreTabs(false)}
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
                >
                  <Ionicons
                    name={tab.icon as any}
                    size={22}
                    color={activeTab === tab.key ? '#0EBF8A' : '#374151'}
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
                    <Ionicons name="checkmark" size={20} color="#0EBF8A" />
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
      <Ionicons name="images-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
      <Text style={styles.emptyTitle}>No posts yet</Text>
      <Text style={styles.emptyDesc}>
        You're one click away from your{'\n'}first post
      </Text>
      {isOwnProfile && (
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => navigation.navigate('CreatePost')}
        >
          <Text style={styles.createBtnText}>Create a post</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );

  // ==================== RENDER POST ITEM (Simple grid style) ====================
  const renderPostItem = useCallback(({ item: post }: { item: { id: string; media_urls?: string[]; media_type?: string; likes_count?: number } }) => {
    const thumbnail = post.media_urls?.[0] || null;
    const isVideo = post.media_type === 'video' || post.media_type === 'multiple';

    return (
      <TouchableOpacity
        style={styles.postCard}
        onPress={() => navigation.navigate('PostDetailProfile', { postId: post.id })}
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.postThumb} />
        ) : (
          <View style={[styles.postThumb, styles.postThumbEmpty]}>
            <Ionicons name="image-outline" size={24} color="#6E6E73" />
          </View>
        )}
        {isVideo && (
          <View style={styles.postPlayIcon}>
            <Ionicons name="play" size={12} color="#FFF" />
          </View>
        )}
        {/* Stats overlay at bottom */}
        <View style={styles.postStatsOverlay}>
          <View style={styles.postStat}>
            <SmuppyHeartIcon size={12} color="#FFF" filled />
            <Text style={styles.postStatText}>{post.likes_count || 0}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  // ==================== RENDER PEAK ITEM ====================
  const renderPeakItem = useCallback((peak: { id: string; media_urls?: string[]; likes_count?: number; views_count?: number; replies_count?: number; peak_duration?: number; tags_count?: number }) => {
    const thumbnail = peak.media_urls?.[0] || null;
    // Mock stats for demo
    const likes = peak.likes_count || Math.floor(Math.random() * 500) + 50;
    const views = peak.views_count || Math.floor(Math.random() * 2000) + 200;
    const replies = peak.replies_count || Math.floor(Math.random() * 30) + 5;

    return (
      <TouchableOpacity
        key={peak.id}
        style={styles.peakCard}
        onPress={() => navigation.navigate('PeakView', { peakId: peak.id })}
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.peakThumb} />
        ) : (
          <View style={[styles.peakThumb, styles.postThumbEmpty]}>
            <Ionicons name="videocam-outline" size={24} color="#6E6E73" />
          </View>
        )}
        {/* Duration badge */}
        <View style={styles.peakDuration}>
          <Text style={styles.peakDurationText}>{peak.peak_duration || 15}s</Text>
        </View>
        {/* Stats overlay */}
        <View style={styles.peakStatsOverlay}>
          <View style={styles.peakStat}>
            <SmuppyHeartIcon size={11} color="#FF6B6B" filled />
            <Text style={styles.peakStatText}>{likes}</Text>
          </View>
          <View style={styles.peakStat}>
            <Ionicons name="eye" size={11} color="#FFF" />
            <Text style={styles.peakStatText}>{views}</Text>
          </View>
          <View style={styles.peakStat}>
            <Ionicons name="chatbubble" size={10} color="#FFF" />
            <Text style={styles.peakStatText}>{replies}</Text>
          </View>
          {/* Tags - only visible to the creator (own profile) */}
          {isOwnProfile && (peak.tags_count ?? 0) > 0 && (
            <View style={styles.peakStat}>
              <Ionicons name="pricetag" size={10} color={COLORS.primary} />
              <Text style={[styles.peakStatText, { color: COLORS.primary }]}>{peak.tags_count}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);

  // ==================== RENDER PEAKS ====================
  const renderPeaks = () => {
    if (peaks.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No peaks yet</Text>
          <Text style={styles.emptyDesc}>
            Share your best moments as Peaks
          </Text>
          {isOwnProfile && storeUser?.accountType !== 'pro_business' && (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => navigation.navigate('CreatePeak')}
            >
              <Text style={styles.createBtnText}>Create a Peak</Text>
              <Ionicons name="arrow-forward" size={16} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      );
    }

    // Show peaks grid
    return (
      <View style={styles.peaksGrid}>
        {peaks.map(renderPeakItem)}
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
        onPress={() => navigation.navigate('PostDetailProfile', { postId: post.id })}
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
        <TouchableOpacity style={styles.collectionMenu} onPress={(e) => handleCollectionMenu(post, e)}>
          <Ionicons name="ellipsis-vertical" size={14} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.collectionInfo}>
          <Text style={styles.collectionTitle} numberOfLines={2}>
            {post.content || 'Saved post'}
          </Text>
          {post.author && (
            <View style={styles.collectionMeta}>
              <AvatarImage source={post.author.avatar_url} size={18} />
              <Text style={styles.collectionAuthorName}>{post.author.full_name}</Text>
              <SmuppyHeartIcon size={12} color="#FF6B6B" filled />
              <Text style={styles.collectionLikes}>{post.likes_count || 0}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  // ==================== RENDER COLLECTIONS ====================
  const renderCollections = () => {
    if (!isOwnProfile) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
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
          <Ionicons name="bookmark-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No collections yet</Text>
          <Text style={styles.emptyDesc}>
            Save posts to find them easily later
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.collectionsGrid}>
        {collections.map((post) => renderCollectionItem(post as typeof post & { author?: { id?: string; username?: string; full_name?: string; avatar_url?: string } }))}
      </View>
    );
  };

  // ==================== RENDER LIVE ITEM ====================
  const renderLiveItem = useCallback((live: { id: string; thumbnail: string; title: string; viewers: number; date: string; duration?: string }) => (
    <TouchableOpacity
      key={live.id}
      style={styles.liveCard}
      onPress={() => {
        // Navigate to recorded live playback
        // navigation.navigate('LivePlayback', { liveId: live.id });
      }}
    >
      <OptimizedImage source={live.thumbnail} style={styles.liveThumb} />
      {/* Live icon overlay */}
      <View style={styles.livePlayOverlay}>
        <View style={styles.livePlayBtn}>
          <Ionicons name="play" size={20} color="#FFF" />
        </View>
      </View>
      {/* Duration badge */}
      <View style={styles.liveDuration}>
        <Ionicons name="time-outline" size={10} color="#FFF" />
        <Text style={styles.liveDurationText}>{live.duration}</Text>
      </View>
      {/* Fans badge */}
      <View style={styles.liveMembersBadge}>
        <Ionicons name="people" size={10} color="#FFF" />
        <Text style={styles.liveMembersText}>Fans</Text>
      </View>
      {/* Info section */}
      <View style={styles.liveInfo}>
        <Text style={styles.liveTitle} numberOfLines={2}>{live.title}</Text>
        <View style={styles.liveMeta}>
          <View style={styles.liveMetaItem}>
            <Ionicons name="eye" size={12} color="#8E8E93" />
            <Text style={styles.liveMetaText}>{live.viewers.toLocaleString()}</Text>
          </View>
          <Text style={styles.liveDate}>{new Date(live.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</Text>
        </View>
      </View>
    </TouchableOpacity>
  ), []);

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
        case 'public': return COLORS.primary;
        case 'subscribers': return '#FFD700'; // Gold for premium/subscribers
        case 'fans': return '#0081BE';
        case 'private': return '#8E8E93';
        case 'hidden': return '#8E8E93';
        default: return COLORS.primary;
      }
    };
    const getVisibilityLabel = () => {
      switch (video.visibility) {
        case 'public': return 'Public';
        case 'subscribers': return 'Subscribers Only';
        case 'fans': return 'Fans Only';
        case 'private': return 'Private';
        case 'hidden': return video.scheduledAt ? `Scheduled ${new Date(video.scheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : 'Hidden';
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
  }, [navigation]);

  // ==================== RENDER VIDEOS ====================
  const renderVideos = () => {
    // Filter videos based on visibility for non-owners
    // - Owner sees all videos
    // - Non-owner sees: public only (TODO: implement fans/subscribers visibility check)
    // In production, this would check:
    // - fans: user is following this creator
    // - subscribers: user has active channel subscription
    const visibleVideos: { id: string; thumbnail: string; title: string; duration: string; views: number; visibility: string; scheduledAt?: string }[] = [];

    if (visibleVideos.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="film-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
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
          <Ionicons name="videocam-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>No lives yet</Text>
          <Text style={styles.emptyDesc}>
            This creator hasn't shared any recorded lives yet
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="videocam-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
        <Text style={styles.emptyTitle}>No lives yet</Text>
        <Text style={styles.emptyDesc}>
          Go live to connect with your fans in real-time
        </Text>
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => navigation.navigate('GoLive')}
        >
          <Text style={styles.createBtnText}>Go Live</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>
    );
  };

  // ==================== RENDER SESSION ITEM ====================
  const renderSessionItem = useCallback((session: { id: string; status: string; date: string; client?: { name?: string; avatar?: string }; clientName?: string; clientAvatar?: string; type?: string; time?: string; duration?: number; price?: number }) => {
    const isUpcoming = session.status === 'upcoming';
    const sessionDate = new Date(session.date);
    const dayName = sessionDate.toLocaleDateString('fr-FR', { weekday: 'short' });
    const dayNum = sessionDate.getDate();
    const month = sessionDate.toLocaleDateString('fr-FR', { month: 'short' });

    return (
      <View key={session.id} style={styles.sessionCard}>
        <View style={styles.sessionDateBox}>
          <Text style={styles.sessionDayName}>{dayName}</Text>
          <Text style={styles.sessionDayNum}>{dayNum}</Text>
          <Text style={styles.sessionMonth}>{month}</Text>
        </View>
        <View style={styles.sessionInfo}>
          <View style={styles.sessionHeader}>
            <AvatarImage source={session.clientAvatar} size={36} />
            <View style={styles.sessionDetails}>
              <Text style={styles.sessionClientName}>{session.clientName}</Text>
              <Text style={styles.sessionTime}>
                {session.time} • {session.duration} min
              </Text>
            </View>
            <View style={[
              styles.sessionStatusBadge,
              isUpcoming ? styles.sessionStatusUpcoming : styles.sessionStatusCompleted
            ]}>
              <Text style={[
                styles.sessionStatusText,
                isUpcoming ? styles.sessionStatusTextUpcoming : styles.sessionStatusTextCompleted
              ]}>
                {isUpcoming ? 'Upcoming' : 'Completed'}
              </Text>
            </View>
          </View>
          <View style={styles.sessionFooter}>
            <Text style={styles.sessionPrice}>${session.price}</Text>
            {isUpcoming && (
              <TouchableOpacity style={styles.sessionJoinBtn}>
                <Text style={styles.sessionJoinText}>Join</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }, []);

  // ==================== RENDER SESSIONS ====================
  const renderSessions = () => {
    if (!isOwnProfile) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="lock-closed-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
          <Text style={styles.emptyTitle}>Private</Text>
          <Text style={styles.emptyDesc}>
            Sessions are only visible to the creator
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="calendar-outline" size={48} color={COLORS.grayMuted} style={styles.emptyIconMargin} />
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
      onRequestClose={() => setShowQRModal(false)}
    >
      <View style={styles.qrModalOverlay}>
        <View style={styles.qrModalContent}>
          <TouchableOpacity
            style={styles.qrCloseBtn}
            onPress={() => setShowQRModal(false)}
          >
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.qrContainer}>
            {/* Simple QR placeholder - replace with actual QR library if needed */}
            <View style={styles.qrCode}>
              <Ionicons name="qr-code" size={150} color="#0A0A0F" />
            </View>
          </View>

          <Text style={styles.qrUsername}>@{user.username || user.displayName.toLowerCase().replace(/\s+/g, '')}</Text>
          <Text style={styles.qrHint}>Scan to be my fan!</Text>

          {/* Profile Link */}
          <View style={styles.profileLinkContainer}>
            <Text style={styles.profileLinkText} numberOfLines={1}>
              {getProfileUrl()}
            </Text>
          </View>

          <TouchableOpacity style={styles.qrCopyBtn} onPress={handleCopyLink}>
            <Ionicons name="copy-outline" size={20} color="#FFF" />
            <Text style={styles.qrCopyText}>Copy profile link</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // ==================== GROUP/EVENT HANDLERS ====================
  const handleEventGroupCardPress = useCallback((type: 'event' | 'group', id: string) => {
    if (type === 'event') {
      navigation.navigate('EventDetail', { eventId: id });
    } else {
      navigation.navigate('GroupDetail', { groupId: id });
    }
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

  const handleNewEventGroup = useCallback(() => {
    if (groupEventMode === 'event') {
      navigation.navigate('CreateEvent');
    } else {
      navigation.navigate('CreateGroup');
    }
  }, [groupEventMode, navigation]);

  // ==================== RENDER GROUP/EVENT ====================
  const renderGroupEvent = () => {
    const items = groupEventMode === 'event' ? events : groups;

    return (
      <View style={styles.groupEventContainer}>
        {/* Header: Toggle + New button */}
        <View style={styles.groupEventHeader}>
          <View style={styles.toggleChipsRow}>
            <TouchableOpacity
              style={[styles.toggleChip, groupEventMode === 'event' && styles.toggleChipActive]}
              onPress={() => setGroupEventMode('event')}
            >
              <Text style={[styles.toggleChipText, groupEventMode === 'event' && styles.toggleChipTextActive]}>
                Event
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleChip, groupEventMode === 'group' && styles.toggleChipActive]}
              onPress={() => setGroupEventMode('group')}
            >
              <Text style={[styles.toggleChipText, groupEventMode === 'group' && styles.toggleChipTextActive]}>
                Group
              </Text>
            </TouchableOpacity>
          </View>

          {isOwnProfile && (
            <TouchableOpacity style={styles.newButton} onPress={handleNewEventGroup}>
              <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
              <Text style={styles.newButtonText}>New</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        {isEventsGroupsLoading ? (
          <View style={styles.emptyContainer}>
            <ActivityIndicator size="small" color={COLORS.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color={COLORS.grayMuted}
              style={styles.emptyIconMargin}
            />
            <Text style={styles.emptyTitle}>
              {groupEventMode === 'event' ? 'No events yet' : 'No groups yet'}
            </Text>
            <Text style={styles.emptyDesc}>
              {groupEventMode === 'event'
                ? 'Create your first event to gather people'
                : 'Create your first group activity'}
            </Text>
            {isOwnProfile && (
              <TouchableOpacity style={styles.createBtn} onPress={handleNewEventGroup}>
                <Text style={styles.createBtnText}>
                  {groupEventMode === 'event' ? 'Create an Event' : 'Create a Group'}
                </Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.groupEventList}>
            {items.map((item) => {
              const isEvent = groupEventMode === 'event';
              const itemTitle = isEvent ? (item as typeof events[0]).title : (item as typeof groups[0]).name;
              return (
                <EventGroupCard
                  key={item.id}
                  type={groupEventMode}
                  id={item.id}
                  title={itemTitle}
                  location={item.address || ''}
                  coverImage={item.cover_image_url}
                  startDate={item.starts_at}
                  participantCount={item.current_participants}
                  maxParticipants={item.max_participants}
                  isOwner={isOwnProfile}
                  onPress={() => handleEventGroupCardPress(groupEventMode, item.id)}
                  onMenuPress={() => handleEventGroupMenuPress(groupEventMode, item.id)}
                />
              );
            })}
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
      return (
        <View style={styles.postsGrid}>
          {posts.map((post) => (
            <View key={post.id} style={styles.postCardWrapper}>
              {renderPostItem({ item: post })}
            </View>
          ))}
        </View>
      );
    }
    if (activeTab === 'peaks') {
      return renderPeaks();
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
    return (
      <View style={[styles.container, styles.loadingCenter]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={[styles.bioText, styles.loadingMargin]}>Loading profile...</Text>
      </View>
    );
  }

  // Note: We no longer show a hard error screen - instead, we show the profile
  // with whatever data we have (from profileData, storeUser, or defaults)
  // This ensures the user can always access their profile and settings

  // ==================== MAIN RENDER ====================
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* Settings Button - Fixed on top */}
      {isOwnProfile && (
        <TouchableOpacity
          style={[styles.settingsBtnFixed, { top: insets.top + 8 }]}
          onPress={() => navigation.navigate('Settings')}
          testID="settings-button"
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
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
        onClose={() => setShowImageSheet(false)}
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
        onClose={() => setMenuItem(null)}
        title={menuItem?.type === 'event' ? 'Event Options' : 'Group Options'}
        options={[
          {
            label: 'Edit',
            icon: 'create-outline',
            onPress: async () => handleEventGroupMenuAction('edit'),
          },
          {
            label: 'Delete',
            icon: 'trash-outline',
            onPress: async () => handleEventGroupMenuAction('delete'),
            destructive: true,
          },
        ]}
      />

      {/* Collection Menu Modal */}
      <Modal
        visible={collectionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCollectionMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.collectionMenuOverlay}
          activeOpacity={1}
          onPress={() => setCollectionMenuVisible(false)}
        >
          <View style={styles.collectionMenuContainer}>
            <TouchableOpacity style={styles.collectionMenuItem} onPress={handleRemoveFromCollection}>
              <Ionicons name="bookmark-outline" size={22} color={COLORS.dark} />
              <Text style={styles.collectionMenuText}>Remove from saved</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.collectionMenuItem, styles.collectionMenuItemLast]}
              onPress={() => setCollectionMenuVisible(false)}
            >
              <Ionicons name="close" size={22} color={COLORS.grayMuted} />
              <Text style={[styles.collectionMenuText, { color: COLORS.grayMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};


export default ProfileScreen;
