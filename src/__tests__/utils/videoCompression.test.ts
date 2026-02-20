/**
 * Video Compression Utility Tests
 * Tests for video file size checking and upload validation.
 */

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import {
  getVideoFileSize,
  shouldCompressVideo,
  validateVideoSize,
  prepareVideoForUpload,
} from '../../utils/videoCompression';

describe('Video Compression Utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getVideoFileSize', () => {
    it('should return file size for valid URI', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ size: 5000000 });
      const size = await getVideoFileSize('file:///video.mp4');
      expect(size).toBe(5000000);
    });

    it('should return 0 for ph:// URIs', async () => {
      const size = await getVideoFileSize('ph://asset-id');
      expect(size).toBe(0);
      expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
    });

    it('should return 0 for assets-library:// URIs', async () => {
      const size = await getVideoFileSize('assets-library://asset-id');
      expect(size).toBe(0);
      expect(FileSystem.getInfoAsync).not.toHaveBeenCalled();
    });

    it('should return 0 when getInfoAsync fails', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error('File error'));
      const size = await getVideoFileSize('file:///video.mp4');
      expect(size).toBe(0);
    });

    it('should return 0 when info has no size property', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      const size = await getVideoFileSize('file:///video.mp4');
      expect(size).toBe(0);
    });
  });

  describe('shouldCompressVideo', () => {
    it('should return true for files over 50MB', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        size: 60 * 1024 * 1024,
      });
      const result = await shouldCompressVideo('file:///big-video.mp4');
      expect(result).toBe(true);
    });

    it('should return false for files under 50MB', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        size: 30 * 1024 * 1024,
      });
      const result = await shouldCompressVideo('file:///small-video.mp4');
      expect(result).toBe(false);
    });

    it('should return false for exactly 50MB', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        size: 50 * 1024 * 1024,
      });
      const result = await shouldCompressVideo('file:///exact-video.mp4');
      expect(result).toBe(false);
    });

    it('should return false for ph:// URIs (size = 0)', async () => {
      const result = await shouldCompressVideo('ph://asset-id');
      expect(result).toBe(false);
    });
  });

  describe('validateVideoSize', () => {
    it('should return valid:true for files under 100MB', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        size: 50 * 1024 * 1024,
      });
      const result = await validateVideoSize('file:///video.mp4');
      expect(result.valid).toBe(true);
      expect(result.size).toBe(50 * 1024 * 1024);
      expect(result.error).toBeUndefined();
    });

    it('should return valid:false for files over 100MB', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        size: 150 * 1024 * 1024,
      });
      const result = await validateVideoSize('file:///big-video.mp4');
      expect(result.valid).toBe(false);
      expect(result.size).toBe(150 * 1024 * 1024);
      expect(result.error).toContain('too large');
      expect(result.error).toContain('150MB');
      expect(result.error).toContain('Maximum: 100MB');
    });

    it('should return valid:true for exactly 100MB', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        size: 100 * 1024 * 1024,
      });
      const result = await validateVideoSize('file:///exact-video.mp4');
      expect(result.valid).toBe(true);
    });

    it('should return valid:true for ph:// URIs (size = 0)', async () => {
      const result = await validateVideoSize('ph://asset-id');
      expect(result.valid).toBe(true);
      expect(result.size).toBe(0);
    });
  });

  describe('prepareVideoForUpload', () => {
    it('should return original URI with size and compressed=false', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({
        size: 5000000,
      });
      const result = await prepareVideoForUpload('file:///video.mp4');
      expect(result.uri).toBe('file:///video.mp4');
      expect(result.fileSize).toBe(5000000);
      expect(result.compressed).toBe(false);
    });

    it('should return 0 size for ph:// URIs', async () => {
      const result = await prepareVideoForUpload('ph://asset-id');
      expect(result.uri).toBe('ph://asset-id');
      expect(result.fileSize).toBe(0);
      expect(result.compressed).toBe(false);
    });
  });
});
