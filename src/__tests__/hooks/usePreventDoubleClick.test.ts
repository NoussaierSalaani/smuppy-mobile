/**
 * usePreventDoubleClick Hook Tests
 * Tests for preventing double-click behavior
 */

import { renderHook, act } from '@testing-library/react-native';
import { usePreventDoubleClick } from '../../hooks/usePreventDoubleClick';

describe('usePreventDoubleClick', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should execute callback on first click', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => usePreventDoubleClick(callback, 500));

    const [handleClick] = result.current;

    act(() => {
      handleClick();
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should prevent multiple clicks within delay period', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => usePreventDoubleClick(callback, 500));

    const [handleClick] = result.current;

    act(() => {
      handleClick();
      handleClick(); // Second click should be ignored
      handleClick(); // Third click should be ignored
    });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('should return disabled state as true after click', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => usePreventDoubleClick(callback, 500));

    const [handleClick, isDisabled] = result.current;

    expect(isDisabled).toBe(false);

    act(() => {
      handleClick();
    });

    const [, isDisabledAfter] = result.current;
    expect(isDisabledAfter).toBe(true);
  });

  it('should allow clicking again after delay expires', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => usePreventDoubleClick(callback, 500));

    const [handleClick] = result.current;

    // First click
    act(() => {
      handleClick();
    });

    expect(callback).toHaveBeenCalledTimes(1);

    // Advance timers
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Second click should work now
    act(() => {
      handleClick();
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should pass arguments to callback', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => usePreventDoubleClick(callback, 500));

    const [handleClick] = result.current;

    act(() => {
      handleClick('arg1', 'arg2', 123);
    });

    expect(callback).toHaveBeenCalledWith('arg1', 'arg2', 123);
  });

  it('should handle undefined callback gracefully', () => {
    const { result } = renderHook(() => usePreventDoubleClick(undefined, 500));

    const [handleClick] = result.current;

    // Should not throw
    act(() => {
      handleClick();
    });

    expect(result.current[1]).toBe(true); // disabled should be true
  });

  it('should cleanup timeout on unmount', () => {
    const callback = jest.fn();
    const { result, unmount } = renderHook(() => usePreventDoubleClick(callback, 500));

    const [handleClick, , cleanup] = result.current;

    act(() => {
      handleClick();
    });

    // Cleanup should not throw
    act(() => {
      cleanup();
    });

    unmount();
  });

  it('should use default delay of 500ms', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => usePreventDoubleClick(callback)); // No delay specified

    const [handleClick] = result.current;

    act(() => {
      handleClick();
    });

    expect(callback).toHaveBeenCalledTimes(1);

    // Should still be disabled before 500ms
    act(() => {
      jest.advanceTimersByTime(400);
    });

    act(() => {
      handleClick();
    });

    expect(callback).toHaveBeenCalledTimes(1); // Still 1

    // After 500ms should work
    act(() => {
      jest.advanceTimersByTime(100);
    });

    act(() => {
      handleClick();
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should use custom delay when specified', () => {
    const callback = jest.fn();
    const { result } = renderHook(() => usePreventDoubleClick(callback, 1000));

    const [handleClick] = result.current;

    act(() => {
      handleClick();
    });

    // Should still be disabled at 500ms
    act(() => {
      jest.advanceTimersByTime(500);
    });

    act(() => {
      handleClick();
    });

    expect(callback).toHaveBeenCalledTimes(1);

    // Should work after 1000ms
    act(() => {
      jest.advanceTimersByTime(500);
    });

    act(() => {
      handleClick();
    });

    expect(callback).toHaveBeenCalledTimes(2);
  });
});
