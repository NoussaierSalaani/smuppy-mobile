/**
 * Agora Live Streaming Service Tests
 *
 * Tests the AgoraService singleton for initialization, channel management,
 * and media controls. All native Agora modules are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockEngine = {
  initialize: jest.fn(),
  enableVideo: jest.fn(),
  setVideoEncoderConfiguration: jest.fn(),
  setClientRole: jest.fn(),
  startPreview: jest.fn(),
  stopPreview: jest.fn(),
  joinChannel: jest.fn(),
  leaveChannel: jest.fn(),
  registerEventHandler: jest.fn(),
  unregisterEventHandler: jest.fn(),
  muteLocalVideoStream: jest.fn(),
  muteLocalAudioStream: jest.fn(),
  switchCamera: jest.fn(),
  setEnableSpeakerphone: jest.fn(),
  release: jest.fn(),
};

jest.mock('react-native-agora', () => ({
  createAgoraRtcEngine: jest.fn(() => mockEngine),
  ChannelProfileType: { ChannelProfileLiveBroadcasting: 1 },
  ClientRoleType: { ClientRoleBroadcaster: 1, ClientRoleAudience: 2 },
}));

jest.mock('../../config/env', () => ({
  ENV: { AGORA_APP_ID: 'test-agora-app-id' },
}));

(global as Record<string, unknown>).__DEV__ = false;

// ---------------------------------------------------------------------------
// Imports — after mocks
// ---------------------------------------------------------------------------

import {
  agoraService,
  generatePrivateChannelName,
  generateLiveChannelName,
} from '../../services/agora';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('agora', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset the service state by destroying
    await agoraService.destroy();
  });

  // =========================================================================
  // initialize
  // =========================================================================

  describe('initialize', () => {
    it('should initialize the Agora engine', async () => {
      const result = await agoraService.initialize();

      expect(result).toBe(true);
      expect(mockEngine.initialize).toHaveBeenCalledWith(
        expect.objectContaining({ appId: 'test-agora-app-id' })
      );
      expect(mockEngine.enableVideo).toHaveBeenCalled();
      expect(mockEngine.setVideoEncoderConfiguration).toHaveBeenCalled();
    });

    it('should return true if already initialized', async () => {
      await agoraService.initialize();
      const result = await agoraService.initialize();
      expect(result).toBe(true);
      // Should only initialize once
      expect(mockEngine.initialize).toHaveBeenCalledTimes(1);
    });

    it('should return false on initialization error', async () => {
      mockEngine.initialize.mockImplementationOnce(() => {
        throw new Error('Init failed');
      });

      const result = await agoraService.initialize();
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // setCallbacks
  // =========================================================================

  describe('setCallbacks', () => {
    it('should register event handler on the engine', async () => {
      await agoraService.initialize();

      const callbacks = {
        onUserJoined: jest.fn(),
        onUserLeft: jest.fn(),
      };

      agoraService.setCallbacks(callbacks);
      expect(mockEngine.registerEventHandler).toHaveBeenCalled();
    });

    it('should remove previous handler before registering new one', async () => {
      await agoraService.initialize();

      agoraService.setCallbacks({ onUserJoined: jest.fn() });
      const unregisterCountAfterFirst = mockEngine.unregisterEventHandler.mock.calls.length;

      agoraService.setCallbacks({ onUserLeft: jest.fn() });

      // Should have unregistered one more time than after first call
      expect(mockEngine.unregisterEventHandler).toHaveBeenCalledTimes(unregisterCountAfterFirst + 1);
      expect(mockEngine.registerEventHandler).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // joinChannel
  // =========================================================================

  describe('joinChannel', () => {
    it('should join channel as broadcaster', async () => {
      await agoraService.initialize();

      const result = await agoraService.joinChannel('test-channel', 'token', 1234, 'broadcaster');

      expect(result).toBe(true);
      expect(mockEngine.setClientRole).toHaveBeenCalledWith(1); // ClientRoleBroadcaster
      expect(mockEngine.startPreview).toHaveBeenCalled();
      expect(mockEngine.joinChannel).toHaveBeenCalledWith(
        'token',
        'test-channel',
        1234,
        expect.objectContaining({
          publishMicrophoneTrack: true,
          publishCameraTrack: true,
        })
      );
    });

    it('should join channel as audience', async () => {
      await agoraService.initialize();

      const result = await agoraService.joinChannel('test-channel', null, 5678, 'audience');

      expect(result).toBe(true);
      expect(mockEngine.setClientRole).toHaveBeenCalledWith(2); // ClientRoleAudience
      expect(mockEngine.startPreview).not.toHaveBeenCalled();
      expect(mockEngine.joinChannel).toHaveBeenCalledWith(
        '',
        'test-channel',
        5678,
        expect.objectContaining({
          publishMicrophoneTrack: false,
          publishCameraTrack: false,
        })
      );
    });

    it('should auto-initialize if not ready', async () => {
      const result = await agoraService.joinChannel('test-channel', 'token', 1, 'audience');

      expect(result).toBe(true);
      expect(mockEngine.initialize).toHaveBeenCalled();
    });

    it('should return false on error', async () => {
      await agoraService.initialize();
      mockEngine.joinChannel.mockImplementationOnce(() => {
        throw new Error('Join failed');
      });

      const result = await agoraService.joinChannel('test-channel', 'token', 1, 'broadcaster');
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // leaveChannel
  // =========================================================================

  describe('leaveChannel', () => {
    it('should leave channel and stop preview', async () => {
      await agoraService.initialize();
      await agoraService.leaveChannel();

      expect(mockEngine.stopPreview).toHaveBeenCalled();
      expect(mockEngine.leaveChannel).toHaveBeenCalled();
    });

    it('should not throw when engine is null', async () => {
      await expect(agoraService.leaveChannel()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Media controls
  // =========================================================================

  describe('muteLocalVideo', () => {
    it('should mute local video stream', async () => {
      await agoraService.initialize();
      agoraService.muteLocalVideo(true);
      expect(mockEngine.muteLocalVideoStream).toHaveBeenCalledWith(true);
    });
  });

  describe('muteLocalAudio', () => {
    it('should mute local audio stream', async () => {
      await agoraService.initialize();
      agoraService.muteLocalAudio(true);
      expect(mockEngine.muteLocalAudioStream).toHaveBeenCalledWith(true);
    });
  });

  describe('switchCamera', () => {
    it('should switch camera', async () => {
      await agoraService.initialize();
      agoraService.switchCamera();
      expect(mockEngine.switchCamera).toHaveBeenCalled();
    });
  });

  describe('setEnableSpeakerphone', () => {
    it('should toggle speakerphone', async () => {
      await agoraService.initialize();
      agoraService.setEnableSpeakerphone(true);
      expect(mockEngine.setEnableSpeakerphone).toHaveBeenCalledWith(true);
    });
  });

  // =========================================================================
  // Getters
  // =========================================================================

  describe('getEngine', () => {
    it('should return engine when initialized', async () => {
      await agoraService.initialize();
      expect(agoraService.getEngine()).toBe(mockEngine);
    });

    it('should return null when not initialized', () => {
      expect(agoraService.getEngine()).toBeNull();
    });
  });

  describe('isReady', () => {
    it('should return true when initialized', async () => {
      await agoraService.initialize();
      expect(agoraService.isReady()).toBe(true);
    });

    it('should return false when not initialized', () => {
      expect(agoraService.isReady()).toBe(false);
    });
  });

  describe('getCurrentChannel', () => {
    it('should return null initially', () => {
      expect(agoraService.getCurrentChannel()).toBeNull();
    });
  });

  describe('getCurrentUid', () => {
    it('should return null initially', () => {
      expect(agoraService.getCurrentUid()).toBeNull();
    });
  });

  // =========================================================================
  // destroy
  // =========================================================================

  describe('destroy', () => {
    it('should release engine and reset state', async () => {
      await agoraService.initialize();
      await agoraService.destroy();

      expect(mockEngine.release).toHaveBeenCalled();
      expect(agoraService.isReady()).toBe(false);
      expect(agoraService.getEngine()).toBeNull();
      expect(agoraService.getCurrentChannel()).toBeNull();
      expect(agoraService.getCurrentUid()).toBeNull();
    });

    it('should not throw when already destroyed', async () => {
      await expect(agoraService.destroy()).resolves.toBeUndefined();
    });
  });

  // =========================================================================
  // Channel name generators
  // =========================================================================

  describe('generatePrivateChannelName', () => {
    it('should generate sorted channel name', () => {
      expect(generatePrivateChannelName('user-b', 'user-a')).toBe('private_user-a_user-b');
      expect(generatePrivateChannelName('user-a', 'user-b')).toBe('private_user-a_user-b');
    });

    it('should be deterministic regardless of order', () => {
      const name1 = generatePrivateChannelName('alice', 'bob');
      const name2 = generatePrivateChannelName('bob', 'alice');
      expect(name1).toBe(name2);
    });
  });

  describe('generateLiveChannelName', () => {
    it('should generate channel name from host ID', () => {
      expect(generateLiveChannelName('host-123')).toBe('live_host-123');
    });
  });
});
