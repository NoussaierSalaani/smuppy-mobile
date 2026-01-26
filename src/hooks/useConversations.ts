/**
 * useConversations Hook
 * React hook for managing conversations and messages with real-time updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { awsAPI, Conversation, Message } from '../services/aws-api';
import { useWebSocket } from './useWebSocket';
import { WebSocketMessage } from '../services/websocket';

interface UseConversationsReturn {
  conversations: Conversation[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  createConversation: (participantId: string) => Promise<Conversation>;
  isConnected: boolean;
}

export function useConversations(): UseConversationsReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const { isConnected, lastMessage } = useWebSocket({ autoConnect: true });

  // Fetch conversations
  const fetchConversations = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const response = await awsAPI.getConversations({
        limit: 20,
        cursor: refresh ? undefined : cursor || undefined,
      });

      if (refresh) {
        setConversations(response.data);
      } else {
        setConversations((prev) => [...prev, ...response.data]);
      }

      setCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch conversations'));
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  // Load more conversations
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetchConversations(false);
  }, [hasMore, loading, fetchConversations]);

  // Refresh conversations
  const refresh = useCallback(async () => {
    setCursor(null);
    await fetchConversations(true);
  }, [fetchConversations]);

  // Create conversation
  const createConversation = useCallback(async (participantId: string): Promise<Conversation> => {
    const conversation = await awsAPI.getOrCreateConversation(participantId);

    // Add to list if not already present
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === conversation.id);
      if (exists) return prev;
      return [conversation, ...prev];
    });

    return conversation;
  }, []);

  // Handle real-time messages
  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'message' && lastMessage.conversationId) {
      // Update conversation with new message
      setConversations((prev) => {
        const index = prev.findIndex((c) => c.id === lastMessage.conversationId);
        if (index === -1) {
          // New conversation - refresh list
          refresh();
          return prev;
        }

        const updated = [...prev];
        const conversation = { ...updated[index] };

        // Update last message
        conversation.lastMessage = {
          id: lastMessage.messageId || '',
          conversationId: lastMessage.conversationId!,
          senderId: lastMessage.senderId || '',
          content: lastMessage.content || '',
          messageType: 'text',
          mediaUrl: null,
          readAt: null,
          createdAt: lastMessage.timestamp || new Date().toISOString(),
        };
        conversation.lastMessageAt = lastMessage.timestamp || new Date().toISOString();
        conversation.unreadCount += 1;

        // Move to top
        updated.splice(index, 1);
        return [conversation, ...updated];
      });
    }
  }, [lastMessage, refresh]);

  // Initial fetch
  useEffect(() => {
    fetchConversations(true);
  }, []);

  return {
    conversations,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    createConversation,
    isConnected,
  };
}

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  sendMessage: (content: string, messageType?: 'text' | 'image' | 'video' | 'audio', mediaUrl?: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  markAsRead: () => Promise<void>;
  isConnected: boolean;
  isTyping: boolean;
  sendTypingIndicator: (isTyping: boolean) => void;
}

export function useMessages(conversationId: string, otherUserId: string): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    isConnected,
    lastMessage,
    sendMessage: wsSendMessage,
    sendTypingIndicator: wsSendTypingIndicator,
    sendReadReceipt,
  } = useWebSocket({ autoConnect: true });

  // Fetch messages
  const fetchMessages = useCallback(async (refresh = false) => {
    try {
      setLoading(true);
      setError(null);

      const response = await awsAPI.getMessages(conversationId, {
        limit: 50,
        cursor: refresh ? undefined : cursor || undefined,
      });

      if (refresh) {
        setMessages(response.data);
      } else {
        // Prepend older messages
        setMessages((prev) => [...response.data, ...prev]);
      }

      setCursor(response.nextCursor);
      setHasMore(response.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch messages'));
    } finally {
      setLoading(false);
    }
  }, [conversationId, cursor]);

  // Load more (older) messages
  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetchMessages(false);
  }, [hasMore, loading, fetchMessages]);

  // Send message via REST (fallback) or WebSocket
  const sendMessage = useCallback(async (
    content: string,
    messageType: 'text' | 'image' | 'video' | 'audio' = 'text',
    mediaUrl?: string
  ) => {
    // Optimistically add message
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      conversationId,
      senderId: 'me', // Will be replaced with actual ID
      content,
      messageType,
      mediaUrl: mediaUrl || null,
      readAt: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      if (isConnected) {
        // Send via WebSocket for real-time
        wsSendMessage({
          conversationId,
          content,
          recipientId: otherUserId,
          messageType,
          mediaUrl,
        });
      } else {
        // Fallback to REST API
        const savedMessage = await awsAPI.sendMessage(conversationId, {
          content,
          messageType,
          mediaUrl,
        });

        // Replace optimistic message with saved one
        setMessages((prev) =>
          prev.map((m) => (m.id === optimisticMessage.id ? savedMessage : m))
        );
      }
    } catch (err) {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id));
      throw err;
    }
  }, [conversationId, otherUserId, isConnected, wsSendMessage]);

  // Delete message
  const deleteMessage = useCallback(async (messageId: string) => {
    await awsAPI.deleteMessage(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // Mark conversation as read
  const markAsRead = useCallback(async () => {
    await awsAPI.markConversationRead(conversationId);

    // Send read receipt via WebSocket if we have messages
    if (messages.length > 0 && isConnected) {
      const lastMsg = messages[messages.length - 1];
      sendReadReceipt(conversationId, lastMsg.id);
    }
  }, [conversationId, messages, isConnected, sendReadReceipt]);

  // Send typing indicator
  const sendTypingIndicator = useCallback((typing: boolean) => {
    wsSendTypingIndicator(conversationId, typing);
  }, [conversationId, wsSendTypingIndicator]);

  // Handle real-time messages
  useEffect(() => {
    if (!lastMessage || lastMessage.conversationId !== conversationId) return;

    if (lastMessage.type === 'message') {
      // Add new message
      const newMessage: Message = {
        id: lastMessage.messageId || `ws-${Date.now()}`,
        conversationId: lastMessage.conversationId!,
        senderId: lastMessage.senderId || '',
        content: lastMessage.content || '',
        messageType: 'text',
        mediaUrl: null,
        readAt: null,
        createdAt: lastMessage.timestamp || new Date().toISOString(),
      };

      setMessages((prev) => {
        // Avoid duplicates
        if (prev.some((m) => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
    } else if (lastMessage.type === 'typing') {
      // Handle typing indicator
      setIsTyping(true);

      // Clear typing after 3 seconds
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
      }, 3000);
    } else if (lastMessage.type === 'read') {
      // Mark messages as read
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          readAt: m.readAt || lastMessage.timestamp || new Date().toISOString(),
        }))
      );
    }
  }, [lastMessage, conversationId]);

  // Initial fetch and mark as read
  useEffect(() => {
    fetchMessages(true);
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [conversationId]);

  return {
    messages,
    loading,
    error,
    hasMore,
    loadMore,
    sendMessage,
    deleteMessage,
    markAsRead,
    isConnected,
    isTyping,
    sendTypingIndicator,
  };
}

export default useConversations;
