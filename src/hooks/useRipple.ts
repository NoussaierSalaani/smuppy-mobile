/**
 * useRipple Hook — Reactive access to ripple state
 */

import { useMemo } from 'react';
import { useVibeStore } from '../stores/vibeStore';
import { getRippleLevel, getRippleAnimationIntensity, RippleLevel } from '../services/rippleTracker';
import { isFeatureEnabled } from '../config/featureFlags';

export interface UseRippleReturn {
  rippleScore: number;
  rippleLevel: RippleLevel;
  animationIntensity: number;
  enabled: boolean;
}

export function useRipple(): UseRippleReturn {
  const rippleScore = useVibeStore((s) => s.rippleScore);
  const enabled = isFeatureEnabled('EMOTIONAL_RIPPLE');

  const rippleLevel = useMemo(() => getRippleLevel(rippleScore), [rippleScore]);
  const animationIntensity = useMemo(() => getRippleAnimationIntensity(rippleScore), [rippleScore]);

  return {
    rippleScore,
    rippleLevel,
    animationIntensity,
    enabled,
  };
}
