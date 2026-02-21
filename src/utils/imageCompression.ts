/**
 * Image Compression Utility
 * Compresses and resizes images before upload to reduce bandwidth and storage costs
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SaveOptions } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

// ============================================
// TYPES
// ============================================

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  format?: 'jpeg' | 'png' | 'webp';
  sourceWidth?: number;  // Skip dimension-reading call when picker provides these
  sourceHeight?: number;
}

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
  fileSize: number;
  mimeType: string;
}

export interface ImageInfo {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
}

// ============================================
// PRESETS
// ============================================

export const COMPRESSION_PRESETS = {
  // For profile avatars (small, square)
  avatar: {
    maxWidth: 400,
    maxHeight: 400,
    quality: 0.8,
    format: 'webp' as const,
  },

  // For cover images (wide)
  cover: {
    maxWidth: 1200,
    maxHeight: 600,
    quality: 0.8,
    format: 'webp' as const,
  },

  // For post images (balanced quality/size — WebP ~30% smaller than JPEG)
  post: {
    maxWidth: 1080,
    maxHeight: 1350,
    quality: 0.85,
    format: 'webp' as const,
  },

  // For thumbnails (very small)
  thumbnail: {
    maxWidth: 300,
    maxHeight: 300,
    quality: 0.7,
    format: 'webp' as const,
  },

  // For high quality (minimal compression)
  highQuality: {
    maxWidth: 2048,
    maxHeight: 2048,
    quality: 0.95,
    format: 'webp' as const,
  },

  // For messages (medium quality)
  message: {
    maxWidth: 800,
    maxHeight: 800,
    quality: 0.75,
    format: 'webp' as const,
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get file size in bytes
 */
const getFileSize = async (uri: string): Promise<number> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return (info as { size?: number }).size ?? 0;
  } catch {
    return 0;
  }
};

/**
 * Calculate new dimensions maintaining aspect ratio
 */
const calculateDimensions = (
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } => {
  let width = originalWidth;
  let height = originalHeight;

  // Scale down if larger than max dimensions
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  if (height > maxHeight) {
    width = Math.round((width * maxHeight) / height);
    height = maxHeight;
  }

  return { width, height };
};

/**
 * Get MIME type from format
 */
const getMimeType = (format: 'jpeg' | 'png' | 'webp'): string => {
  const mimeTypes = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return mimeTypes[format];
};

// ============================================
// MAIN FUNCTIONS
// ============================================

/**
 * Compress an image with custom options
 */
export const compressImage = async (
  imageUri: string,
  options: CompressionOptions = {}
): Promise<CompressedImage> => {
  const {
    maxWidth = 1080,
    maxHeight = 1350,
    quality = 0.85,
    format = 'jpeg',
    sourceWidth,
    sourceHeight,
  } = options;

  try {
    // Use provided dimensions (from ImagePicker) or read them via manipulate API
    let origWidth: number;
    let origHeight: number;
    if (sourceWidth && sourceHeight) {
      origWidth = sourceWidth;
      origHeight = sourceHeight;
    } else {
      const origRef = await ImageManipulator.manipulate(imageUri).renderAsync();
      origWidth = origRef.width;
      origHeight = origRef.height;
    }

    // Calculate new dimensions
    const { width, height } = calculateDimensions(origWidth, origHeight, maxWidth, maxHeight);

    // Build manipulation context with optional resize
    let context = ImageManipulator.manipulate(imageUri);
    if (width !== origWidth || height !== origHeight) {
      context = context.resize({ width, height });
    }

    // Determine save format
    let imgSaveFormat: SaveFormat;
    if (format === 'png') {
      imgSaveFormat = SaveFormat.PNG;
    } else if (format === 'webp') {
      imgSaveFormat = SaveFormat.WEBP;
    } else {
      imgSaveFormat = SaveFormat.JPEG;
    }

    const imageRef = await context.renderAsync();
    const result = await imageRef.saveAsync({ compress: quality, format: imgSaveFormat } as SaveOptions);

    // Get final file size
    const fileSize = await getFileSize(result.uri);

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      fileSize,
      mimeType: getMimeType(format),
    };
  } catch (error) {
    if (__DEV__) console.warn('Image compression failed:', error);
    throw error;
  }
};

/**
 * Compress image using a preset
 * Pass sourceDimensions from ImagePicker to skip the dimension-reading call
 */
export const compressWithPreset = async (
  imageUri: string,
  preset: keyof typeof COMPRESSION_PRESETS,
  sourceDimensions?: { width: number; height: number }
): Promise<CompressedImage> => {
  const options: CompressionOptions = { ...COMPRESSION_PRESETS[preset] };
  if (sourceDimensions) {
    options.sourceWidth = sourceDimensions.width;
    options.sourceHeight = sourceDimensions.height;
  }
  return compressImage(imageUri, options);
};

/**
 * Compress multiple images in parallel
 */
export const compressImages = async (
  imageUris: string[],
  options: CompressionOptions = {}
): Promise<CompressedImage[]> => {
  const compressionPromises = imageUris.map((uri) =>
    compressImage(uri, options)
  );
  return Promise.all(compressionPromises);
};

/**
 * Compress for avatar upload
 */
export const compressAvatar = (imageUri: string, dimensions?: { width: number; height: number }): Promise<CompressedImage> => {
  return compressWithPreset(imageUri, 'avatar', dimensions);
};

/**
 * Compress for cover image upload
 */
export const compressCover = (imageUri: string, dimensions?: { width: number; height: number }): Promise<CompressedImage> => {
  return compressWithPreset(imageUri, 'cover', dimensions);
};

/**
 * Compress for post upload
 */
export const compressPost = (imageUri: string, dimensions?: { width: number; height: number }): Promise<CompressedImage> => {
  return compressWithPreset(imageUri, 'post', dimensions);
};

/**
 * Compress for thumbnail
 */
export const compressThumbnail = (imageUri: string, dimensions?: { width: number; height: number }): Promise<CompressedImage> => {
  return compressWithPreset(imageUri, 'thumbnail', dimensions);
};

/**
 * Compress for message/chat image
 */
export const compressMessage = (imageUri: string, dimensions?: { width: number; height: number }): Promise<CompressedImage> => {
  return compressWithPreset(imageUri, 'message', dimensions);
};

/**
 * Smart compress - automatically chooses best settings based on file size
 */
export const smartCompress = async (
  imageUri: string,
  targetSizeKB: number = 500
): Promise<CompressedImage> => {
  const originalSize = await getFileSize(imageUri);
  const targetSize = targetSizeKB * 1024;

  // If already small enough, just do minimal processing
  if (originalSize <= targetSize) {
    return compressImage(imageUri, { quality: 0.95 });
  }

  // Calculate approximate quality needed
  const ratio = targetSize / originalSize;
  const estimatedQuality = Math.max(0.5, Math.min(0.9, ratio + 0.2));

  // Start with estimated quality
  let result = await compressImage(imageUri, { quality: estimatedQuality });

  // If still too large, progressively reduce quality
  let attempts = 0;
  while (result.fileSize > targetSize && attempts < 3) {
    const newQuality = estimatedQuality - (0.1 * (attempts + 1));
    result = await compressImage(imageUri, { quality: Math.max(0.4, newQuality) });
    attempts++;
  }

  return result;
};

/**
 * Get image info without compressing
 */
export const getImageInfo = async (imageUri: string): Promise<ImageInfo> => {
  const imageRef = await ImageManipulator.manipulate(imageUri).renderAsync();

  const fileSize = await getFileSize(imageUri);

  return {
    uri: imageUri,
    width: imageRef.width,
    height: imageRef.height,
    fileSize,
  };
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export default {
  compressImage,
  compressWithPreset,
  compressImages,
  compressAvatar,
  compressCover,
  compressPost,
  compressThumbnail,
  compressMessage,
  smartCompress,
  getImageInfo,
  formatFileSize,
  COMPRESSION_PRESETS,
};
