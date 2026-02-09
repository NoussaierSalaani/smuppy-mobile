/**
 * useVibeGuardian Hook
 *
 * Consumes vibeGuardian + vibeProfile to provide anti-doom-scroll
 * protection to feed screens.
 *
 * Adapts behavior per account type + interests/expertise:
 * - Personal: thresholds based on interests
 * - Pro Creator: thresholds based on expertise
 * - Pro Business: vibe features entirely disabled
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { vibeGuardian, VibeHealthStatus, SessionRecap } from '../services/vibeGuardian';
import { buildVibeProfile } from '../services/vibeProfile';
import { isFeatureEnabled } from '../config/featureFlags';
import { useUserStore } from '../stores/userStore';

const HEALTH_CHECK_INTERVAL_MS = 15_000; // Check every 15s

const noop = () => {};

export interface UseVibeGuardianReturn {
  isAlertVisible: boolean;
  dismissAlert: () => void;
  sessionRecap: SessionRecap | null;
  showSessionRecap: boolean;
  dismissSessionRecap: () => void;
  vibeHealth: VibeHealthStatus | null;
  trackEngagement: () => void;
  trackPositiveInteraction: () => void;
}

const DISABLED_RETURN: UseVibeGuardianReturn = {
  isAlertVisible: false,
  dismissAlert: noop,
  sessionRecap: null,
  showSessionRecap: false,
  dismissSessionRecap: noop,
  vibeHealth: null,
  trackEngagement: noop,
  trackPositiveInteraction: noop,
};

export function useVibeGuardian(): UseVibeGuardianReturn {
  const [isAlertVisible, setIsAlertVisible] = useState(false);
  const [showSessionRecap, setShowSessionRecap] = useState(false);
  const [sessionRecap, setSessionRecap] = useState<SessionRecap | null>(null);
  const [vibeHealth, setVibeHealth] = useState<VibeHealthStatus | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissedRef = useRef(false);

  // Read user profile from store
  const accountType = useUserStore((s) => s.user?.accountType);
  const interests = useUserStore((s) => s.user?.interests);
  const expertise = useUserStore((s) => s.user?.expertise);

  // Memoize profile config to avoid rebuilding every render
  const tags = accountType === 'pro_creator' ? expertise : interests;
  const profileConfig = useMemo(
    () => buildVibeProfile(accountType, tags || []),
    [accountType, tags],
  );

  // Feature flag + profile check
  const featureEnabled = isFeatureEnabled('VIBE_GUARDIAN');
  const enabled = featureEnabled && profileConfig.vibeEnabled;

  // Apply profile config to guardian singleton
  useEffect(() => {
    if (!enabled) return;
    vibeGuardian.applyProfile(profileConfig);
  }, [enabled, profileConfig]);

  // Start monitoring on mount
  useEffect(() => {
    if (!enabled) return;

    vibeGuardian.startMonitoring();

    // Periodic health checks
    healthCheckRef.current = setInterval(() => {
      const health = vibeGuardian.checkHealth();
      setVibeHealth(health);

      // Show alert if health is 'alert' and not previously dismissed this session
      if (health.level === 'alert' && !dismissedRef.current) {
        setIsAlertVisible(true);
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => {
      if (healthCheckRef.current) {
        clearInterval(healthCheckRef.current);
        healthCheckRef.current = null;
      }
      vibeGuardian.stopMonitoring();
    };
  }, [enabled]);

  // Show session recap when app goes to background
  useEffect(() => {
    if (!enabled) return;

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        const recap = vibeGuardian.getSessionRecap();
        if (recap.durationMinutes >= 2) {
          setSessionRecap(recap);
          setShowSessionRecap(true);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription?.remove();
  }, [enabled]);

  const dismissAlert = useCallback(() => {
    setIsAlertVisible(false);
    dismissedRef.current = true;
  }, []);

  const dismissSessionRecap = useCallback(() => {
    setShowSessionRecap(false);
    setSessionRecap(null);
  }, []);

  const trackEngagement = useCallback(() => {
    if (!enabled) return;
    vibeGuardian.trackEngagement();
  }, [enabled]);

  const trackPositiveInteraction = useCallback(() => {
    if (!enabled) return;
    vibeGuardian.trackPositiveInteraction();
  }, [enabled]);

  // Early return for disabled accounts
  if (!enabled) return DISABLED_RETURN;

  return {
    isAlertVisible,
    dismissAlert,
    sessionRecap,
    showSessionRecap,
    dismissSessionRecap,
    vibeHealth,
    trackEngagement,
    trackPositiveInteraction,
  };
}
