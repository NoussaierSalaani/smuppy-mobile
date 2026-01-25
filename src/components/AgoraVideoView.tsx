/**
 * Agora Video View Components
 * For rendering local and remote video streams
 */

import React from 'react';
import { View, StyleSheet, ViewStyle, Text } from 'react-native';
import {
  RtcSurfaceView,
  ChannelProfileType,
  VideoSourceType,
  RenderModeType,
} from 'react-native-agora';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/theme';

interface LocalVideoViewProps {
  style?: ViewStyle;
  zOrderMediaOverlay?: boolean;
  renderMode?: RenderModeType;
  isVideoOff?: boolean;
}

interface RemoteVideoViewProps {
  uid: number;
  channelId: string;
  style?: ViewStyle;
  zOrderMediaOverlay?: boolean;
  renderMode?: RenderModeType;
  isVideoOff?: boolean;
}

interface VideoPlaceholderProps {
  style?: ViewStyle;
  label?: string;
  iconSize?: number;
}

/**
 * Placeholder shown when video is off or loading
 */
export function VideoPlaceholder({ style, label, iconSize = 48 }: VideoPlaceholderProps) {
  return (
    <View style={[styles.placeholder, style]}>
      <View style={styles.placeholderIcon}>
        <Ionicons name="videocam-off" size={iconSize} color={COLORS.grayMuted} />
      </View>
      {label && <Text style={styles.placeholderText}>{label}</Text>}
    </View>
  );
}

/**
 * Local video view (your camera)
 */
export function LocalVideoView({
  style,
  zOrderMediaOverlay = false,
  renderMode = RenderModeType.RenderModeHidden,
  isVideoOff = false,
}: LocalVideoViewProps) {
  if (isVideoOff) {
    return <VideoPlaceholder style={style} label="Camera Off" />;
  }

  return (
    <RtcSurfaceView
      style={[styles.videoView, style]}
      canvas={{
        sourceType: VideoSourceType.VideoSourceCamera,
        renderMode,
      }}
      zOrderMediaOverlay={zOrderMediaOverlay}
    />
  );
}

/**
 * Remote video view (other user's video)
 */
export function RemoteVideoView({
  uid,
  channelId,
  style,
  zOrderMediaOverlay = false,
  renderMode = RenderModeType.RenderModeHidden,
  isVideoOff = false,
}: RemoteVideoViewProps) {
  if (isVideoOff) {
    return <VideoPlaceholder style={style} label="Video Paused" />;
  }

  return (
    <RtcSurfaceView
      style={[styles.videoView, style]}
      canvas={{
        uid,
        renderMode,
      }}
      zOrderMediaOverlay={zOrderMediaOverlay}
    />
  );
}

/**
 * Grid of remote video views
 */
interface VideoGridProps {
  remoteUsers: number[];
  channelId: string;
  style?: ViewStyle;
  maxVisible?: number;
}

export function RemoteVideoGrid({
  remoteUsers,
  channelId,
  style,
  maxVisible = 4,
}: VideoGridProps) {
  const visibleUsers = remoteUsers.slice(0, maxVisible);
  const hiddenCount = remoteUsers.length - maxVisible;

  const getGridStyle = () => {
    switch (visibleUsers.length) {
      case 1:
        return styles.gridSingle;
      case 2:
        return styles.gridDouble;
      default:
        return styles.gridMulti;
    }
  };

  const getItemStyle = () => {
    switch (visibleUsers.length) {
      case 1:
        return styles.gridItemSingle;
      case 2:
        return styles.gridItemDouble;
      default:
        return styles.gridItemMulti;
    }
  };

  if (visibleUsers.length === 0) {
    return (
      <View style={[styles.emptyGrid, style]}>
        <Ionicons name="people-outline" size={48} color={COLORS.grayMuted} />
        <Text style={styles.emptyText}>Waiting for viewers...</Text>
      </View>
    );
  }

  return (
    <View style={[getGridStyle(), style]}>
      {visibleUsers.map((uid) => (
        <RemoteVideoView
          key={uid}
          uid={uid}
          channelId={channelId}
          style={getItemStyle()}
        />
      ))}
      {hiddenCount > 0 && (
        <View style={[styles.moreIndicator, getItemStyle()]}>
          <Text style={styles.moreText}>+{hiddenCount}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  videoView: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    marginTop: 12,
    color: COLORS.grayMuted,
    fontSize: 14,
  },
  emptyGrid: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 12,
    color: COLORS.grayMuted,
    fontSize: 16,
  },
  gridSingle: {
    flex: 1,
  },
  gridDouble: {
    flex: 1,
    flexDirection: 'row',
  },
  gridMulti: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItemSingle: {
    flex: 1,
  },
  gridItemDouble: {
    flex: 1,
    height: '100%',
  },
  gridItemMulti: {
    width: '50%',
    height: '50%',
  },
  moreIndicator: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    color: 'white',
    fontSize: 24,
    fontWeight: '600',
  },
});
