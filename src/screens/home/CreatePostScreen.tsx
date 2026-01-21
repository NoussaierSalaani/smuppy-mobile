import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import OptimizedImage from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, SPACING } from '../../config/theme';

const { width } = Dimensions.get('window');
const ITEM_SIZE = (width - 4) / 3;
const MAX_SELECTION = 10;

export default function CreatePostScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [mediaAssets, setMediaAssets] = useState([]);
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [selectedPreview, setSelectedPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  
  // Post type is always 'post' for this screen (Peaks use CreatePeakScreen)

  // Request permissions and load media
  useEffect(() => {
    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status === 'granted') {
        loadMedia();
      } else {
        setLoading(false);
      }
    })();
  }, []);

  // Load media from gallery
  const loadMedia = async () => {
    try {
      const { assets } = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        sortBy: ['creationTime'],
        first: 100,
      });
      
      setMediaAssets(assets);
      if (assets.length > 0) {
        setSelectedPreview(assets[0]);
      }
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  // Open camera
  const openCamera = () => {
    // Show options: Photo or Video
    Alert.alert(
      'Camera',
      'What do you want to capture?',
      [
        {
          text: 'Photo',
          onPress: () => takePhoto(),
        },
        {
          text: 'Video',
          onPress: () => navigation.navigate('VideoRecorder'),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow camera access to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const newMedia = {
          id: Date.now().toString(),
          uri: result.assets[0].uri,
          mediaType: 'photo' as const,
          duration: 0,
        };

        setSelectedMedia([newMedia]);
        setSelectedPreview(newMedia);
      }
    } catch (error) {
      Alert.alert(
        'Camera not available',
        'Camera is not available on this device. Please select from your photo library instead.'
      );
    }
  };

  // Toggle media selection
  const toggleMediaSelection = (item) => {
    const isSelected = selectedMedia.find(m => m.id === item.id);
    
    if (isSelected) {
      const newSelection = selectedMedia.filter(m => m.id !== item.id);
      setSelectedMedia(newSelection);
      if (selectedPreview?.id === item.id && newSelection.length > 0) {
        setSelectedPreview(newSelection[0]);
      } else if (newSelection.length === 0) {
        setSelectedPreview(item);
      }
    } else {
      if (selectedMedia.length >= MAX_SELECTION) {
        Alert.alert('Limit reached', `You can select up to ${MAX_SELECTION} items.`);
        return;
      }
      
      if (item.mediaType === 'video' && item.duration > 15) {
        Alert.alert('Video too long', 'Videos must be 15 seconds or less.');
        return;
      }
      
      setSelectedMedia([...selectedMedia, item]);
      setSelectedPreview(item);
    }
  };

  // Get selection index
  const getSelectionIndex = (item) => {
    const index = selectedMedia.findIndex(m => m.id === item.id);
    return index >= 0 ? index + 1 : null;
  };

  // Handle next - MEDIA IS REQUIRED
  const handleNext = () => {
    if (selectedMedia.length === 0) {
      Alert.alert(
        'Select media', 
        'Please select at least one photo or video to create a post.'
      );
      return;
    }

    navigation.navigate('AddPostDetails', {
      media: selectedMedia,
      postType: 'post',
    });
  };

  // Handle close - GO BACK instead of navigate to Home
  const handleClose = () => {
    if (selectedMedia.length > 0) {
      setShowDiscardModal(true);
    } else {
      navigation.goBack();
    }
  };

  // Render custom discard modal - Smuppy branded
  const renderDiscardModal = () => (
    <Modal
      visible={showDiscardModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowDiscardModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalIconBox}>
            <Ionicons name="image-outline" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.modalTitle}>Discard post?</Text>
          <Text style={styles.modalMessage}>
            If you leave now, your selected photos and videos won't be saved.
          </Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.keepEditingButton}
              onPress={() => setShowDiscardModal(false)}
            >
              <Text style={styles.keepEditingText}>Keep editing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.discardButton}
              onPress={() => {
                setShowDiscardModal(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.discardButtonText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Render media item
  const renderMediaItem = ({ item }) => {
    const selectionIndex = getSelectionIndex(item);
    const isSelected = selectionIndex !== null;
    const isPreview = selectedPreview?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.mediaItem, isPreview && styles.mediaItemPreview]}
        onPress={() => {
          setSelectedPreview(item);
          if (selectedMedia.length === 0) {
            setSelectedMedia([item]);
          }
        }}
        onLongPress={() => toggleMediaSelection(item)}
        activeOpacity={0.8}
      >
        <OptimizedImage source={item.uri} style={styles.mediaThumbnail} />
        
        {item.mediaType === 'video' && (
          <View style={styles.videoDuration}>
            <Ionicons name="play" size={10} color="#fff" />
            <Text style={styles.videoDurationText}>
              {Math.floor(item.duration / 60)}:{String(Math.floor(item.duration % 60)).padStart(2, '0')}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.selectionCircle, isSelected && styles.selectionCircleActive]}
          onPress={() => toggleMediaSelection(item)}
        >
          {isSelected ? (
            <Text style={styles.selectionNumber}>{selectionIndex}</Text>
          ) : (
            <View style={styles.selectionCircleInner} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // No permission view
  if (!hasPermission && !loading) {
    return (
      <View style={styles.container}>
        {/* Close button */}
        <TouchableOpacity
          style={[styles.permissionCloseButton, { top: insets.top + 10 }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color={COLORS.dark} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Ionicons name="images-outline" size={60} color={COLORS.gray} />
          <Text style={styles.permissionText}>Allow access to your photos</Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={async () => {
              const { status } = await MediaLibrary.requestPermissionsAsync();
              if (status === 'granted') {
                setHasPermission(true);
                loadMedia();
              }
            }}
          >
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={handleClose}>
          <Ionicons name="close" size={28} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create post</Text>
        <TouchableOpacity onPress={handleNext}>
          <LinearGradient
            colors={selectedMedia.length > 0 ? GRADIENTS.primary : ['#ccc', '#ccc']}
            style={styles.nextButton}
          >
            <Text style={styles.nextButtonText}>Next</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Preview */}
      <View style={styles.previewContainer}>
        {selectedPreview ? (
          <>
            <OptimizedImage source={selectedPreview.uri} style={styles.previewImage} contentFit="contain" />
            {selectedPreview.mediaType === 'video' && (
              <View style={styles.previewPlayButton}>
                <Ionicons name="play" size={40} color="#fff" />
              </View>
            )}
            {selectedMedia.length > 1 && (
              <View style={styles.multipleIndicator}>
                <Ionicons name="copy" size={16} color="#fff" />
                <Text style={styles.multipleIndicatorText}>{selectedMedia.length}</Text>
              </View>
            )}
          </>
        ) : (
          <View style={styles.previewPlaceholder}>
            <Ionicons name="image-outline" size={60} color={COLORS.grayLight} />
            <Text style={styles.previewPlaceholderText}>Select a photo or video</Text>
          </View>
        )}
      </View>

      {/* Gallery Header */}
      <View style={styles.galleryHeader}>
        <TouchableOpacity style={styles.galleryTab}>
          <Text style={styles.galleryTabText}>Recent</Text>
          <Ionicons name="chevron-down" size={18} color={COLORS.dark} />
        </TouchableOpacity>

        {/* Selection count indicator */}
        {selectedMedia.length > 0 && (
          <View style={styles.selectionCount}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
            <Text style={styles.selectionCountText}>{selectedMedia.length} selected</Text>
          </View>
        )}
      </View>

      {/* Media Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlashList
          data={mediaAssets}
          renderItem={renderMediaItem}
          keyExtractor={(item) => item.id}
          numColumns={3}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.mediaGrid}
        />
      )}

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 20 }]}>
        {/* Camera Button */}
        <TouchableOpacity style={styles.cameraButton} onPress={openCamera}>
          <Ionicons name="camera" size={24} color={COLORS.dark} />
        </TouchableOpacity>
      </View>

      {/* Discard Modal */}
      {renderDiscardModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionCloseButton: {
    position: 'absolute',
    left: SPACING.lg,
    zIndex: 10,
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
  nextButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Preview
  previewContainer: {
    width: width,
    height: width * 0.75,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
  },
  previewPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewPlaceholderText: {
    color: COLORS.grayLight,
    fontSize: 14,
    marginTop: 10,
  },
  previewPlayButton: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  multipleIndicator: {
    position: 'absolute',
    top: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  multipleIndicatorText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 5,
  },

  // Gallery Header
  galleryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  galleryTab: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  galleryTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
    marginRight: 4,
  },
  selectionCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6FAF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  selectionCountText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
    marginLeft: 6,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Media Grid
  mediaGrid: {
    paddingBottom: 150,
  },
  mediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    padding: 1,
  },
  mediaItemPreview: {
    opacity: 0.7,
  },
  mediaThumbnail: {
    width: '100%',
    height: '100%',
  },
  videoDuration: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  videoDurationText: {
    color: '#fff',
    fontSize: 11,
    marginLeft: 3,
  },
  selectionCircle: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionCircleActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  selectionCircleInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  selectionNumber: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Bottom Actions
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  cameraButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Permission
  permissionText: {
    fontSize: 16,
    color: COLORS.gray,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Discard Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  modalIconBox: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E6FAF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  keepEditingButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  keepEditingText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  discardButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
  },
  discardButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});