import { useState, useCallback, useRef } from 'react';

type CallbackFn = ((...args: unknown[]) => void) | undefined;

/**
 * usePreventDoubleClick Hook
 *
 * Prevents multiple rapid clicks on buttons (navigation, submit, etc.)
 *
 * @param callback - The function to execute on click
 * @param delay - Delay in ms before allowing another click (default: 500)
 * @returns [handleClick function, disabled state, cleanup function]
 *
 * @example
 * const [handleGoBack, isDisabled] = usePreventDoubleClick(() => {
 *   navigation.goBack();
 * });
 *
 * <TouchableOpacity onPress={handleGoBack} disabled={isDisabled}>
 *   <Text>Go Back</Text>
 * </TouchableOpacity>
 */
export const usePreventDoubleClick = (callback: CallbackFn, delay = 500): [(...args: unknown[]) => void, boolean, () => void] => {
  const [disabled, setDisabled] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = useCallback((...args: unknown[]) => {
    if (disabled) return;

    setDisabled(true);

    // Execute the callback
    if (callback) {
      callback(...args);
    }

    // Re-enable after delay
    timeoutRef.current = setTimeout(() => {
      setDisabled(false);
    }, delay);
  }, [callback, delay, disabled]);

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  return [handleClick, disabled, cleanup];
};

interface NavigationLike {
  canGoBack: () => boolean;
  goBack: () => void;
  navigate: (screen: string, params?: Record<string, unknown>) => void;
  replace: (screen: string, params?: Record<string, unknown>) => void;
  reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
}

interface NavigationState {
  index: number;
  routes: Array<{ name: string; params?: Record<string, unknown> }>;
}

/**
 * usePreventDoubleNavigation Hook
 *
 * Specialized version for navigation actions with canGoBack check
 *
 * @param navigation - React Navigation object
 * @param delay - Delay in ms (default: 500)
 * @returns { goBack, navigate, disabled }
 *
 * @example
 * const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);
 *
 * <TouchableOpacity onPress={goBack} disabled={disabled}>
 *   <Ionicons name="arrow-back" />
 * </TouchableOpacity>
 */
export const usePreventDoubleNavigation = (navigation: NavigationLike, delay = 500) => {
  const [disabled, setDisabled] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeWithDelay = useCallback((action: () => void) => {
    if (disabled) return;

    setDisabled(true);
    action();

    timeoutRef.current = setTimeout(() => {
      setDisabled(false);
    }, delay);
  }, [disabled, delay]);

  const goBack = useCallback(() => {
    if (navigation.canGoBack()) {
      executeWithDelay(() => navigation.goBack());
    }
  }, [navigation, executeWithDelay]);

  const navigate = useCallback((screen: string, params?: Record<string, unknown>) => {
    executeWithDelay(() => navigation.navigate(screen, params));
  }, [navigation, executeWithDelay]);

  const replace = useCallback((screen: string, params?: Record<string, unknown>) => {
    executeWithDelay(() => navigation.replace(screen, params));
  }, [navigation, executeWithDelay]);

  const reset = useCallback((state: NavigationState) => {
    executeWithDelay(() => navigation.reset(state));
  }, [navigation, executeWithDelay]);

  return {
    goBack,
    navigate,
    replace,
    reset,
    disabled
  };
};

export default usePreventDoubleClick;