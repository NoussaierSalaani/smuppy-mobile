import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  Dimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
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
  
  // Get postType from route params (from Profile = 'post' only) or default to 'post'
  const fromProfile = route?.params?.fromProfile || false;
  const [postType, setPostType] = useState(route?.params?.postType || 'post');

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
  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      quality: 0.8,
      videoMaxDuration: 60,
    });

    if (!result.canceled && result.assets[0]) {
      const newMedia = {
        id: Date.now().toString(),
        uri: result.assets[0].uri,
        mediaType: result.assets[0].type === 'video' ? 'video' : 'photo',
        duration: result.assets[0].duration || 0,
      };
      
      setSelectedMedia([newMedia]);
      setSelectedPreview(newMedia);
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
      
      if (item.mediaType === 'video' && item.duration > 60) {
        Alert.alert('Video too long', 'Videos must be 60 seconds or less.');
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
      postType: postType,
    });
  };

  // Handle close - GO BACK instead of navigate to Home
  const handleClose = () => {
    if (selectedMedia.length > 0) {
      Alert.alert(
        'Discard post?',
        'If you go back, your changes will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

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
        <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} />
        
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
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="images-outline" size={60} color={COLORS.gray} />
        <Text style={styles.permissionText}>Allow access to your photos</Text>
        <TouchableOpacity 
          style={styles.permissionButton} 
          onPress={() => MediaLibrary.requestPermissionsAsync()}
        >
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
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
            <Image source={{ uri: selectedPreview.uri }} style={styles.previewImage} />
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
        
        <TouchableOpacity style={styles.selectMultiple}>
          <Ionicons name="copy-outline" size={18} color={COLORS.dark} />
          <Text style={styles.selectMultipleText}>Select multiple</Text>
        </TouchableOpacity>
      </View>

      {/* Media Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
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

        {/* Post Type Selector - Only show if NOT from profile */}
        {!fromProfile && (
          <View style={styles.postTypeSelector}>
            <TouchableOpacity
              style={[styles.postTypeButton, postType === 'post' && styles.postTypeButtonActive]}
              onPress={() => setPostType('post')}
            >
              <Ionicons 
                name="images" 
                size={18} 
                color={postType === 'post' ? '#fff' : COLORS.dark} 
              />
              <Text style={[styles.postTypeText, postType === 'post' && styles.postTypeTextActive]}>
                Post
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.postTypeButton, postType === 'peaks' && styles.postTypeButtonActive]}
              onPress={() => setPostType('peaks')}
            >
              <Ionicons 
                name="trending-up" 
                size={18} 
                color={postType === 'peaks' ? '#fff' : COLORS.dark} 
              />
              <Text style={[styles.postTypeText, postType === 'peaks' && styles.postTypeTextActive]}>
                Peaks
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
  selectMultiple: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectMultipleText: {
    fontSize: 14,
    color: COLORS.dark,
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
  postTypeSelector: {
    flexDirection: 'row',
    backgroundColor: '#F5F5F5',
    borderRadius: 25,
    padding: 4,
  },
  postTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  postTypeButtonActive: {
    backgroundColor: COLORS.dark,
  },
  postTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.dark,
    marginLeft: 6,
  },
  postTypeTextActive: {
    color: '#fff',
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
});