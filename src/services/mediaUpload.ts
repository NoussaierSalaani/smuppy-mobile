/**
 * Media Upload Service
 * Handles uploads to AWS S3 with presigned URLs and CloudFront CDN
 */

import * as FileSystem from 'expo-file-system/legacy';
import { ENV } from '../config/env';

// VideoThumbnails est un module natif qui nécessite un build de développement
// En Expo Go, on utilise une fallback sans thumbnail
let VideoThumbnails: typeof import('expo-video-thumbnails') | null = null;
try {
  VideoThumbnails = require('expo-video-thumbnails');
} catch {
  // Module natif non disponible (Expo Go)
  VideoThumbnails = null;
}
import { captureException } from '../lib/sentry';
import {
  compressImage,
  compressAvatar,
  compressCover,
  compressPost,
  compressThumbnail,
  CompressedImage,
  CompressionOptions,
} from '../utils/imageCompression';

// ============================================
// TYPES
// ============================================

export interface UploadOptions {
  folder?: 'avatars' | 'covers' | 'posts' | 'peaks' | 'messages' | 'thumbnails';
  compress?: boolean;
  compressionOptions?: CompressionOptions;
  onProgress?: (progress: number) => void;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  success: boolean;
  key?: string;
  url?: string;
  cdnUrl?: string;
  error?: string;
  fileSize?: number;
}

export interface PresignedUrlResponse {
  uploadUrl: string;
  key: string;
  cdnUrl: string;
}

export interface MediaFile {
  uri: string;
  type: 'image' | 'video';
  fileName?: string;
  mimeType?: string;
}

// ============================================
// CONFIGURATION
// ============================================

const S3_CONFIG = {
  bucket: ENV.S3_BUCKET_NAME || '',
  region: ENV.AWS_REGION || 'us-east-1',
  cloudFrontUrl: ENV.CLOUDFRONT_URL || '',
};

// Supported MIME types
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

// Max file sizes (in bytes)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a unique file key for S3
 */
const generateFileKey = (
  folder: string,
  userId: string,
  fileName: string,
  extension: string
): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8); // NOSONAR
  return `${folder}/${userId}/${timestamp}-${random}.${extension}`;
};

/**
 * Get file extension from URI or MIME type
 */
const getFileExtension = (uri: string, mimeType?: string): string => {
  // Try to get from MIME type first
  if (mimeType) {
    const mimeExtensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/quicktime': 'mov',
      'video/x-m4v': 'm4v',
    };
    if (mimeExtensions[mimeType]) {
      return mimeExtensions[mimeType];
    }
  }

  // Fall back to URI extension
  const match = uri.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : 'jpg';
};

/**
 * Get MIME type from extension
 */
const getMimeType = (extension: string): string => {
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

/**
 * Get file info - handles various URI formats
 * For ph:// URIs, validates via fetch HEAD instead of blindly assuming existence
 */
const getFileInfo = async (uri: string): Promise<{ size: number; exists: boolean }> => {
  try {
    // For ph:// / assets-library:// URIs on iOS, validate via fetch
    if (uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
      try {
        const response = await fetch(uri, { method: 'HEAD' });
        return { size: 0, exists: response.ok };
      } catch {
        // fetch failed — asset may have been deleted
        return { size: 0, exists: false };
      }
    }

    // For http/https URIs
    if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return { size: 0, exists: true };
    }

    const info = await FileSystem.getInfoAsync(uri);
    return {
      size: (info as { size?: number }).size ?? 0,
      exists: info.exists,
    };
  } catch (error) {
    if (__DEV__) console.log('[getFileInfo] Error checking file:', uri.substring(0, 50), error);
    return { size: 0, exists: false };
  }
};

/**
 * Read file as base64 using fetch/blob (modern approach)
 * Replaces deprecated FileSystem.readAsStringAsync
 * Handles various URI formats including ph:// on iOS
 */
const readFileAsBase64 = async (uri: string): Promise<string> => {
  try {
    // Try fetch first (works for most URIs including file://)
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
        const base64 = dataUrl.split(',')[1];
        if (!base64) {
          reject(new Error('Failed to extract base64 from data URL'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(blob);
    });
  } catch (fetchError) {
    // Fallback: try using FileSystem for file:// URIs
    if (uri.startsWith('file://')) {
      if (__DEV__) console.log('[readFileAsBase64] Fetch failed, trying FileSystem...');
      // Use the legacy method as fallback
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      return base64;
    }
    throw fetchError;
  }
};

/**
 * Validate file before upload
 */
const validateFile = async (
  uri: string,
  type: 'image' | 'video',
  mimeType?: string
): Promise<{ valid: boolean; error?: string }> => {
  const fileInfo = await getFileInfo(uri);

  if (!fileInfo.exists) {
    return { valid: false, error: 'File not found' };
  }

  const maxSize = type === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
  if (fileInfo.size > maxSize) {
    const maxSizeMB = maxSize / (1024 * 1024);
    return { valid: false, error: `File too large. Max size: ${maxSizeMB}MB` };
  }

  if (mimeType) {
    const supportedTypes = type === 'image' ? SUPPORTED_IMAGE_TYPES : SUPPORTED_VIDEO_TYPES;
    if (!supportedTypes.includes(mimeType)) {
      return { valid: false, error: `Unsupported file type: ${mimeType}` };
    }
  }

  return { valid: true };
};

// ============================================
// PRESIGNED URL FUNCTIONS
// ============================================

/**
 * Get presigned URL from AWS Lambda via API Gateway
 */
export const getPresignedUrl = async (
  fileName: string,
  folder: string,
  contentType: string,
  duration?: number,
): Promise<PresignedUrlResponse | null> => {
  try {
    if (__DEV__) console.log('[getPresignedUrl] Requesting URL for:', fileName.substring(0, 60), 'type:', contentType);

    // Import AWS API service
    const { awsAPI } = await import('./aws-api');

    // Use AWS API to get presigned URL
    const result = await awsAPI.getUploadUrl(fileName, contentType, undefined, duration);

    if (__DEV__) console.log('[getPresignedUrl] Got URL, key:', result.fileUrl?.substring(0, 60));

    if (!result.uploadUrl || !result.fileUrl) {
      if (__DEV__) console.log('[getPresignedUrl] Missing uploadUrl or fileUrl in response:', JSON.stringify(result).substring(0, 200));
      return null;
    }

    return {
      uploadUrl: result.uploadUrl,
      key: result.fileUrl,
      cdnUrl: awsAPI.getCDNUrl(result.fileUrl),
    };
  } catch (error) {
    if (__DEV__) console.log('[getPresignedUrl] Error:', error);
    captureException(error as Error, { context: 'getPresignedUrl', fileName, folder, contentType });
    return null;
  }
};

// ============================================
// CLOUDFRONT URL FUNCTIONS
// ============================================

/**
 * Convert S3 key to CloudFront URL
 */
export const getCloudFrontUrl = (key: string): string => {
  if (!S3_CONFIG.cloudFrontUrl) {
    // Fall back to S3 URL if CloudFront not configured
    return `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${key}`;
  }
  return `${S3_CONFIG.cloudFrontUrl}/${key}`;
};

/**
 * Convert S3 URL to CloudFront URL
 */
export const s3ToCloudFront = (s3Url: string): string => {
  if (!S3_CONFIG.cloudFrontUrl) return s3Url;

  // Extract key from S3 URL
  const keyMatch = s3Url.match(/amazonaws\.com\/(.+)$/);
  if (keyMatch) {
    return `${S3_CONFIG.cloudFrontUrl}/${keyMatch[1]}`;
  }
  return s3Url;
};

// ============================================
// UPLOAD FUNCTIONS
// ============================================

/**
 * Upload file to S3 using presigned URL (fetch-based, works for images)
 */
export const uploadToS3 = async (
  fileUri: string,
  presignedUrl: string,
  contentType: string,
  onProgress?: (progress: number) => void
): Promise<boolean> => {
  try {
    if (__DEV__) console.log('[uploadToS3] Reading file:', fileUri.substring(0, 80));
    const fileBase64 = await readFileAsBase64(fileUri);
    const fileBlob = Uint8Array.from(atob(fileBase64), (c) => c.codePointAt(0) ?? 0);
    if (__DEV__) console.log('[uploadToS3] File size:', fileBlob.length, 'bytes, contentType:', contentType);

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileBlob.length),
      },
      body: fileBlob,
    });

    if (!response.ok) {
      const body = await response.text().catch((e) => { if (__DEV__) console.log('[uploadToS3] Failed to read response body:', e); return ''; });
      if (__DEV__) console.log('[uploadToS3] S3 returned', response.status, body.substring(0, 300));
      throw new Error(`Upload failed: ${response.status}`);
    }

    if (__DEV__) console.log('[uploadToS3] Upload succeeded');
    onProgress?.(100);
    return true;
  } catch (error) {
    if (__DEV__) console.log('[uploadToS3] Error:', error);
    captureException(error as Error, { context: 'uploadToS3' });
    return false;
  }
};

/**
 * Upload using Expo FileSystem (better for large files / videos)
 */
export const uploadWithFileSystem = async (
  fileUri: string,
  presignedUrl: string,
  contentType: string,
  onProgress?: (progress: number) => void
): Promise<boolean> => {
  try {
    if (__DEV__) console.log('[uploadFS] Uploading:', fileUri.substring(0, 80), 'contentType:', contentType);

    const uploadResult = await FileSystem.uploadAsync(presignedUrl, fileUri, {
      httpMethod: 'PUT',
      uploadType: 0, // FileSystemUploadType.BINARY_CONTENT
      headers: {
        'Content-Type': contentType,
      },
    });

    if (__DEV__) console.log('[uploadFS] Status:', uploadResult.status, 'body:', (uploadResult.body || '').substring(0, 200));

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      onProgress?.(100);
      return true;
    }

    // FileSystem upload failed — try fetch-based fallback for non-video files
    if (__DEV__) console.log('[uploadFS] FileSystem upload failed, trying fetch fallback...');
    return uploadToS3(fileUri, presignedUrl, contentType, onProgress);
  } catch (error) {
    if (__DEV__) console.log('[uploadFS] Error:', error, '— trying fetch fallback...');
    // Fallback: try fetch-based upload
    try {
      return await uploadToS3(fileUri, presignedUrl, contentType, onProgress);
    } catch (fallbackError) {
      if (__DEV__) console.log('[uploadFS] Fallback also failed:', fallbackError);
      captureException(error as Error, { context: 'uploadWithFileSystem' });
      return false;
    }
  }
};

// ============================================
// MAIN UPLOAD FUNCTIONS
// ============================================

/**
 * Upload a single image
 */
export const uploadImage = async (
  userId: string,
  imageUri: string,
  options: UploadOptions = {}
): Promise<UploadResult> => {
  const {
    folder = 'posts',
    compress = true,
    compressionOptions,
    onProgress,
  } = options;

  try {
    if (__DEV__) console.log('[uploadImage] Start — folder:', folder, 'uri:', imageUri.substring(0, 60));

    // Validate
    const validation = await validateFile(imageUri, 'image');
    if (!validation.valid) {
      if (__DEV__) console.log('[uploadImage] Validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    // Compress if needed
    let finalUri = imageUri;
    let mimeType = 'image/jpeg';
    let fileSize = 0;

    if (compress) {
      let compressed: CompressedImage;

      switch (folder) {
        case 'avatars':
          compressed = await compressAvatar(imageUri);
          break;
        case 'covers':
          compressed = await compressCover(imageUri);
          break;
        case 'thumbnails':
          compressed = await compressThumbnail(imageUri);
          break;
        default:
          compressed = compressionOptions
            ? await compressImage(imageUri, compressionOptions)
            : await compressPost(imageUri);
      }

      finalUri = compressed.uri;
      mimeType = compressed.mimeType;
      fileSize = compressed.fileSize;
      if (__DEV__) console.log('[uploadImage] Compressed:', fileSize, 'bytes, mime:', mimeType, 'uri:', finalUri.substring(0, 60));
      onProgress?.(30);
    }

    // Generate file key
    const extension = getFileExtension(finalUri, mimeType);
    const key = generateFileKey(folder, userId, 'image', extension);

    // Get presigned URL
    onProgress?.(40);
    const presignedData = await getPresignedUrl(key, folder, mimeType);

    if (!presignedData) {
      if (__DEV__) console.log('[uploadImage] Failed to get presigned URL');
      return { success: false, error: 'Failed to get upload URL. Check your connection.' };
    }

    // Upload
    onProgress?.(50);
    if (__DEV__) console.log('[uploadImage] Uploading to S3...');
    const uploadSuccess = await uploadWithFileSystem(
      finalUri,
      presignedData.uploadUrl,
      mimeType,
      (p) => onProgress?.(50 + (p * 0.5))
    );

    if (!uploadSuccess) {
      if (__DEV__) console.log('[uploadImage] Upload to S3 failed');
      return { success: false, error: 'Upload to storage failed. Please try again.' };
    }

    if (__DEV__) console.log('[uploadImage] Success — key:', presignedData.key);

    return {
      success: true,
      key: presignedData.key,
      url: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${presignedData.key}`,
      cdnUrl: presignedData.cdnUrl || getCloudFrontUrl(presignedData.key),
      fileSize,
    };
  } catch (error) {
    if (__DEV__) console.warn('[uploadImage] Error:', error);
    captureException(error as Error, { context: 'uploadImage', folder });
    return { success: false, error: 'Upload failed' };
  }
};

/**
 * Upload a video
 */
export const uploadVideo = async (
  userId: string,
  videoUri: string,
  options: UploadOptions = {}
): Promise<UploadResult> => {
  const { folder = 'posts', onProgress } = options;

  try {
    if (__DEV__) console.log('[uploadVideo] Start — uri:', videoUri.substring(0, 60));

    // Validate
    const validation = await validateFile(videoUri, 'video');
    if (!validation.valid) {
      if (__DEV__) console.log('[uploadVideo] Validation failed:', validation.error);
      return { success: false, error: validation.error };
    }

    const extension = getFileExtension(videoUri);
    const mimeType = getMimeType(extension);
    const key = generateFileKey(folder, userId, 'video', extension);
    if (__DEV__) console.log('[uploadVideo] ext:', extension, 'mime:', mimeType);

    // Get presigned URL
    onProgress?.(20);
    const presignedData = await getPresignedUrl(key, folder, mimeType);

    if (!presignedData) {
      if (__DEV__) console.log('[uploadVideo] Failed to get presigned URL');
      return { success: false, error: 'Failed to get upload URL. Check your connection.' };
    }

    // Upload
    onProgress?.(30);
    if (__DEV__) console.log('[uploadVideo] Uploading to S3...');
    const uploadSuccess = await uploadWithFileSystem(
      videoUri,
      presignedData.uploadUrl,
      mimeType,
      (p) => onProgress?.(30 + (p * 0.7))
    );

    if (!uploadSuccess) {
      if (__DEV__) console.log('[uploadVideo] Upload to S3 failed');
      return { success: false, error: 'Upload to storage failed. Please try again.' };
    }

    if (__DEV__) console.log('[uploadVideo] Success — key:', presignedData.key);

    const fileInfo = await getFileInfo(videoUri);

    return {
      success: true,
      key: presignedData.key,
      url: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${presignedData.key}`,
      cdnUrl: presignedData.cdnUrl || getCloudFrontUrl(presignedData.key),
      fileSize: fileInfo.size,
    };
  } catch (error) {
    if (__DEV__) console.warn('[uploadVideo] Error:', error);
    captureException(error as Error, { context: 'uploadVideo', folder });
    return { success: false, error: 'Upload failed' };
  }
};

/**
 * Upload multiple files
 */
export const uploadMultiple = async (
  userId: string,
  files: MediaFile[],
  options: UploadOptions = {}
): Promise<UploadResult[]> => {
  const results: UploadResult[] = [];
  const totalFiles = files.length;

  for (const [i, file] of files.entries()) {
    const fileProgress = (progress: number) => {
      const overallProgress = ((i / totalFiles) + (progress / 100 / totalFiles)) * 100;
      options.onProgress?.(overallProgress);
    };

    const result = file.type === 'video'
      ? await uploadVideo(userId, file.uri, { ...options, onProgress: fileProgress })
      : await uploadImage(userId, file.uri, { ...options, onProgress: fileProgress });

    results.push(result);
  }

  return results;
};

/**
 * Upload avatar with automatic compression
 */
export const uploadAvatar = (userId: string, imageUri: string): Promise<UploadResult> => {
  return uploadImage(userId, imageUri, { folder: 'avatars', compress: true });
};

/**
 * Upload cover image with automatic compression
 */
export const uploadCoverImage = (userId: string, imageUri: string): Promise<UploadResult> => {
  return uploadImage(userId, imageUri, { folder: 'covers', compress: true });
};

/**
 * Upload post media
 */
export const uploadPostMedia = (
  userId: string,
  mediaUri: string,
  type: 'image' | 'video',
  onProgress?: (progress: number) => void
): Promise<UploadResult> => {
  return type === 'video'
    ? uploadVideo(userId, mediaUri, { folder: 'posts', onProgress })
    : uploadImage(userId, mediaUri, { folder: 'posts', compress: true, onProgress });
};

/**
 * Upload peak video (stored in peaks/{userId}/ on S3)
 */
export const uploadPeakMedia = (
  userId: string,
  videoUri: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> => {
  return uploadVideo(userId, videoUri, { folder: 'peaks', onProgress });
};

/**
 * Generate a thumbnail image from a video URI
 * Returns the local thumbnail URI or null on failure
 */
export const generateVideoThumbnail = async (videoUri: string): Promise<string | null> => {
  try {
    if (!VideoThumbnails) {
      if (__DEV__) console.warn('[generateVideoThumbnail] Module not available in Expo Go');
      return null;
    }
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000 });
    return uri;
  } catch {
    if (__DEV__) console.warn('[generateVideoThumbnail] Failed');
    return null;
  }
};

// ============================================
// DELETE FUNCTIONS
// ============================================

/**
 * Delete file from S3
 * Note: This should be done server-side for security
 */
export const deleteFromS3 = async (key: string): Promise<boolean> => {
  try {
    const response = await fetch(`${ENV.API_URL}/media/delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ key }),
    });

    return response.ok;
  } catch (error) {
    if (__DEV__) console.warn('Delete error:', error);
    captureException(error as Error, { context: 'deleteFromS3', key });
    return false;
  }
};

export default {
  uploadImage,
  uploadVideo,
  uploadMultiple,
  uploadAvatar,
  uploadCoverImage,
  uploadPostMedia,
  uploadPeakMedia,
  generateVideoThumbnail,
  deleteFromS3,
  getCloudFrontUrl,
  s3ToCloudFront,
  getPresignedUrl,
};
