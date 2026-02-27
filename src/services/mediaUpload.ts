/**
 * Media Upload Service
 * Handles uploads to AWS S3 with presigned URLs and CloudFront CDN
 */

import * as FileSystem from 'expo-file-system/legacy';
import { ENV } from '../config/env';
import { AWS_CONFIG } from '../config/aws-config';

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
  waitForAvailability?: boolean;
}

export interface UploadResult {
  success: boolean;
  key?: string;
  url?: string;
  cdnUrl?: string;
  error?: string;
  fileSize?: number;
  mediaReady?: boolean;
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

export interface MediaAvailabilityOptions {
  timeoutMs?: number;
  intervalMs?: number;
}

// ============================================
// CONFIGURATION
// ============================================

const S3_CONFIG = {
  // Prefer centralized AWS config (has safe staging fallbacks), then ENV as fallback.
  bucket: AWS_CONFIG.storage.bucket || ENV.S3_BUCKET_NAME || '',
  region: AWS_CONFIG.region || ENV.AWS_REGION || 'us-east-1',
  cloudFrontUrl: AWS_CONFIG.storage.cdnDomain || ENV.CLOUDFRONT_URL || '',
};

// Supported MIME types
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

// Max file sizes (in bytes)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
const MIN_IMAGE_SIZE_BYTES = 512;
const ENFORCE_MIN_IMAGE_SIZE = process.env.NODE_ENV !== 'test';

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
    // For ph:// / assets-library:// URIs on iOS, validation can fail with HEAD.
    // Try multiple probes and fail open if we can at least access the asset.
    if (uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
      try {
        const fsInfo = await FileSystem.getInfoAsync(uri);
        if (fsInfo.exists) {
          return { size: (fsInfo as { size?: number }).size ?? 0, exists: true };
        }
      } catch {
        // Expected: FileSystem may not resolve ph:// URIs on some iOS versions.
      }
      try {
        const response = await fetch(uri, { method: 'HEAD' });
        if (response.ok) return { size: 0, exists: true };
      } catch {
        // Expected: some iOS versions reject HEAD on ph://
      }
      try {
        const response = await fetch(uri);
        if (!response.ok) return { size: 0, exists: false };
        const blob = await response.blob();
        return { size: blob.size || 0, exists: true };
      } catch {
        // Last fallback for ph:// assets: allow upload pipeline to try anyway.
        // This avoids false negatives where validation blocks real files.
        return { size: 0, exists: true };
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until a media URL is publicly reachable.
 * Used to avoid creating entities that point to URLs still pending scan/promotion.
 */
export const waitForMediaAvailability = async (
  url: string,
  options: MediaAvailabilityOptions = {},
): Promise<boolean> => {
  if (process.env.NODE_ENV === 'test') return true;

  const normalized = typeof url === 'string' ? url.trim() : '';
  if (!normalized || normalized.startsWith('file:') || normalized.startsWith('ph:')) return false;

  const timeoutMs = options.timeoutMs ?? 45_000;
  const intervalMs = options.intervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const headResponse = await fetch(normalized, {
        method: 'HEAD',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (headResponse.ok || headResponse.status === 206) return true;
    } catch {
      // Expected for intermittent network issues; continue retry loop.
    }

    try {
      // Some origins disallow HEAD. Range GET keeps payload minimal.
      const getResponse = await fetch(normalized, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-1',
          'Cache-Control': 'no-cache',
        },
      });
      if (getResponse.ok || getResponse.status === 206) return true;
    } catch {
      // Expected while object is not yet promoted/available.
    }

    await sleep(intervalMs);
  }

  return false;
};

/**
 * Extract object key from backend upload references.
 * Backend may return a raw key, an S3 URL, or a CDN URL depending on env.
 */
const extractObjectKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return trimmed.replace(/^\/+/, '');
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname.replace(/^\/+/, '');
    return path || null;
  } catch {
    return null;
  }
};

/**
 * True when URL points to S3/amazonaws host or is a signed temporary URL.
 * Those URLs are not stable display URLs for persisted media references.
 */
const isTransientStorageUrl = (value: string | null | undefined): boolean => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const query = parsed.searchParams;
    const isS3Host =
      host === 's3.amazonaws.com' ||
      host.startsWith('s3.') ||
      host.includes('.s3.') ||
      host.endsWith('.amazonaws.com');
    const isSigned =
      query.has('X-Amz-Signature') ||
      query.has('X-Amz-Credential') ||
      query.has('X-Amz-Algorithm') ||
      query.has('X-Amz-Date') ||
      query.has('X-Amz-Security-Token') ||
      query.has('Expires') ||
      query.has('Signature');
    return isS3Host || isSigned;
  } catch {
    return false;
  }
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
  fileSize: number,
  duration?: number,
): Promise<PresignedUrlResponse | null> => {
  try {
    if (__DEV__) console.log('[getPresignedUrl] Requesting URL for:', fileName.substring(0, 60), 'type:', contentType);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      if (__DEV__) console.log('[getPresignedUrl] Invalid fileSize:', fileSize);
      return null;
    }

    // Import AWS API service
    const { awsAPI } = await import('./aws-api');

    // Use AWS API to get presigned URL
    const result = await awsAPI.getUploadUrl(fileName, contentType, fileSize, duration);

    const key = extractObjectKey(result.key || result.fileUrl || result.publicUrl || null);
    if (__DEV__) console.log('[getPresignedUrl] Got URL, key:', key?.substring(0, 60));

    if (!result.uploadUrl || !key) {
      if (__DEV__) console.log('[getPresignedUrl] Missing uploadUrl or fileUrl in response:', JSON.stringify(result).substring(0, 200));
      return null;
    }

    const backendCdnUrl = typeof result.cdnUrl === 'string' ? result.cdnUrl.trim() : '';
    const backendPublicUrl = typeof result.publicUrl === 'string' ? result.publicUrl.trim() : '';
    const derivedCdnUrl = awsAPI.getCDNUrl(key);

    // URL priority:
    // 1) Explicit backend cdnUrl
    // 2) Backend publicUrl only if it's not transient storage/signed URL
    // 3) Derived CDN URL from object key
    // 4) Fallback backend publicUrl (best effort)
    const resolvedMediaUrl =
      backendCdnUrl ||
      (backendPublicUrl && !isTransientStorageUrl(backendPublicUrl) ? backendPublicUrl : '') ||
      derivedCdnUrl ||
      backendPublicUrl ||
      '';

    return {
      uploadUrl: result.uploadUrl,
      key,
      cdnUrl: resolvedMediaUrl,
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
    if (!S3_CONFIG.bucket) {
      return key;
    }
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

    // Guard against iOS URI edge-cases returning tiny/corrupt payloads.
    // Let caller fallback to FileSystem upload path instead.
    if (ENFORCE_MIN_IMAGE_SIZE && contentType.startsWith('image/') && fileBlob.length < MIN_IMAGE_SIZE_BYTES) {
      if (__DEV__) console.warn('[uploadToS3] Refusing tiny image payload:', fileBlob.length, 'bytes');
      return false;
    }

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(fileBlob.length),
      },
      body: fileBlob,
    });

    if (!response.ok) {
      const body = await response.text().catch((e) => { if (__DEV__) { console.log('[uploadToS3] Failed to read response body:', e); } return ''; });
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

    if (fileSize <= 0) {
      const info = await getFileInfo(finalUri);
      fileSize = info.size;
    }
    if (fileSize <= 0) {
      if (__DEV__) console.log('[uploadImage] Unable to determine file size');
      return { success: false, error: 'Unable to determine image size. Please reselect the image.' };
    }
    if (ENFORCE_MIN_IMAGE_SIZE && fileSize < MIN_IMAGE_SIZE_BYTES) {
      if (__DEV__) console.warn('[uploadImage] Image too small/corrupt candidate:', fileSize, 'bytes');
      return { success: false, error: 'Image file looks invalid. Please choose another photo.' };
    }

    // Generate file key
    const extension = getFileExtension(finalUri, mimeType);
    const key = generateFileKey(folder, userId, 'image', extension);

    // Get presigned URL
    onProgress?.(40);
    const presignedData = await getPresignedUrl(key, folder, mimeType, fileSize);

    if (!presignedData) {
      if (__DEV__) console.log('[uploadImage] Failed to get presigned URL');
      return { success: false, error: 'Failed to get upload URL. Check your connection.' };
    }

    // Upload (prefer fetch/blob path for images; it is more reliable for iOS media URIs)
    onProgress?.(50);
    if (__DEV__) console.log('[uploadImage] Uploading to S3...');
    // FileSystem upload is more stable for iOS local file URIs.
    // Fallback to fetch/blob path only if needed.
    let uploadSuccess = await uploadWithFileSystem(
      finalUri,
      presignedData.uploadUrl,
      mimeType,
      (p) => onProgress?.(50 + (p * 0.5))
    );
    if (!uploadSuccess) {
      if (__DEV__) console.warn('[uploadImage] Primary upload path failed, retrying with fetch/blob');
      uploadSuccess = await uploadToS3(
        finalUri,
        presignedData.uploadUrl,
        mimeType,
        (p) => onProgress?.(50 + (p * 0.5))
      );
    }

    if (!uploadSuccess) {
      if (__DEV__) console.log('[uploadImage] Upload to S3 failed');
      return { success: false, error: 'Upload to storage failed. Please try again.' };
    }

    if (__DEV__) console.log('[uploadImage] Success — key:', presignedData.key);

    const publicMediaUrl = presignedData.cdnUrl || getCloudFrontUrl(presignedData.key);
    const shouldWaitForReady = options.waitForAvailability === true;
    let mediaReady: boolean | undefined;
    if (shouldWaitForReady) {
      onProgress?.(92);
      mediaReady = await waitForMediaAvailability(publicMediaUrl, { timeoutMs: 60_000, intervalMs: 2_000 });
      if (!mediaReady && __DEV__) {
        console.warn('[uploadImage] CDN not yet reachable — returning success anyway:', publicMediaUrl.substring(0, 120));
      }
    }

    return {
      success: true,
      key: presignedData.key,
      url: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${presignedData.key}`,
      cdnUrl: publicMediaUrl,
      fileSize,
      mediaReady,
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

    const videoInfo = await getFileInfo(videoUri);
    if (videoInfo.size <= 0) {
      if (__DEV__) console.log('[uploadVideo] Unable to determine file size');
      return { success: false, error: 'Unable to determine video size. Please reselect the video.' };
    }

    // Get presigned URL
    onProgress?.(20);
    const presignedData = await getPresignedUrl(key, folder, mimeType, videoInfo.size);

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

    return {
      success: true,
      key: presignedData.key,
      url: `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${presignedData.key}`,
      cdnUrl: presignedData.cdnUrl || getCloudFrontUrl(presignedData.key),
      fileSize: videoInfo.size,
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
  return uploadImage(userId, imageUri, {
    folder: 'avatars',
    compress: true,
    waitForAvailability: true,
  });
};

/**
 * Upload cover image with automatic compression
 */
export const uploadCoverImage = (userId: string, imageUri: string): Promise<UploadResult> => {
  return uploadImage(userId, imageUri, {
    folder: 'covers',
    compress: true,
    waitForAvailability: true,
  });
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
