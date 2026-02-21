/**
 * useVideoStatus Hook
 * Polls the video processing status endpoint until the video is ready or fails.
 * Used after uploading a video post/peak to show HLS readiness.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface VideoStatus {
  videoStatus: 'uploaded' | 'processing' | 'ready' | 'failed' | null;
  hlsUrl: string | null;
  thumbnailUrl: string | null;
  videoVariants: Array<{ url: string; width: number; height: number }> | null;
  videoDuration: number | null;
}

interface UseVideoStatusOptions {
  entityType: 'post' | 'peak';
  entityId: string | null;
  /** Whether to start polling immediately (default: true) */
  enabled?: boolean;
  /** Poll interval in ms (default: 3000) */
  pollInterval?: number;
  /** Max poll attempts before giving up (default: 60 = ~3 minutes) */
  maxAttempts?: number;
}

const DEFAULT_POLL_INTERVAL = 3000;
const DEFAULT_MAX_ATTEMPTS = 60;

export function useVideoStatus(options: UseVideoStatusOptions): VideoStatus & { isPolling: boolean } {
  const { entityType, entityId, enabled = true, pollInterval = DEFAULT_POLL_INTERVAL, maxAttempts = DEFAULT_MAX_ATTEMPTS } = options;

  const [status, setStatus] = useState<VideoStatus>({
    videoStatus: null,
    hlsUrl: null,
    thumbnailUrl: null,
    videoVariants: null,
    videoDuration: null,
  });
  const [isPolling, setIsPolling] = useState(false);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!entityId) return;

    try {
      const { awsAPI } = await import('../services/aws-api');
      const response = await awsAPI.request<{
        success?: boolean;
        videoStatus?: VideoStatus['videoStatus'];
        hlsUrl?: string;
        thumbnailUrl?: string;
        videoVariants?: VideoStatus['videoVariants'];
        videoDuration?: number;
      }>(`/media/video-status?type=${entityType}&id=${entityId}`);

      if (response.success) {
        setStatus({
          videoStatus: response.videoStatus ?? null,
          hlsUrl: response.hlsUrl || null,
          thumbnailUrl: response.thumbnailUrl || null,
          videoVariants: response.videoVariants || null,
          videoDuration: response.videoDuration || null,
        });

        // Stop polling if terminal state
        if (response.videoStatus === 'ready' || response.videoStatus === 'failed') {
          setIsPolling(false);
          return;
        }
      }
    } catch {
      // Expected: network errors during polling are retried automatically
    }

    // Continue polling if not at max attempts
    attemptsRef.current += 1;
    if (attemptsRef.current >= maxAttempts) {
      setIsPolling(false);
      return;
    }

    // Schedule next poll
    timerRef.current = setTimeout(fetchStatus, pollInterval);
  }, [entityType, entityId, pollInterval, maxAttempts]);

  useEffect(() => {
    if (!enabled || !entityId) {
      setIsPolling(false);
      return;
    }

    attemptsRef.current = 0;
    setIsPolling(true);
    fetchStatus();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, entityId, fetchStatus]);

  return { ...status, isPolling };
}
