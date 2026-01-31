// ============================================
// SMUPPY - IMAGE UPLOAD SERVICE
// Upload images to AWS S3
// ============================================

import { uploadAvatar, uploadImage as uploadToS3 } from './mediaUpload';
import { awsAuth } from './aws-auth';

/**
 * Result type for image upload operations
 */
export interface ImageUploadResult {
  url: string | null;
  error: string | null;
}

export interface ImageDeleteResult {
  error: string | null;
}

/**
 * Upload a profile image to AWS S3
 * @param imageUri - Local URI of the image (from ImagePicker)
 * @param userId - User ID for naming the file
 * @returns Promise with url and error
 */
export const uploadProfileImage = async (
  imageUri: string,
  userId: string
): Promise<ImageUploadResult> => {
  try {
    if (!imageUri || !userId) {
      return { url: null, error: 'Missing image URI or user ID' };
    }

    // Use mediaUpload service for S3 upload
    const result = await uploadAvatar(userId, imageUri);

    if (!result.success) {
      return { url: null, error: result.error || 'Upload failed' };
    }

    // Add cache-busting timestamp
    const urlWithCacheBust = `${result.cdnUrl}?t=${Date.now()}`;
    return { url: urlWithCacheBust, error: null };
  } catch (err) {
    const error = err as Error;
    if (__DEV__) console.error('[ImageUpload] Error:', error);
    return { url: null, error: error.message || 'Failed to upload image' };
  }
};

/**
 * Delete a profile image from AWS S3
 * @param userId - User ID
 * @returns Promise with error
 */
export const deleteProfileImage = async (_userId: string): Promise<ImageDeleteResult> => {
  // Note: S3 deletion is handled server-side via AWS Lambda
  // For now, we just return success as the old image will be overwritten on next upload
  return { error: null };
};

/**
 * Upload any image to AWS S3
 * @param imageUri - Local URI of the image
 * @param bucket - Folder name (avatars, covers, posts, etc.)
 * @param path - Not used in S3 version, kept for compatibility
 * @returns Promise with url and error
 */
export const uploadImage = async (
  imageUri: string,
  bucket: string,
  _path: string
): Promise<ImageUploadResult> => {
  try {
    if (!imageUri) {
      return { url: null, error: 'Missing image URI' };
    }

    // Map bucket to folder
    const folder = bucket as 'avatars' | 'covers' | 'posts' | 'messages' | 'thumbnails';

    // Get authenticated user ID
    const user = await awsAuth.getCurrentUser();
    const userId = user?.id || 'unknown';

    // Use mediaUpload service
    const result = await uploadToS3(userId, imageUri, { folder, compress: true });

    if (!result.success) {
      return { url: null, error: result.error || 'Upload failed' };
    }

    return { url: `${result.cdnUrl}?t=${Date.now()}`, error: null };
  } catch (err) {
    const error = err as Error;
    return { url: null, error: error.message || 'Failed to upload image' };
  }
};
