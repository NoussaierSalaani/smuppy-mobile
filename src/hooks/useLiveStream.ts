/**
 * useLiveStream Hook
 * Handles real-time communication for live streaming (comments, reactions, viewers)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { websocketService, WebSocketMessage } from '../services/websocket';

export interface LiveComment {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  content: string;
  timestamp: string;
  isNew?: boolean;
}

export interface LiveReaction {
  id: string;
  userId: string;
  username: string;
  emoji: string;
  timestamp: string;
}

export interface LiveViewer {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

interface UseLiveStreamOptions {
  channelName: string;
  isHost?: boolean;
  onViewerJoined?: (viewer: LiveViewer, viewerCount: number) => void;
  onViewerLeft?: (userId: string, viewerCount: number) => void;
  onComment?: (comment: LiveComment) => void;
  onReaction?: (reaction: LiveReaction) => void;
}

interface UseLiveStreamReturn {
  isConnected: boolean;
  viewerCount: number;
  comments: LiveComment[];
  sendComment: (content: string) => void;
  sendReaction: (emoji: string) => void;
  joinStream: () => Promise<void>;
  leaveStream: () => Promise<void>;
}

export function useLiveStream({
  channelName,
  isHost: _isHost = false,
  onViewerJoined,
  onViewerLeft,
  onComment,
  onReaction,
}: UseLiveStreamOptions): UseLiveStreamReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [comments, setComments] = useState<LiveComment[]>([]);
  const hasJoined = useRef(false);

  // Handle incoming WebSocket messages
  useEffect(() => {
    const handleMessage = (message: WebSocketMessage) => {
      const data = message.data || message;

      switch (data.type) {
        case 'viewerJoined':
          if (data.channelName === channelName) {
            setViewerCount(data.viewerCount);
            onViewerJoined?.(data.user, data.viewerCount);
          }
          break;

        case 'viewerLeft':
          if (data.channelName === channelName) {
            setViewerCount(data.viewerCount);
            onViewerLeft?.(data.userId, data.viewerCount);
          }
          break;

        case 'liveComment':
          if (data.channelName === channelName) {
            const comment: LiveComment = {
              ...data.comment,
              isNew: true,
            };
            setComments((prev) => [...prev.slice(-99), comment]); // Keep last 100
            onComment?.(comment);
          }
          break;

        case 'liveReaction':
          if (data.channelName === channelName) {
            onReaction?.(data.reaction);
          }
          break;

        case 'joinedLive':
          setViewerCount(data.viewerCount);
          break;
      }
    };

    const handleConnection = (connected: boolean) => {
      setIsConnected(connected);
      // Rejoin if reconnected
      if (connected && hasJoined.current) {
        sendAction('joinLive');
      }
    };

    const unsubMessage = websocketService.onMessage(handleMessage);
    const unsubConnection = websocketService.onConnectionChange(handleConnection);

    // Check initial connection state
    setIsConnected(websocketService.isConnected());

    return () => {
      if (hasJoined.current) {
        websocketService.send({ action: 'leaveLive', channelName });
        hasJoined.current = false;
      }
      unsubMessage();
      unsubConnection();
    };
  }, [channelName, onViewerJoined, onViewerLeft, onComment, onReaction]);

  // Send action to WebSocket
  const sendAction = useCallback((action: string, data?: Record<string, unknown>) => {
    if (!websocketService.isConnected()) {
      console.warn('[useLiveStream] WebSocket not connected');
      return;
    }

    try {
      websocketService.send({ action, channelName, ...data });
    } catch (error) {
      console.error('[useLiveStream] Failed to send:', error);
    }
  }, [channelName]);

  // Join the live stream
  const joinStream = useCallback(async () => {
    // Connect WebSocket if not connected
    if (!websocketService.isConnected()) {
      await websocketService.connect();
    }

    hasJoined.current = true;
    sendAction('joinLive');
  }, [sendAction]);

  // Leave the live stream
  const leaveStream = useCallback(async () => {
    hasJoined.current = false;
    sendAction('leaveLive');
  }, [sendAction]);

  // Send a comment
  const sendComment = useCallback((content: string) => {
    if (!content.trim()) return;
    sendAction('liveComment', { content: content.trim() });
  }, [sendAction]);

  // Send a reaction
  const sendReaction = useCallback((emoji: string) => {
    sendAction('liveReaction', { emoji });
  }, [sendAction]);

  return {
    isConnected,
    viewerCount,
    comments,
    sendComment,
    sendReaction,
    joinStream,
    leaveStream,
  };
}

export default useLiveStream;
