/**
 * usePostInteractions Hook Tests
 * Tests for optimistic like/save with rollback
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 */

// Define __DEV__ global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies BEFORE imports
const mockLikePost = jest.fn();
const mockSavePost = jest.fn();
const mockUnsavePost = jest.fn();
const mockToggleLikeOptimistic = jest.fn();

jest.mock('../../services/database', () => ({
  likePost: (...args: unknown[]) => mockLikePost(...args),
  savePost: (...args: unknown[]) => mockSavePost(...args),
  unsavePost: (...args: unknown[]) => mockUnsavePost(...args),
}));

jest.mock('../../stores/feedStore', () => ({
  useFeedStore: {
    getState: () => ({
      toggleLikeOptimistic: mockToggleLikeOptimistic,
    }),
  },
}));

// Minimal hook runner
function createHookRunner<T>(hookFn: () => T) {
  let callbackMap: Map<number, unknown> = new Map();
  let refMap: Map<number, { current: unknown }> = new Map();
  let callbackIndex = 0;
  let refIndex = 0;
  let result: T;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useRef').mockImplementation(mockUseRef as any);

  function render() {
    callbackIndex = 0;
    refIndex = 0;
    result = hookFn();
  }

  render();

  return {
    get current() {
      return result;
    },
    rerender() {
      render();
    },
  };
}

import { usePostInteractions } from '../../hooks/usePostInteractions';

interface TestPost {
  id: string;
  isLiked: boolean;
  likes: number;
  isSaved?: boolean;
  saves?: number;
}

describe('usePostInteractions', () => {
  let posts: TestPost[];
  let setPosts: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    posts = [
      { id: 'post-1', isLiked: false, likes: 10, isSaved: false, saves: 5 },
      { id: 'post-2', isLiked: true, likes: 20, isSaved: true, saves: 15 },
      { id: 'post-3', isLiked: false, likes: 0, isSaved: false, saves: 0 },
    ];

    // setPosts captures the updater function and applies it to simulate React state
    setPosts = jest.fn((updater: ((prev: TestPost[]) => TestPost[]) | TestPost[]) => {
      if (typeof updater === 'function') {
        posts = updater(posts);
      } else {
        posts = updater;
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // toggleLike
  // ========================================

  describe('toggleLike', () => {
    it('should return toggleLike and toggleSave functions', () => {
      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      expect(typeof runner.current.toggleLike).toBe('function');
      expect(typeof runner.current.toggleSave).toBe('function');
    });

    it('should optimistically like an unliked post', async () => {
      mockLikePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleLike('post-1');

      // setPosts should have been called with the optimistic update
      expect(setPosts).toHaveBeenCalled();
      // After the optimistic update, post-1 should be liked with likes incremented
      const updatedPost = posts.find(p => p.id === 'post-1');
      expect(updatedPost?.isLiked).toBe(true);
      expect(updatedPost?.likes).toBe(11);
    });

    it('should optimistically unlike a liked post', async () => {
      mockLikePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleLike('post-2');

      const updatedPost = posts.find(p => p.id === 'post-2');
      expect(updatedPost?.isLiked).toBe(false);
      expect(updatedPost?.likes).toBe(19);
    });

    it('should call likePost service with postId', async () => {
      mockLikePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleLike('post-1');

      expect(mockLikePost).toHaveBeenCalledWith('post-1');
    });

    it('should sync to feedStore on successful like', async () => {
      mockLikePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleLike('post-1');

      // For an unliked post becoming liked, toggleLikeOptimistic is called with true
      expect(mockToggleLikeOptimistic).toHaveBeenCalledWith('post-1', true);
    });

    it('should fire onLike callback when liking (not unliking)', async () => {
      mockLikePost.mockResolvedValue({ error: null });
      const onLike = jest.fn();

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts, onLike })
      );

      await runner.current.toggleLike('post-1'); // Was not liked, now liking
      expect(onLike).toHaveBeenCalledWith('post-1');
    });

    it('should NOT fire onLike callback when unliking', async () => {
      mockLikePost.mockResolvedValue({ error: null });
      const onLike = jest.fn();

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts, onLike })
      );

      await runner.current.toggleLike('post-2'); // Was liked, now unliking
      expect(onLike).not.toHaveBeenCalled();
    });

    it('should rollback on API error and fire onError', async () => {
      mockLikePost.mockResolvedValue({ error: 'Server error' });
      const onError = jest.fn();

      // Reset posts to known initial state before the test
      posts = [
        { id: 'post-1', isLiked: false, likes: 10, isSaved: false, saves: 5 },
      ];

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts, onError })
      );

      await runner.current.toggleLike('post-1');

      // After rollback, post should be back to original state
      // The setPosts is called twice: once optimistic, once rollback
      expect(setPosts).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledWith('like', 'post-1');
      expect(mockToggleLikeOptimistic).toHaveBeenCalledWith('post-1', false);
    });

    it('should rollback and fire onError when like request throws', async () => {
      mockLikePost.mockRejectedValue(new Error('Network down'));
      const onError = jest.fn();

      posts = [
        { id: 'post-1', isLiked: false, likes: 10, isSaved: false, saves: 5 },
      ];

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts, onError })
      );

      await runner.current.toggleLike('post-1');

      expect(setPosts).toHaveBeenCalledTimes(2);
      expect(posts[0]?.isLiked).toBe(false);
      expect(posts[0]?.likes).toBe(10);
      expect(onError).toHaveBeenCalledWith('like', 'post-1');
      expect(mockToggleLikeOptimistic).toHaveBeenCalledWith('post-1', false);
    });

    it('should not allow concurrent like requests for the same post', async () => {
      let resolveFirst: (value: { error: null }) => void;
      const firstPromise = new Promise<{ error: null }>(resolve => {
        resolveFirst = resolve;
      });
      mockLikePost.mockReturnValueOnce(firstPromise);

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      // First call starts
      const promise1 = runner.current.toggleLike('post-1');

      // Second call should be skipped (pending)
      await runner.current.toggleLike('post-1');

      // likePost should only be called once
      expect(mockLikePost).toHaveBeenCalledTimes(1);

      // Resolve the first call
      resolveFirst!({ error: null });
      await promise1;
    });

    it('should allow concurrent like requests for different posts', async () => {
      mockLikePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await Promise.all([
        runner.current.toggleLike('post-1'),
        runner.current.toggleLike('post-2'),
      ]);

      expect(mockLikePost).toHaveBeenCalledTimes(2);
      expect(mockLikePost).toHaveBeenCalledWith('post-1');
      expect(mockLikePost).toHaveBeenCalledWith('post-2');
    });

    it('should not go below 0 likes when unliking a post with 0 likes', async () => {
      mockLikePost.mockResolvedValue({ error: null });

      // post-3 has 0 likes, is not liked. But let's make a post that IS liked with 0 likes
      posts = [{ id: 'post-x', isLiked: true, likes: 0, isSaved: false, saves: 0 }];

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleLike('post-x');

      const updatedPost = posts.find(p => p.id === 'post-x');
      expect(updatedPost?.likes).toBe(0); // Math.max(0, 0 - 1) = 0
      expect(updatedPost?.isLiked).toBe(false);
    });
  });

  // ========================================
  // toggleSave
  // ========================================

  describe('toggleSave', () => {
    it('should optimistically save an unsaved post', async () => {
      mockSavePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleSave('post-1');

      const updatedPost = posts.find(p => p.id === 'post-1');
      expect(updatedPost?.isSaved).toBe(true);
      expect(updatedPost?.saves).toBe(6);
    });

    it('should optimistically unsave a saved post', async () => {
      mockUnsavePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleSave('post-2');

      const updatedPost = posts.find(p => p.id === 'post-2');
      expect(updatedPost?.isSaved).toBe(false);
      expect(updatedPost?.saves).toBe(14);
    });

    it('should call savePost for unsaved posts', async () => {
      mockSavePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleSave('post-1');

      expect(mockSavePost).toHaveBeenCalledWith('post-1');
      expect(mockUnsavePost).not.toHaveBeenCalled();
    });

    it('should call unsavePost for saved posts', async () => {
      mockUnsavePost.mockResolvedValue({ error: null });

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleSave('post-2');

      expect(mockUnsavePost).toHaveBeenCalledWith('post-2');
      expect(mockSavePost).not.toHaveBeenCalled();
    });

    it('should fire onSaveToggle callback with saved=true when saving', async () => {
      mockSavePost.mockResolvedValue({ error: null });
      const onSaveToggle = jest.fn();

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts, onSaveToggle })
      );

      await runner.current.toggleSave('post-1');

      expect(onSaveToggle).toHaveBeenCalledWith('post-1', true);
    });

    it('should fire onSaveToggle callback with saved=false when unsaving', async () => {
      mockUnsavePost.mockResolvedValue({ error: null });
      const onSaveToggle = jest.fn();

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts, onSaveToggle })
      );

      await runner.current.toggleSave('post-2');

      expect(onSaveToggle).toHaveBeenCalledWith('post-2', false);
    });

    it('should rollback on save API error and fire onError', async () => {
      mockSavePost.mockResolvedValue({ error: 'Server error' });
      const onError = jest.fn();

      posts = [
        { id: 'post-1', isLiked: false, likes: 10, isSaved: false, saves: 5 },
      ];

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts, onError })
      );

      await runner.current.toggleSave('post-1');

      // After rollback, should be back to unsaved state
      expect(setPosts).toHaveBeenCalledTimes(2); // optimistic + rollback
      expect(onError).toHaveBeenCalledWith('save', 'post-1');
    });

    it('should rollback on unsave API error and fire onError', async () => {
      mockUnsavePost.mockResolvedValue({ error: 'Server error' });
      const onError = jest.fn();

      posts = [
        { id: 'post-2', isLiked: true, likes: 20, isSaved: true, saves: 15 },
      ];

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts, onError })
      );

      await runner.current.toggleSave('post-2');

      expect(setPosts).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledWith('save', 'post-2');
    });

    it('should not allow concurrent save requests for the same post', async () => {
      let resolveFirst: (value: { error: null }) => void;
      const firstPromise = new Promise<{ error: null }>(resolve => {
        resolveFirst = resolve;
      });
      mockSavePost.mockReturnValueOnce(firstPromise);

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      const promise1 = runner.current.toggleSave('post-1');
      await runner.current.toggleSave('post-1');

      // savePost should only be called once
      expect(mockSavePost).toHaveBeenCalledTimes(1);

      resolveFirst!({ error: null });
      await promise1;
    });

    it('should handle posts with undefined isSaved', async () => {
      mockSavePost.mockResolvedValue({ error: null });

      posts = [
        { id: 'post-no-save', isLiked: false, likes: 5 }, // No isSaved field
      ];

      const runner = createHookRunner(() =>
        usePostInteractions<TestPost>({ setPosts })
      );

      await runner.current.toggleSave('post-no-save');

      // Should treat undefined as false, so should save
      const updatedPost = posts.find(p => p.id === 'post-no-save');
      expect(updatedPost?.isSaved).toBe(true);
      expect(mockSavePost).toHaveBeenCalledWith('post-no-save');
    });
  });
});
