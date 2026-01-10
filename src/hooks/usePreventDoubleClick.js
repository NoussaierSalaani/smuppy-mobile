import { useState, useCallback, useRef } from 'react';

/**
 * usePreventDoubleClick Hook
 * 
 * Prevents multiple rapid clicks on buttons (navigation, submit, etc.)
 * 
 * @param {function} callback - The function to execute on click
 * @param {number} delay - Delay in ms before allowing another click (default: 500)
 * @returns {[function, boolean]} - [handleClick function, disabled state]
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
export const usePreventDoubleClick = (callback, delay = 500) => {
  const [disabled, setDisabled] = useState(false);
  const timeoutRef = useRef(null);

  const handleClick = useCallback((...args) => {
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

/**
 * usePreventDoubleNavigation Hook
 * 
 * Specialized version for navigation actions with canGoBack check
 * 
 * @param {object} navigation - React Navigation object
 * @param {number} delay - Delay in ms (default: 500)
 * @returns {object} - { goBack, navigate, disabled }
 * 
 * @example
 * const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);
 * 
 * <TouchableOpacity onPress={goBack} disabled={disabled}>
 *   <Ionicons name="arrow-back" />
 * </TouchableOpacity>
 */
export const usePreventDoubleNavigation = (navigation, delay = 500) => {
  const [disabled, setDisabled] = useState(false);
  const timeoutRef = useRef(null);

  const executeWithDelay = useCallback((action) => {
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

  const navigate = useCallback((screen, params) => {
    executeWithDelay(() => navigation.navigate(screen, params));
  }, [navigation, executeWithDelay]);

  const replace = useCallback((screen, params) => {
    executeWithDelay(() => navigation.replace(screen, params));
  }, [navigation, executeWithDelay]);

  const reset = useCallback((state) => {
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