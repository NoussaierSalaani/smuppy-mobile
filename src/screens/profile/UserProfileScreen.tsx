import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { DARK_COLORS as COLORS } from '../../config/theme';
import { useProfile } from '../../hooks';

const { width } = Dimensions.get('window');
const HEADER_MAX_HEIGHT = 280;
const HEADER_MIN_HEIGHT = 100;
const HEADER_SCROLL_DISTANCE = HEADER_MAX_HEIGHT - HEADER_MIN_HEIGHT;
const CARD_WIDTH = (width - 48) / 2;

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
};

const MOCK_POSTS = [
  {
    id: '1',
    thumbnail: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?w=400',
    title: 'Epic Win Moment',
    duration: '0:34',
    likes: 1234,
    comments: 89,
    isVideo: true,
  },
  {
    id: '2',
    thumbnail: 'https://images.unsplash.com/photo-1493711662062-fa541f7f3d24?w=400',
    title: 'New Setup Tour',
    duration: '2:15',
    likes: 856,
    comments: 42,
    isVideo: true,
  },
  {
    id: '3',
    thumbnail: 'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?w=400',
    title: 'Start At Zero',
    duration: null,
    likes: 2341,
    comments: 156,
    isVideo: false,
  },
  {
    id: '4',
    thumbnail: 'https://images.unsplash.com/photo-1552820728-8b83bb6b2b0a?w=400',
    title: 'Gaming Highlights',
    duration: '1:20',
    likes: 567,
    comments: 23,
    isVideo: true,
  },
];

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
    const data = profileData || {};
    return {
      id: data.id || userId || DEFAULT_PROFILE.id,
      username: data.username || DEFAULT_PROFILE.username,
      displayName: data.full_name || data.username || DEFAULT_PROFILE.displayName,
      avatar: data.avatar_url || DEFAULT_PROFILE.avatar,
      coverImage: data.cover_url || DEFAULT_PROFILE.coverImage,
      bio: data.bio || DEFAULT_PROFILE.bio,
      fanCount: data.fan_count ?? DEFAULT_PROFILE.fanCount,
      postCount: data.post_count ?? DEFAULT_PROFILE.postCount,
      isVerified: data.is_verified ?? DEFAULT_PROFILE.isVerified,
    };
  }, [profileData, userId]);
  
  // États
  const [isFan, setIsFan] = useState(false);
  const [fanToggleCount, setFanToggleCount] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockEndDate, setBlockEndDate] = useState(null);
  const [showUnfanModal, setShowUnfanModal] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showFanRequiredModal, setShowFanRequiredModal] = useState(false);
  
  // Animation scroll
  const scrollY = useRef(new Animated.Value(0)).current;
  
  // Interpolations pour header compact
  const headerHeight = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE],
    outputRange: [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
    extrapolate: 'clamp',
  });
  
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE / 2, HEADER_SCROLL_DISTANCE],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });
  
  const compactHeaderOpacity = scrollY.interpolate({
    inputRange: [0, HEADER_SCROLL_DISTANCE / 2, HEADER_SCROLL_DISTANCE],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  // Gestion du bouton Fan
  const handleFanPress = () => {
    if (isBlocked) {
      setShowBlockedModal(true);
      return;
    }
    
    if (isFan) {
      setShowUnfanModal(true);
    } else {
      becomeFan();
    }
  };
  
  const becomeFan = () => {
    const newCount = fanToggleCount + 1;
    setFanToggleCount(newCount);
    
    if (newCount > 2) {
      // Bloquer pour 7 jours
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      setBlockEndDate(endDate);
      setIsBlocked(true);
      setShowBlockedModal(true);
    } else {
      setIsFan(true);
    }
  };
  
  const confirmUnfan = () => {
    setShowUnfanModal(false);
    setIsFan(false);
    
    const newCount = fanToggleCount + 1;
    setFanToggleCount(newCount);
    
    if (newCount > 2) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 7);
      setBlockEndDate(endDate);
      setIsBlocked(true);
      setTimeout(() => setShowBlockedModal(true), 300);
    }
  };
  
  const handleMessagePress = () => {
    if (isFan) {
      const conversation = {
        id: `conv_${profile.id}`,
        user: {
          id: profile.id,
          name: profile.displayName,
          avatar: profile.avatar,
          isVerified: profile.isVerified || false,
          isOnline: true,
        },
      };
      (navigation as any).navigate('Chat', { conversation });
    }
  };

  // ✅ CORRIGÉ - Gestion des commentaires avec bonne route
  const handleCommentPress = (postId: string) => {
    if (!isFan && !isOwnProfile) {
      setShowFanRequiredModal(true);
    } else {
      (navigation as any).navigate('PostDetailFanFeed', { postId });
    }
  };
  
  // Formater la date de déblocage
  const formatBlockDate = () => {
    if (!blockEndDate) return '';
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return blockEndDate.toLocaleDateString('en-US', options);
  };

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

  // ✅ CORRIGÉ - Render Post Card avec bonne route
  const renderPostCard = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.postCard}
      activeOpacity={0.8}
      onPress={() => (navigation as any).navigate('PostDetailFanFeed', { postId: item.id })}
    >
      <View style={styles.thumbnailContainer}>
        <OptimizedImage source={item.thumbnail} style={styles.thumbnail} />
        {item.isVideo && item.duration && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{item.duration}</Text>
          </View>
        )}
      </View>
      <View style={styles.postInfo}>
        <Text style={styles.postTitle} numberOfLines={1}>{item.title}</Text>
        <View style={styles.postStats}>
          <View style={styles.statItem}>
            <Text style={styles.statIcon}>❤️</Text>
            <Text style={styles.statText}>{item.likes}</Text>
          </View>
          <TouchableOpacity 
            style={styles.statItem}
            onPress={() => handleCommentPress(item.id)}
          >
            <Text style={styles.statIcon}>💬</Text>
            <Text style={styles.statText}>{item.comments}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  // Render Empty State
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.emptyTitle}>No posts to see</Text>
      <Text style={styles.emptySubtitle}>
        This user hasn't shared any content yet
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />
      
      {/* Header Compact (visible après scroll) */}
      <Animated.View style={[styles.compactHeader, { opacity: compactHeaderOpacity }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        
        <View style={styles.compactInfo}>
          <AvatarImage source={profile.avatar} size={32} />
          <Text style={styles.compactStats}>
            {profile.fanCount} Fan · {profile.postCount} Post
          </Text>
        </View>
        
        <View style={styles.compactActions}>
          <TouchableOpacity 
            style={[styles.compactFanBtn, isFan && styles.compactFanBtnActive]}
            onPress={handleFanPress}
          >
            <Text style={[styles.compactFanText, isFan && styles.compactFanTextActive]}>
              {isFan ? '✓ Fan' : '+ Become a fan'}
            </Text>
          </TouchableOpacity>
          
          {isFan && (
            <TouchableOpacity style={styles.compactMsgBtn} onPress={handleMessagePress}>
              <Text style={styles.msgIcon}>💬</Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={styles.menuBtn}
            onPress={() => setShowMenuModal(true)}
          >
            <Text style={styles.menuIcon}>⋯</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.ScrollView
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Header Normal */}
        <Animated.View style={[styles.header, { height: headerHeight, opacity: headerOpacity }]}>
          {/* Cover Image */}
          <OptimizedImage source={profile.coverImage} style={styles.coverImage} />
          <View style={styles.coverOverlay} />
          
          {/* Top Navigation */}
          <View style={styles.topNav}>
            <TouchableOpacity 
              style={styles.navButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.navIcon}>←</Text>
            </TouchableOpacity>
            
            <View style={styles.topNavRight}>
              {!isOwnProfile && (
                <TouchableOpacity 
                  style={styles.navButton}
                  onPress={() => setShowMenuModal(true)}
                >
                  <Text style={styles.navIcon}>⋯</Text>
                </TouchableOpacity>
              )}
              {isOwnProfile && (
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => (navigation as any).navigate('Settings')}
                >
                  <Text style={styles.navIcon}>⚙️</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          
          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <AvatarImage source={profile.avatar} size={80} style={styles.avatar} />
            
            <View style={styles.userInfo}>
              <Text style={styles.displayName}>{profile.displayName}</Text>
              <Text style={styles.username}>@{profile.username}</Text>
              
              <View style={styles.statsRow}>
                <Text style={styles.statsText}>
                  <Text style={styles.statsNumber}>{profile.fanCount}</Text> Fan
                </Text>
                <Text style={styles.statsDot}>·</Text>
                <Text style={styles.statsText}>
                  <Text style={styles.statsNumber}>{profile.postCount}</Text> Post
                </Text>
              </View>
            </View>
          </View>
        </Animated.View>
        
        {/* Bio Section */}
        <View style={styles.bioSection}>
          {profile.bio ? (
            <Text style={styles.bioText}>{profile.bio}</Text>
          ) : isOwnProfile ? (
            <TouchableOpacity style={styles.addBioBtn}>
              <Text style={styles.addBioText}>+ Add Bio</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        
        {/* Action Buttons (profil autre user) */}
        {!isOwnProfile && (
          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.fanButton, isFan && styles.fanButtonActive]}
              onPress={handleFanPress}
            >
              <Text style={[styles.fanButtonText, isFan && styles.fanButtonTextActive]}>
                {isFan ? '✓ Fan' : '+ Become a fan'}
              </Text>
            </TouchableOpacity>
            
            {isFan && (
              <TouchableOpacity style={styles.messageButton} onPress={handleMessagePress}>
                <Text style={styles.messageIcon}>💬</Text>
                <Text style={styles.messageText}>Message</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {/* Posts Section */}
        <View style={styles.postsSection}>
          <Text style={styles.sectionTitle}>Posts</Text>
          
          {MOCK_POSTS.length > 0 ? (
            <View style={styles.postsGrid}>
              {MOCK_POSTS.map((post) => (
                <View key={post.id} style={styles.postCardWrapper}>
                  {renderPostCard({ item: post })}
                </View>
              ))}
            </View>
          ) : (
            renderEmptyState()
          )}
        </View>
      </Animated.ScrollView>

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
                <Text style={styles.modalBtnConfirmText}>Unfollow</Text>
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
            
            <TouchableOpacity style={styles.menuItem}>
              <Text style={styles.menuItemIcon}>🔗</Text>
              <Text style={styles.menuItemText}>Share Profile</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem}>
              <Text style={styles.menuItemIcon}>🚩</Text>
              <Text style={styles.menuItemText}>Report</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]}>
              <Text style={styles.menuItemIcon}>🚫</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkBg,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  
  // Header Compact
  compactHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    backgroundColor: COLORS.darkBg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 100,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 20,
    color: COLORS.textPrimary,
  },
  compactInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  compactAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  compactStats: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  compactActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactFanBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryGreen,
  },
  compactFanBtnActive: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.primaryGreen,
  },
  compactFanText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },
  compactFanTextActive: {
    color: COLORS.darkBg,
  },
  compactMsgBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  msgIcon: {
    fontSize: 16,
  },
  menuBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuIcon: {
    fontSize: 18,
    color: COLORS.textPrimary,
  },
  
  // Header Normal
  header: {
    overflow: 'hidden',
  },
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    resizeMode: 'cover',
  },
  coverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(13, 13, 13, 0.6)',
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(26, 26, 26, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navIcon: {
    fontSize: 18,
    color: COLORS.textPrimary,
  },
  topNavRight: {
    flexDirection: 'row',
    gap: 8,
  },
  profileInfo: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: COLORS.primaryGreen,
  },
  userInfo: {
    marginLeft: 16,
    flex: 1,
  },
  displayName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  username: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  statsText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  statsNumber: {
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  statsDot: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginHorizontal: 6,
  },
  
  // Bio Section
  bioSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  bioText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  addBioBtn: {
    paddingVertical: 8,
  },
  addBioText: {
    fontSize: 14,
    color: COLORS.primaryGreen,
    fontWeight: '500',
  },
  
  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  fanButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.primaryGreen,
    alignItems: 'center',
  },
  fanButtonActive: {
    backgroundColor: COLORS.primaryGreen,
  },
  fanButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },
  fanButtonTextActive: {
    color: COLORS.darkBg,
  },
  messageButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  messageIcon: {
    fontSize: 16,
  },
  messageText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  
  // Posts Section
  postsSection: {
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  postCardWrapper: {
    width: CARD_WIDTH,
  },
  postCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    position: 'relative',
    aspectRatio: 1,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  postInfo: {
    padding: 10,
  },
  postTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  postStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statIcon: {
    fontSize: 12,
  },
  statText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: COLORS.cardBg,
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
    color: COLORS.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    color: COLORS.textMuted,
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
    backgroundColor: COLORS.border,
    alignItems: 'center',
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalBtnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primaryGreen,
    alignItems: 'center',
  },
  modalBtnConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.darkBg,
  },
  modalBtnSingle: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.primaryGreen,
    alignItems: 'center',
  },
  modalBtnSingleText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.darkBg,
  },
  
  // Menu Modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  menuContent: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  menuHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
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
  menuItemIcon: {
    fontSize: 20,
  },
  menuItemText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  menuItemDanger: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    marginTop: 8,
    paddingTop: 24,
  },
  menuItemTextDanger: {
    color: COLORS.error,
  },
  menuCancel: {
    marginTop: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    alignItems: 'center',
  },
  menuCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
});

export default UserProfileScreen;
