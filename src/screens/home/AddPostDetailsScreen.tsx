/**
 * AddPostDetailsScreen - Écran d'ajout des détails d'un post
 * 
 * Corrections appliquées:
 * - setTimeout avec cleanup proper via useRef
 * - Toutes les couleurs utilisent le theme
 * - Code optimisé et clean
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Dimensions,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage, { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  COLORS,
  GRADIENTS,
  SPACING,
  SIZES,
} from '../../config/theme';
import { supabase } from '../../config/supabase';
import { createPost } from '../../services/database';
import { uploadPostMedia } from '../../services/mediaUpload';

const { width } = Dimensions.get('window');

// ============================================
// CONSTANTS
// ============================================

const VISIBILITY_OPTIONS = [
  { id: 'public', label: 'Public', icon: 'globe-outline', description: 'Anyone can see this post' },
  { id: 'fans', label: 'Fans Only', icon: 'people-outline', description: 'Only your fans can see this' },
  { id: 'private', label: 'Private', icon: 'lock-closed-outline', description: 'Only you can see this' },
];

const SAMPLE_USERS = [
  { id: 1, name: 'Hannah Smith', username: '@hannahsmith', avatar: 'https://i.pravatar.cc/100?img=1' },
  { id: 2, name: 'Thomas Lefèvre', username: '@thomaslef', avatar: 'https://i.pravatar.cc/100?img=3' },
  { id: 3, name: 'Mariam Fiori', username: '@mariamfiori', avatar: 'https://i.pravatar.cc/100?img=5' },
  { id: 4, name: 'Alex Runner', username: '@alexrunner', avatar: 'https://i.pravatar.cc/100?img=8' },
  { id: 5, name: 'FitCoach Pro', username: '@fitcoachpro', avatar: 'https://i.pravatar.cc/100?img=12' },
];

const SAMPLE_LOCATIONS = [
  '775 Rolling Green Rd.',
  'Gold Gym, LA',
  'Central Park, NYC',
  'Fitness First',
  'CrossFit Montreal',
];

const MAX_DESCRIPTION_LENGTH = 2200;
const POST_DELAY_MS = 1000;

// ============================================
// COMPONENT
// ============================================

export default function AddPostDetailsScreen({ route, navigation }) {
  const { media, postType } = route.params;
  const insets = useSafeAreaInsets();

  // State
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [location, setLocation] = useState('');
  const [taggedPeople, setTaggedPeople] = useState([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // User data from Supabase
  const [currentUser, setCurrentUser] = useState({
    displayName: 'User',
    username: 'user',
    avatar: null,
  });

  // Modals
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  // Refs for cleanup
  const postTimeoutRef = useRef(null);

  // Load user data from Supabase
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Get profile from profiles table
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, username, avatar_url')
            .eq('id', user.id)
            .single();

          const displayName = profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
          const username = profile?.username || user.email?.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'user';
          const avatar = profile?.avatar_url || user.user_metadata?.avatar_url || null;

          setCurrentUser({ displayName, username, avatar });
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    };

    loadUserData();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (postTimeoutRef.current) {
        clearTimeout(postTimeoutRef.current);
      }
    };
  }, []);

  // Current visibility option
  const currentVisibility = VISIBILITY_OPTIONS.find(v => v.id === visibility);

  // ============================================
  // HANDLERS
  // ============================================

  const handlePost = useCallback(async () => {
    if (isPosting) return;

    setIsPosting(true);
    setUploadProgress(0);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert('Error', 'You must be logged in to create a post');
        setIsPosting(false);
        return;
      }

      // Upload media files
      const mediaUrls: string[] = [];
      const totalFiles = media.length;

      for (let i = 0; i < media.length; i++) {
        const mediaItem = media[i];
        const type = mediaItem.mediaType === 'video' ? 'video' : 'image';

        const result = await uploadPostMedia(
          user.id,
          mediaItem.uri,
          type,
          (progress) => {
            const overallProgress = ((i / totalFiles) + (progress / 100 / totalFiles)) * 80;
            setUploadProgress(overallProgress);
          }
        );

        if (!result.success) {
          throw new Error(result.error || 'Failed to upload media');
        }

        mediaUrls.push(result.cdnUrl || result.url || '');
      }

      setUploadProgress(85);

      // Create post in database
      const postData = {
        content: description,
        media_urls: mediaUrls,
        media_type: media.length === 1 ? (media[0].mediaType === 'video' ? 'video' : 'image') : 'multiple',
        visibility: visibility,
        location: location || null,
        is_peak: postType === 'peaks',
        tagged_users: taggedPeople.map(p => p.id),
      };

      const { data: newPost, error } = await createPost(postData);

      if (error) {
        throw new Error(typeof error === 'string' ? error : 'Failed to create post');
      }

      setUploadProgress(100);

      // Navigate to success
      navigation.navigate('PostSuccess', {
        media,
        postType,
        description,
        visibility,
        location,
        taggedPeople,
        postId: newPost?.id,
      });
    } catch (error) {
      console.error('Post creation error:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to create post. Please try again.');
      setIsPosting(false);
      setUploadProgress(0);
    }
  }, [isPosting, navigation, media, postType, description, visibility, location, taggedPeople]);

  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleSelectVisibility = useCallback((optionId) => {
    setVisibility(optionId);
    setShowVisibilityModal(false);
  }, []);

  const handleSelectLocation = useCallback((loc) => {
    setLocation(loc);
    setShowLocationModal(false);
  }, []);

  const handleToggleTag = useCallback((user) => {
    setTaggedPeople(prev => {
      const isTagged = prev.find(p => p.id === user.id);
      if (isTagged) {
        return prev.filter(p => p.id !== user.id);
      }
      return [...prev, user];
    });
  }, []);

  const handleRemoveTag = useCallback((userId) => {
    setTaggedPeople(prev => prev.filter(p => p.id !== userId));
  }, []);

  // ============================================
  // RENDER FUNCTIONS
  // ============================================

  const renderMediaPreview = useCallback(({ item, index }) => (
    <TouchableOpacity
      style={[
        styles.mediaPreviewItem,
        index === currentMediaIndex && styles.mediaPreviewItemActive
      ]}
      onPress={() => setCurrentMediaIndex(index)}
    >
      <OptimizedImage source={item.uri} style={styles.mediaPreviewImage} />
      {item.mediaType === 'video' && (
        <View style={styles.videoIcon}>
          <Ionicons name="play" size={12} color={COLORS.white} />
        </View>
      )}
    </TouchableOpacity>
  ), [currentMediaIndex]);

  // Visibility Modal
  const renderVisibilityModal = () => (
    <Modal visible={showVisibilityModal} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowVisibilityModal(false)}>
            <Ionicons name="close" size={28} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Visibility</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.modalContent}>
          {VISIBILITY_OPTIONS.map((option) => {
            const isActive = visibility === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.visibilityOption,
                  isActive && styles.visibilityOptionActive
                ]}
                onPress={() => handleSelectVisibility(option.id)}
              >
                <View style={[
                  styles.visibilityIconContainer,
                  isActive && styles.visibilityIconContainerActive
                ]}>
                  <Ionicons 
                    name={option.icon} 
                    size={24} 
                    color={isActive ? COLORS.white : COLORS.dark} 
                  />
                </View>
                <View style={styles.visibilityInfo}>
                  <Text style={styles.visibilityLabel}>{option.label}</Text>
                  <Text style={styles.visibilityDescription}>{option.description}</Text>
                </View>
                {isActive && (
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );

  // Location Modal
  const renderLocationModal = () => (
    <Modal visible={showLocationModal} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowLocationModal(false)}>
            <Ionicons name="close" size={28} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Add Location</Text>
          <TouchableOpacity onPress={() => setShowLocationModal(false)}>
            <Text style={styles.modalDone}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalContent}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.gray} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search location..."
              placeholderTextColor={COLORS.gray}
              value={location}
              onChangeText={setLocation}
              autoFocus
            />
            {location.length > 0 && (
              <TouchableOpacity onPress={() => setLocation('')}>
                <Ionicons name="close-circle" size={20} color={COLORS.gray} />
              </TouchableOpacity>
            )}
          </View>

          {SAMPLE_LOCATIONS.map((loc) => (
            <TouchableOpacity
              key={loc}
              style={styles.locationOption}
              onPress={() => handleSelectLocation(loc)}
            >
              <Ionicons name="location-outline" size={22} color={COLORS.gray} />
              <Text style={styles.locationText}>{loc}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );

  // Tag People Modal
  const renderTagModal = () => (
    <Modal visible={showTagModal} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowTagModal(false)}>
            <Ionicons name="close" size={28} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Tag People</Text>
          <TouchableOpacity onPress={() => setShowTagModal(false)}>
            <Text style={styles.modalDone}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modalContent}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={COLORS.gray} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search people..."
              placeholderTextColor={COLORS.gray}
              autoFocus
            />
          </View>

          {/* Tagged people chips */}
          {taggedPeople.length > 0 && (
            <View style={styles.taggedChips}>
              {taggedPeople.map((person) => (
                <TouchableOpacity
                  key={person.id}
                  style={styles.taggedChip}
                  onPress={() => handleRemoveTag(person.id)}
                >
                  <AvatarImage source={person.avatar} size={24} style={styles.taggedChipAvatar} />
                  <Text style={styles.taggedChipName}>{person.name}</Text>
                  <Ionicons name="close" size={16} color={COLORS.gray} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {SAMPLE_USERS.map((user) => {
            const isTagged = taggedPeople.find(p => p.id === user.id);
            return (
              <TouchableOpacity
                key={user.id}
                style={styles.userOption}
                onPress={() => handleToggleTag(user)}
              >
                <AvatarImage source={user.avatar} size={44} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userUsername}>{user.username}</Text>
                </View>
                <View style={[styles.checkbox, isTagged && styles.checkboxActive]}>
                  {isTagged && <Ionicons name="checkmark" size={16} color={COLORS.white} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add details</Text>
        <TouchableOpacity onPress={handlePost} disabled={isPosting}>
          <LinearGradient colors={GRADIENTS.primary} style={styles.postButton}>
            {isPosting ? (
              <View style={styles.postingContainer}>
                <ActivityIndicator size="small" color={COLORS.white} />
                <Text style={styles.postButtonText}>{Math.round(uploadProgress)}%</Text>
              </View>
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Media Preview */}
        <View style={styles.mediaContainer}>
          <OptimizedImage
            source={media[currentMediaIndex]?.uri}
            style={styles.mainMedia}
            contentFit="cover"
          />
          {media[currentMediaIndex]?.mediaType === 'video' && (
            <View style={styles.playButton}>
              <Ionicons name="play" size={30} color={COLORS.white} />
            </View>
          )}
        </View>

        {/* Media Thumbnails (if multiple) */}
        {media.length > 1 && (
          <FlashList
            data={media}
            renderItem={renderMediaPreview}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mediaThumbnails}
          />
        )}

        {/* User Info + Description */}
        <View style={styles.userSection}>
          <AvatarImage
            source={currentUser.avatar || 'https://i.pravatar.cc/100?img=33'}
            size={44}
          />
          <View style={styles.userDetails}>
            <Text style={styles.currentUserName}>{currentUser.displayName}</Text>
            <Text style={styles.currentUserHandle}>@{currentUser.username}</Text>
          </View>
        </View>

        <View style={styles.descriptionContainer}>
          <TextInput
            style={styles.descriptionInput}
            placeholder="Describe your post! (You can also add hashtags here...)"
            placeholderTextColor={COLORS.gray}
            multiline
            value={description}
            onChangeText={setDescription}
            maxLength={MAX_DESCRIPTION_LENGTH}
          />
          <Text style={styles.charCount}>
            {description.length}/{MAX_DESCRIPTION_LENGTH}
          </Text>
        </View>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {/* Visibility */}
          <TouchableOpacity 
            style={styles.optionRow}
            onPress={() => setShowVisibilityModal(true)}
          >
            <View style={styles.optionLeft}>
              <Ionicons name={currentVisibility.icon} size={22} color={COLORS.dark} />
              <Text style={styles.optionLabel}>Visibility</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={styles.optionValue}>{currentVisibility.label}</Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
            </View>
          </TouchableOpacity>

          {/* Location */}
          <TouchableOpacity 
            style={styles.optionRow}
            onPress={() => setShowLocationModal(true)}
          >
            <View style={styles.optionLeft}>
              <Ionicons name="location-outline" size={22} color={COLORS.dark} />
              <Text style={styles.optionLabel}>Location</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={[styles.optionValue, location && styles.optionValueSet]}>
                {location || 'Add location'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
            </View>
          </TouchableOpacity>

          {/* Tag People */}
          <TouchableOpacity 
            style={styles.optionRow}
            onPress={() => setShowTagModal(true)}
          >
            <View style={styles.optionLeft}>
              <Ionicons name="person-add-outline" size={22} color={COLORS.dark} />
              <Text style={styles.optionLabel}>Tag people</Text>
            </View>
            <View style={styles.optionRight}>
              <Text style={[styles.optionValue, taggedPeople.length > 0 && styles.optionValueSet]}>
                {taggedPeople.length > 0 ? `${taggedPeople.length} people` : 'Add tags'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Modals */}
      {renderVisibilityModal()}
      {renderLocationModal()}
      {renderTagModal()}
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: COLORS.dark,
  },
  headerSpacer: {
    width: 28,
  },
  postButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  postButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: COLORS.white,
  },
  postingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  // Media
  mediaContainer: {
    width: width,
    height: width * 0.6,
    backgroundColor: COLORS.dark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainMedia: {
    width: '100%',
    height: '100%',
  },
  playButton: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaThumbnails: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  mediaPreviewItem: {
    width: 60,
    height: 60,
    borderRadius: SIZES.radiusSm,
    marginRight: SPACING.sm,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mediaPreviewItemActive: {
    borderColor: COLORS.primary,
  },
  mediaPreviewImage: {
    width: '100%',
    height: '100%',
  },
  videoIcon: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    backgroundColor: COLORS.overlay,
    padding: 2,
    borderRadius: 3,
  },

  // User Section
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  currentUserAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userDetails: {
    marginLeft: SPACING.md,
  },
  currentUserName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: COLORS.dark,
  },
  currentUserHandle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
  },

  // Description
  descriptionContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  descriptionInput: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: COLORS.dark,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: COLORS.gray,
    textAlign: 'right',
    marginTop: 5,
  },

  // Options
  optionsContainer: {
    paddingHorizontal: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.grayBorder,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayBorder,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionLabel: {
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: COLORS.dark,
    marginLeft: SPACING.md,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionValue: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: COLORS.gray,
    marginRight: SPACING.sm,
  },
  optionValueSet: {
    color: COLORS.primary,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayBorder,
  },
  modalTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: COLORS.dark,
  },
  modalDone: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: COLORS.primary,
  },
  modalContent: {
    padding: SPACING.lg,
  },

  // Visibility Options
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayBorder,
  },
  visibilityOptionActive: {
    backgroundColor: COLORS.backgroundSecondary,
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  visibilityIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.grayBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  visibilityIconContainerActive: {
    backgroundColor: COLORS.primary,
  },
  visibilityInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  visibilityLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: COLORS.dark,
  },
  visibilityDescription: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: SIZES.radiusMd,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    color: COLORS.dark,
    marginLeft: SPACING.sm,
  },

  // Location
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayBorder,
  },
  locationText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 15,
    color: COLORS.dark,
    marginLeft: SPACING.md,
  },

  // Tagged Chips
  taggedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.md,
  },
  taggedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.grayBorder,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  taggedChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  taggedChipName: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: COLORS.dark,
    marginRight: 6,
  },

  // User Option (Tag)
  userOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayBorder,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  userInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  userName: {
    fontFamily: 'Poppins-Medium',
    fontSize: 15,
    color: COLORS.dark,
  },
  userUsername: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: COLORS.gray,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 100,
  },
});
