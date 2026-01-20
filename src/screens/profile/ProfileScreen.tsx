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
  Share,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { DARK_COLORS as COLORS } from '../../config/theme';
import { useUser } from '../../context/UserContext';
import { useCurrentProfile } from '../../hooks';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COVER_HEIGHT = 260;
const AVATAR_SIZE = 90;
const GRID_ITEM_WIDTH = (SCREEN_WIDTH - 48) / 2;

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
  const { data: profileData, isLoading: isProfileLoading, isError: profileError } = useCurrentProfile();
  const [activeTab, setActiveTab] = useState('posts');
  const [refreshing, setRefreshing] = useState(false);
  
  // User state
  const [user, setUser] = useState(INITIAL_USER);
  const [posts, setPosts] = useState([]); // Empty for new account
  const [peaks, setPeaks] = useState([]); // Empty for new account

  // Modal states
  const [showBioModal, setShowBioModal] = useState(false);
  const [bioText, setBioText] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  
  const isOwnProfile = route?.params?.userId === undefined;

  const resolvedProfile = useMemo(() => {
    const base = profileData || {};
    // Always use contextUser as fallback, don't require contextMatchesProfile
    const fallback = contextUser || {};

    // Build display name from available sources
    const displayName =
      base.full_name ||
      base.display_name ||
      base.name ||
      fallback.fullName ||
      fallback.displayName ||
      (fallback.firstName && fallback.lastName
        ? `${fallback.firstName} ${fallback.lastName}`.trim()
        : null) ||
      fallback.email ||
      'User';

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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1500);
  }, []);

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

  // ==================== SHARE ====================
  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${user.displayName}'s profile on Smuppy! https://smuppy.com/@${user.displayName.toLowerCase().replace(' ', '')}`,
        title: 'Share Profile',
      });
    } catch (error) {
      // Share error handled silently
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
              <Ionicons name="settings-outline" size={22} color="#FFF" />
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
        <View style={styles.actionBtns}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setShowQRModal(true)}>
            <Ionicons name="qr-code-outline" size={20} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#FFF" />
          </TouchableOpacity>
        </View>
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
  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <TouchableOpacity
        style={styles.tab}
        onPress={() => setActiveTab('posts')}
      >
        <Text style={[styles.tabText, activeTab === 'posts' && styles.tabTextActive]}>
          Posts
        </Text>
        {activeTab === 'posts' && <View style={styles.tabIndicator} />}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.tab}
        onPress={() => setActiveTab('peaks')}
      >
        <Text style={[styles.tabText, activeTab === 'peaks' && styles.tabTextActive]}>
          Peaks
        </Text>
        {activeTab === 'peaks' && <View style={styles.tabIndicator} />}
      </TouchableOpacity>
    </View>
  );

  // ==================== RENDER EMPTY STATE ====================
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyTitle}>No posts</Text>
      <Text style={styles.emptyDesc}>
        You're one click away from your{'\n'}first post
      </Text>
      {isOwnProfile && (
        <TouchableOpacity 
          style={styles.createBtn}
          onPress={() => navigation.navigate('CreatePost')}
        >
          <Text style={styles.createBtnText}>Create a post</Text>
          <Ionicons name="arrow-forward" size={16} color="#0A0A0F" />
        </TouchableOpacity>
      )}
    </View>
  );

  // ==================== RENDER POST ITEM ====================
  const renderPostItem = useCallback(({ item: post }) => (
    <TouchableOpacity style={styles.postCard}>
      <OptimizedImage source={post.thumbnail} style={styles.postThumb} />
      {post.duration && (
        <View style={styles.duration}>
          <Text style={styles.durationText}>{post.duration}</Text>
        </View>
      )}
      <TouchableOpacity style={styles.postMenu}>
        <Ionicons name="ellipsis-vertical" size={14} color="#FFF" />
      </TouchableOpacity>
      <View style={styles.postInfo}>
        <Text style={styles.postTitle} numberOfLines={2}>{post.title}</Text>
        <View style={styles.postMeta}>
          <AvatarImage source={post.authorAvatar} size={18} />
          <Text style={styles.authorName}>{post.author}</Text>
          <Ionicons name="heart" size={12} color="#FF6B6B" />
          <Text style={styles.likes}>{post.likes}</Text>
        </View>
      </View>
    </TouchableOpacity>
  ), []);

  const keyExtractor = useCallback((item) => item.id, []);

  // ==================== RENDER PEAKS ====================
  const renderPeaks = () => {
    if (peaks.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No peaks yet</Text>
          <Text style={styles.emptyDesc}>
            Share your best moments as Peaks
          </Text>
          {isOwnProfile && (
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => navigation.navigate('CreatePost', { isPeak: true })}
            >
              <Text style={styles.createBtnText}>Create a Peak</Text>
              <Ionicons name="arrow-forward" size={16} color="#0A0A0F" />
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return null;
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
          
          <TouchableOpacity style={styles.qrShareBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={20} color="#0A0A0F" />
            <Text style={styles.qrShareText}>Share Profile</Text>
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
      {activeTab === 'peaks' && renderPeaks()}
      {activeTab === 'posts' && posts.length === 0 && renderEmpty()}
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
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

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
    backgroundColor: '#0A0A0F',
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
    backgroundColor: '#1C1C1E',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT * 0.7,
  },
  settingsBtn: {
    position: 'absolute',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
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
    borderWidth: 3,
    borderColor: '#0A0A0F',
  },
  avatarEmpty: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#0A0A0F',
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
    fontFamily: 'WorkSans-Bold',
    color: '#0A0A0F',
  },
  badgeLabel: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: '#0A0A0F',
    opacity: 0.8,
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
    fontFamily: 'WorkSans-Bold',
    color: '#FFF',
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1C1C1E',
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
    fontFamily: 'Poppins-Medium',
    color: '#0EBF8A',
  },
  bioSection: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  bioText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#FFF',
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
    fontFamily: 'Poppins-Regular',
    color: '#8E8E93',
  },

  // ===== TABS =====
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  tab: {
    paddingVertical: 12,
    marginRight: 24,
    position: 'relative',
  },
  tabText: {
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
    color: '#6E6E73',
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
    backgroundColor: '#0EBF8A',
    borderRadius: 1,
  },

  // ===== EMPTY STATE =====
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'WorkSans-Bold',
    color: '#FFF',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
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
    fontFamily: 'Poppins-SemiBold',
    color: '#0A0A0F',
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
    backgroundColor: '#1C1C1E',
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
    fontFamily: 'Poppins-Medium',
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
    fontFamily: 'Poppins-SemiBold',
    color: '#FFF',
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
    fontFamily: 'Poppins-Regular',
    color: '#8E8E93',
  },
  likes: {
    fontSize: 11,
    fontFamily: 'Poppins-Regular',
    color: '#8E8E93',
    marginLeft: 2,
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
    fontFamily: 'WorkSans-SemiBold',
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
    fontFamily: 'Poppins-Medium',
    color: '#FFF',
  },
  bioInputWrap: {
    flex: 1,
    padding: 20,
  },
  bioInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Poppins-Regular',
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
  qrShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  qrShareText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0A0F',
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
    color: '#0A0A0F',
  },
});

export default ProfileScreen;
