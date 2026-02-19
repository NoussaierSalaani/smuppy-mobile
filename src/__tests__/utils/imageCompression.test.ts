/**
 * Image Compression Utility Tests
 * Tests for COMPRESSION_PRESETS validation and formatFileSize pure function.
 * BUG-2026-02-05: Regression test ensuring all presets use 'webp' format.
 */

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

import { COMPRESSION_PRESETS, formatFileSize } from '../../utils/imageCompression';

describe('Image Compression Utils', () => {
  describe('COMPRESSION_PRESETS validation (BUG-2026-02-05 regression)', () => {
    it('should use webp format for all 6 presets', () => {
      const presetNames = ['avatar', 'cover', 'post', 'thumbnail', 'highQuality', 'message'] as const;
      for (const name of presetNames) {
        expect(COMPRESSION_PRESETS[name].format).toBe('webp');
      }
    });

    it('should have avatar dimensions maxWidth=400 and maxHeight=400', () => {
      expect(COMPRESSION_PRESETS.avatar.maxWidth).toBe(400);
      expect(COMPRESSION_PRESETS.avatar.maxHeight).toBe(400);
    });

    it('should have cover dimensions maxWidth=1200 and maxHeight=600', () => {
      expect(COMPRESSION_PRESETS.cover.maxWidth).toBe(1200);
      expect(COMPRESSION_PRESETS.cover.maxHeight).toBe(600);
    });

    it('should have post quality of 0.85', () => {
      expect(COMPRESSION_PRESETS.post.quality).toBe(0.85);
    });

    it('should have thumbnail quality of 0.7', () => {
      expect(COMPRESSION_PRESETS.thumbnail.quality).toBe(0.7);
    });

    it('should have message dimensions maxWidth=800 and maxHeight=800', () => {
      expect(COMPRESSION_PRESETS.message.maxWidth).toBe(800);
      expect(COMPRESSION_PRESETS.message.maxHeight).toBe(800);
    });
  });

  describe('formatFileSize', () => {
    it('should return "0 B" for 0 bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('should return "512 B" for 512 bytes', () => {
      expect(formatFileSize(512)).toBe('512 B');
    });

    it('should return "1 KB" for 1024 bytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('should return "1.5 KB" for 1536 bytes', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('should return "1 MB" for 1048576 bytes', () => {
      expect(formatFileSize(1048576)).toBe('1 MB');
    });

    it('should return "1 GB" for 1073741824 bytes', () => {
      expect(formatFileSize(1073741824)).toBe('1 GB');
    });
  });
});
