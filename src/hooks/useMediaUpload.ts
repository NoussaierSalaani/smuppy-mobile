/**
 * useMediaUpload Hook
 * Provides easy-to-use media upload functionality with progress tracking
 */

import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  uploadImage,
  uploadVideo,
  uploadMultiple,
  uploadAvatar,
  uploadCoverImage,
    getCloudFrontUrl,
  UploadResult,
  UploadOptions,
  MediaFile,
} from '../services/mediaUpload';
import { useUserStore } from '../stores';
import { captureException } from '../lib/sentry';

// ============================================
// TYPES
// ============================================

export interface UseMediaUploadOptions {
  autoCompress?: boolean;
  maxFiles?: number;
  allowVideo?: boolean;
}

export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  results: UploadResult[];
}

export interface UseMediaUploadReturn {
  // State
  isUploading: boolean;
  progress: number;
  error: string | null;
  results: UploadResult[];

  // Actions
  pickAndUploadImage: (folder?: UploadOptions['folder']) => Promise<UploadResult | null>;
  pickAndUploadVideo: () => Promise<UploadResult | null>;
  pickAndUploadMultiple: (options?: { maxFiles?: number }) => Promise<UploadResult[]>;
  uploadFromUri: (uri: string, type: 'image' | 'video', folder?: UploadOptions['folder']) => Promise<UploadResult | null>;
  uploadAvatarImage: () => Promise<UploadResult | null>;
  uploadCover: () => Promise<UploadResult | null>;
  reset: () => void;

  // Utilities
  getUrl: (key: string) => string;
}

// ============================================
// HOOK
// ============================================

export const useMediaUpload = (
  options: UseMediaUploadOptions = {}
): UseMediaUploadReturn => {
  const { autoCompress = true, maxFiles = 10, allowVideo = true } = options;

  const user = useUserStore((state) => state.user);

  const [state, setState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    results: [],
  });

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      results: [],
    });
  }, []);

  /**
   * Update progress
   */
  const updateProgress = useCallback((progress: number) => {
    setState((prev) => ({ ...prev, progress }));
  }, []);

  /**
   * Request media library permissions
   */
  const requestPermissions = async (): Promise<boolean> => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setState((prev) => ({
        ...prev,
        error: 'Permission to access media library was denied',
      }));
      return false;
    }
    return true;
  };

  /**
   * Pick image from library
   */
  const pickImage = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1,
    });

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    return result.assets[0];
  };

  /**
   * Pick video from library
   */
  const pickVideo = async (): Promise<ImagePicker.ImagePickerAsset | null> => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      quality: 1,
      videoMaxDuration: 60, // 60 seconds max
    });

    if (result.canceled || !result.assets?.[0]) {
      return null;
    }

    return result.assets[0];
  };

  /**
   * Pick multiple media items
   */
  const pickMultiple = async (
    limit: number = maxFiles
  ): Promise<ImagePicker.ImagePickerAsset[]> => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return [];

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: allowVideo
        ? ImagePicker.MediaTypeOptions.All
        : ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: limit,
      quality: 1,
    });

    if (result.canceled || !result.assets) {
      return [];
    }

    return result.assets;
  };

  /**
   * Pick and upload a single image
   */
  const pickAndUploadImage = useCallback(
    async (folder: UploadOptions['folder'] = 'posts'): Promise<UploadResult | null> => {
      if (!user?.id) {
        setState((prev) => ({ ...prev, error: 'User not logged in' }));
        return null;
      }

      try {
        const asset = await pickImage();
        if (!asset) return null;

        setState({ isUploading: true, progress: 0, error: null, results: [] });

        const result = await uploadImage(user.id, asset.uri, {
          folder,
          compress: autoCompress,
          onProgress: updateProgress,
        });

        setState((prev) => ({
          ...prev,
          isUploading: false,
          progress: 100,
          results: [result],
          error: result.success ? null : result.error || 'Upload failed',
        }));

        return result;
      } catch (error) {
        captureException(error as Error, { context: 'pickAndUploadImage' });
        setState((prev) => ({
          ...prev,
          isUploading: false,
          error: 'Upload failed',
        }));
        return null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, autoCompress, updateProgress]
  );

  /**
   * Pick and upload a video
   */
  const pickAndUploadVideo = useCallback(async (): Promise<UploadResult | null> => {
    if (!user?.id) {
      setState((prev) => ({ ...prev, error: 'User not logged in' }));
      return null;
    }

    try {
      const asset = await pickVideo();
      if (!asset) return null;

      setState({ isUploading: true, progress: 0, error: null, results: [] });

      const result = await uploadVideo(user.id, asset.uri, {
        folder: 'posts',
        onProgress: updateProgress,
      });

      setState((prev) => ({
        ...prev,
        isUploading: false,
        progress: 100,
        results: [result],
        error: result.success ? null : result.error || 'Upload failed',
      }));

      return result;
    } catch (error) {
      captureException(error as Error, { context: 'pickAndUploadVideo' });
      setState((prev) => ({
        ...prev,
        isUploading: false,
        error: 'Upload failed',
      }));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, updateProgress]);

  /**
   * Pick and upload multiple files
   */
  const pickAndUploadMultiple = useCallback(
    async (opts?: { maxFiles?: number }): Promise<UploadResult[]> => {
      if (!user?.id) {
        setState((prev) => ({ ...prev, error: 'User not logged in' }));
        return [];
      }

      try {
        const assets = await pickMultiple(opts?.maxFiles || maxFiles);
        if (assets.length === 0) return [];

        setState({ isUploading: true, progress: 0, error: null, results: [] });

        const files: MediaFile[] = assets.map((asset) => ({
          uri: asset.uri,
          type: asset.type === 'video' ? 'video' : 'image',
          mimeType: asset.mimeType,
        }));

        const results = await uploadMultiple(user.id, files, {
          folder: 'posts',
          compress: autoCompress,
          onProgress: updateProgress,
        });

        const hasErrors = results.some((r) => !r.success);

        setState((prev) => ({
          ...prev,
          isUploading: false,
          progress: 100,
          results,
          error: hasErrors ? 'Some uploads failed' : null,
        }));

        return results;
      } catch (error) {
        captureException(error as Error, { context: 'pickAndUploadMultiple' });
        setState((prev) => ({
          ...prev,
          isUploading: false,
          error: 'Upload failed',
        }));
        return [];
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, maxFiles, autoCompress, updateProgress]
  );

  /**
   * Upload from existing URI
   */
  const uploadFromUri = useCallback(
    async (
      uri: string,
      type: 'image' | 'video',
      folder: UploadOptions['folder'] = 'posts'
    ): Promise<UploadResult | null> => {
      if (!user?.id) {
        setState((prev) => ({ ...prev, error: 'User not logged in' }));
        return null;
      }

      try {
        setState({ isUploading: true, progress: 0, error: null, results: [] });

        const result = type === 'video'
          ? await uploadVideo(user.id, uri, { folder, onProgress: updateProgress })
          : await uploadImage(user.id, uri, { folder, compress: true, onProgress: updateProgress });

        setState((prev) => ({
          ...prev,
          isUploading: false,
          progress: 100,
          results: [result],
          error: result.success ? null : result.error || 'Upload failed',
        }));

        return result;
      } catch (error) {
        captureException(error as Error, { context: 'uploadFromUri' });
        setState((prev) => ({
          ...prev,
          isUploading: false,
          error: 'Upload failed',
        }));
        return null;
      }
    },
    [user?.id, updateProgress]
  );

  /**
   * Upload avatar image
   */
  const uploadAvatarImage = useCallback(async (): Promise<UploadResult | null> => {
    if (!user?.id) {
      setState((prev) => ({ ...prev, error: 'User not logged in' }));
      return null;
    }

    try {
      const asset = await pickImage();
      if (!asset) return null;

      setState({ isUploading: true, progress: 0, error: null, results: [] });

      const result = await uploadAvatar(user.id, asset.uri);

      setState((prev) => ({
        ...prev,
        isUploading: false,
        progress: 100,
        results: [result],
        error: result.success ? null : result.error || 'Upload failed',
      }));

      return result;
    } catch (error) {
      captureException(error as Error, { context: 'uploadAvatarImage' });
      setState((prev) => ({
        ...prev,
        isUploading: false,
        error: 'Upload failed',
      }));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /**
   * Upload cover image
   */
  const uploadCover = useCallback(async (): Promise<UploadResult | null> => {
    if (!user?.id) {
      setState((prev) => ({ ...prev, error: 'User not logged in' }));
      return null;
    }

    try {
      const asset = await pickImage();
      if (!asset) return null;

      setState({ isUploading: true, progress: 0, error: null, results: [] });

      const result = await uploadCoverImage(user.id, asset.uri);

      setState((prev) => ({
        ...prev,
        isUploading: false,
        progress: 100,
        results: [result],
        error: result.success ? null : result.error || 'Upload failed',
      }));

      return result;
    } catch (error) {
      captureException(error as Error, { context: 'uploadCover' });
      setState((prev) => ({
        ...prev,
        isUploading: false,
        error: 'Upload failed',
      }));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /**
   * Get CloudFront URL for a key
   */
  const getUrl = useCallback((key: string): string => {
    return getCloudFrontUrl(key);
  }, []);

  return {
    // State
    isUploading: state.isUploading,
    progress: state.progress,
    error: state.error,
    results: state.results,

    // Actions
    pickAndUploadImage,
    pickAndUploadVideo,
    pickAndUploadMultiple,
    uploadFromUri,
    uploadAvatarImage,
    uploadCover,
    reset,

    // Utilities
    getUrl,
  };
};

export default useMediaUpload;
