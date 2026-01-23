import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, GRADIENTS } from '../../config/theme';
import { useUser } from '../../context/UserContext';
import { useCurrentProfile, useUserPosts, useSavedPosts } from '../../hooks';
import { AccountBadge, PremiumBadge } from '../../components/Badge';
import SmuppyActionSheet from '../../components/SmuppyActionSheet';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_HEIGHT = 282;
const AVATAR_SIZE = 96;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 48) / 2;

// Type for profile data from various sources
interface ProfileDataSource {
  id?: string | null;
  full_name?: string;
  display_name?: string;
  name?: string;
  fullName?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  username?: string;
  avatar_url?: string;
  avatar?: string;
  cover_url?: string;
  coverImage?: string;
  bio?: string;
  location?: string;
  businessAddress?: string;
  account_type?: string;
  accountType?: string;
  interests?: string[];
  expertise?: string[];
  website?: string;
  social_links?: Record<string, string>;
  socialLinks?: Record<string, string>;
  business_name?: string;
  businessName?: string;
  business_category?: string;
  businessCategory?: string;
  is_verified?: boolean;
  isVerified?: boolean;
  is_premium?: boolean;
  isPremium?: boolean;
  fan_count?: number;
  fans?: number;
  post_count?: number;
  posts?: number;
  stats?: { fans?: number; posts?: number };
}

// Initial empty user (filled from auth/context)
const INITIAL_USER = {
  id: null,
  displayName: '',
  username: '',
  avatar: null,
  coverImage: null,
  bio: '',
  location: '',
  accountType: 'personal',
  interests: [],
  expertise: [],
  website: '',
  socialLinks: {},
  businessName: '',
  businessCategory: '',
  isVerified: false,
  isPremium: false,
  stats: {
    fans: 0,
    posts: 0,
  },
};

const BIO_MAX_LINES = 2;
const BIO_EXPANDED_MAX_LINES = 6;

// Mock data for posts
const MOCK_POSTS = [
  {
    id: 'post-1',
    content: 'Amazing training session today! 💪 #fitness #workout',
    media_urls: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400'],
    media_type: 'image',
    likes_count: 124,
    created_at: new Date().toISOString(),
  },
  {
    id: 'post-2',
    content: 'New personal record on the track 🏃‍♂️',
    media_urls: ['https://images.unsplash.com/photo-1461896836934- voices?w=400'],
    media_type: 'video',
    likes_count: 89,
    created_at: new Date().toISOString(),
  },
  {
    id: 'post-3',
    content: 'Sunday morning yoga vibes 🧘‍♀️',
    media_urls: ['https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400'],
    media_type: 'image',
    likes_count: 256,
    created_at: new Date().toISOString(),
  },
  {
    id: 'post-4',
    content: 'Team practice was intense today!',
    media_urls: ['https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400'],
    media_type: 'image',
    likes_count: 67,
    created_at: new Date().toISOString(),
  },
];

// Mock data for peaks
const MOCK_PEAKS = [
  {
    id: 'peak-1',
    content: 'Behind the scenes 🎬',
    media_urls: ['https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400'],
    peak_duration: 15,
    is_peak: true,
  },
  {
    id: 'peak-2',
    content: 'Quick workout tip',
    media_urls: ['https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400'],
    peak_duration: 10,
    is_peak: true,
  },
  {
    id: 'peak-3',
    content: 'Match highlights ⚽',
    media_urls: ['https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400'],
    peak_duration: 15,
    is_peak: true,
  },
  {
    id: 'peak-4',
    content: 'Morning routine',
    media_urls: ['https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400'],
    peak_duration: 12,
    is_peak: true,
  },
  {
    id: 'peak-5',
    content: 'Training day',
    media_urls: ['https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400'],
    peak_duration: 8,
    is_peak: true,
  },
  {
    id: 'peak-6',
    content: 'Recovery session',
    media_urls: ['https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400'],
    peak_duration: 15,
    is_peak: true,
  },
];

// Mock data for collections (saved posts)
const MOCK_COLLECTIONS = [
  {
    id: 'saved-1',
    media_urls: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400'],
    media_type: 'image',
    author: { full_name: 'Coach Mike', avatar_url: 'https://randomuser.me/api/portraits/men/32.jpg' },
  },
  {
    id: 'saved-2',
    media_urls: ['https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400'],
    media_type: 'video',
    author: { full_name: 'Sarah Sports', avatar_url: 'https://randomuser.me/api/portraits/women/44.jpg' },
  },
  {
    id: 'saved-3',
    media_urls: ['https://images.unsplash.com/photo-1518459031867-a89b944bffe4?w=400'],
    media_type: 'image',
    author: { full_name: 'FitLife', avatar_url: 'https://randomuser.me/api/portraits/men/22.jpg' },
  },
  {
    id: 'saved-4',
    media_urls: ['https://images.unsplash.com/photo-1594737625785-a6cbdabd333c?w=400'],
    media_type: 'image',
    author: { full_name: 'Yoga Master', avatar_url: 'https://randomuser.me/api/portraits/women/65.jpg' },
  },
];

const ProfileScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user: contextUser } = useUser();
  const { data: profileData, isLoading: isProfileLoading, refetch: refetchProfile } = useCurrentProfile();
  const [activeTab, setActiveTab] = useState('posts');
  const [refreshing, setRefreshing] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  // User state
  const [user, setUser] = useState(INITIAL_USER);

  // Get user's posts from database
  const userId = profileData?.id || contextUser?.id;
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
    return realPosts.length > 0 ? realPosts : MOCK_POSTS;
  }, [allUserPosts]);

  const peaks = useMemo(() => {
    const realPeaks = allUserPosts.filter(post => post.is_peak && post.save_to_profile !== false);
    return realPeaks.length > 0 ? realPeaks : MOCK_PEAKS;
  }, [allUserPosts]);

  // Get saved posts (collections) - only for own profile
  const {
    data: savedPostsData,
    refetch: refetchSavedPosts,
  } = useSavedPosts();

  const collections = useMemo(() => {
    if (!savedPostsData?.pages) return MOCK_COLLECTIONS;
    const realCollections = savedPostsData.pages.flatMap(page => page.posts);
    return realCollections.length > 0 ? realCollections : MOCK_COLLECTIONS;
  }, [savedPostsData]);

  // Check if user has peaks (for avatar border indicator)
  const hasPeaks = peaks.length > 0;

  // Modal states
  const [showQRModal, setShowQRModal] = useState(false);
  const [showImageSheet, setShowImageSheet] = useState(false);
  const [imageSheetType, setImageSheetType] = useState<'avatar' | 'cover'>('avatar');

  const isOwnProfile = route?.params?.userId === undefined;

  const resolvedProfile = useMemo(() => {
    const base: ProfileDataSource = profileData || {};
    // Always use contextUser as fallback, don't require contextMatchesProfile
    const fallback: ProfileDataSource = contextUser || {};

    // Helper to check if a name looks like an email-derived username
    const isEmailDerivedName = (name: string | undefined | null): boolean => {
      if (!name) return true;
      // Check if name contains dots (like email prefix) or matches email pattern start
      const email = fallback.email || base.email || '';
      const emailPrefix = email?.split('@')[0]?.toLowerCase() || '';
      return name.toLowerCase() === emailPrefix.toLowerCase() ||
             name.toLowerCase().replace(/[^a-z0-9]/g, '') === emailPrefix.replace(/[^a-z0-9]/g, '');
    };

    // Build display name, preferring actual names over email-derived ones
    // Priority: contextUser.fullName (from onboarding) > DB full_name > other sources
    let displayName = 'User';

    // First check contextUser.fullName - this is set during onboarding with the actual name
    if (fallback.fullName && !isEmailDerivedName(fallback.fullName)) {
      displayName = fallback.fullName;
    } else if (base.full_name && !isEmailDerivedName(base.full_name)) {
      displayName = base.full_name;
    } else if (base.display_name) {
      displayName = base.display_name;
    } else if (fallback.displayName) {
      displayName = fallback.displayName;
    } else if (fallback.firstName && fallback.lastName) {
      displayName = `${fallback.firstName} ${fallback.lastName}`.trim();
    } else if (base.full_name) {
      displayName = base.full_name;
    } else if (fallback.fullName) {
      displayName = fallback.fullName;
    }

    return {
      id: base.id || fallback.id || INITIAL_USER.id,
      displayName,
      username: base.username || fallback.username || '',
      avatar: base.avatar_url || fallback.avatar || INITIAL_USER.avatar,
      coverImage: base.cover_url || fallback.coverImage || INITIAL_USER.coverImage,
      bio: base.bio || fallback.bio || INITIAL_USER.bio,
      location: base.location || fallback.location || fallback.businessAddress || INITIAL_USER.location,
      accountType: base.account_type || fallback.accountType || 'personal',
      interests: base.interests || fallback.interests || [],
      expertise: base.expertise || fallback.expertise || [],
      website: base.website || fallback.website || '',
      socialLinks: base.social_links || fallback.socialLinks || {},
      businessName: base.business_name || fallback.businessName || '',
      businessCategory: base.business_category || fallback.businessCategory || '',
      isVerified: base.is_verified ?? fallback.isVerified ?? INITIAL_USER.isVerified,
      isPremium: base.is_premium ?? fallback.isPremium ?? INITIAL_USER.isPremium,
      stats: {
        fans: base.fan_count ?? base.fans ?? fallback.stats?.fans ?? INITIAL_USER.stats.fans,
        posts: base.post_count ?? base.posts ?? fallback.stats?.posts ?? INITIAL_USER.stats.posts,
      },
    };
  }, [profileData, contextUser]);

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
      await Promise.all([refetchProfile(), refetchPosts(), refetchSavedPosts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfile, refetchPosts, refetchSavedPosts]);

  // ==================== IMAGE PICKER ====================
  const showImageOptions = (type: 'avatar' | 'cover') => {
    setImageSheetType(type);
    setShowImageSheet(true);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required');
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
      Alert.alert('Permission needed', 'Photo library access is required');
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

  const updateImage = (type, uri) => {
    setUser(prev => ({
      ...prev,
      [type === 'avatar' ? 'avatar' : 'coverImage']: uri,
    }));
  };

  // ==================== BIO ====================
  // Render bio with clickable links (URLs, emails, phone numbers)
  const renderBioWithLinks = (text: string) => {
    if (!text) return null;

    // Regex patterns
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/g;
    const phoneRegex = /(\+?[\d\s\-().]{10,})/g;

    // Combined regex to split text
    const combinedRegex = /(https?:\/\/[^\s]+|[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+|\+?[\d\s\-().]{10,})/g;

    const parts = text.split(combinedRegex);
    const matches = text.match(combinedRegex) || [];

    const elements: React.ReactNode[] = [];
    let matchIndex = 0;

    parts.forEach((part, index) => {
      if (part) {
        // Check if this part is a link
        if (urlRegex.test(part)) {
          elements.push(
            <Text
              key={`link-${index}`}
              style={styles.bioLink}
              onPress={() => Linking.openURL(part)}
            >
              {part}
            </Text>
          );
        } else if (emailRegex.test(part)) {
          elements.push(
            <Text
              key={`email-${index}`}
              style={styles.bioLink}
              onPress={() => Linking.openURL(`mailto:${part}`)}
            >
              {part}
            </Text>
          );
        } else if (phoneRegex.test(part) && part.replace(/\D/g, '').length >= 10) {
          elements.push(
            <Text
              key={`phone-${index}`}
              style={styles.bioLink}
              onPress={() => Linking.openURL(`tel:${part.replace(/\D/g, '')}`)}
            >
              {part}
            </Text>
          );
        } else {
          elements.push(<Text key={`text-${index}`}>{part}</Text>);
        }
      }
    });

    return <Text style={styles.bioText}>{elements}</Text>;
  };

  // ==================== COPY PROFILE LINK ====================
  const getProfileUrl = () => {
    const username = user.username || user.displayName.toLowerCase().replace(/\s+/g, '');
    return `https://smuppy.app/u/${username}`;
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(getProfileUrl());
      Alert.alert('Copied!', 'Profile link copied to clipboard');
    } catch (error) {
      Alert.alert('Error', 'Failed to copy link');
    }
  };

  // ==================== FANS ====================
  const handleFansPress = () => {
    navigation.navigate('FansList', { fansCount: user.stats.fans });
  };

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

      {/* Settings Button */}
      {isOwnProfile && (
        <TouchableOpacity
          style={[styles.settingsBtn, { top: insets.top + 8 }]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Spacer for cover height */}
      <View style={styles.coverSpacer} />

      {/* Avatar & Stats Row */}
      <View style={styles.avatarRow}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => isOwnProfile && showImageOptions('avatar')}
        >
          {/* Peaks indicator - gradient border around avatar */}
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
        </TouchableOpacity>

        {/* Stats - Glassmorphism Style */}
        <View style={styles.statsGlass}>
          <BlurView intensity={80} tint="light" style={styles.statsBlurContainer}>
            <TouchableOpacity style={styles.statGlassItem} onPress={handleFansPress}>
              <Text style={styles.statGlassValue}>{user.stats.fans || 128}</Text>
              <Text style={styles.statGlassLabel}>Fans</Text>
            </TouchableOpacity>
            <View style={styles.statGlassDivider} />
            <View style={styles.statGlassItem}>
              <Text style={styles.statGlassValue}>{user.stats.posts || 24}</Text>
              <Text style={styles.statGlassLabel}>Posts</Text>
            </View>
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
            accountType={user.accountType as 'personal' | 'pro_creator' | 'pro_local'}
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
          onPress={() => navigation.navigate('Settings', { screen: 'EditProfil' })}
        >
          <Ionicons name="add" size={16} color="#0EBF8A" />
          <Text style={styles.addBioText}>Add Bio</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  // ==================== RENDER TABS ====================
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

  // ==================== RENDER EMPTY STATE ====================
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="images-outline" size={48} color={COLORS.grayMuted} style={{ marginBottom: 16 }} />
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
  const renderPostItem = useCallback(({ item: post }) => {
    const thumbnail = post.media_urls?.[0] || null;
    const isVideo = post.media_type === 'video' || post.media_type === 'multiple';

    return (
      <TouchableOpacity
        style={styles.postCard}
        onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.postThumb} />
        ) : (
          <View style={[styles.postThumb, { backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center' }]}>
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

  const keyExtractor = useCallback((item) => item.id, []);

  // ==================== RENDER PEAK ITEM ====================
  const renderPeakItem = useCallback((peak) => {
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
          <View style={[styles.peakThumb, { backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center' }]}>
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
          {isOwnProfile && peak.tags_count > 0 && (
            <View style={styles.peakStat}>
              <Ionicons name="pricetag" size={10} color={COLORS.primary} />
              <Text style={[styles.peakStatText, { color: COLORS.primary }]}>{peak.tags_count}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [navigation]);

  // ==================== RENDER PEAKS ====================
  const renderPeaks = () => {
    if (peaks.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="videocam-outline" size={48} color={COLORS.grayMuted} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>No peaks yet</Text>
          <Text style={styles.emptyDesc}>
            Share your best moments as Peaks
          </Text>
          {isOwnProfile && (
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
  const renderCollectionItem = useCallback((post) => {
    const thumbnail = post.media_urls?.[0] || null;
    const isVideo = post.media_type === 'video';

    return (
      <TouchableOpacity
        key={post.id}
        style={styles.collectionCard}
        onPress={() => navigation.navigate('PostDetail', { postId: post.id })}
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.collectionThumb} />
        ) : (
          <View style={[styles.collectionThumb, { backgroundColor: '#2C2C2E', justifyContent: 'center', alignItems: 'center' }]}>
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
        <TouchableOpacity style={styles.collectionMenu}>
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
          <Ionicons name="lock-closed-outline" size={48} color={COLORS.grayMuted} style={{ marginBottom: 16 }} />
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
          <Ionicons name="bookmark-outline" size={48} color={COLORS.grayMuted} style={{ marginBottom: 16 }} />
          <Text style={styles.emptyTitle}>No collections yet</Text>
          <Text style={styles.emptyDesc}>
            Save posts to find them easily later
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.collectionsGrid}>
        {collections.map(renderCollectionItem)}
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
    if (activeTab === 'collections') {
      return renderCollections();
    }
    return null;
  };

  // ==================== EARLY RETURNS (after all hooks) ====================
  // Show loading only on initial load when we have no data at all
  if (isProfileLoading && !profileData && !user.displayName) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={[styles.bioText, { marginTop: 12 }]}>Loading profile...</Text>
      </View>
    );
  }

  // Note: We no longer show a hard error screen - instead, we show the profile
  // with whatever data we have (from profileData, contextUser, or defaults)
  // This ensures the user can always access their profile and settings

  // ==================== MAIN RENDER ====================
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
  coverTouchable: {
    width: '100%',
    height: '100%',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E8E8E8',
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
  settingsBtn: {
    position: 'absolute',
    right: 16,
    padding: 8,
    zIndex: 10,
    // Shadow pour visibilité sur la cover photo
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
  // Avatar with peaks indicator (gradient border)
  avatarGradientBorder: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    padding: 3,
  },
  avatarInnerBorder: {
    width: '100%',
    height: '100%',
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#FFFFFF',
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarWithPeaks: {
    width: AVATAR_SIZE - 8,
    height: AVATAR_SIZE - 8,
    borderRadius: (AVATAR_SIZE - 8) / 2,
  },
  avatarEmptyWithPeaks: {
    width: AVATAR_SIZE - 8,
    height: AVATAR_SIZE - 8,
    borderRadius: (AVATAR_SIZE - 8) / 2,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  displayName: {
    fontFamily: 'WorkSans-SemiBold',
    fontSize: 20,
    color: '#0A252F',
    letterSpacing: -0.2,
  },
  badge: {
    marginLeft: 6,
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ===== BIO =====
  addBioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 20,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#0EBF8A',
    gap: 5,
  },
  addBioText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0EBF8A',
  },
  bioSection: {
    paddingHorizontal: 20,
    marginTop: 2,
    zIndex: 2,
  },
  bioText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#0A252F',
    lineHeight: 18,
  },
  bioLink: {
    color: '#0EBF8A',
    textDecorationLine: 'underline',
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  locationPin: {
    fontSize: 11,
    marginRight: 3,
  },
  locationText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#8E8E93',
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

  // ===== EMPTY STATE =====
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
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  createBtnText: {
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

  // ===== POSTS GRID (Simple style like old collections) =====
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  postCardWrapper: {
    width: (SCREEN_WIDTH - 48) / 3,
  },
  postCard: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  postThumb: {
    width: '100%',
    height: '100%',
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
  postStatsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  postStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  postStatText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  listContent: {
    paddingBottom: 20,
  },
  authorName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '400',
    color: '#8E8E93',
  },
  likes: {
    fontSize: 11,
    fontWeight: '400',
    color: '#8E8E93',
    marginLeft: 2,
  },

  // ===== PEAKS GRID (with stats) =====
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

  // ===== COLLECTIONS GRID (Detailed card style like old posts) =====
  collectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  collectionCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  collectionThumb: {
    width: '100%',
    height: 120,
  },
  collectionPlayIcon: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionSaveIcon: {
    position: 'absolute',
    top: 8,
    right: 36,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 191, 138, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionMenu: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionInfo: {
    padding: 10,
  },
  collectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0A0A0F',
    lineHeight: 18,
    marginBottom: 8,
  },
  collectionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionAuthorName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '400',
    color: '#8E8E93',
  },
  collectionLikes: {
    fontSize: 11,
    fontWeight: '400',
    color: '#8E8E93',
    marginLeft: 2,
  },

  // ===== QR MODAL =====
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrModalContent: {
    alignItems: 'center',
    padding: 30,
  },
  qrCloseBtn: {
    position: 'absolute',
    top: -60,
    right: 0,
    padding: 10,
  },
  qrContainer: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  qrCode: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrUsername: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  qrHint: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 24,
  },
  profileLinkContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    maxWidth: 280,
  },
  profileLinkText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  qrCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  qrCopyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ===== FAN BUTTON (for error state) =====
  fanButton: {
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
  },
  fanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ProfileScreen;
