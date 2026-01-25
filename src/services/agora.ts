/**
 * Agora Live Streaming Service
 * Handles video/audio streaming for live broadcasts and 1:1 private sessions
 */

import {
  createAgoraRtcEngine,
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcConnection,
  IRtcEngineEventHandler,
  VideoSourceType,
  RenderModeType,
} from 'react-native-agora';
import { Platform } from 'react-native';
import { ENV } from '../config/env';

// Agora App ID - MUST be configured in .env
const AGORA_APP_ID = ENV.AGORA_APP_ID || '';

export type AgoraRole = 'broadcaster' | 'audience';
export type StreamType = 'live' | 'private';

export interface AgoraUser {
  uid: number;
  isHost: boolean;
}

export interface AgoraCallbacks {
  onUserJoined?: (uid: number) => void;
  onUserLeft?: (uid: number) => void;
  onError?: (error: string) => void;
  onJoinSuccess?: (channel: string, uid: number) => void;
  onLeaveChannel?: () => void;
  onRemoteVideoStateChanged?: (uid: number, state: number) => void;
  onUserMuteVideo?: (uid: number, muted: boolean) => void;
  onUserMuteAudio?: (uid: number, muted: boolean) => void;
  onConnectionStateChanged?: (state: number) => void;
}

class AgoraService {
  private engine: IRtcEngine | null = null;
  private isInitialized = false;
  private currentChannel: string | null = null;
  private currentUid: number | null = null;
  private callbacks: AgoraCallbacks = {};
  private eventHandler: IRtcEngineEventHandler | null = null;

  /**
   * Initialize Agora engine
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.engine) {
      return true;
    }

    if (!AGORA_APP_ID) {
      console.error('[Agora] App ID not configured');
      return false;
    }

    try {
      this.engine = createAgoraRtcEngine();

      this.engine.initialize({
        appId: AGORA_APP_ID,
        channelProfile: ChannelProfileType.ChannelProfileLiveBroadcasting,
      });

      // Enable video
      this.engine.enableVideo();

      // Set default video encoder config
      this.engine.setVideoEncoderConfiguration({
        dimensions: { width: 1280, height: 720 },
        frameRate: 30,
        bitrate: 2000,
        orientationMode: 0,
      });

      this.isInitialized = true;
      console.log('[Agora] Engine initialized successfully');
      return true;
    } catch (error) {
      console.error('[Agora] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: AgoraCallbacks): void {
    this.callbacks = callbacks;
    this.setupEventHandler();
  }

  /**
   * Setup event handler for Agora events
   */
  private setupEventHandler(): void {
    if (!this.engine) return;

    // Remove existing handler if any
    if (this.eventHandler) {
      this.engine.unregisterEventHandler(this.eventHandler);
    }

    this.eventHandler = {
      onJoinChannelSuccess: (connection: RtcConnection, elapsed: number) => {
        console.log('[Agora] Joined channel:', connection.channelId);
        this.currentChannel = connection.channelId || null;
        this.currentUid = connection.localUid || null;
        this.callbacks.onJoinSuccess?.(connection.channelId || '', connection.localUid || 0);
      },

      onLeaveChannel: (connection: RtcConnection, stats: any) => {
        console.log('[Agora] Left channel');
        this.currentChannel = null;
        this.currentUid = null;
        this.callbacks.onLeaveChannel?.();
      },

      onUserJoined: (connection: RtcConnection, remoteUid: number, elapsed: number) => {
        console.log('[Agora] User joined:', remoteUid);
        this.callbacks.onUserJoined?.(remoteUid);
      },

      onUserOffline: (connection: RtcConnection, remoteUid: number, reason: number) => {
        console.log('[Agora] User left:', remoteUid);
        this.callbacks.onUserLeft?.(remoteUid);
      },

      onError: (err: number, msg: string) => {
        console.error('[Agora] Error:', err, msg);
        this.callbacks.onError?.(msg);
      },

      onRemoteVideoStateChanged: (
        connection: RtcConnection,
        remoteUid: number,
        state: number,
        reason: number,
        elapsed: number
      ) => {
        this.callbacks.onRemoteVideoStateChanged?.(remoteUid, state);
      },

      onUserMuteVideo: (connection: RtcConnection, remoteUid: number, muted: boolean) => {
        this.callbacks.onUserMuteVideo?.(remoteUid, muted);
      },

      onUserMuteAudio: (connection: RtcConnection, remoteUid: number, muted: boolean) => {
        this.callbacks.onUserMuteAudio?.(remoteUid, muted);
      },

      onConnectionStateChanged: (
        connection: RtcConnection,
        state: number,
        reason: number
      ) => {
        this.callbacks.onConnectionStateChanged?.(state);
      },
    };

    this.engine.registerEventHandler(this.eventHandler);
  }

  /**
   * Join a channel as broadcaster (host) or audience
   */
  async joinChannel(
    channelName: string,
    token: string | null,
    uid: number,
    role: AgoraRole
  ): Promise<boolean> {
    if (!this.engine || !this.isInitialized) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }

    try {
      // Set client role
      const clientRole = role === 'broadcaster'
        ? ClientRoleType.ClientRoleBroadcaster
        : ClientRoleType.ClientRoleAudience;

      this.engine!.setClientRole(clientRole);

      // If broadcaster, start local preview
      if (role === 'broadcaster') {
        this.engine!.startPreview();
      }

      // Join the channel
      this.engine!.joinChannel(token || '', channelName, uid, {
        clientRoleType: clientRole,
        publishMicrophoneTrack: role === 'broadcaster',
        publishCameraTrack: role === 'broadcaster',
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });

      return true;
    } catch (error) {
      console.error('[Agora] Failed to join channel:', error);
      return false;
    }
  }

  /**
   * Leave the current channel
   */
  async leaveChannel(): Promise<void> {
    if (!this.engine) return;

    try {
      this.engine.stopPreview();
      this.engine.leaveChannel();
    } catch (error) {
      console.error('[Agora] Failed to leave channel:', error);
    }
  }

  /**
   * Toggle local video (camera)
   */
  muteLocalVideo(mute: boolean): void {
    this.engine?.muteLocalVideoStream(mute);
  }

  /**
   * Toggle local audio (microphone)
   */
  muteLocalAudio(mute: boolean): void {
    this.engine?.muteLocalAudioStream(mute);
  }

  /**
   * Switch camera (front/back)
   */
  switchCamera(): void {
    this.engine?.switchCamera();
  }

  /**
   * Enable/disable speaker
   */
  setEnableSpeakerphone(enable: boolean): void {
    this.engine?.setEnableSpeakerphone(enable);
  }

  /**
   * Get engine instance for video rendering
   */
  getEngine(): IRtcEngine | null {
    return this.engine;
  }

  /**
   * Check if initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.engine !== null;
  }

  /**
   * Get current channel
   */
  getCurrentChannel(): string | null {
    return this.currentChannel;
  }

  /**
   * Get current user ID
   */
  getCurrentUid(): number | null {
    return this.currentUid;
  }

  /**
   * Destroy engine and cleanup
   */
  async destroy(): Promise<void> {
    if (this.engine) {
      try {
        if (this.eventHandler) {
          this.engine.unregisterEventHandler(this.eventHandler);
        }
        this.engine.stopPreview();
        this.engine.leaveChannel();
        this.engine.release();
      } catch (error) {
        console.error('[Agora] Error during cleanup:', error);
      }
    }

    this.engine = null;
    this.isInitialized = false;
    this.currentChannel = null;
    this.currentUid = null;
    this.callbacks = {};
    this.eventHandler = null;
  }
}

// Export singleton instance
export const agoraService = new AgoraService();

/**
 * Generate a unique channel name for private sessions
 */
export function generatePrivateChannelName(userId1: string, userId2: string): string {
  // Sort to ensure same channel regardless of who initiates
  const sorted = [userId1, userId2].sort();
  return `private_${sorted[0]}_${sorted[1]}`;
}

/**
 * Generate a channel name for live streams
 */
export function generateLiveChannelName(hostUserId: string): string {
  const timestamp = Date.now();
  return `live_${hostUserId}_${timestamp}`;
}
