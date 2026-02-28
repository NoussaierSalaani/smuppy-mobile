import type { AWSAPIService } from '../aws-api';
import type { Conversation, Message } from './types';
import type { PaginatedResponse } from './internal-types';

export async function getConversations(
  api: AWSAPIService,
  params?: { limit?: number; cursor?: string },
): Promise<PaginatedResponse<Conversation>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  const query = queryParams.toString();
  return api.request(`/conversations${query ? `?${query}` : ''}`);
}

export async function getConversation(api: AWSAPIService, id: string): Promise<Conversation> {
  return api.request(`/conversations/${id}`);
}

export async function createConversation(api: AWSAPIService, participantId: string): Promise<Conversation> {
  return api.request('/conversations', {
    method: 'POST',
    body: { participantId },
  });
}

export async function getOrCreateConversation(api: AWSAPIService, participantId: string): Promise<Conversation> {
  return api.request('/conversations/get-or-create', {
    method: 'POST',
    body: { participantId },
  });
}

export async function getMessages(
  api: AWSAPIService,
  conversationId: string,
  params?: { limit?: number; cursor?: string },
): Promise<PaginatedResponse<Message>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.cursor) queryParams.set('cursor', params.cursor);
  const query = queryParams.toString();
  return api.request(`/conversations/${conversationId}/messages${query ? `?${query}` : ''}`);
}

export async function sendMessage(
  api: AWSAPIService,
  conversationId: string,
  data: {
    content: string;
    messageType?: 'text' | 'image' | 'video' | 'audio';
    mediaUrl?: string;
  },
): Promise<Message> {
  return api.request(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: data,
  });
}

export async function deleteMessage(api: AWSAPIService, messageId: string): Promise<void> {
  return api.request(`/messages/${messageId}`, {
    method: 'DELETE',
  });
}

export async function markConversationRead(api: AWSAPIService, conversationId: string): Promise<void> {
  return api.request(`/conversations/${conversationId}/read`, {
    method: 'POST',
  });
}
