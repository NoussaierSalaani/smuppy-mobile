/**
 * useAsyncAction - Unified async action handling with error management
 * Replaces 51+ inconsistent try-catch blocks across screens
 */

import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';

// ============================================
// TYPES
// ============================================

interface AsyncActionOptions<T> {
  /** Called when action succeeds */
  onSuccess?: (result: T) => void;
  /** Called when action fails */
  onError?: (error: Error) => void;
  /** Show alert on error (default: false) */
  showErrorAlert?: boolean;
  /** Custom error message for alert */
  errorMessage?: string;
  /** Custom error title for alert */
  errorTitle?: string;
  /** Prevent concurrent executions (default: true) */
  preventConcurrent?: boolean;
  /** Optimistic update function - called before async action */
  optimisticUpdate?: () => void;
  /** Rollback function - called if async action fails after optimistic update */
  rollback?: () => void;
}

interface AsyncActionResult<T> {
  /** Execute the async action */
  execute: () => Promise<T | undefined>;
  /** Loading state */
  isLoading: boolean;
  /** Error from last execution */
  error: Error | null;
  /** Result from last successful execution */
  data: T | null;
  /** Reset state */
  reset: () => void;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

/**
 * Hook for executing async actions with consistent error handling
 *
 * @example
 * ```tsx
 * // Basic usage
 * const { execute, isLoading } = useAsyncAction(
 *   () => likePost(postId),
 *   { onSuccess: () => setLiked(true) }
 * );
 *
 * // With optimistic update
 * const { execute } = useAsyncAction(
 *   () => likePost(postId),
 *   {
 *     optimisticUpdate: () => setLiked(true),
 *     rollback: () => setLiked(false),
 *     onError: (e) => showToast(e.message)
 *   }
 * );
 *
 * // Execute on button press
 * <TouchableOpacity onPress={execute} disabled={isLoading}>
 * ```
 */
export function useAsyncAction<T>(
  action: () => Promise<T>,
  options: AsyncActionOptions<T> = {}
): AsyncActionResult<T> {
  const {
    onSuccess,
    onError,
    showErrorAlert = false,
    errorMessage = 'An error occurred. Please try again.',
    errorTitle = 'Error',
    preventConcurrent = true,
    optimisticUpdate,
    rollback,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);
  const isExecutingRef = useRef(false);

  const execute = useCallback(async (): Promise<T | undefined> => {
    // Prevent concurrent executions
    if (preventConcurrent && isExecutingRef.current) {
      return undefined;
    }

    isExecutingRef.current = true;
    setIsLoading(true);
    setError(null);

    // Apply optimistic update
    if (optimisticUpdate) {
      optimisticUpdate();
    }

    try {
      const result = await action();
      setData(result);
      onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);

      // Rollback optimistic update
      if (rollback) {
        rollback();
      }

      // Handle error
      onError?.(error);

      if (showErrorAlert) {
        Alert.alert(errorTitle, errorMessage);
      }

      return undefined;
    } finally {
      setIsLoading(false);
      isExecutingRef.current = false;
    }
  }, [action, onSuccess, onError, showErrorAlert, errorMessage, errorTitle, preventConcurrent, optimisticUpdate, rollback]);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
    setData(null);
    isExecutingRef.current = false;
  }, []);

  return { execute, isLoading, error, data, reset };
}

// ============================================
// SPECIALIZED VARIANTS
// ============================================

/**
 * Hook for toggling boolean states with async actions (like/unlike, follow/unfollow)
 */
export function useAsyncToggle(
  onAction: () => Promise<void>,
  offAction: () => Promise<void>,
  initialState: boolean = false,
  options: Omit<AsyncActionOptions<void>, 'optimisticUpdate' | 'rollback'> = {}
) {
  const [isActive, setIsActive] = useState(initialState);
  const [isLoading, setIsLoading] = useState(false);

  const toggle = useCallback(async () => {
    if (isLoading) return;

    const newState = !isActive;
    const action = newState ? onAction : offAction;

    // Optimistic update
    setIsActive(newState);
    setIsLoading(true);

    try {
      await action();
      options.onSuccess?.();
    } catch (err) {
      // Rollback
      setIsActive(!newState);
      const error = err instanceof Error ? err : new Error(String(err));
      options.onError?.(error);

      if (options.showErrorAlert) {
        Alert.alert(
          options.errorTitle || 'Error',
          options.errorMessage || 'Action failed. Please try again.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [isActive, isLoading, onAction, offAction, options]);

  const setActive = useCallback((active: boolean) => {
    setIsActive(active);
  }, []);

  return { isActive, isLoading, toggle, setActive };
}

/**
 * Hook for actions on specific items (like by post ID)
 */
export function useItemAction<T>(
  action: (itemId: string) => Promise<T>,
  options: AsyncActionOptions<T> = {}
) {
  const [loadingItems, setLoadingItems] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, Error | null>>({});

  const execute = useCallback(async (itemId: string): Promise<T | undefined> => {
    if (loadingItems[itemId]) return undefined;

    setLoadingItems((prev) => ({ ...prev, [itemId]: true }));
    setErrors((prev) => ({ ...prev, [itemId]: null }));

    if (options.optimisticUpdate) {
      options.optimisticUpdate();
    }

    try {
      const result = await action(itemId);
      options.onSuccess?.(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setErrors((prev) => ({ ...prev, [itemId]: error }));

      if (options.rollback) {
        options.rollback();
      }

      options.onError?.(error);

      if (options.showErrorAlert) {
        Alert.alert(
          options.errorTitle || 'Error',
          options.errorMessage || 'Action failed. Please try again.'
        );
      }

      return undefined;
    } finally {
      setLoadingItems((prev) => ({ ...prev, [itemId]: false }));
    }
  }, [action, loadingItems, options]);

  const isLoading = useCallback((itemId: string) => loadingItems[itemId] || false, [loadingItems]);
  const getError = useCallback((itemId: string) => errors[itemId] || null, [errors]);

  return { execute, isLoading, getError };
}

export default useAsyncAction;
