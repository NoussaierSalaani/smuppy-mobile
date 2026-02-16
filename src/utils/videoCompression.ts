/**
 * Video Compression Utility
 * Client-side video compression before upload to reduce bandwidth and processing time.
 * Uses expo-av for video info and expo-file-system for file operations.
 *
 * Note: Full hardware-accelerated compression requires react-native-compressor
 * or a custom native module. This utility provides lightweight validation and
 * size checking. When react-native-compressor is added, compression will be wired here.
 */

import * as FileSystem from 'expo-file-system/legacy';

export interface VideoCompressionResult {
  uri: string;
  fileSize: number;
  compressed: boolean;
}

// Max sizes after which we recommend compression
const VIDEO_SIZE_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50 MB — above this, we recommend compression
const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB — hard limit

/**
 * Get video file size.
 * Returns 0 if file info is unavailable (e.g. ph:// URIs).
 */
export async function getVideoFileSize(uri: string): Promise<number> {
  try {
    if (uri.startsWith('ph://') || uri.startsWith('assets-library://')) {
      return 0;
    }
    const info = await FileSystem.getInfoAsync(uri);
    return (info as { size?: number }).size || 0;
  } catch {
    return 0;
  }
}

/**
 * Check if video needs compression (above 50 MB).
 */
export async function shouldCompressVideo(uri: string): Promise<boolean> {
  const size = await getVideoFileSize(uri);
  return size > VIDEO_SIZE_THRESHOLD_BYTES;
}

/**
 * Validate video is within upload limits.
 */
export async function validateVideoSize(uri: string): Promise<{ valid: boolean; size: number; error?: string }> {
  const size = await getVideoFileSize(uri);
  if (size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      valid: false,
      size,
      error: `Video is too large (${Math.round(size / (1024 * 1024))}MB). Maximum: 100MB.`,
    };
  }
  return { valid: true, size };
}

/**
 * Prepare video for upload.
 * Currently returns the original URI with validation.
 * When react-native-compressor is added, this will compress the video.
 */
export async function prepareVideoForUpload(uri: string): Promise<VideoCompressionResult> {
  const size = await getVideoFileSize(uri);

  // For now, return as-is — server-side MediaConvert handles transcoding
  // Future: add react-native-compressor for client-side pre-compression
  return {
    uri,
    fileSize: size,
    compressed: false,
  };
}
