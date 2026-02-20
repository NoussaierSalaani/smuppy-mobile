import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
  StatusBar,
} from 'react-native';
import { FlashList, ListRenderItem } from '@shopify/flash-list';
import OptimizedImage from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, SPACING, HIT_SLOP } from '../../config/theme';
import { hapticButtonPress, hapticSubmit, hapticDestructive } from '../../utils/haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import SmuppyActionSheet from '../../components/SmuppyActionSheet';
import { useUserStore } from '../../stores/userStore';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';

import { SCREEN_WIDTH, WIDTH_CAPPED } from '../../utils/responsive';

const GRID_GAP = 2;
const ITEM_SIZE = Math.floor((WIDTH_CAPPED - GRID_GAP * 4) / 3);
const MAX_SELECTION = 10;

// Media item type
interface MediaItem {
  id: string;
  uri: string;
  mediaType: 'photo' | 'video';
  duration?: number;
}

// Route params type
type RootStackParamList = {
  CreatePost: { fromProfile?: boolean } | undefined;
  AddPostDetails: {
    media: MediaItem[];
    postType: string;
    fromProfile?: boolean;
  };
  VideoRecorder: undefined;
};

type CreatePostScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'CreatePost'>;
type CreatePostScreenRouteProp = RouteProp<RootStackParamList, 'CreatePost'>;

interface CreatePostScreenProps {
  navigation: CreatePostScreenNavigationProp;
  route: CreatePostScreenRouteProp;
}

// --- Memoized grid item to prevent full-list re-renders on selection change ---
interface MediaGridItemProps {
  item: MediaLibrary.Asset;
  selectionIndex: number | null;
  isPreview: boolean;
  onPress: (item: MediaLibrary.Asset) => void;
  onSelectionToggle: (item: MediaLibrary.Asset) => void;
  styles: ReturnType<typeof createStyles>;
}

const MediaGridItem = React.memo(function MediaGridItem({
  item,
  selectionIndex,
  isPreview,
  onPress,
  onSelectionToggle,
  styles,
}: MediaGridItemProps) {
  const isSelected = selectionIndex !== null;

  const handlePress = useCallback(() => {
    hapticButtonPress();
    onPress(item);
  }, [onPress, item]);

  const handleLongPress = useCallback(() => {
    hapticButtonPress();
    onSelectionToggle(item);
  }, [onSelectionToggle, item]);

  const handleSelectionPress = useCallback(() => {
    hapticButtonPress();
    onSelectionToggle(item);
  }, [onSelectionToggle, item]);

  return (
    <TouchableOpacity
      style={[styles.mediaItem, isPreview && styles.mediaItemPreview]}
      onPress={handlePress}
      onLongPress={handleLongPress}
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
        onPress={handleSelectionPress}
        hitSlop={HIT_SLOP.small}
      >
        {isSelected ? (
          <Text style={styles.selectionNumber}>{selectionIndex}</Text>
        ) : (
          <View style={styles.selectionCircleInner} />
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}, (prev, next) => (
  prev.item.id === next.item.id &&
  prev.selectionIndex === next.selectionIndex &&
  prev.isPreview === next.isPreview &&
  prev.styles === next.styles
));

export default function CreatePostScreen({ navigation, route: _route }: CreatePostScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const fromProfile = _route?.params?.fromProfile ?? false;
  const { showError: errorAlert, showWarning: warningAlert } = useSmuppyAlert();
  const storeUser = useUserStore((state) => state.user);
  const isPro = storeUser?.accountType === 'pro_creator' || storeUser?.accountType === 'pro_business';
  const maxVideoDuration = isPro ? 300 : 60;
  const [mediaAssets, setMediaAssets] = useState<MediaLibrary.Asset[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<MediaItem | MediaLibrary.Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showCameraSheet, setShowCameraSheet] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Refs for stable callbacks (avoid stale closures in memoized items)
  const selectedMediaRef = useRef(selectedMedia);
  selectedMediaRef.current = selectedMedia;
  const selectedPreviewRef = useRef(selectedPreview);
  selectedPreviewRef.current = selectedPreview;

  // O(1) selection index lookup
  const selectedIdsMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedMedia.forEach((m, i) => map.set(m.id, i + 1));
    return map;
  }, [selectedMedia]);

  // Memoized extraData for FlashList — changes when selection or preview changes
  const flashListExtraData = useMemo(
    () => ({ selectedIdsMap, previewId: selectedPreview?.id }),
    [selectedIdsMap, selectedPreview?.id]
  );

  // Post type is always 'post' for this screen (Peaks use CreatePeakScreen)

  // Load media from gallery
  const loadMedia = useCallback(async () => {
    try {
      // Load first batch quickly, then load more in background
      const { assets, endCursor, hasNextPage } = await MediaLibrary.getAssetsAsync({
        mediaType: ['photo', 'video'],
        sortBy: ['creationTime'],
        first: 30,
      });

      setMediaAssets(assets);
      if (assets.length > 0) {
        setSelectedPreview(assets[0]);
      }
      setLoading(false);

      // Load remaining assets in background
      if (hasNextPage && endCursor) {
        const { assets: moreAssets } = await MediaLibrary.getAssetsAsync({
          mediaType: ['photo', 'video'],
          sortBy: ['creationTime'],
          first: 70,
          after: endCursor,
        });
        setMediaAssets(prev => [...prev, ...moreAssets]);
      }
    } catch (error) {
      if (__DEV__) console.error('[CreatePost] Failed to load media:', error);
      setLoading(false);
      errorAlert('Gallery Error', 'Could not load your photos. Please check permissions and try again.');
    }
  }, [errorAlert]);

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
  }, [loadMedia]);

  // Open camera
  const openCamera = () => {
    setShowCameraSheet(true);
  };

  const getCameraSheetOptions = () => [
    {
      label: 'Take Photo',
      icon: 'camera-outline',
      onPress: takePhoto,
    },
    {
      label: 'Record Video',
      icon: 'videocam-outline',
      onPress: () => navigation.navigate('VideoRecorder'),
    },
  ];

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== 'granted') {
        warningAlert('Permission Needed', 'Please allow camera access to take photos.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
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
    } catch (_error) {
      errorAlert(
        'Camera Not Available',
        'Camera is not available on this device. Please select from your photo library instead.'
      );
    }
  };

  // Stable callback for grid item tap
  const handleItemPress = useCallback((item: MediaLibrary.Asset) => {
    if (!item?.uri) return;
    setSelectedPreview(item);
    if (selectedMediaRef.current.length === 0) {
      const mediaItem: MediaItem = {
        id: item.id,
        uri: item.uri,
        mediaType: item.mediaType === 'video' ? 'video' : 'photo',
        duration: item.duration,
      };
      setSelectedMedia([mediaItem]);
    }
  }, []);

  // Stable callback for selection toggle (long press or circle tap)
  const handleSelectionToggle = useCallback((item: MediaLibrary.Asset) => {
    const current = selectedMediaRef.current;
    const preview = selectedPreviewRef.current;

    const mediaItem: MediaItem = {
      id: item.id,
      uri: item.uri,
      mediaType: item.mediaType === 'video' ? 'video' : 'photo',
      duration: item.duration,
    };

    const isSelected = current.find(m => m.id === item.id);

    if (isSelected) {
      const newSelection = current.filter(m => m.id !== item.id);
      setSelectedMedia(newSelection);
      if (preview?.id === item.id && newSelection.length > 0) {
        setSelectedPreview(newSelection[0]);
      } else if (newSelection.length === 0) {
        setSelectedPreview(item);
      }
    } else {
      if (current.length >= MAX_SELECTION) {
        warningAlert('Limit Reached', `You can select up to ${MAX_SELECTION} items.`);
        return;
      }

      if (item.mediaType === 'video') {
        if (item.duration == null) {
          warningAlert('Video Error', 'Could not determine video duration. Please try another video.');
          return;
        }
        if (item.duration > maxVideoDuration) {
          warningAlert('Video Too Long', `Videos must be ${maxVideoDuration} seconds or less.${!isPro ? ' Upgrade to Pro for longer videos.' : ''}`);
          return;
        }
      }

      setSelectedMedia([...current, mediaItem]);
      setSelectedPreview(item);
    }
  }, [warningAlert, isPro, maxVideoDuration]);

  // Handle next - MEDIA IS REQUIRED
  const handleNext = () => {
    hapticSubmit();
    if (selectedMedia.length === 0) {
      warningAlert(
        'Select Media',
        'Please select at least one photo or video to create a post.'
      );
      return;
    }

    navigation.navigate('AddPostDetails', {
      media: selectedMedia,
      postType: 'post',
      fromProfile,
    });
  };

  // Handle close - GO BACK instead of navigate to Home
  const handleClose = () => {
    hapticButtonPress();
    if (selectedMedia.length > 0) {
      setShowDiscardModal(true);
    } else {
      navigation.goBack();
    }
  };

  // Render custom discard modal - Smuppy branded
  const handleKeepEditing = useCallback(() => {
    hapticButtonPress();
    setShowDiscardModal(false);
  }, []);

  const handleDiscard = useCallback(() => {
    hapticDestructive();
    setShowDiscardModal(false);
    navigation.goBack();
  }, [navigation]);

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
            <Ionicons name="image-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.modalTitle}>Discard post?</Text>
          <Text style={styles.modalMessage}>
            If you leave now, your selected photos and videos won't be saved.
          </Text>
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.keepEditingButton}
              onPress={handleKeepEditing}
            >
              <Text style={styles.keepEditingText}>Keep editing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.discardButton}
              onPress={handleDiscard}
            >
              <Text style={styles.discardButtonText}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Render media item — delegates to memoized MediaGridItem
  const renderMediaItem: ListRenderItem<MediaLibrary.Asset> = useCallback(({ item }) => (
    <MediaGridItem
      item={item}
      selectionIndex={selectedIdsMap.get(item.id) ?? null}
      isPreview={selectedPreview?.id === item.id}
      onPress={handleItemPress}
      onSelectionToggle={handleSelectionToggle}
      styles={styles}
    />
  ), [selectedIdsMap, selectedPreview?.id, handleItemPress, handleSelectionToggle, styles]);

  // No permission view
  if (!hasPermission && !loading) {
    return (
      <View style={styles.container}>
        {/* Close button */}
        <TouchableOpacity
          style={[styles.permissionCloseButton, { top: insets.top + 10 }]}
          onPress={() => { hapticButtonPress(); navigation.goBack(); }}
          hitSlop={HIT_SLOP.medium}
        >
          <Ionicons name="close" size={28} color={colors.dark} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Ionicons name="images-outline" size={60} color={colors.gray} />
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
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Safe area fill - covers status bar area on modal presentations */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.background, zIndex: 10 }} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.background, zIndex: 5 }]}>
        <TouchableOpacity onPress={handleClose} hitSlop={HIT_SLOP.medium}>
          <Ionicons name="close" size={28} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create post</Text>
        <TouchableOpacity onPress={handleNext} hitSlop={HIT_SLOP.medium}>
          <LinearGradient
            colors={selectedMedia.length > 0 ? GRADIENTS.primary : [colors.grayBorder, colors.grayBorder]}
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
            <Ionicons name="image-outline" size={60} color={colors.grayLight} />
            <Text style={styles.previewPlaceholderText}>Select a photo or video</Text>
          </View>
        )}
      </View>

      {/* Selected Media Carousel */}
      {selectedMedia.length > 1 && (
        <View style={styles.carouselContainer}>
          <FlatList
            data={selectedMedia}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.carouselContent}
            renderItem={({ item, index }) => {
              const isActive = selectedPreview?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.carouselItem, isActive && styles.carouselItemActive]}
                  onPress={() => setSelectedPreview(item)}
                  activeOpacity={0.8}
                >
                  <OptimizedImage source={item.uri} style={styles.carouselImage} />
                  {item.mediaType === 'video' && (
                    <View style={styles.carouselVideoIcon}>
                      <Ionicons name="play" size={10} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.carouselIndex}>{index + 1}</Text>
                  <TouchableOpacity
                    style={styles.carouselRemove}
                    onPress={() => {
                      const newSelection = selectedMedia.filter(m => m.id !== item.id);
                      setSelectedMedia(newSelection);
                      if (isActive && newSelection.length > 0) {
                        setSelectedPreview(newSelection[0]);
                      } else if (newSelection.length === 0) {
                        setSelectedPreview(mediaAssets[0] || null);
                      }
                    }}
                    hitSlop={HIT_SLOP.small}
                  >
                    <Ionicons name="close-circle" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Gallery Header */}
      <View style={[styles.galleryHeader, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={styles.galleryTab}
          onPress={() => {
            // Future: Open album picker
          }}
        >
          <Text style={styles.galleryTabText}>Recent</Text>
          <Ionicons name="chevron-down" size={18} color={colors.dark} />
        </TouchableOpacity>

        {/* Selection count indicator */}
        {selectedMedia.length > 0 && (
          <View style={styles.selectionCount}>
            <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
            <Text style={styles.selectionCountText}>{selectedMedia.length} selected</Text>
          </View>
        )}
      </View>

      {/* Media Grid */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlashList<MediaLibrary.Asset>
          data={mediaAssets}
          renderItem={renderMediaItem}
          keyExtractor={(item) => item.id}
          numColumns={3}
          extraData={flashListExtraData}
          drawDistance={ITEM_SIZE * 3}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.mediaGrid}
          style={styles.mediaList}
        />
      )}

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { paddingBottom: insets.bottom + 20 }]}>
        {/* Camera Button */}
        <TouchableOpacity style={styles.cameraButton} onPress={() => { hapticButtonPress(); openCamera(); }} hitSlop={HIT_SLOP.medium}>
          <Ionicons name="camera" size={24} color={colors.dark} />
        </TouchableOpacity>
      </View>

      {/* Discard Modal */}
      {renderDiscardModal()}

      {/* Camera Action Sheet */}
      <SmuppyActionSheet
        visible={showCameraSheet}
        onClose={() => setShowCameraSheet(false)}
        title="Camera"
        subtitle="What do you want to capture?"
        options={getCameraSheetOptions()}
      />
    </View>
  );
}

const createStyles = (colors: typeof import('../../config/theme').COLORS, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.dark,
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
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.75,
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
    color: colors.grayLight,
    fontSize: 14,
    marginTop: 10,
  },
  previewPlayButton: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  multipleIndicator: {
    position: 'absolute',
    top: 15,
    right: 15,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  multipleIndicatorText: {
    color: isDark ? '#000' : '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 5,
  },

  // Selected Media Carousel
  carouselContainer: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
  },
  carouselContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  carouselItem: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  carouselItemActive: {
    borderColor: colors.primary,
  },
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  carouselVideoIcon: {
    position: 'absolute',
    bottom: 3,
    left: 3,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselIndex: {
    position: 'absolute',
    top: 3,
    left: 5,
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  carouselRemove: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: colors.background,
    borderRadius: 9,
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
    color: colors.dark,
    marginRight: 4,
  },
  selectionCount: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(14,191,138,0.2)' : '#E6FAF8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  selectionCountText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
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
    paddingHorizontal: GRID_GAP,
    paddingBottom: 90,
  },
  mediaList: {
    flex: 1,
  },
  mediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: GRID_GAP / 2,
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
    backgroundColor: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  videoDurationText: {
    color: isDark ? '#000' : '#fff',
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
    backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionCircleActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.grayBorder,
  },
  cameraButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Permission
  permissionText: {
    fontSize: 16,
    color: colors.gray,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  permissionButton: {
    backgroundColor: colors.primary,
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
    backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  modalIconBox: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: isDark ? 'rgba(14,191,138,0.2)' : '#E6FAF8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: colors.gray,
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
    borderColor: colors.primary,
    alignItems: 'center',
  },
  keepEditingText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
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
