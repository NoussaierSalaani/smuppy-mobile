// ============================================
// SMUPPY - IMAGE UPLOAD SERVICE
// Upload images to Supabase Storage
// ============================================

import { supabase } from '../config/supabase';
import { decode } from 'base64-arraybuffer';

/**
 * Convert a file URI to base64 using fetch/blob (modern approach)
 * Replaces deprecated FileSystem.readAsStringAsync
 */
const uriToBase64 = async (uri: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

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
 * Upload a profile image to Supabase Storage
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

    // Read the file as base64
    const base64 = await uriToBase64(imageUri);

    // Determine file extension
    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}/avatar.${fileExt}`;
    const contentType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from('avatars')
      .upload(fileName, decode(base64), {
        contentType,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error('[ImageUpload] Upload error:', error);
      return { url: null, error: (error as { message: string }).message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    // Add cache-busting timestamp
    const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

    return { url: urlWithCacheBust, error: null };
  } catch (err) {
    const error = err as Error;
    console.error('[ImageUpload] Error:', error);
    return { url: null, error: error.message || 'Failed to upload image' };
  }
};

/**
 * Delete a profile image from Supabase Storage
 * @param userId - User ID
 * @returns Promise with error
 */
export const deleteProfileImage = async (userId: string): Promise<ImageDeleteResult> => {
  try {
    // List all files in user's folder
    const { data: files, error: listError } = await supabase.storage
      .from('avatars')
      .list(userId);

    if (listError) {
      return { error: (listError as { message: string }).message };
    }

    if (files && files.length > 0) {
      const filesToDelete = files.map((file: { name: string }) => `${userId}/${file.name}`);
      const { error } = await supabase.storage
        .from('avatars')
        .remove(filesToDelete);

      if (error) {
        return { error: (error as { message: string }).message };
      }
    }

    return { error: null };
  } catch (err) {
    const error = err as Error;
    return { error: error.message || 'Failed to delete image' };
  }
};

/**
 * Upload any image to a specified bucket
 * @param imageUri - Local URI of the image
 * @param bucket - Storage bucket name
 * @param path - Path within the bucket
 * @returns Promise with url and error
 */
export const uploadImage = async (
  imageUri: string,
  bucket: string,
  path: string
): Promise<ImageUploadResult> => {
  try {
    if (!imageUri) {
      return { url: null, error: 'Missing image URI' };
    }

    const base64 = await uriToBase64(imageUri);

    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, decode(base64), {
        contentType,
        upsert: true,
      });

    if (error) {
      return { url: null, error: (error as { message: string }).message };
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return { url: `${publicUrl}?t=${Date.now()}`, error: null };
  } catch (err) {
    const error = err as Error;
    return { url: null, error: error.message || 'Failed to upload image' };
  }
};
