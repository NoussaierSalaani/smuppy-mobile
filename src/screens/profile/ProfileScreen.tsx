import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Modal,
  TextInput,
  Alert,
  ActionSheetIOS,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, GRADIENTS } from '../../config/theme';
import { useUser } from '../../context/UserContext';
import { useCurrentProfile, useUserPosts, useSavedPosts } from '../../hooks';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_HEIGHT = 260;
const AVATAR_SIZE = 90;
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
  stats: {
    fans: 0,
    posts: 0,
  },
};

const ProfileScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { user: contextUser } = useUser();
  const { data: profileData, isLoading: isProfileLoading, refetch: refetchProfile } = useCurrentProfile();
  const [activeTab, setActiveTab] = useState('posts');
  const [refreshing, setRefreshing] = useState(false);

  // User state
  const [user, setUser] = useState(INITIAL_USER);

  // Get user's posts from database
  const userId = profileData?.id || contextUser?.id;
  const {
    data: userPostsData,
    isLoading: isPostsLoading,
    refetch: refetchPosts,
    fetchNextPage,
    hasNextPage,
  } = useUserPosts(userId);

  // Separate posts and peaks from the data
  const allUserPosts = useMemo(() => {
    if (!userPostsData?.pages) return [];
    return userPostsData.pages.flatMap(page => page.posts);
  }, [userPostsData]);

  // Filter: posts = not peaks, peaks = is_peak true
  const posts = useMemo(() =>
    allUserPosts.filter(post => !post.is_peak),
    [allUserPosts]
  );

  const peaks = useMemo(() =>
    allUserPosts.filter(post => post.is_peak && post.save_to_profile !== false),
    [allUserPosts]
  );

  // Get saved posts (collections) - only for own profile
  const {
    data: savedPostsData,
    refetch: refetchSavedPosts,
  } = useSavedPosts();

  const collections = useMemo(() => {
    if (!savedPostsData?.pages) return [];
    return savedPostsData.pages.flatMap(page => page.posts);
  }, [savedPostsData]);

  // Modal states
  const [showBioModal, setShowBioModal] = useState(false);
  const [bioText, setBioText] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  
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

  useEffect(() => {
    setBioText(resolvedProfile.bio || '');
  }, [resolvedProfile.bio]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchProfile(), refetchPosts(), refetchSavedPosts()]);
    } finally {
      setRefreshing(false);
    }
  }, [refetchProfile, refetchPosts, refetchSavedPosts]);

  // ==================== IMAGE PICKER ====================
  const showImageOptions = (type) => {
    const title = type === 'avatar' ? 'Profile Photo' : 'Cover Photo';
    const options = ['Take Photo', 'Choose from Library', 'Cancel'];
    
    if ((type === 'avatar' && user.avatar) || (type === 'cover' && user.coverImage)) {
      options.splice(2, 0, 'Remove Photo');
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title,
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: options.indexOf('Remove Photo'),
        },
        (index) => handleImageOption(index, type, options)
      );
    } else {
      Alert.alert(title, '', 
        options.map((opt, idx) => ({
          text: opt,
          style: opt === 'Remove Photo' ? 'destructive' : opt === 'Cancel' ? 'cancel' : 'default',
          onPress: () => handleImageOption(idx, type, options),
        }))
      );
    }
  };

  const handleImageOption = async (index, type, options) => {
    const option = options[index];
    
    if (option === 'Take Photo') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Camera access is required');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.8,
      });
      if (!result.canceled) {
        updateImage(type, result.assets[0].uri);
      }
    } else if (option === 'Choose from Library') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Photo library access is required');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [16, 9],
        quality: 0.8,
      });
      if (!result.canceled) {
        updateImage(type, result.assets[0].uri);
      }
    } else if (option === 'Remove Photo') {
      updateImage(type, null);
    }
  };

  const updateImage = (type, uri) => {
    setUser(prev => ({
      ...prev,
      [type === 'avatar' ? 'avatar' : 'coverImage']: uri,
    }));
  };

  // ==================== BIO ====================
  const saveBio = () => {
    setUser(prev => ({ ...prev, bio: bioText }));
    setShowBioModal(false);
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
      {/* Cover Image */}
      <TouchableOpacity 
        activeOpacity={0.95}
        onPress={() => isOwnProfile && showImageOptions('cover')}
      >
        <View style={styles.coverWrapper}>
          {user.coverImage ? (
            <OptimizedImage source={user.coverImage} style={styles.coverImage} />
          ) : (
            <View style={styles.coverPlaceholder} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(10, 10, 15, 0.95)']}
            style={styles.coverGradient}
          />
          
          {/* Settings Button */}
          {isOwnProfile && (
            <TouchableOpacity
              style={[styles.settingsBtn, { top: insets.top + 8 }]}
              onPress={() => navigation.navigate('Settings')}
            >
              <Ionicons name="settings-outline" size={22} color="#0A0A0F" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>

      {/* Avatar & Stats Row */}
      <View style={styles.avatarRow}>
        <TouchableOpacity 
          activeOpacity={0.9}
          onPress={() => isOwnProfile && showImageOptions('avatar')}
        >
          {user.avatar ? (
            <AvatarImage source={user.avatar} size={AVATAR_SIZE} style={styles.avatar} />
          ) : (
            <View style={styles.avatarEmpty}>
              <Ionicons name="person" size={36} color="#6E6E73" />
            </View>
          )}
        </TouchableOpacity>

        {/* Stats Badges */}
        <View style={styles.statsBadges}>
          <TouchableOpacity style={styles.badge} onPress={handleFansPress}>
            <Ionicons name="people" size={14} color="#0A0A0F" />
            <Text style={styles.badgeValue}>{user.stats.fans}</Text>
            <Text style={styles.badgeLabel}>Fan</Text>
          </TouchableOpacity>
          <View style={styles.badge}>
            <Ionicons name="albums-outline" size={14} color="#0A0A0F" />
            <Text style={styles.badgeValue}>{user.stats.posts}</Text>
            <Text style={styles.badgeLabel}>Post</Text>
          </View>
        </View>
      </View>

      {/* Name & Actions */}
      <View style={styles.nameRow}>
        <Text style={styles.displayName}>{user.displayName}</Text>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setShowQRModal(true)}>
          <Ionicons name="qr-code-outline" size={20} color="#0A0A0F" />
        </TouchableOpacity>
      </View>

      {/* Bio Section */}
      {user.bio ? (
        <TouchableOpacity 
          style={styles.bioSection}
          onPress={() => isOwnProfile && setShowBioModal(true)}
        >
          <Text style={styles.bioText}>{user.bio}</Text>
          {user.location ? (
            <View style={styles.locationRow}>
              <Text style={styles.locationPin}>📍</Text>
              <Text style={styles.locationText}>{user.location}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : isOwnProfile ? (
        <TouchableOpacity 
          style={styles.addBioBtn}
          onPress={() => setShowBioModal(true)}
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
      {TABS.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={styles.tab}
          onPress={() => setActiveTab(tab.key)}
        >
          <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
            {tab.label}
          </Text>
          {activeTab === tab.key && (
            <LinearGradient
              colors={GRADIENTS.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tabIndicator}
            />
          )}
        </TouchableOpacity>
      ))}
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

  // ==================== RENDER POST ITEM ====================
  const renderPostItem = useCallback(({ item: post }) => {
    // Get thumbnail (first media URL or placeholder)
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
            <Ionicons name="image-outline" size={32} color="#6E6E73" />
          </View>
        )}
        {isVideo && (
          <View style={styles.duration}>
            <Ionicons name="play" size={10} color="#FFF" />
          </View>
        )}
        <TouchableOpacity style={styles.postMenu}>
          <Ionicons name="ellipsis-vertical" size={14} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.postInfo}>
          <Text style={styles.postTitle} numberOfLines={2}>
            {post.content || 'No caption'}
          </Text>
          <View style={styles.postMeta}>
            <AvatarImage source={post.author?.avatar_url || user.avatar} size={18} />
            <Text style={styles.authorName}>{post.author?.full_name || user.displayName}</Text>
            <Ionicons name="heart" size={12} color="#FF6B6B" />
            <Text style={styles.likes}>{post.likes_count || 0}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [navigation, user.avatar, user.displayName]);

  const keyExtractor = useCallback((item) => item.id, []);

  // ==================== RENDER PEAK ITEM ====================
  const renderPeakItem = useCallback((peak) => {
    const thumbnail = peak.media_urls?.[0] || null;

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
        <View style={styles.peakOverlay}>
          <View style={styles.peakDuration}>
            <Text style={styles.peakDurationText}>{peak.peak_duration || 15}s</Text>
          </View>
          {peak.content && (
            <Text style={styles.peakCaption} numberOfLines={2}>{peak.content}</Text>
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

  // ==================== RENDER COLLECTION ITEM ====================
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
            <Ionicons name="image-outline" size={24} color="#6E6E73" />
          </View>
        )}
        {isVideo && (
          <View style={styles.collectionPlayIcon}>
            <Ionicons name="play" size={12} color="#FFF" />
          </View>
        )}
        <View style={styles.collectionSaveIcon}>
          <Ionicons name="bookmark" size={12} color="#FFF" />
        </View>
        {post.author && (
          <View style={styles.collectionAuthor}>
            <AvatarImage source={post.author.avatar_url} size={16} />
            <Text style={styles.collectionAuthorName} numberOfLines={1}>
              {post.author.full_name}
            </Text>
          </View>
        )}
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

  // ==================== BIO MODAL ====================
  const renderBioModal = () => (
    <Modal
      visible={showBioModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowBioModal(false)}
    >
      <View style={[styles.bioModal, { paddingTop: insets.top || 20 }]}>
        <View style={styles.bioModalHeader}>
          <TouchableOpacity onPress={() => setShowBioModal(false)}>
            <Ionicons name="arrow-back" size={24} color="#0A0A0F" />
          </TouchableOpacity>
          <Text style={styles.bioModalTitle}>Biographies</Text>
          <TouchableOpacity style={styles.saveBtn} onPress={saveBio}>
            <Ionicons name="bookmark-outline" size={16} color="#FFF" />
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.bioInputWrap}>
          <TextInput
            style={styles.bioInput}
            placeholder="Write a short biography about your background, hobbies, and interests"
            placeholderTextColor="#A0A0A0"
            multiline
            value={bioText}
            onChangeText={setBioText}
            maxLength={300}
            autoFocus
          />
        </View>
      </View>
    </Modal>
  );

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
          <Text style={styles.qrHint}>Scan to follow on Smuppy</Text>

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

  // ==================== LIST HEADER ====================
  const ListHeader = useMemo(() => (
    <>
      {renderHeader()}
      {renderTabs()}
      {activeTab === 'posts' && posts.length === 0 && renderEmpty()}
      {activeTab === 'peaks' && renderPeaks()}
      {activeTab === 'collections' && renderCollections()}
    </>
  ), [activeTab, posts.length, peaks.length, user, isOwnProfile]);

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

      <FlashList
        data={activeTab === 'posts' ? posts : []}
        renderItem={renderPostItem}
        keyExtractor={keyExtractor}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={<View style={{ height: 120 }} />}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      />

      {renderBioModal()}
      {renderQRModal()}
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
    paddingBottom: 16,
  },
  coverWrapper: {
    height: COVER_HEIGHT,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F5',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT * 0.5,
  },
  settingsBtn: {
    position: 'absolute',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  // ===== AVATAR ROW =====
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: -50,
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

  // ===== STATS BADGES =====
  statsBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 5,
  },
  badgeValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  badgeLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#FFFFFF',
    opacity: 0.9,
  },

  // ===== NAME ROW =====
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0A0A0F',
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
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
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#0EBF8A',
    gap: 6,
  },
  addBioText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0EBF8A',
  },
  bioSection: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  bioText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#0A0A0F',
    lineHeight: 21,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationPin: {
    fontSize: 12,
    marginRight: 4,
  },
  locationText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#8E8E93',
  },

  // ===== TABS =====
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    paddingVertical: 12,
    marginRight: 24,
    position: 'relative',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#8E8E93',
  },
  tabTextActive: {
    color: '#0EBF8A',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
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

  // ===== POSTS LIST =====
  listContent: {
    paddingBottom: 20,
  },
  postsRow: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  postCard: {
    width: GRID_ITEM_WIDTH,
    backgroundColor: '#F5F5F5',
    borderRadius: 14,
    overflow: 'hidden',
  },
  postThumb: {
    width: '100%',
    height: 130,
  },
  duration: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#FFF',
  },
  postMenu: {
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
  postInfo: {
    padding: 10,
  },
  postTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0A0A0F',
    lineHeight: 18,
    marginBottom: 8,
  },
  postMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorPic: {
    width: 18,
    height: 18,
    borderRadius: 9,
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

  // ===== PEAKS GRID =====
  peaksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  peakCard: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  peakThumb: {
    width: '100%',
    height: '100%',
  },
  peakOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  peakDuration: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  peakDurationText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },
  peakCaption: {
    fontSize: 11,
    fontWeight: '500',
    color: '#FFF',
    lineHeight: 14,
  },

  // ===== COLLECTIONS GRID =====
  collectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  collectionCard: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F5F5F5',
  },
  collectionThumb: {
    width: '100%',
    height: '100%',
  },
  collectionPlayIcon: {
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
  collectionSaveIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(14, 191, 138, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionAuthor: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 4,
  },
  collectionAuthorName: {
    flex: 1,
    fontSize: 10,
    fontWeight: '500',
    color: '#FFF',
  },

  // ===== BIO MODAL =====
  bioModal: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  bioModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  bioModalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#0A0A0F',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    gap: 5,
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFF',
  },
  bioInputWrap: {
    flex: 1,
    padding: 20,
  },
  bioInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
    color: '#0A0A0F',
    borderWidth: 1.5,
    borderColor: '#0EBF8A',
    borderRadius: 14,
    padding: 16,
    textAlignVertical: 'top',
    lineHeight: 22,
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
