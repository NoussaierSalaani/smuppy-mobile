import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Modal,
  Animated,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import { useTabBar } from '../../context/TabBarContext';
import { useContentStore } from '../../store/contentStore';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;
const PEAK_CARD_WIDTH = 100;
const PEAK_CARD_HEIGHT = 140;

// User interests (from onboarding)
const USER_INTERESTS = [
  { id: 1, name: 'Fitness', icon: 'fitness', active: true },
  { id: 2, name: 'Yoga', icon: 'body', active: false },
  { id: 3, name: 'Running', icon: 'walk', active: false },
  { id: 4, name: 'Nutrition', icon: 'nutrition', active: false },
  { id: 5, name: 'Camping', icon: 'bonfire', active: false },
  { id: 6, name: 'Swimming', icon: 'water', active: false },
];

// Mock Peaks data
const PEAKS_DATA = [
  {
    id: 'peak1',
    thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200',
    user: { id: 'u1', name: 'Sarah', avatar: 'https://i.pravatar.cc/100?img=1' },
    duration: 10,
    hasNew: true,
  },
  {
    id: 'peak2',
    thumbnail: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200',
    user: { id: 'u2', name: 'Mike', avatar: 'https://i.pravatar.cc/100?img=12' },
    duration: 6,
    hasNew: true,
  },
  {
    id: 'peak3',
    thumbnail: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=200',
    user: { id: 'u3', name: 'Emma', avatar: 'https://i.pravatar.cc/100?img=5' },
    duration: 15,
    hasNew: false,
  },
  {
    id: 'peak4',
    thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200',
    user: { id: 'u4', name: 'John', avatar: 'https://i.pravatar.cc/100?img=8' },
    duration: 10,
    hasNew: true,
  },
  {
    id: 'peak5',
    thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200',
    user: { id: 'u5', name: 'Lisa', avatar: 'https://i.pravatar.cc/100?img=9' },
    duration: 6,
    hasNew: false,
  },
];

// Sample vibes posts
const VIBES_POSTS = [
  { id: '1', type: 'image', media: 'https://picsum.photos/400/500?random=10', height: 220, user: { id: '1', name: 'Sarah Fit', avatar: 'https://i.pravatar.cc/100?img=1' }, title: 'Morning stretch routine', likes: 1234, category: 'Fitness' },
  { id: '2', type: 'video', media: 'https://picsum.photos/400/600?random=11', height: 280, duration: '2:34', user: { id: '2', name: 'YogaLife', avatar: 'https://i.pravatar.cc/100?img=5' }, title: 'Sunset yoga flow 🧘‍♀️', likes: 892, category: 'Yoga' },
  { id: '3', type: 'carousel', media: 'https://picsum.photos/400/400?random=12', height: 180, slideCount: 5, user: { id: '3', name: 'RunClub', avatar: 'https://i.pravatar.cc/100?img=8' }, title: 'Marathon prep tips', likes: 2341, category: 'Running' },
  { id: '4', type: 'image', media: 'https://picsum.photos/400/550?random=13', height: 250, user: { id: '4', name: 'HealthyEats', avatar: 'https://i.pravatar.cc/100?img=12' }, title: 'High protein meal prep', likes: 567, category: 'Nutrition' },
  { id: '5', type: 'video', media: 'https://picsum.photos/400/450?random=14', height: 200, duration: '1:15', user: { id: '5', name: 'CampVibes', avatar: 'https://i.pravatar.cc/100?img=15' }, title: 'Best camping spots 🏕️', likes: 1890, category: 'Camping' },
  { id: '6', type: 'image', media: 'https://picsum.photos/400/480?random=15', height: 210, user: { id: '6', name: 'SwimPro', avatar: 'https://i.pravatar.cc/100?img=20' }, title: 'Improve your stroke', likes: 432, category: 'Swimming' },
  { id: '7', type: 'carousel', media: 'https://picsum.photos/400/520?random=16', height: 240, slideCount: 3, user: { id: '7', name: 'GymBros', avatar: 'https://i.pravatar.cc/100?img=22' }, title: 'Leg day essentials 💪', likes: 3421, category: 'Fitness' },
  { id: '8', type: 'video', media: 'https://picsum.photos/400/380?random=17', height: 170, duration: '3:45', user: { id: '8', name: 'ZenMaster', avatar: 'https://i.pravatar.cc/100?img=25' }, title: 'Meditation guide', likes: 1567, category: 'Yoga' },
];

// Related posts
const RELATED_POSTS = [
  { id: '101', media: 'https://picsum.photos/200/250?random=101', height: 120 },
  { id: '102', media: 'https://picsum.photos/200/200?random=102', height: 100 },
  { id: '103', media: 'https://picsum.photos/200/280?random=103', height: 140 },
  { id: '104', media: 'https://picsum.photos/200/220?random=104', height: 110 },
  { id: '105', media: 'https://picsum.photos/200/260?random=105', height: 130 },
  { id: '106', media: 'https://picsum.photos/200/240?random=106', height: 120 },
];

export default function VibesFeed() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll } = useTabBar();
  const { isUnderReview } = useContentStore();
  const [interests, setInterests] = useState(USER_INTERESTS);
  const [selectedPost, setSelectedPost] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Navigate to user profile
  const goToUserProfile = useCallback((userId) => {
    setModalVisible(false);
    navigation.navigate('UserProfile', { userId });
  }, [navigation]);

  // Navigate to Peak view
  const goToPeakView = useCallback((peak, index) => {
    navigation.navigate('PeakView', {
      peaks: PEAKS_DATA,
      initialIndex: index,
    });
  }, [navigation]);

  // Get active filters
  const activeFilters = useMemo(() =>
    interests.filter(i => i.active).map(i => i.name),
    [interests]
  );

  // Filter posts (by category AND hide under_review - SAFETY-2)
  const filteredPosts = useMemo(() => {
    const categoryFiltered = activeFilters.length > 0
      ? VIBES_POSTS.filter(post => activeFilters.includes(post.category))
      : VIBES_POSTS;
    // Hide posts that are under review
    return categoryFiltered.filter(post => !isUnderReview(String(post.id)));
  }, [activeFilters, isUnderReview]);

  // Toggle interest
  const toggleInterest = useCallback((id) => {
    setInterests(prevInterests => prevInterests.map(interest =>
      interest.id === id ? { ...interest, active: !interest.active } : interest
    ));
  }, []);

  // Format numbers
  const formatNumber = useCallback((num) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }, []);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Simulate API call - replace with real Supabase fetch
    await new Promise(resolve => setTimeout(resolve, 1000));
    setHasMore(true);
    setRefreshing(false);
  }, []);

  // Load more vibes
  const onLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    // Simulate API call - replace with real Supabase pagination
    await new Promise(resolve => setTimeout(resolve, 1000));
    setHasMore(false); // No more mock data
    setLoadingMore(false);
  }, [loadingMore, hasMore]);

  // Handle scroll end for infinite loading
  const handleScrollEnd = useCallback((event) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 200;
    if (isNearBottom && hasMore) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  // Get columns for masonry
  const getColumns = useCallback(() => {
    const leftColumn = [];
    const rightColumn = [];
    let leftHeight = 0;
    let rightHeight = 0;

    filteredPosts.forEach((post) => {
      if (leftHeight <= rightHeight) {
        leftColumn.push(post);
        leftHeight += post.height + 16;
      } else {
        rightColumn.push(post);
        rightHeight += post.height + 16;
      }
    });

    return { leftColumn, rightColumn };
  }, [filteredPosts]);

  const { leftColumn, rightColumn } = useMemo(() => getColumns(), [getColumns]);

  // Render Peak card
  const renderPeakCard = (peak, index) => (
    <TouchableOpacity
      key={peak.id}
      style={styles.peakCard}
      onPress={() => goToPeakView(peak, index)}
      activeOpacity={0.9}
    >
      <Image source={{ uri: peak.thumbnail }} style={styles.peakThumbnail} />
      
      {peak.hasNew && <View style={styles.peakNewIndicator} />}
      
      <View style={styles.peakDuration}>
        <Text style={styles.peakDurationText}>{peak.duration}s</Text>
      </View>
      
      <View style={styles.peakAvatarContainer}>
        <Image source={{ uri: peak.user.avatar }} style={styles.peakAvatar} />
      </View>
      
      <Text style={styles.peakUserName} numberOfLines={1}>{peak.user.name}</Text>
    </TouchableOpacity>
  );

  // Render vibe card
  const renderVibeCard = (post) => (
    <TouchableOpacity
      key={post.id}
      style={[styles.vibeCard, { height: post.height }]}
      onPress={() => {
        setSelectedPost(post);
        setModalVisible(true);
      }}
      activeOpacity={0.9}
    >
      <Image source={{ uri: post.media }} style={styles.vibeImage} />

      {post.type === 'video' && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={12} color="#fff" />
          <Text style={styles.videoDuration}>{post.duration}</Text>
        </View>
      )}

      {post.type === 'carousel' && (
        <View style={styles.carouselIndicator}>
          <Ionicons name="copy" size={14} color="#fff" />
        </View>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)']}
        style={styles.vibeOverlay}
      >
        <Text style={styles.vibeTitle} numberOfLines={2}>{post.title}</Text>
        <TouchableOpacity 
          style={styles.vibeMeta}
          onPress={() => goToUserProfile(post.user.id)}
        >
          <Image source={{ uri: post.user.avatar }} style={styles.vibeAvatar} />
          <Text style={styles.vibeUserName} numberOfLines={1}>{post.user.name}</Text>
          <View style={styles.vibeLikes}>
            <Ionicons name="heart" size={12} color="#fff" />
            <Text style={styles.vibeLikesText}>{formatNumber(post.likes)}</Text>
          </View>
        </TouchableOpacity>
      </LinearGradient>
    </TouchableOpacity>
  );

  // Render modal - Full screen post
  const renderModal = () => (
    <Modal
      visible={modalVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <View style={styles.modalContainer}>
        <ScrollView 
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {selectedPost && (
            <>
              {/* Full screen image with close button */}
              <View style={styles.modalImageContainer}>
                <Image
                  source={{ uri: selectedPost.media }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />
                
                {/* Close button on image */}
                <TouchableOpacity 
                  style={[styles.closeButton, { top: insets.top + 12 }]}
                  onPress={() => setModalVisible(false)}
                  activeOpacity={0.8}
                >
                  <View style={styles.closeButtonBg}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>

              {/* Post info */}
              <View style={styles.modalInfo}>
                <TouchableOpacity 
                  style={styles.modalUser}
                  onPress={() => goToUserProfile(selectedPost.user.id)}
                >
                  <Image source={{ uri: selectedPost.user.avatar }} style={styles.modalAvatar} />
                  <View style={styles.modalUserInfo}>
                    <Text style={styles.modalUserName}>{selectedPost.user.name}</Text>
                    <Text style={styles.modalCategory}>{selectedPost.category}</Text>
                  </View>
                  <TouchableOpacity style={styles.modalFollowButton}>
                    <Text style={styles.modalFollowText}>Follow</Text>
                  </TouchableOpacity>
                </TouchableOpacity>

                <Text style={styles.modalTitle}>{selectedPost.title}</Text>

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalAction}>
                    <Ionicons name="heart-outline" size={24} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>{formatNumber(selectedPost.likes)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAction}>
                    <Ionicons name="chatbubble-outline" size={22} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>Comment</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAction}>
                    <Ionicons name="share-outline" size={24} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalAction}>
                    <Ionicons name="bookmark-outline" size={24} color={COLORS.dark} />
                    <Text style={styles.modalActionText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Related posts */}
              <View style={styles.relatedSection}>
                <Text style={styles.relatedTitle}>More like this</Text>
                <View style={styles.relatedGrid}>
                  {RELATED_POSTS.map((post) => (
                    <TouchableOpacity key={post.id} style={styles.relatedCard}>
                      <Image source={{ uri: post.media }} style={[styles.relatedImage, { height: post.height }]} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Safe area bottom */}
              <View style={{ height: insets.bottom + 20 }} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleScrollEnd}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* PEAKS SECTION */}
        <View style={styles.peaksSection}>
          <View style={styles.peaksSectionHeader}>
            <Text style={styles.peaksSectionTitle}>Peaks</Text>
            <TouchableOpacity 
              style={styles.peaksSeeAll}
              onPress={() => navigation.navigate('PeaksFeed')}
            >
              <Text style={styles.peaksSeeAllText}>See all</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.peaksScrollContent}
          >
            {PEAKS_DATA.map((peak, index) => renderPeakCard(peak, index))}
          </ScrollView>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={styles.filtersContent}
        >
          {interests.map((interest) => (
            <TouchableOpacity
              key={interest.id}
              style={[
                styles.filterChip,
                interest.active && styles.filterChipActive,
              ]}
              onPress={() => toggleInterest(interest.id)}
            >
              <Ionicons
                name={interest.icon}
                size={16}
                color={interest.active ? '#fff' : COLORS.primary}
              />
              <Text style={[
                styles.filterChipText,
                interest.active && styles.filterChipTextActive,
              ]}>
                {interest.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Grid */}
        <View style={styles.gridContainer}>
          <View style={styles.masonryContainer}>
            <View style={styles.column}>
              {leftColumn.map(renderVibeCard)}
            </View>
            <View style={styles.column}>
              {rightColumn.map(renderVibeCard)}
            </View>
          </View>

          {filteredPosts.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={64} color={COLORS.gray} />
              <Text style={styles.emptyTitle}>No vibes found</Text>
              <Text style={styles.emptySubtitle}>Try selecting different interests</Text>
            </View>
          )}

          {loadingMore && (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )}

          <View style={{ height: 100 }} />
        </View>
      </Animated.ScrollView>

      {renderModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollContent: {
    paddingTop: SPACING.sm,
  },

  // PEAKS SECTION
  peaksSection: {
    marginBottom: SPACING.md,
  },
  peaksSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.sm,
  },
  peaksSectionTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 18,
    color: COLORS.dark,
  },
  peaksSeeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  peaksSeeAllText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: COLORS.primary,
  },
  peaksScrollContent: {
    paddingHorizontal: SPACING.base,
    gap: SPACING.sm,
  },
  peakCard: {
    width: PEAK_CARD_WIDTH,
    marginRight: SPACING.sm,
  },
  peakThumbnail: {
    width: PEAK_CARD_WIDTH,
    height: PEAK_CARD_HEIGHT,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
  },
  peakNewIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  peakDuration: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  peakDurationText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    color: COLORS.white,
  },
  peakAvatarContainer: {
    position: 'absolute',
    bottom: 30,
    left: '50%',
    marginLeft: -18,
  },
  peakAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  peakUserName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: COLORS.dark,
    textAlign: 'center',
    marginTop: 6,
  },

  // Filters
  filtersContainer: {
    maxHeight: 50,
    marginBottom: SPACING.sm,
  },
  filtersContent: {
    paddingHorizontal: SPACING.base,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    marginRight: SPACING.sm,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 13,
    color: COLORS.primary,
    marginLeft: 6,
  },
  filterChipTextActive: {
    color: '#fff',
  },

  // Grid
  gridContainer: {
    paddingHorizontal: SPACING.base,
  },
  masonryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: {
    width: COLUMN_WIDTH,
  },

  // Vibe Card
  vibeCard: {
    borderRadius: SIZES.radiusMd,
    overflow: 'hidden',
    marginBottom: SPACING.base,
    backgroundColor: COLORS.grayLight,
  },
  vibeImage: {
    width: '100%',
    height: '100%',
  },
  vibeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.sm,
    paddingTop: 30,
  },
  vibeTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 12,
    color: '#fff',
    marginBottom: 6,
  },
  vibeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vibeAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  vibeUserName: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: '#fff',
    flex: 1,
  },
  vibeLikes: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vibeLikesText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: '#fff',
    marginLeft: 4,
  },
  videoIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  videoDuration: {
    fontFamily: 'Poppins-Medium',
    fontSize: 10,
    color: '#fff',
    marginLeft: 4,
  },
  carouselIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    borderRadius: 4,
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: COLORS.dark,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
    marginTop: SPACING.sm,
  },

  // ===== MODAL (Full screen post) =====
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  modalImageContainer: {
    position: 'relative',
    width: width,
    height: width * 1.25,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
  },
  closeButtonBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalInfo: {
    padding: SPACING.lg,
  },
  modalUser: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  modalUserInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  modalUserName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: COLORS.dark,
  },
  modalCategory: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: COLORS.gray,
  },
  modalFollowButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 20,
  },
  modalFollowText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: '#fff',
  },
  modalTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 20,
    color: COLORS.dark,
    marginBottom: SPACING.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.grayLight,
  },
  modalAction: {
    alignItems: 'center',
  },
  modalActionText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },

  // Related
  relatedSection: {
    padding: SPACING.lg,
    paddingTop: 0,
  },
  relatedTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: COLORS.dark,
    marginBottom: SPACING.md,
  },
  relatedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  relatedCard: {
    width: (width - 48) / 3,
    borderRadius: SIZES.radiusSm,
    overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  relatedImage: {
    width: '100%',
  },

  // Pagination
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});