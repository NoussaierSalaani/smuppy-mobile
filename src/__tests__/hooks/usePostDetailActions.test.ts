/**
 * usePostDetailActions Hook Tests
 * Tests for post detail screen actions (like, bookmark, follow, report, etc.)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = false;

// Mock dependencies
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();
const mockShowDestructiveConfirm = jest.fn();
const mockFollowUser = jest.fn();
const mockIsFollowing = jest.fn();
const mockLikePost = jest.fn();
const mockHasLikedPost = jest.fn();
const mockSavePost = jest.fn();
const mockUnsavePost = jest.fn();
const mockHasSavedPost = jest.fn();
const mockDeletePost = jest.fn();
const mockSubmitPostReport = jest.fn();
const mockHasUserReported = jest.fn();
const mockIsUnderReview = jest.fn();
const mockMuteUser = jest.fn();
const mockBlockUser = jest.fn();
const mockIsMuted = jest.fn();
const mockIsBlocked = jest.fn();
const mockToggleLikeOptimistic = jest.fn();
const mockMarkPostDeleted = jest.fn();
const mockCopyPostLink = jest.fn();
const mockShareModalOpen = jest.fn();

jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(() => ({
      setValue: jest.fn(),
    })),
    sequence: jest.fn(() => ({ start: jest.fn((cb) => cb && cb()) })),
    spring: jest.fn(() => ({})),
    timing: jest.fn(() => ({})),
  },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: jest.fn(() => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  })),
}));

jest.mock('../../context/SmuppyAlertContext', () => ({
  useSmuppyAlert: jest.fn(() => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
    showDestructiveConfirm: mockShowDestructiveConfirm,
  })),
}));

jest.mock('../../stores/userStore', () => ({
  useUserStore: jest.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({ user: { id: 'current-user-id' } })
  ),
}));

jest.mock('../../stores/feedStore', () => ({
  useFeedStore: {
    getState: () => ({
      toggleLikeOptimistic: mockToggleLikeOptimistic,
      markPostDeleted: mockMarkPostDeleted,
    }),
  },
}));

jest.mock('../../stores/contentStore', () => ({
  useContentStore: jest.fn(() => ({
    submitPostReport: mockSubmitPostReport,
    hasUserReported: mockHasUserReported,
    isUnderReview: mockIsUnderReview,
  })),
}));

jest.mock('../../stores/userSafetyStore', () => ({
  useUserSafetyStore: jest.fn(() => ({
    mute: mockMuteUser,
    block: mockBlockUser,
    isMuted: mockIsMuted,
    isBlocked: mockIsBlocked,
  })),
}));

jest.mock('../../hooks/useModalState', () => ({
  useShareModal: jest.fn(() => ({
    open: mockShareModalOpen,
    close: jest.fn(),
    isOpen: false,
  })),
}));

jest.mock('../../utils/share', () => ({
  copyPostLink: (_postId: string) => mockCopyPostLink(_postId),
}));

jest.mock('../../services/database', () => ({
  followUser: (_userId: string) => mockFollowUser(_userId),
  isFollowing: (_userId: string) => mockIsFollowing(_userId),
  likePost: (_postId: string) => mockLikePost(_postId),
  hasLikedPost: (_postId: string) => mockHasLikedPost(_postId),
  savePost: (_postId: string) => mockSavePost(_postId),
  unsavePost: (_postId: string) => mockUnsavePost(_postId),
  hasSavedPost: (_postId: string) => mockHasSavedPost(_postId),
  deletePost: (_postId: string) => mockDeletePost(_postId),
}));

jest.mock('../../utils/formatters', () => ({
  isValidUUID: (_val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_val),
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

function flushAsync(ms = 50): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

import { usePostDetailActions, PostDetailPost } from '../../hooks/usePostDetailActions';

const VALID_POST_ID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440001';

const TEST_POST: PostDetailPost = {
  id: VALID_POST_ID,
  type: 'image',
  media: 'https://cdn.example.com/image.jpg',
  thumbnail: 'https://cdn.example.com/thumb.jpg',
  description: 'Test post description',
  likes: 10,
  user: {
    id: VALID_USER_ID,
    name: 'John Doe',
    avatar: 'https://cdn.example.com/avatar.jpg',
  },
};

describe('usePostDetailActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasLikedPost.mockResolvedValue({ hasLiked: false });
    mockHasSavedPost.mockResolvedValue({ saved: false });
    mockIsFollowing.mockResolvedValue({ following: false });
    mockLikePost.mockResolvedValue({ error: null });
    mockSavePost.mockResolvedValue({ error: null });
    mockUnsavePost.mockResolvedValue({ error: null });
    mockFollowUser.mockResolvedValue({ error: null });
    mockDeletePost.mockResolvedValue({ error: null });
    mockHasUserReported.mockReturnValue(false);
    mockIsUnderReview.mockReturnValue(false);
    mockIsMuted.mockReturnValue(false);
    mockIsBlocked.mockReturnValue(false);
    mockCopyPostLink.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should return expected properties', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    expect(runner.current.currentUserId).toBe('current-user-id');
    expect(runner.current.isLiked).toBe(false);
    expect(runner.current.isBookmarked).toBe(false);
    expect(runner.current.isFan).toBe(false);
    expect(runner.current.isAudioMuted).toBe(true);
    expect(runner.current.isPaused).toBe(false);
    expect(runner.current.showMenu).toBe(false);
    expect(runner.current.expandedDescription).toBe(false);
    expect(runner.current.showLikeAnimation).toBe(false);
    expect(runner.current.likeLoading).toBe(false);
    expect(runner.current.bookmarkLoading).toBe(false);
    expect(runner.current.fanLoading).toBe(false);
    expect(runner.current.deleteLoading).toBe(false);
  });

  it('should return all handler functions', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    expect(typeof runner.current.toggleLike).toBe('function');
    expect(typeof runner.current.toggleBookmark).toBe('function');
    expect(typeof runner.current.becomeFan).toBe('function');
    expect(typeof runner.current.handleDoubleTap).toBe('function');
    expect(typeof runner.current.handleGoBack).toBe('function');
    expect(typeof runner.current.handleShowMenu).toBe('function');
    expect(typeof runner.current.handleCloseMenu).toBe('function');
    expect(typeof runner.current.handleToggleAudioMute).toBe('function');
    expect(typeof runner.current.handleToggleDescription).toBe('function');
    expect(typeof runner.current.handleShare).toBe('function');
    expect(typeof runner.current.handleCopyLink).toBe('function');
    expect(typeof runner.current.handleReport).toBe('function');
    expect(typeof runner.current.handleMute).toBe('function');
    expect(typeof runner.current.handleBlock).toBe('function');
    expect(typeof runner.current.handleDeletePost).toBe('function');
    expect(typeof runner.current.handleViewProfile).toBe('function');
  });

  // ========================================
  // Toggle Like
  // ========================================

  it('should call likePost and sync to feedStore on toggle like', async () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.toggleLike();

    expect(mockLikePost).toHaveBeenCalledWith(VALID_POST_ID);
    expect(mockToggleLikeOptimistic).toHaveBeenCalledWith(VALID_POST_ID, true);
  });

  it('should not sync to feedStore on like API error', async () => {
    mockLikePost.mockResolvedValue({ error: 'Server error' });

    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.toggleLike();

    expect(mockLikePost).toHaveBeenCalledWith(VALID_POST_ID);
    // On error, toggleLikeOptimistic should NOT be called (rollback happens instead)
    expect(mockToggleLikeOptimistic).not.toHaveBeenCalled();
  });

  // ========================================
  // Toggle Bookmark
  // ========================================

  it('should call savePost and show success on bookmark', async () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.toggleBookmark();

    expect(mockSavePost).toHaveBeenCalledWith(VALID_POST_ID);
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('should not show success on save error', async () => {
    mockSavePost.mockResolvedValue({ error: 'Server error' });

    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.toggleBookmark();

    expect(mockSavePost).toHaveBeenCalledWith(VALID_POST_ID);
    expect(mockShowSuccess).not.toHaveBeenCalled();
  });

  // ========================================
  // Become Fan (Follow)
  // ========================================

  it('should follow user', async () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.becomeFan();
    runner.rerender();

    expect(runner.current.isFan).toBe(true);
    expect(mockFollowUser).toHaveBeenCalledWith(VALID_USER_ID);
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  // ========================================
  // Navigation
  // ========================================

  it('should go back', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    runner.current.handleGoBack();

    expect(mockGoBack).toHaveBeenCalled();
  });

  it('should show and close menu', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    runner.current.handleShowMenu();
    runner.rerender();
    expect(runner.current.showMenu).toBe(true);

    runner.current.handleCloseMenu();
    runner.rerender();
    expect(runner.current.showMenu).toBe(false);
  });

  // ========================================
  // Audio & Description
  // ========================================

  it('should toggle audio mute', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    expect(runner.current.isAudioMuted).toBe(true);

    runner.current.handleToggleAudioMute();
    runner.rerender();

    expect(runner.current.isAudioMuted).toBe(false);
  });

  it('should toggle description expansion', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    expect(runner.current.expandedDescription).toBe(false);

    runner.current.handleToggleDescription();
    runner.rerender();

    expect(runner.current.expandedDescription).toBe(true);
  });

  // ========================================
  // Share & Copy Link
  // ========================================

  it('should open share modal', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    runner.current.handleShare();

    expect(mockShareModalOpen).toHaveBeenCalledWith(expect.objectContaining({
      id: VALID_POST_ID,
      type: 'post',
    }));
  });

  it('should copy post link', async () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.handleCopyLink();

    expect(mockCopyPostLink).toHaveBeenCalledWith(VALID_POST_ID);
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  // ========================================
  // Report
  // ========================================

  it('should submit post report', async () => {
    mockSubmitPostReport.mockResolvedValue({ success: true, message: 'Reported' });

    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.handleReport('spam');

    expect(mockSubmitPostReport).toHaveBeenCalledWith(VALID_POST_ID, 'spam');
    expect(mockShowSuccess).toHaveBeenCalled();
  });

  it('should show error when already reported', async () => {
    mockHasUserReported.mockReturnValue(true);

    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.handleReport('spam');

    expect(mockShowError).toHaveBeenCalledWith(
      'Already Reported',
      expect.stringContaining('already reported')
    );
    expect(mockSubmitPostReport).not.toHaveBeenCalled();
  });

  it('should show error when under review', async () => {
    mockIsUnderReview.mockReturnValue(true);

    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    await runner.current.handleReport('harassment');

    expect(mockShowError).toHaveBeenCalledWith(
      'Under Review',
      expect.stringContaining('already being reviewed')
    );
  });

  // ========================================
  // View Profile
  // ========================================

  it('should navigate to UserProfile for other users', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    runner.current.handleViewProfile();

    expect(mockNavigate).toHaveBeenCalledWith('UserProfile', { userId: VALID_USER_ID });
  });

  it('should navigate to Profile tab for own profile', () => {
    const ownPost = {
      ...TEST_POST,
      user: { ...TEST_POST.user, id: 'current-user-id' },
    };

    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: ownPost })
    );

    runner.current.handleViewProfile();

    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Profile' });
  });

  // ========================================
  // Report helpers
  // ========================================

  it('should expose hasUserReported and isUnderReview', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: TEST_POST })
    );

    expect(typeof runner.current.hasUserReported).toBe('function');
    expect(typeof runner.current.isUnderReview).toBe('function');
  });

  // ========================================
  // Null post handling
  // ========================================

  it('should handle null currentPost gracefully', () => {
    const runner = createHookRunner(() =>
      usePostDetailActions({ currentPost: null })
    );

    // Should not throw
    expect(runner.current.isLiked).toBe(false);
    expect(typeof runner.current.toggleLike).toBe('function');
  });
});
