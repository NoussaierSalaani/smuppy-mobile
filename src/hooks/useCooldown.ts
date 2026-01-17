import { useCallback, useEffect, useRef, useState } from 'react';

export function useCooldown(seconds: number) {
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const start = useCallback(() => {
    setRemaining(seconds);
  }, [seconds]);

  const reset = useCallback(() => {
    setRemaining(0);
  }, []);

  useEffect(() => {
    if (remaining <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        setRemaining((r) => Math.max(0, r - 1));
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [remaining]);

  return {
    remaining,
    isCoolingDown: remaining > 0,
    start,
    reset,
  };
}
