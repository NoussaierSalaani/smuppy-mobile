// ============================================
// SMUPPY - IMAGE UPLOAD SERVICE
// Upload images to Supabase Storage
// ============================================

import { supabase } from '../config/supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

/**
 * Upload a profile image to Supabase Storage
 * @param {string} imageUri - Local URI of the image (from ImagePicker)
 * @param {string} userId - User ID for naming the file
 * @returns {Promise<{url: string | null, error: string | null}>}
 */
export const uploadProfileImage = async (imageUri, userId) => {
  try {
    if (!imageUri || !userId) {
      return { url: null, error: 'Missing image URI or user ID' };
    }

    // Read the file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Determine file extension
    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const fileName = `${userId}/avatar.${fileExt}`;
    const contentType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, decode(base64), {
        contentType,
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error('[ImageUpload] Upload error:', error);
      return { url: null, error: error.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    // Add cache-busting timestamp
    const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

    return { url: urlWithCacheBust, error: null };
  } catch (err) {
    console.error('[ImageUpload] Error:', err);
    return { url: null, error: err.message || 'Failed to upload image' };
  }
};

/**
 * Delete a profile image from Supabase Storage
 * @param {string} userId - User ID
 * @returns {Promise<{error: string | null}>}
 */
export const deleteProfileImage = async (userId) => {
  try {
    // List all files in user's folder
    const { data: files, error: listError } = await supabase.storage
      .from('avatars')
      .list(userId);

    if (listError) {
      return { error: listError.message };
    }

    if (files && files.length > 0) {
      const filesToDelete = files.map(file => `${userId}/${file.name}`);
      const { error } = await supabase.storage
        .from('avatars')
        .remove(filesToDelete);

      if (error) {
        return { error: error.message };
      }
    }

    return { error: null };
  } catch (err) {
    return { error: err.message || 'Failed to delete image' };
  }
};

/**
 * Upload any image to a specified bucket
 * @param {string} imageUri - Local URI of the image
 * @param {string} bucket - Storage bucket name
 * @param {string} path - Path within the bucket
 * @returns {Promise<{url: string | null, error: string | null}>}
 */
export const uploadImage = async (imageUri, bucket, path) => {
  try {
    if (!imageUri) {
      return { url: null, error: 'Missing image URI' };
    }

    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileExt = imageUri.split('.').pop()?.toLowerCase() || 'jpg';
    const contentType = `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`;

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, decode(base64), {
        contentType,
        upsert: true,
      });

    if (error) {
      return { url: null, error: error.message };
    }

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return { url: `${publicUrl}?t=${Date.now()}`, error: null };
  } catch (err) {
    return { url: null, error: err.message || 'Failed to upload image' };
  }
};
