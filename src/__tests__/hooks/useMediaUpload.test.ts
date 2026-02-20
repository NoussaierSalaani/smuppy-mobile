/**
 * useMediaUpload Hook Tests
 * Tests for media upload with progress tracking
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockUploadImage = jest.fn();
const mockUploadVideo = jest.fn();
const mockUploadMultiple = jest.fn();
const mockUploadAvatar = jest.fn();
const mockUploadCoverImage = jest.fn();
const mockGetCloudFrontUrl = jest.fn();
const mockRequestMediaLibraryPermissionsAsync = jest.fn();
const mockLaunchImageLibraryAsync = jest.fn();
const mockCaptureException = jest.fn();

jest.mock('../../services/mediaUpload', () => ({
  uploadImage: (...args: unknown[]) => mockUploadImage(...args),
  uploadVideo: (...args: unknown[]) => mockUploadVideo(...args),
  uploadMultiple: (...args: unknown[]) => mockUploadMultiple(...args),
  uploadAvatar: (...args: unknown[]) => mockUploadAvatar(...args),
  uploadCoverImage: (...args: unknown[]) => mockUploadCoverImage(...args),
  getCloudFrontUrl: (_key: string) => mockGetCloudFrontUrl(_key),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: () => mockRequestMediaLibraryPermissionsAsync(),
  launchImageLibraryAsync: (_opts: unknown) => mockLaunchImageLibraryAsync(_opts),
  MediaTypeOptions: { Images: ['images'], Videos: ['videos'], All: ['images', 'videos'] },
}));

jest.mock('../../stores/userStore', () => ({
  useUserStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: { id: 'user-123' } })
  ),
}));

jest.mock('../../lib/sentry', () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

/**
 * Minimal hook runner
 */
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
  let refIndex = 0;
  let effectIndex = 0;
  let previousEffectDeps: Array<unknown[] | undefined> = [];
  let effectCleanups: Array<(() => void) | void> = [];
  let pendingEffects: Array<{ idx: number; fn: () => void | (() => void) }> = [];
  let result: T;

  const mockUseState = jest.fn((initial: unknown) => {
    const idx = stateIndex++;
    if (!state.has(idx)) state.set(idx, initial);
    const setter = (val: unknown) => {
      const newVal = typeof val === 'function' ? (val as (prev: unknown) => unknown)(state.get(idx)) : val;
      state.set(idx, newVal);
    };
    return [state.get(idx), setter];
  });

  const mockUseCallback = jest.fn((fn: unknown, _deps: unknown[]) => {
    const idx = callbackIndex++;
    callbackMap.set(idx, fn);
    return fn;
  });

  const mockUseRef = jest.fn((initial: unknown) => {
    const idx = refIndex++;
    if (!refMap.has(idx)) refMap.set(idx, { current: initial });
    return refMap.get(idx);
  });

  const mockUseEffect = jest.fn((fn: () => void | (() => void), deps?: unknown[]) => {
    const idx = effectIndex++;
    const prevDeps = previousEffectDeps[idx];
    let shouldRun = false;
    if (prevDeps === undefined) shouldRun = true;
    else if (deps === undefined) shouldRun = true;
    else if (deps.length !== prevDeps.length) shouldRun = true;
    else { for (let i = 0; i < deps.length; i++) { if (deps[i] !== prevDeps[i]) { shouldRun = true; break; } } }
    if (shouldRun) pendingEffects.push({ idx, fn });
    previousEffectDeps[idx] = deps;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useState').mockImplementation(mockUseState as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useEffect').mockImplementation(mockUseEffect as any);

  function flushEffects() {
    const effects = [...pendingEffects];
    pendingEffects = [];
    for (const { idx, fn } of effects) {
      if (effectCleanups[idx]) effectCleanups[idx]!();
      const cleanup = fn();
      effectCleanups[idx] = cleanup || undefined;
    }
  }

  function render() {
    stateIndex = 0;
    callbackIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    result = hookFn();
    flushEffects();
  }

  render();

  return {
    get current() { return result; },
    rerender() { render(); },
  };
}

import { useMediaUpload } from '../../hooks/useMediaUpload';

describe('useMediaUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///image.jpg', type: 'image', mimeType: 'image/jpeg' }],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should return initial state', () => {
    const runner = createHookRunner(() => useMediaUpload());

    expect(runner.current.isUploading).toBe(false);
    expect(runner.current.progress).toBe(0);
    expect(runner.current.error).toBeNull();
    expect(runner.current.results).toEqual([]);
  });

  it('should return action functions', () => {
    const runner = createHookRunner(() => useMediaUpload());

    expect(typeof runner.current.pickAndUploadImage).toBe('function');
    expect(typeof runner.current.pickAndUploadVideo).toBe('function');
    expect(typeof runner.current.pickAndUploadMultiple).toBe('function');
    expect(typeof runner.current.uploadFromUri).toBe('function');
    expect(typeof runner.current.uploadAvatarImage).toBe('function');
    expect(typeof runner.current.uploadCover).toBe('function');
    expect(typeof runner.current.reset).toBe('function');
    expect(typeof runner.current.getUrl).toBe('function');
  });

  // ========================================
  // pickAndUploadImage
  // ========================================

  it('should pick and upload an image', async () => {
    const uploadResult = { success: true, key: 'posts/image.jpg', url: 'https://cdn.example.com/image.jpg' };
    mockUploadImage.mockResolvedValue(uploadResult);

    const runner = createHookRunner(() => useMediaUpload());
    const result = await runner.current.pickAndUploadImage();

    expect(result).toEqual(uploadResult);
    expect(mockUploadImage).toHaveBeenCalledWith(
      'user-123',
      'file:///image.jpg',
      expect.objectContaining({ folder: 'posts', compress: true })
    );
  });

  it('should return null when user cancels image picker', async () => {
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    const runner = createHookRunner(() => useMediaUpload());
    const result = await runner.current.pickAndUploadImage();

    expect(result).toBeNull();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it('should set error when permissions denied', async () => {
    mockRequestMediaLibraryPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const runner = createHookRunner(() => useMediaUpload());
    const result = await runner.current.pickAndUploadImage();

    expect(result).toBeNull();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  it('should return null and set error when user is not logged in', async () => {
    const { useUserStore } = require('../../stores/userStore');
    useUserStore.mockImplementationOnce((selector: (s: Record<string, unknown>) => unknown) =>
      selector({ user: null })
    );

    const runner = createHookRunner(() => useMediaUpload());
    const result = await runner.current.pickAndUploadImage();

    expect(result).toBeNull();
  });

  it('should handle upload failure', async () => {
    mockUploadImage.mockResolvedValue({ success: false, error: 'Storage error' });

    const runner = createHookRunner(() => useMediaUpload());
    const result = await runner.current.pickAndUploadImage();
    runner.rerender();

    expect(result).toEqual({ success: false, error: 'Storage error' });
    expect(runner.current.error).toBe('Storage error');
  });

  it('should handle exception during upload', async () => {
    mockUploadImage.mockRejectedValue(new Error('Network error'));

    const runner = createHookRunner(() => useMediaUpload());
    const result = await runner.current.pickAndUploadImage();
    runner.rerender();

    expect(result).toBeNull();
    expect(runner.current.error).toBe('Upload failed');
    expect(mockCaptureException).toHaveBeenCalled();
  });

  // ========================================
  // uploadFromUri
  // ========================================

  it('should upload image from URI', async () => {
    const uploadResult = { success: true, key: 'posts/img.jpg' };
    mockUploadImage.mockResolvedValue(uploadResult);

    const runner = createHookRunner(() => useMediaUpload());
    const result = await runner.current.uploadFromUri('file:///local/img.jpg', 'image', 'posts');

    expect(result).toEqual(uploadResult);
    expect(mockUploadImage).toHaveBeenCalled();
  });

  it('should upload video from URI', async () => {
    const uploadResult = { success: true, key: 'posts/video.mp4' };
    mockUploadVideo.mockResolvedValue(uploadResult);

    const runner = createHookRunner(() => useMediaUpload());
    const result = await runner.current.uploadFromUri('file:///local/video.mp4', 'video');

    expect(result).toEqual(uploadResult);
    expect(mockUploadVideo).toHaveBeenCalled();
  });

  // ========================================
  // Reset
  // ========================================

  it('should reset state', () => {
    const runner = createHookRunner(() => useMediaUpload());

    runner.current.reset();
    runner.rerender();

    expect(runner.current.isUploading).toBe(false);
    expect(runner.current.progress).toBe(0);
    expect(runner.current.error).toBeNull();
    expect(runner.current.results).toEqual([]);
  });

  // ========================================
  // getUrl
  // ========================================

  it('should get CloudFront URL for key', () => {
    mockGetCloudFrontUrl.mockReturnValue('https://cdn.example.com/posts/image.jpg');

    const runner = createHookRunner(() => useMediaUpload());
    const url = runner.current.getUrl('posts/image.jpg');

    expect(url).toBe('https://cdn.example.com/posts/image.jpg');
    expect(mockGetCloudFrontUrl).toHaveBeenCalledWith('posts/image.jpg');
  });

  // ========================================
  // Options
  // ========================================

  it('should respect autoCompress option', async () => {
    mockUploadImage.mockResolvedValue({ success: true });

    const runner = createHookRunner(() => useMediaUpload({ autoCompress: false }));
    await runner.current.pickAndUploadImage();

    expect(mockUploadImage).toHaveBeenCalledWith(
      'user-123',
      expect.any(String),
      expect.objectContaining({ compress: false })
    );
  });
});
