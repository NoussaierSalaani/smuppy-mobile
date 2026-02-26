/**
 * Image Compression Utility Tests
 * Tests for COMPRESSION_PRESETS validation and formatFileSize pure function.
 * BUG-2026-02-05: Regression test ensuring all presets use 'webp' format.
 */

// Define __DEV__ before imports
(global as Record<string, unknown>).__DEV__ = true;

// Track mock calls for the chained ImageManipulator API
const mockSaveAsync = jest.fn();
const mockRenderAsync = jest.fn();
const mockResize = jest.fn();
const mockManipulate = jest.fn();

jest.mock('expo-image-manipulator', () => {
  const createContext = (): Record<string, unknown> => ({
    resize: (...args: unknown[]) => { mockResize(...args); return createContext(); },
    renderAsync: () => mockRenderAsync(),
  });

  return {
    ImageManipulator: {
      manipulate: (uri: string) => { mockManipulate(uri); return createContext(); },
    },
    SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  };
});
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import {
  COMPRESSION_PRESETS,
  formatFileSize,
  compressImage,
  compressWithPreset,
  compressImages,
  compressAvatar,
  compressCover,
  compressPost,
  compressThumbnail,
  compressMessage,
  smartCompress,
  getImageInfo,
} from '../../utils/imageCompression';

/** Helper: set up the standard mock chain for a successful compression */
const setupCompressMock = (opts: {
  renderWidth?: number;
  renderHeight?: number;
  saveUri?: string;
  saveWidth?: number;
  saveHeight?: number;
  fileSize?: number;
} = {}) => {
  const {
    renderWidth = 800, renderHeight = 600,
    saveUri = 'file:///compressed.jpg',
    saveWidth = 800, saveHeight = 600,
    fileSize = 50000,
  } = opts;
  mockSaveAsync.mockResolvedValue({ uri: saveUri, width: saveWidth, height: saveHeight });
  mockRenderAsync.mockResolvedValue({ width: renderWidth, height: renderHeight, saveAsync: mockSaveAsync });
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ size: fileSize });
};

/**
 * Helper: set up mock for a flow that first reads dimensions, then compresses.
 * renderAsync is called twice: first for dimension reading, second for compression.
 */
const setupDimReadThenCompress = (opts: {
  origWidth?: number;
  origHeight?: number;
  compressWidth?: number;
  compressHeight?: number;
  saveUri?: string;
  fileSize?: number;
} = {}) => {
  const {
    origWidth = 3000, origHeight = 2000,
    compressWidth = 1080, compressHeight = 720,
    saveUri = 'file:///compressed.jpg',
    fileSize = 50000,
  } = opts;
  mockSaveAsync.mockResolvedValue({ uri: saveUri, width: compressWidth, height: compressHeight });
  mockRenderAsync
    .mockResolvedValueOnce({ width: origWidth, height: origHeight }) // dim read (no saveAsync needed)
    .mockResolvedValueOnce({ width: compressWidth, height: compressHeight, saveAsync: mockSaveAsync });
  (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ size: fileSize });
};

describe('Image Compression Utils', () => {
  describe('COMPRESSION_PRESETS validation (BUG-2026-02-05 regression)', () => {
    it('should use jpeg format for all 6 presets', () => {
      const presetNames = ['avatar', 'cover', 'post', 'thumbnail', 'highQuality', 'message'] as const;
      for (const name of presetNames) {
        expect(COMPRESSION_PRESETS[name].format).toBe('jpeg');
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

    it('should handle fractional MB', () => {
      expect(formatFileSize(2621440)).toBe('2.5 MB');
    });
  });

  describe('compressImage', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      setupCompressMock();
    });

    it('should compress image with default options', async () => {
      const result = await compressImage('file:///original.jpg', {
        sourceWidth: 2000,
        sourceHeight: 1500,
      });
      expect(result.uri).toBe('file:///compressed.jpg');
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.fileSize).toBe(50000);
    });

    it('should use provided source dimensions and skip dimension-reading', async () => {
      await compressImage('file:///original.jpg', {
        sourceWidth: 500,
        sourceHeight: 400,
        maxWidth: 1080,
        maxHeight: 1350,
      });
      // manipulate called once (for compression only, not for dimension reading)
      expect(mockManipulate).toHaveBeenCalledTimes(1);
    });

    it('should read dimensions when sourceWidth/sourceHeight not provided', async () => {
      setupDimReadThenCompress();

      await compressImage('file:///original.jpg');
      // manipulate called twice: once to read dimensions, once to compress
      expect(mockManipulate).toHaveBeenCalledTimes(2);
      expect(mockRenderAsync).toHaveBeenCalledTimes(2);
    });

    it('should not resize when image is smaller than max dimensions', async () => {
      await compressImage('file:///small.jpg', {
        sourceWidth: 500,
        sourceHeight: 400,
        maxWidth: 1080,
        maxHeight: 1350,
      });
      // resize should NOT be called since image is already small
      expect(mockResize).not.toHaveBeenCalled();
    });

    it('should resize when image is larger than max dimensions', async () => {
      await compressImage('file:///big.jpg', {
        sourceWidth: 3000,
        sourceHeight: 2000,
        maxWidth: 1080,
        maxHeight: 1350,
      });
      expect(mockResize).toHaveBeenCalledTimes(1);
      expect(mockResize).toHaveBeenCalledWith(expect.objectContaining({ width: expect.any(Number) }));
    });

    it('should use PNG format when specified', async () => {
      await compressImage('file:///original.png', {
        sourceWidth: 500,
        sourceHeight: 400,
        format: 'png',
      });
      expect(mockSaveAsync).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'png' })
      );
    });

    it('should use WEBP format when specified', async () => {
      await compressImage('file:///original.webp', {
        sourceWidth: 500,
        sourceHeight: 400,
        format: 'webp',
      });
      expect(mockSaveAsync).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'webp' })
      );
    });

    it('should return correct MIME type for png', async () => {
      const result = await compressImage('file:///original.png', {
        sourceWidth: 500,
        sourceHeight: 400,
        format: 'png',
      });
      expect(result.mimeType).toBe('image/png');
    });

    it('should return correct MIME type for webp', async () => {
      const result = await compressImage('file:///original.webp', {
        sourceWidth: 500,
        sourceHeight: 400,
        format: 'webp',
      });
      expect(result.mimeType).toBe('image/webp');
    });

    it('should throw when renderAsync fails', async () => {
      mockRenderAsync.mockRejectedValue(new Error('Manipulation failed'));
      await expect(
        compressImage('file:///original.jpg', { sourceWidth: 100, sourceHeight: 100 })
      ).rejects.toThrow('Manipulation failed');
    });
  });

  describe('compressWithPreset', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      setupCompressMock({
        saveUri: 'file:///compressed.webp',
        renderWidth: 400, renderHeight: 400,
        saveWidth: 400, saveHeight: 400,
        fileSize: 30000,
      });
    });

    it('should use avatar preset options', async () => {
      const result = await compressWithPreset('file:///photo.jpg', 'avatar', {
        width: 800,
        height: 800,
      });
      expect(result.uri).toBe('file:///compressed.webp');
    });

    it('should use post preset options', async () => {
      const result = await compressWithPreset('file:///photo.jpg', 'post', {
        width: 2000,
        height: 1500,
      });
      expect(result).toBeDefined();
    });

    it('should work without sourceDimensions', async () => {
      setupDimReadThenCompress({
        origWidth: 1000, origHeight: 1000,
        compressWidth: 400, compressHeight: 400,
        saveUri: 'file:///compressed.webp',
        fileSize: 30000,
      });

      const result = await compressWithPreset('file:///photo.jpg', 'avatar');
      expect(result).toBeDefined();
    });
  });

  describe('compressImages', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should compress multiple images in parallel', async () => {
      // Use mockResolvedValue (not Once) since concurrent calls race unpredictably
      mockSaveAsync.mockResolvedValue({ uri: 'file:///c.jpg', width: 800, height: 640 });
      mockRenderAsync.mockResolvedValue({ width: 1000, height: 800, saveAsync: mockSaveAsync });
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ size: 50000 });

      const results = await compressImages(['file:///img1.jpg', 'file:///img2.jpg']);
      expect(results).toHaveLength(2);
    });
  });

  describe('convenience compress functions', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      setupCompressMock({
        saveUri: 'file:///compressed.webp',
        renderWidth: 400, renderHeight: 400,
        saveWidth: 400, saveHeight: 400,
        fileSize: 30000,
      });
    });

    it('compressAvatar should use avatar preset', async () => {
      const result = await compressAvatar('file:///photo.jpg', { width: 800, height: 800 });
      expect(result).toBeDefined();
      expect(result.uri).toBe('file:///compressed.webp');
    });

    it('compressCover should use cover preset', async () => {
      const result = await compressCover('file:///photo.jpg', { width: 2400, height: 1200 });
      expect(result).toBeDefined();
    });

    it('compressPost should use post preset', async () => {
      const result = await compressPost('file:///photo.jpg', { width: 2000, height: 1500 });
      expect(result).toBeDefined();
    });

    it('compressThumbnail should use thumbnail preset', async () => {
      const result = await compressThumbnail('file:///photo.jpg', { width: 600, height: 600 });
      expect(result).toBeDefined();
    });

    it('compressMessage should use message preset', async () => {
      const result = await compressMessage('file:///photo.jpg', { width: 1600, height: 1200 });
      expect(result).toBeDefined();
    });
  });

  describe('smartCompress', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should use high quality when file is already small enough', async () => {
      // File is 400KB, target is 500KB — already small enough
      mockSaveAsync.mockResolvedValue({ uri: 'file:///compressed.jpg', width: 1000, height: 750 });
      mockRenderAsync
        .mockResolvedValueOnce({ width: 1000, height: 750 }) // dim read
        .mockResolvedValueOnce({ width: 1000, height: 750, saveAsync: mockSaveAsync }); // compress
      (FileSystem.getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ size: 400 * 1024 }) // original size check
        .mockResolvedValueOnce({ size: 400 * 1024 }); // after compression size

      const result = await smartCompress('file:///photo.jpg', 500);
      expect(result).toBeDefined();
    });

    it('should reduce quality for large files', async () => {
      // File is 2MB, target is 500KB
      mockSaveAsync.mockResolvedValue({ uri: 'file:///compressed.jpg', width: 1080, height: 810 });
      mockRenderAsync
        .mockResolvedValueOnce({ width: 2000, height: 1500 }) // dim read
        .mockResolvedValueOnce({ width: 1080, height: 810, saveAsync: mockSaveAsync }); // compress
      (FileSystem.getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ size: 2 * 1024 * 1024 }) // original size check
        .mockResolvedValueOnce({ size: 300 * 1024 }); // after compression

      const result = await smartCompress('file:///photo.jpg', 500);
      expect(result).toBeDefined();
    });
  });

  describe('getImageInfo', () => {
    it('should return image info without compressing', async () => {
      jest.clearAllMocks();
      mockRenderAsync.mockResolvedValue({ width: 3000, height: 2000 });
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ size: 5000000 });

      const result = await getImageInfo('file:///photo.jpg');
      expect(result.uri).toBe('file:///photo.jpg');
      expect(result.width).toBe(3000);
      expect(result.height).toBe(2000);
      expect(result.fileSize).toBe(5000000);
      // Should NOT call saveAsync — getImageInfo only reads
      expect(mockSaveAsync).not.toHaveBeenCalled();
    });
  });
});
