/**
 * WebSocket Service for Real-time Messaging
 * Connects to AWS API Gateway WebSocket for real-time communication
 */

import { AWS_CONFIG } from '../config/aws-config';
import { awsAuth } from './aws-auth';

type MessageHandler = (message: WebSocketMessage) => void;
type ConnectionHandler = (connected: boolean) => void;
type ErrorHandler = (error: Error) => void;

export interface WebSocketMessage {
  type: 'message' | 'typing' | 'read' | 'online' | 'offline' | 'error';
  conversationId?: string;
  messageId?: string;
  senderId?: string;
  content?: string;
  timestamp?: string;
  data?: any;
}

export interface SendMessagePayload {
  action: 'sendMessage';
  conversationId: string;
  content: string;
  recipientId: string;
  messageType?: 'text' | 'image' | 'video' | 'audio';
  mediaUrl?: string;
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isConnecting = false;

  private messageHandlers: Set<MessageHandler> = new Set();
  private connectionHandlers: Set<ConnectionHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    if (this.isConnecting) {
      console.log('[WebSocket] Connection already in progress');
      return;
    }

    this.isConnecting = true;

    try {
      // Get authentication token
      const token = await awsAuth.getIdToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Build WebSocket URL with token
      const wsUrl = `${AWS_CONFIG.api.websocketEndpoint}?token=${encodeURIComponent(token)}`;

      console.log('[WebSocket] Connecting to:', AWS_CONFIG.api.websocketEndpoint);

      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.notifyConnectionHandlers(true);
        this.startPingInterval();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          console.log('[WebSocket] Received message:', message.type);
          this.notifyMessageHandlers(message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
        }
      };

      this.socket.onclose = (event) => {
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        this.isConnecting = false;
        this.stopPingInterval();
        this.notifyConnectionHandlers(false);

        // Attempt reconnection if not intentional close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.isConnecting = false;
        this.notifyErrorHandlers(new Error('WebSocket connection error'));
      };
    } catch (error) {
      this.isConnecting = false;
      console.error('[WebSocket] Failed to connect:', error);
      throw error;
    }
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.stopPingInterval();

    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }

  /**
   * Send a message through WebSocket
   */
  sendMessage(payload: SendMessagePayload): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('[WebSocket] Cannot send message - not connected');
      throw new Error('WebSocket is not connected');
    }

    const message = JSON.stringify(payload);
    console.log('[WebSocket] Sending message to conversation:', payload.conversationId);
    this.socket.send(message);
  }

  /**
   * Send typing indicator
   */
  sendTypingIndicator(conversationId: string, isTyping: boolean): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = JSON.stringify({
      action: 'typing',
      conversationId,
      isTyping,
    });

    this.socket.send(payload);
  }

  /**
   * Mark messages as read
   */
  sendReadReceipt(conversationId: string, messageId: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = JSON.stringify({
      action: 'markRead',
      conversationId,
      messageId,
    });

    this.socket.send(payload);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to messages
   */
  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to connection status changes
   */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  /**
   * Subscribe to errors
   */
  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  // Private methods

  private notifyMessageHandlers(message: WebSocketMessage): void {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.error('[WebSocket] Error in message handler:', error);
      }
    });
  }

  private notifyConnectionHandlers(connected: boolean): void {
    this.connectionHandlers.forEach((handler) => {
      try {
        handler(connected);
      } catch (error) {
        console.error('[WebSocket] Error in connection handler:', error);
      }
    });
  }

  private notifyErrorHandlers(error: Error): void {
    this.errorHandlers.forEach((handler) => {
      try {
        handler(error);
      } catch (err) {
        console.error('[WebSocket] Error in error handler:', err);
      }
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WebSocket] Reconnection failed:', error);
      });
    }, delay);
  }

  private startPingInterval(): void {
    this.stopPingInterval();

    // Send ping every 30 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
export default websocketService;
