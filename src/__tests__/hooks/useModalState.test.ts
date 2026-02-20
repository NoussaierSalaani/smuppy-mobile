/**
 * useModalState Hook Tests
 * Tests for modal state management and specialized modal hooks
 *
 * Uses a lightweight manual hook runner since the Jest config uses ts-jest/node
 * (not jest-expo) and cannot load @testing-library/react-native.
 */

// Minimal hook runner that simulates React hook state for testing
function createHookRunner<T>(hookFn: () => T) {
  let state: Map<number, unknown> = new Map();
  let callbackMap: Map<number, unknown> = new Map();
  let stateIndex = 0;
  let callbackIndex = 0;
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useState').mockImplementation(mockUseState as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn(require('react'), 'useCallback').mockImplementation(mockUseCallback as any);

  function render() {
    stateIndex = 0;
    callbackIndex = 0;
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

import { useModalState, useMultiModal, useShareModal, useMenuModal, useConfirmationModal, useImageViewerModal } from '../../hooks/useModalState';

describe('useModalState', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // Initial state
  // ========================================

  it('should initialize as not visible with null data by default', () => {
    const runner = createHookRunner(() => useModalState());

    expect(runner.current.isVisible).toBe(false);
    expect(runner.current.data).toBeNull();
  });

  it('should accept custom initial visibility', () => {
    const runner = createHookRunner(() => useModalState(true));

    expect(runner.current.isVisible).toBe(true);
    expect(runner.current.data).toBeNull();
  });

  it('should accept custom initial data', () => {
    const runner = createHookRunner(() =>
      useModalState<{ id: string }>(false, { id: 'test-123' })
    );

    expect(runner.current.isVisible).toBe(false);
    expect(runner.current.data).toEqual({ id: 'test-123' });
  });

  it('should accept both initial visibility and data', () => {
    const runner = createHookRunner(() =>
      useModalState<string>(true, 'initial-data')
    );

    expect(runner.current.isVisible).toBe(true);
    expect(runner.current.data).toBe('initial-data');
  });

  // ========================================
  // open
  // ========================================

  it('should set isVisible to true when open is called', () => {
    const runner = createHookRunner(() => useModalState());

    runner.current.open();
    runner.rerender();

    expect(runner.current.isVisible).toBe(true);
  });

  it('should set data when open is called with data', () => {
    const runner = createHookRunner(() => useModalState<{ postId: string }>());

    runner.current.open({ postId: 'abc' });
    runner.rerender();

    expect(runner.current.isVisible).toBe(true);
    expect(runner.current.data).toEqual({ postId: 'abc' });
  });

  it('should not change data when open is called without data argument', () => {
    const runner = createHookRunner(() =>
      useModalState<string>(false, 'existing-data')
    );

    runner.current.open();
    runner.rerender();

    expect(runner.current.isVisible).toBe(true);
    // Data should remain unchanged since open() was called without data
    expect(runner.current.data).toBe('existing-data');
  });

  // ========================================
  // close
  // ========================================

  it('should set isVisible to false when close is called', () => {
    const runner = createHookRunner(() => useModalState(true));

    runner.current.close();
    runner.rerender();

    expect(runner.current.isVisible).toBe(false);
  });

  it('should preserve data when close is called', () => {
    const runner = createHookRunner(() =>
      useModalState<string>(true, 'my-data')
    );

    runner.current.close();
    runner.rerender();

    expect(runner.current.isVisible).toBe(false);
    // Data is preserved on close (not cleared)
    expect(runner.current.data).toBe('my-data');
  });

  // ========================================
  // toggle
  // ========================================

  it('should toggle visibility from false to true', () => {
    const runner = createHookRunner(() => useModalState(false));

    runner.current.toggle();
    runner.rerender();

    expect(runner.current.isVisible).toBe(true);
  });

  it('should toggle visibility from true to false', () => {
    const runner = createHookRunner(() => useModalState(true));

    runner.current.toggle();
    runner.rerender();

    expect(runner.current.isVisible).toBe(false);
  });

  it('should toggle back and forth', () => {
    const runner = createHookRunner(() => useModalState(false));

    runner.current.toggle();
    runner.rerender();
    expect(runner.current.isVisible).toBe(true);

    runner.current.toggle();
    runner.rerender();
    expect(runner.current.isVisible).toBe(false);
  });

  // ========================================
  // setData
  // ========================================

  it('should set data without affecting visibility', () => {
    const runner = createHookRunner(() => useModalState<string>(false));

    runner.current.setData('new-data');
    runner.rerender();

    expect(runner.current.isVisible).toBe(false);
    expect(runner.current.data).toBe('new-data');
  });

  it('should allow setting data to null', () => {
    const runner = createHookRunner(() =>
      useModalState<string>(false, 'some-data')
    );

    runner.current.setData(null);
    runner.rerender();

    expect(runner.current.data).toBeNull();
  });

  // ========================================
  // Return value shape
  // ========================================

  it('should return all expected properties', () => {
    const runner = createHookRunner(() => useModalState());

    const result = runner.current;
    expect(result).toHaveProperty('isVisible');
    expect(result).toHaveProperty('data');
    expect(typeof result.open).toBe('function');
    expect(typeof result.close).toBe('function');
    expect(typeof result.toggle).toBe('function');
    expect(typeof result.setData).toBe('function');
  });
});

// ========================================
// Specialized modal hooks
// ========================================

describe('useShareModal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return a modal state with ShareContentData type', () => {
    const runner = createHookRunner(() => useShareModal());

    expect(runner.current.isVisible).toBe(false);
    expect(runner.current.data).toBeNull();

    runner.current.open({
      id: 'post-1',
      type: 'post',
      title: 'Test Post',
      subtitle: 'A test caption',
      image: 'https://example.com/img.jpg',
    });
    runner.rerender();

    expect(runner.current.isVisible).toBe(true);
    expect(runner.current.data?.id).toBe('post-1');
    expect(runner.current.data?.type).toBe('post');
  });
});

describe('useMenuModal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return a modal state with MenuPostData type', () => {
    const runner = createHookRunner(() => useMenuModal());

    runner.current.open({
      id: 'post-1',
      userId: 'user-1',
      isOwnPost: true,
    });
    runner.rerender();

    expect(runner.current.isVisible).toBe(true);
    expect(runner.current.data?.id).toBe('post-1');
    expect(runner.current.data?.isOwnPost).toBe(true);
  });
});

describe('useConfirmationModal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return a modal state with ConfirmationData type', () => {
    const onConfirm = jest.fn();
    const runner = createHookRunner(() => useConfirmationModal());

    runner.current.open({
      title: 'Delete Post',
      message: 'Are you sure?',
      onConfirm,
      destructive: true,
    });
    runner.rerender();

    expect(runner.current.isVisible).toBe(true);
    expect(runner.current.data?.title).toBe('Delete Post');
    expect(runner.current.data?.destructive).toBe(true);
  });
});

describe('useImageViewerModal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return a modal state with ImageViewerData type', () => {
    const runner = createHookRunner(() => useImageViewerModal());

    runner.current.open({
      images: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
      initialIndex: 1,
    });
    runner.rerender();

    expect(runner.current.isVisible).toBe(true);
    expect(runner.current.data?.images).toHaveLength(2);
    expect(runner.current.data?.initialIndex).toBe(1);
  });
});

// ========================================
// useMultiModal
// ========================================

describe('useMultiModal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize with no active modal', () => {
    const runner = createHookRunner(() => useMultiModal());

    expect(runner.current.activeModal).toBeNull();
    expect(runner.current.modalData).toEqual({});
  });

  it('should open a named modal', () => {
    const runner = createHookRunner(() => useMultiModal());

    runner.current.open('share', { postId: '123' });
    runner.rerender();

    expect(runner.current.activeModal).toBe('share');
  });

  it('should report correct isOpen for named modals', () => {
    const runner = createHookRunner(() => useMultiModal());

    runner.current.open('share');
    runner.rerender();

    expect(runner.current.isOpen('share')).toBe(true);
    expect(runner.current.isOpen('menu')).toBe(false);
  });

  it('should close the active modal when close() is called without args', () => {
    const runner = createHookRunner(() => useMultiModal());

    runner.current.open('share');
    runner.rerender();
    expect(runner.current.activeModal).toBe('share');

    runner.current.close();
    runner.rerender();

    expect(runner.current.activeModal).toBeNull();
  });

  it('should close a specific modal by name', () => {
    const runner = createHookRunner(() => useMultiModal());

    runner.current.open('share');
    runner.rerender();

    runner.current.close('share');
    runner.rerender();

    expect(runner.current.activeModal).toBeNull();
  });

  it('should NOT close if close() is called with a different modal name', () => {
    const runner = createHookRunner(() => useMultiModal());

    runner.current.open('share');
    runner.rerender();

    runner.current.close('menu'); // closing 'menu' but 'share' is active
    runner.rerender();

    // 'share' should still be active
    expect(runner.current.activeModal).toBe('share');
  });

  it('should store and retrieve data for a modal', () => {
    const runner = createHookRunner(() => useMultiModal());

    runner.current.open('share', { postId: 'abc', media: 'https://example.com/img.jpg' });
    runner.rerender();

    const data = runner.current.getData<{ postId: string; media: string }>('share');
    expect(data?.postId).toBe('abc');
    expect(data?.media).toBe('https://example.com/img.jpg');
  });

  it('should return undefined for modal with no data', () => {
    const runner = createHookRunner(() => useMultiModal());

    const data = runner.current.getData<unknown>('nonexistent');
    expect(data).toBeUndefined();
  });

  it('should only have one modal open at a time', () => {
    const runner = createHookRunner(() => useMultiModal());

    runner.current.open('share');
    runner.rerender();
    expect(runner.current.isOpen('share')).toBe(true);

    runner.current.open('menu');
    runner.rerender();

    expect(runner.current.isOpen('menu')).toBe(true);
    expect(runner.current.isOpen('share')).toBe(false);
    expect(runner.current.activeModal).toBe('menu');
  });

  it('should preserve data across modal switches', () => {
    const runner = createHookRunner(() => useMultiModal());

    runner.current.open('share', { id: 'share-data' });
    runner.rerender();

    runner.current.open('menu', { id: 'menu-data' });
    runner.rerender();

    // Both data should be preserved even though only menu is active
    const shareData = runner.current.getData<{ id: string }>('share');
    const menuData = runner.current.getData<{ id: string }>('menu');
    expect(shareData?.id).toBe('share-data');
    expect(menuData?.id).toBe('menu-data');
  });
});
