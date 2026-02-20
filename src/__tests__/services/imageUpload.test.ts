/**
 * Image Upload Service Tests
 *
 * Tests the image upload wrapper that delegates to mediaUpload service.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockUploadAvatar = jest.fn();
const mockUploadImageToS3 = jest.fn();

jest.mock('../../services/mediaUpload', () => ({
  uploadAvatar: mockUploadAvatar,
  uploadImage: mockUploadImageToS3,
}));

const mockGetCurrentUser = jest.fn();

jest.mock('../../services/aws-auth', () => ({
  awsAuth: { getCurrentUser: mockGetCurrentUser },
}));

(global as Record<string, unknown>).__DEV__ = false;

// Mock Date.now for cache busting
const NOW = 1700000000000;
jest.spyOn(Date, 'now').mockReturnValue(NOW);

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  uploadProfileImage,
  deleteProfileImage,
  uploadImage,
} from '../../services/imageUpload';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('imageUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // uploadProfileImage
  // =========================================================================

  describe('uploadProfileImage', () => {
    it('should upload and return URL with cache bust', async () => {
      mockUploadAvatar.mockResolvedValue({
        success: true,
        cdnUrl: 'https://cdn.example.com/avatars/u1/img.jpg',
      });

      const result = await uploadProfileImage('file:///image.jpg', 'u1');

      expect(result.url).toBe(`https://cdn.example.com/avatars/u1/img.jpg?t=${NOW}`);
      expect(result.error).toBeNull();
    });

    it('should return error when upload fails', async () => {
      mockUploadAvatar.mockResolvedValue({
        success: false,
        error: 'Upload failed',
      });

      const result = await uploadProfileImage('file:///image.jpg', 'u1');

      expect(result.url).toBeNull();
      expect(result.error).toBe('Upload failed');
    });

    it('should return error for missing image URI', async () => {
      const result = await uploadProfileImage('', 'u1');
      expect(result.url).toBeNull();
      expect(result.error).toBe('Missing image URI or user ID');
    });

    it('should return error for missing user ID', async () => {
      const result = await uploadProfileImage('file:///image.jpg', '');
      expect(result.url).toBeNull();
      expect(result.error).toBe('Missing image URI or user ID');
    });

    it('should handle thrown errors', async () => {
      mockUploadAvatar.mockRejectedValue(new Error('Network error'));

      const result = await uploadProfileImage('file:///image.jpg', 'u1');

      expect(result.url).toBeNull();
      expect(result.error).toBe('Network error');
    });

    it('should provide default error message', async () => {
      mockUploadAvatar.mockResolvedValue({ success: false });

      const result = await uploadProfileImage('file:///image.jpg', 'u1');

      expect(result.error).toBe('Upload failed');
    });
  });

  // =========================================================================
  // deleteProfileImage
  // =========================================================================

  describe('deleteProfileImage', () => {
    it('should return no error (stub implementation)', async () => {
      const result = await deleteProfileImage('u1');
      expect(result.error).toBeNull();
    });
  });

  // =========================================================================
  // uploadImage
  // =========================================================================

  describe('uploadImage', () => {
    it('should upload image with folder mapping', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: 'u1' });
      mockUploadImageToS3.mockResolvedValue({
        success: true,
        cdnUrl: 'https://cdn.example.com/posts/u1/img.jpg',
      });

      const result = await uploadImage('file:///image.jpg', 'posts', '/some/path');

      expect(result.url).toBe(`https://cdn.example.com/posts/u1/img.jpg?t=${NOW}`);
      expect(result.error).toBeNull();
      expect(mockUploadImageToS3).toHaveBeenCalledWith(
        'u1',
        'file:///image.jpg',
        { folder: 'posts', compress: true }
      );
    });

    it('should return error for missing image URI', async () => {
      const result = await uploadImage('', 'posts', '/path');
      expect(result.url).toBeNull();
      expect(result.error).toBe('Missing image URI');
    });

    it('should use "unknown" for unauthenticated user', async () => {
      mockGetCurrentUser.mockResolvedValue(null);
      mockUploadImageToS3.mockResolvedValue({
        success: true,
        cdnUrl: 'https://cdn.example.com/img.jpg',
      });

      await uploadImage('file:///image.jpg', 'posts', '/path');

      expect(mockUploadImageToS3).toHaveBeenCalledWith(
        'unknown',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should handle upload failure', async () => {
      mockGetCurrentUser.mockResolvedValue({ id: 'u1' });
      mockUploadImageToS3.mockResolvedValue({ success: false, error: 'S3 error' });

      const result = await uploadImage('file:///image.jpg', 'posts', '/path');

      expect(result.url).toBeNull();
      expect(result.error).toBe('S3 error');
    });

    it('should handle thrown errors', async () => {
      mockGetCurrentUser.mockRejectedValue(new Error('Auth error'));

      const result = await uploadImage('file:///image.jpg', 'posts', '/path');

      expect(result.url).toBeNull();
      expect(result.error).toBe('Auth error');
    });
  });
});
