/**
 * useWebSocket Hook
 * React hook for managing WebSocket connection and real-time messaging
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { websocketService, WebSocketMessage, SendMessagePayload } from '../services/websocket';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  reconnectOnForeground?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (payload: Omit<SendMessagePayload, 'action'>) => void;
  sendTypingIndicator: (conversationId: string, isTyping: boolean) => void;
  sendReadReceipt: (conversationId: string, messageId: string) => void;
  lastMessage: WebSocketMessage | null;
  error: Error | null;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const { autoConnect = true, reconnectOnForeground = true } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    try {
      setError(null);
      await websocketService.connect();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Connection failed'));
    }
  }, []);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);

  // Send message
  const sendMessage = useCallback((payload: Omit<SendMessagePayload, 'action'>) => {
    websocketService.sendMessage({
      ...payload,
      action: 'sendMessage',
    });
  }, []);

  // Send typing indicator
  const sendTypingIndicator = useCallback((conversationId: string, isTyping: boolean) => {
    websocketService.sendTypingIndicator(conversationId, isTyping);
  }, []);

  // Send read receipt
  const sendReadReceipt = useCallback((conversationId: string, messageId: string) => {
    websocketService.sendReadReceipt(conversationId, messageId);
  }, []);

  // Set up subscriptions and auto-connect
  useEffect(() => {
    // Subscribe to connection changes
    const unsubConnection = websocketService.onConnectionChange((connected) => {
      setIsConnected(connected);
    });

    // Subscribe to messages
    const unsubMessage = websocketService.onMessage((message) => {
      setLastMessage(message);
    });

    // Subscribe to errors
    const unsubError = websocketService.onError((err) => {
      setError(err);
    });

    // Auto-connect if enabled
    if (autoConnect) {
      connect();
    }

    // Cleanup
    return () => {
      unsubConnection();
      unsubMessage();
      unsubError();
    };
  }, [autoConnect, connect]);

  // Handle app state changes (reconnect on foreground)
  useEffect(() => {
    if (!reconnectOnForeground) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App has come to the foreground
        if (!websocketService.isConnected()) {
          console.log('[useWebSocket] App foregrounded, reconnecting...');
          connect();
        }
      }
      appStateRef.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [reconnectOnForeground, connect]);

  return {
    isConnected,
    connect,
    disconnect,
    sendMessage,
    sendTypingIndicator,
    sendReadReceipt,
    lastMessage,
    error,
  };
}

export default useWebSocket;
