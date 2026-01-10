import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  Dimensions,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';

const { width } = Dimensions.get('window');

// Visibility options
const VISIBILITY_OPTIONS = [
  { id: 'public', label: 'Public', icon: 'globe-outline', description: 'Anyone can see this post' },
  { id: 'fans', label: 'Fans Only', icon: 'people-outline', description: 'Only your fans can see this' },
  { id: 'private', label: 'Private', icon: 'lock-closed-outline', description: 'Only you can see this' },
];

// Sample users for tagging
const SAMPLE_USERS = [
  { id: 1, name: 'Hannah Smith', username: '@hannahsmith', avatar: 'https://i.pravatar.cc/100?img=1' },
  { id: 2, name: 'Thomas Lefèvre', username: '@thomaslef', avatar: 'https://i.pravatar.cc/100?img=3' },
  { id: 3, name: 'Mariam Fiori', username: '@mariamfiori', avatar: 'https://i.pravatar.cc/100?img=5' },
  { id: 4, name: 'Alex Runner', username: '@alexrunner', avatar: 'https://i.pravatar.cc/100?img=8' },
  { id: 5, name: 'FitCoach Pro', username: '@fitcoachpro', avatar: 'https://i.pravatar.cc/100?img=12' },
];

export default function AddPostDetailsScreen({ route, navigation }) {
  const { media, postType } = route.params;
  const insets = useSafeAreaInsets();
  
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [location, setLocation] = useState('');
  const [taggedPeople, setTaggedPeople] = useState([]);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPosting, setIsPosting] = useState(false);
  
  // Modals
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

  // Get current visibility option
  const currentVisibility = VISIBILITY_OPTIONS.find(v => v.id === visibility);

  // Handle post
  const handlePost = () => {
    setIsPosting(true);
    
    // Simulate posting delay
    setTimeout(() => {
      navigation.navigate('PostSuccess', {
        media,
        postType,
        description,
        visibility,
        location,
        taggedPeople,
      });
    }, 1000);
  };

  // Handle back
  const handleBack = () => {
    navigation.goBack();
  };

  // Render media preview
  const renderMediaPreview = ({ item, index }) => (
    <TouchableOpacity
      style={[
        styles.mediaPreviewItem,
        index === currentMediaIndex && styles.mediaPreviewItemActive
      ]}
      onPress={() => setCurrentMediaIndex(index)}
    >
      <Image source={{ uri: item.uri }} style={styles.mediaPreviewImage} />
      {item.mediaType === 'video' && (
        <View style={styles.videoIcon}>
          <Ionicons name="play" size={12} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );

  // Visibility Modal
  const renderVisibilityModal = () => (
    <Modal visible={showVisibilityModal} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setShowVisibilityModal(false)}>
            <Ionicons name="close" size={28} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Visibility</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.modalContent}>
          {VISIBILITY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.visibilityOption,
                visibility === option.id && styles.visibilityOptionActive
              ]}
              onPress={() => {
                setVisibility(option.id);
                setShowVisibilityModal(false);
              }}
            >
              <View style={[
                styles.visibilityIconContainer,
                visibility === option.id && styles.visibilityIconContainerActive
              ]}>
                <Ionicons 
                  name={option.icon} 
                  size={24} 
                  color={visibility === option.id ? '#fff' : COLORS.dark} 
                />
              </View>
              <View style={styles.visibilityInfo}>
                <Text style={styles.visibilityLabel}>{option.label}</Text>
                <Text style={styles.visibilityDescription}>{option.description}</Text>
              </View>
              {visibility === option.id && (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
              )}
            </TouchableOpacity>
          ))}
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

          {/* Sample locations */}
          {['775 Rolling Green Rd.', 'Gold Gym, LA', 'Central Park, NYC', 'Fitness First', 'CrossFit Montreal'].map((loc) => (
            <TouchableOpacity
              key={loc}
              style={styles.locationOption}
              onPress={() => {
                setLocation(loc);
                setShowLocationModal(false);
              }}
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
                  onPress={() => setTaggedPeople(taggedPeople.filter(p => p.id !== person.id))}
                >
                  <Image source={{ uri: person.avatar }} style={styles.taggedChipAvatar} />
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
                onPress={() => {
                  if (isTagged) {
                    setTaggedPeople(taggedPeople.filter(p => p.id !== user.id));
                  } else {
                    setTaggedPeople([...taggedPeople, user]);
                  }
                }}
              >
                <Image source={{ uri: user.avatar }} style={styles.userAvatar} />
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.name}</Text>
                  <Text style={styles.userUsername}>{user.username}</Text>
                </View>
                <View style={[styles.checkbox, isTagged && styles.checkboxActive]}>
                  {isTagged && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add details</Text>
        <TouchableOpacity onPress={handlePost} disabled={isPosting}>
          <LinearGradient colors={GRADIENTS.primary} style={styles.postButton}>
            {isPosting ? (
              <Text style={styles.postButtonText}>Posting...</Text>
            ) : (
              <Text style={styles.postButtonText}>Post</Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Media Preview */}
        <View style={styles.mediaContainer}>
          <Image 
            source={{ uri: media[currentMediaIndex]?.uri }} 
            style={styles.mainMedia}
            resizeMode="cover"
          />
          {media[currentMediaIndex]?.mediaType === 'video' && (
            <View style={styles.playButton}>
              <Ionicons name="play" size={30} color="#fff" />
            </View>
          )}
        </View>

        {/* Media Thumbnails (if multiple) */}
        {media.length > 1 && (
          <FlatList
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
          <Image 
            source={{ uri: 'https://i.pravatar.cc/100?img=33' }} 
            style={styles.currentUserAvatar}
          />
          <View style={styles.userDetails}>
            <Text style={styles.currentUserName}>Ronald Richards</Text>
            <Text style={styles.currentUserHandle}>@ronaldrichards58</Text>
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
            maxLength={2200}
          />
          <Text style={styles.charCount}>{description.length}/2200</Text>
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

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Modals */}
      {renderVisibilityModal()}
      {renderLocationModal()}
      {renderTagModal()}
    </View>
  );
}

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
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
  },
  postButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  postButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Media
  mediaContainer: {
    width: width,
    height: width * 0.6,
    backgroundColor: '#000',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
    borderRadius: 8,
    marginRight: 8,
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  currentUserHandle: {
    fontSize: 14,
    color: COLORS.gray,
  },

  // Description
  descriptionContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  descriptionInput: {
    fontSize: 16,
    color: COLORS.dark,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: COLORS.gray,
    textAlign: 'right',
    marginTop: 5,
  },

  // Options
  optionsContainer: {
    paddingHorizontal: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 16,
    color: COLORS.dark,
    marginLeft: SPACING.md,
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionValue: {
    fontSize: 14,
    color: COLORS.gray,
    marginRight: 8,
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
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
  },
  modalDone: {
    fontSize: 16,
    fontWeight: '600',
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
    borderBottomColor: '#F0F0F0',
  },
  visibilityOptionActive: {
    backgroundColor: '#F8F8F8',
    marginHorizontal: -SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  visibilityIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0F0F0',
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
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.dark,
  },
  visibilityDescription: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
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
    borderBottomColor: '#F0F0F0',
  },
  locationText: {
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
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
    marginBottom: 8,
  },
  taggedChipAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 6,
  },
  taggedChipName: {
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
    borderBottomColor: '#F0F0F0',
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
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.dark,
  },
  userUsername: {
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
});
