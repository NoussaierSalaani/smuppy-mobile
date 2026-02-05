/**
 * Custom hook for Agora live streaming
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { Camera } from 'expo-camera';
import { Audio } from 'expo-av';
import {
  agoraService,
  AgoraCallbacks,
  AgoraRole,
  generateLiveChannelName,
  generatePrivateChannelName,
} from '../services/agora';

export interface UseAgoraOptions {
  role: AgoraRole;
  channelName?: string;
  token?: string | null;
  uid?: number;
  autoJoin?: boolean;
}

export interface UseAgoraReturn {
  // State
  isInitialized: boolean;
  isJoined: boolean;
  isLoading: boolean;
  error: string | null;
  localUid: number | null;
  remoteUsers: number[];
  isMuted: boolean;
  isVideoOff: boolean;

  // Actions
  initialize: () => Promise<boolean>;
  joinChannel: (channelName?: string, token?: string | null) => Promise<boolean>;
  leaveChannel: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  switchCamera: () => void;
  destroy: () => Promise<void>;

  // Utilities
  engine: ReturnType<typeof agoraService.getEngine>;
}

/**
 * Request camera and microphone permissions
 */
async function requestPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      const cameraPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );
      const audioPermission = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      return (
        cameraPermission === PermissionsAndroid.RESULTS.GRANTED &&
        audioPermission === PermissionsAndroid.RESULTS.GRANTED
      );
    } else {
      // iOS - use Expo permissions
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      const { status: audioStatus } = await Audio.requestPermissionsAsync();
      return cameraStatus === 'granted' && audioStatus === 'granted';
    }
  } catch (error) {
    if (__DEV__) console.warn('[useAgora] Permission error:', error);
    return false;
  }
}

export function useAgora(options: UseAgoraOptions): UseAgoraReturn {
  const { role, channelName: initialChannel, token, uid, autoJoin = false } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localUid, setLocalUid] = useState<number | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<number[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const mountedRef = useRef(true);

  // Setup callbacks (use ref to avoid stale closures)
  const callbacksRef = useRef<AgoraCallbacks>({} as AgoraCallbacks);
  const callbacks: AgoraCallbacks = {
    onJoinSuccess: (channel, joinedUid) => {
      if (!mountedRef.current) return;
      if (__DEV__) console.log('[useAgora] Joined channel:', channel, 'UID:', joinedUid);
      setLocalUid(joinedUid);
      setIsJoined(true);
      setIsLoading(false);
      setError(null);
    },
    onLeaveChannel: () => {
      if (!mountedRef.current) return;
      if (__DEV__) console.log('[useAgora] Left channel');
      setIsJoined(false);
      setRemoteUsers([]);
      setLocalUid(null);
    },
    onUserJoined: (remoteUid) => {
      if (!mountedRef.current) return;
      if (__DEV__) console.log('[useAgora] Remote user joined:', remoteUid);
      setRemoteUsers((prev) => {
        if (prev.includes(remoteUid)) return prev;
        return [...prev, remoteUid];
      });
    },
    onUserLeft: (remoteUid) => {
      if (!mountedRef.current) return;
      if (__DEV__) console.log('[useAgora] Remote user left:', remoteUid);
      setRemoteUsers((prev) => prev.filter((id) => id !== remoteUid));
    },
    onError: (errorMsg) => {
      if (!mountedRef.current) return;
      if (__DEV__) console.warn('[useAgora] Error:', errorMsg);
      setError(errorMsg);
      setIsLoading(false);
    },
  };
  callbacksRef.current = callbacks;

  // Initialize Agora engine
  const initialize = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    // Request permissions
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      setError('Camera and microphone permissions are required');
      setIsLoading(false);
      return false;
    }

    // Initialize Agora
    const success = await agoraService.initialize();
    if (!success) {
      setError('Failed to initialize Agora. Check your App ID.');
      setIsLoading(false);
      return false;
    }

    agoraService.setCallbacks(callbacksRef.current);
    setIsInitialized(true);
    setIsLoading(false);
    return true;
  }, []);

  // Join channel
  const joinChannel = useCallback(
    async (channel?: string, joinToken?: string | null): Promise<boolean> => {
      const channelToJoin = channel || initialChannel;
      if (!channelToJoin) {
        setError('Channel name is required');
        return false;
      }

      setIsLoading(true);
      setError(null);

      // Initialize if needed
      if (!isInitialized) {
        const initSuccess = await initialize();
        if (!initSuccess) return false;
      }

      // Generate a random UID if not provided
      const userUid = uid || Math.floor(Math.random() * 100000);

      const success = await agoraService.joinChannel(
        channelToJoin,
        joinToken || token || null,
        userUid,
        role
      );

      if (!success) {
        setError('Failed to join channel');
        setIsLoading(false);
        return false;
      }

      return true;
    },
    [initialChannel, token, uid, role, isInitialized, initialize]
  );

  // Leave channel
  const leaveChannel = useCallback(async (): Promise<void> => {
    await agoraService.leaveChannel();
    setIsJoined(false);
    setRemoteUsers([]);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    agoraService.muteLocalAudio(newMuted);
    setIsMuted(newMuted);
  }, [isMuted]);

  // Toggle video
  const toggleVideo = useCallback(() => {
    const newVideoOff = !isVideoOff;
    agoraService.muteLocalVideo(newVideoOff);
    setIsVideoOff(newVideoOff);
  }, [isVideoOff]);

  // Switch camera
  const switchCamera = useCallback(() => {
    agoraService.switchCamera();
  }, []);

  // Destroy and cleanup
  const destroy = useCallback(async (): Promise<void> => {
    await agoraService.destroy();
    setIsInitialized(false);
    setIsJoined(false);
    setRemoteUsers([]);
    setLocalUid(null);
  }, []);

  // Auto-join on mount if enabled
  useEffect(() => {
    if (autoJoin && initialChannel) {
      joinChannel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin, initialChannel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      agoraService.leaveChannel();
    };
  }, []);

  return {
    isInitialized,
    isJoined,
    isLoading,
    error,
    localUid,
    remoteUsers,
    isMuted,
    isVideoOff,
    initialize,
    joinChannel,
    leaveChannel,
    toggleMute,
    toggleVideo,
    switchCamera,
    destroy,
    engine: agoraService.getEngine(),
  };
}

/**
 * Hook for creating a live stream (as host)
 */
export function useLiveStream(hostUserId: string) {
  const channelName = generateLiveChannelName(hostUserId);

  return useAgora({
    role: 'broadcaster',
    channelName,
  });
}

/**
 * Hook for watching a live stream (as viewer)
 */
export function useWatchLiveStream(channelName: string) {
  return useAgora({
    role: 'audience',
    channelName,
    autoJoin: true,
  });
}

/**
 * Hook for private 1:1 video call
 */
export function usePrivateCall(myUserId: string, otherUserId: string) {
  const channelName = generatePrivateChannelName(myUserId, otherUserId);

  return useAgora({
    role: 'broadcaster', // Both participants are broadcasters in 1:1
    channelName,
  });
}
