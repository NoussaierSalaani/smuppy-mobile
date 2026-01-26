/**
 * AWS API Service
 * AWS API Gateway client for Smuppy backend
 */

import { AWS_CONFIG } from '../config/aws-config';
import { awsAuth } from './aws-auth';

const API_BASE_URL = AWS_CONFIG.api.restEndpoint;
const CDN_URL = AWS_CONFIG.storage.cdnDomain;

interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  headers?: Record<string, string>;
  authenticated?: boolean;
  timeout?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}

class AWSAPIService {
  private defaultTimeout = 30000;

  /**
   * Make authenticated API request
   */
  async request<T>(endpoint: string, options: RequestOptions = { method: 'GET' }): Promise<T> {
    const { method, body, headers = {}, authenticated = true, timeout = this.defaultTimeout } = options;

    const url = `${API_BASE_URL}${endpoint}`;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    // Add authentication header if needed
    if (authenticated) {
      const token = await awsAuth.getAccessToken();
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new APIError(
          errorData.message || `Request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      const data = await response.json();
      return data as T;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new APIError('Request timeout', 408);
      }

      throw error;
    }
  }

  // ==========================================
  // Posts API
  // ==========================================

  async getPosts(params?: {
    limit?: number;
    cursor?: string;
    type?: 'all' | 'following' | 'explore';
    userId?: string;
  }): Promise<PaginatedResponse<Post>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    if (params?.type) queryParams.set('type', params.type);
    if (params?.userId) queryParams.set('userId', params.userId);

    const query = queryParams.toString();
    const response = await this.request<any>(`/posts${query ? `?${query}` : ''}`);

    // Map API response (posts) to expected format (data)
    return {
      data: response.posts || response.data || [],
      nextCursor: response.nextCursor || null,
      hasMore: response.hasMore || false,
      total: response.total || 0,
    };
  }

  async getPost(id: string): Promise<Post> {
    return this.request(`/posts/${id}`);
  }

  async createPost(data: CreatePostInput): Promise<Post> {
    return this.request('/posts', {
      method: 'POST',
      body: data,
    });
  }

  async updatePost(id: string, data: Partial<CreatePostInput>): Promise<Post> {
    return this.request(`/posts/${id}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deletePost(id: string): Promise<void> {
    return this.request(`/posts/${id}`, {
      method: 'DELETE',
    });
  }

  async likePost(id: string): Promise<void> {
    return this.request(`/posts/${id}/like`, {
      method: 'POST',
    });
  }

  async unlikePost(id: string): Promise<void> {
    return this.request(`/posts/${id}/unlike`, {
      method: 'POST',
    });
  }

  // ==========================================
  // Profiles API
  // ==========================================

  async getProfile(id: string): Promise<Profile> {
    return this.request(`/profiles/${id}`);
  }

  async getProfileByUsername(username: string): Promise<Profile> {
    return this.request(`/profiles/username/${username}`);
  }

  async updateProfile(data: UpdateProfileInput): Promise<Profile> {
    return this.request('/profiles/me', {
      method: 'PATCH',
      body: data,
    });
  }

  async searchProfiles(query: string, limit = 20): Promise<Profile[]> {
    return this.request(`/profiles?search=${encodeURIComponent(query)}&limit=${limit}`);
  }

  // ==========================================
  // Follows API
  // ==========================================

  async followUser(userId: string): Promise<void> {
    return this.request('/follows', {
      method: 'POST',
      body: { followingId: userId },
    });
  }

  async unfollowUser(userId: string): Promise<void> {
    return this.request(`/follows/${userId}`, {
      method: 'DELETE',
    });
  }

  async getFollowers(userId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Profile>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/profiles/${userId}/followers${query ? `?${query}` : ''}`);
  }

  async getFollowing(userId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Profile>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/profiles/${userId}/following${query ? `?${query}` : ''}`);
  }

  // ==========================================
  // Feed API
  // ==========================================

  async getFeed(params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Post>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/feed${query ? `?${query}` : ''}`);
  }

  // ==========================================
  // Peaks API
  // ==========================================

  async getPeaks(params?: { limit?: number; cursor?: string; userId?: string }): Promise<PaginatedResponse<Peak>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    if (params?.userId) queryParams.set('userId', params.userId);
    const query = queryParams.toString();
    return this.request(`/peaks${query ? `?${query}` : ''}`);
  }

  async getPeak(id: string): Promise<Peak> {
    return this.request(`/peaks/${id}`);
  }

  async createPeak(data: CreatePeakInput): Promise<Peak> {
    return this.request('/peaks', {
      method: 'POST',
      body: data,
    });
  }

  async likePeak(id: string): Promise<void> {
    return this.request(`/peaks/${id}/like`, {
      method: 'POST',
    });
  }

  async unlikePeak(id: string): Promise<void> {
    return this.request(`/peaks/${id}/unlike`, {
      method: 'POST',
    });
  }

  // ==========================================
  // Comments API
  // ==========================================

  async getComments(postId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Comment>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/posts/${postId}/comments${query ? `?${query}` : ''}`);
  }

  async createComment(postId: string, content: string, parentId?: string): Promise<Comment> {
    return this.request(`/posts/${postId}/comments`, {
      method: 'POST',
      body: { content, parentId },
    });
  }

  async deleteComment(commentId: string): Promise<void> {
    return this.request(`/comments/${commentId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Notifications API
  // ==========================================

  async getNotifications(params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Notification>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/notifications${query ? `?${query}` : ''}`);
  }

  async markNotificationRead(id: string): Promise<void> {
    return this.request(`/notifications/${id}/read`, {
      method: 'POST',
    });
  }

  async markAllNotificationsRead(): Promise<void> {
    return this.request('/notifications/read-all', {
      method: 'POST',
    });
  }

  async getUnreadCount(): Promise<{ count: number }> {
    return this.request('/notifications/unread-count');
  }

  // ==========================================
  // Account Management
  // ==========================================

  async deleteAccount(): Promise<void> {
    return this.request('/account', {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Device Sessions
  // ==========================================

  async registerDeviceSession(deviceInfo: {
    deviceId: string;
    deviceName: string | null;
    deviceType: string;
    platform: string;
    osVersion: string | null;
    appVersion: string | null;
    ipAddress?: string;
    country?: string;
    city?: string;
  }): Promise<{ success: boolean; isNewDevice: boolean; sessionId: string }> {
    return this.request('/devices/sessions', {
      method: 'POST',
      body: deviceInfo,
    });
  }

  async getUserDevices(): Promise<any[]> {
    return this.request('/devices');
  }

  async revokeDeviceSession(sessionId: string): Promise<{ success: boolean }> {
    return this.request(`/devices/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Push Notifications
  // ==========================================

  async registerPushToken(data: {
    token: string;
    platform: 'ios' | 'android';
    deviceId: string;
  }): Promise<void> {
    return this.request('/notifications/push-token', {
      method: 'POST',
      body: data,
    });
  }

  async unregisterPushToken(deviceId: string): Promise<void> {
    return this.request(`/notifications/push-token/${deviceId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Email Validation
  // ==========================================

  async validateEmail(email: string): Promise<{
    valid: boolean;
    email?: string;
    code?: string;
    error?: string;
  }> {
    return this.request('/auth/validate-email', {
      method: 'POST',
      body: { email },
      authenticated: false,
    });
  }

  /**
   * Check if user already exists in Cognito
   */
  async checkUserExists(email: string): Promise<{
    success: boolean;
    exists: boolean;
    confirmed: boolean;
    message?: string;
  }> {
    return this.request('/auth/check-user', {
      method: 'POST',
      body: { email },
      authenticated: false,
    });
  }

  // ==========================================
  // Contacts
  // ==========================================

  async storeContacts(contacts: Array<{
    name?: string;
    emails?: string[];
    phones?: string[];
  }>): Promise<{ success: boolean; friendsOnApp: number }> {
    return this.request('/contacts/sync', {
      method: 'POST',
      body: { contacts },
    });
  }

  // ==========================================
  // Problem Reports
  // ==========================================

  async submitProblemReport(data: {
    message: string;
    email?: string;
  }): Promise<{ success: boolean }> {
    return this.request('/support/report', {
      method: 'POST',
      body: data,
    });
  }

  // ==========================================
  // Following Users (for tagging)
  // ==========================================

  async getFollowingUsers(userId: string, params?: { limit?: number }): Promise<Profile[]> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    const query = queryParams.toString();
    return this.request(`/profiles/${userId}/following${query ? `?${query}` : ''}`).then((res: any) => res.data || res);
  }

  // ==========================================
  // Media Upload
  // ==========================================

  async getUploadUrl(filename: string, contentType: string): Promise<{ uploadUrl: string; fileUrl: string }> {
    return this.request('/media/upload-url', {
      method: 'POST',
      body: { filename, contentType },
    });
  }

  async uploadMedia(file: Blob | File, filename: string): Promise<string> {
    const contentType = file.type || 'application/octet-stream';

    // Get presigned URL
    const { uploadUrl, fileUrl } = await this.getUploadUrl(filename, contentType);

    // Upload to S3
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });

    if (!response.ok) {
      throw new APIError('Failed to upload media', response.status);
    }

    // Return CDN URL
    return `${CDN_URL}/${fileUrl}`;
  }

  // ==========================================
  // Auth API (Server-side Cognito operations)
  // ==========================================

  /**
   * Smart signup - handles unconfirmed users by deleting and recreating
   * This endpoint uses Admin SDK to properly handle the case where a user
   * started signup but never confirmed their email.
   */
  async smartSignup(data: {
    email: string;
    password: string;
    username?: string;
    fullName?: string;
  }): Promise<{
    success: boolean;
    userSub?: string;
    confirmationRequired: boolean;
    message?: string;
  }> {
    return this.request('/auth/signup', {
      method: 'POST',
      body: data,
      authenticated: false,
    });
  }

  /**
   * Confirm signup with verification code
   */
  async confirmSignup(data: {
    email: string;
    code: string;
  }): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request('/auth/confirm-signup', {
      method: 'POST',
      body: data,
      authenticated: false,
    });
  }

  /**
   * Resend confirmation code
   */
  async resendConfirmationCode(email: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request('/auth/resend-code', {
      method: 'POST',
      body: { email },
      authenticated: false,
    });
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      authenticated: false,
    });
  }

  /**
   * Complete forgot password with code and new password
   */
  async confirmForgotPassword(data: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request('/auth/confirm-forgot-password', {
      method: 'POST',
      body: data,
      authenticated: false,
    });
  }

  // ==========================================
  // Conversations & Messages API
  // ==========================================

  async getConversations(params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Conversation>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/conversations${query ? `?${query}` : ''}`);
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.request(`/conversations/${id}`);
  }

  async createConversation(participantId: string): Promise<Conversation> {
    return this.request('/conversations', {
      method: 'POST',
      body: { participantId },
    });
  }

  async getOrCreateConversation(participantId: string): Promise<Conversation> {
    return this.request('/conversations/get-or-create', {
      method: 'POST',
      body: { participantId },
    });
  }

  async getMessages(conversationId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Message>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/conversations/${conversationId}/messages${query ? `?${query}` : ''}`);
  }

  async sendMessage(conversationId: string, data: {
    content: string;
    messageType?: 'text' | 'image' | 'video' | 'audio';
    mediaUrl?: string;
  }): Promise<Message> {
    return this.request(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: data,
    });
  }

  async deleteMessage(messageId: string): Promise<void> {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async markConversationRead(conversationId: string): Promise<void> {
    return this.request(`/conversations/${conversationId}/read`, {
      method: 'POST',
    });
  }

  // ==========================================
  // Payments API (Stripe)
  // ==========================================

  /**
   * Create a payment intent for a session booking
   */
  async createPaymentIntent(data: {
    creatorId: string;
    amount: number; // Amount in cents
    sessionId?: string;
    description?: string;
  }): Promise<{
    success: boolean;
    paymentIntent?: {
      id: string;
      clientSecret: string;
      amount: number;
      currency: string;
    };
    publishableKey?: string;
    message?: string;
  }> {
    return this.request('/payments/create-intent', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Get payment history for the current user
   */
  async getPaymentHistory(params?: {
    limit?: number;
    cursor?: string;
  }): Promise<PaginatedResponse<Payment>> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    const query = queryParams.toString();
    return this.request(`/payments/history${query ? `?${query}` : ''}`);
  }

  // ==========================================
  // Subscriptions API (Monthly subscriptions)
  // ==========================================

  /**
   * Create a subscription to a creator
   */
  async createSubscription(data: {
    creatorId: string;
    priceId: string;
  }): Promise<{
    success: boolean;
    subscription?: {
      id: string;
      status: string;
      currentPeriodEnd: number;
    };
    message?: string;
  }> {
    return this.request('/payments/subscriptions', {
      method: 'POST',
      body: { action: 'create', ...data },
    });
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string): Promise<{
    success: boolean;
    message?: string;
    cancelAt?: number;
  }> {
    return this.request('/payments/subscriptions', {
      method: 'POST',
      body: { action: 'cancel', subscriptionId },
    });
  }

  /**
   * List user's active subscriptions
   */
  async listSubscriptions(): Promise<{
    success: boolean;
    subscriptions: Subscription[];
  }> {
    return this.request('/payments/subscriptions', {
      method: 'POST',
      body: { action: 'list' },
    });
  }

  /**
   * Get creator's subscription tiers/prices
   */
  async getCreatorPrices(creatorId: string): Promise<{
    success: boolean;
    tiers: SubscriptionTier[];
  }> {
    return this.request('/payments/subscriptions', {
      method: 'POST',
      body: { action: 'get-prices', creatorId },
    });
  }

  // ==========================================
  // Stripe Connect API (Creator payouts)
  // ==========================================

  /**
   * Create Stripe Connect account for creator
   */
  async createConnectAccount(): Promise<{
    success: boolean;
    accountId?: string;
    message?: string;
  }> {
    return this.request('/payments/connect', {
      method: 'POST',
      body: { action: 'create-account' },
    });
  }

  /**
   * Get onboarding link for Stripe Connect
   */
  async getConnectOnboardingLink(returnUrl: string, refreshUrl: string): Promise<{
    success: boolean;
    url?: string;
    expiresAt?: number;
  }> {
    return this.request('/payments/connect', {
      method: 'POST',
      body: { action: 'create-link', returnUrl, refreshUrl },
    });
  }

  /**
   * Get Connect account status
   */
  async getConnectStatus(): Promise<{
    success: boolean;
    hasAccount: boolean;
    status: 'not_created' | 'pending' | 'active';
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
  }> {
    return this.request('/payments/connect', {
      method: 'POST',
      body: { action: 'get-status' },
    });
  }

  /**
   * Get Stripe dashboard link for creators
   */
  async getStripeDashboardLink(): Promise<{
    success: boolean;
    url?: string;
  }> {
    return this.request('/payments/connect', {
      method: 'POST',
      body: { action: 'get-dashboard-link' },
    });
  }

  /**
   * Get creator's balance
   */
  async getCreatorBalance(): Promise<{
    success: boolean;
    balance?: {
      available: { amount: number; currency: string }[];
      pending: { amount: number; currency: string }[];
    };
  }> {
    return this.request('/payments/connect', {
      method: 'POST',
      body: { action: 'get-balance' },
    });
  }

  // ==========================================
  // Stripe Identity API (Creator verification)
  // ==========================================

  /**
   * Create identity verification session
   */
  async createVerificationSession(returnUrl: string): Promise<{
    success: boolean;
    sessionId?: string;
    url?: string;
    status?: string;
  }> {
    return this.request('/payments/identity', {
      method: 'POST',
      body: { action: 'create-session', returnUrl },
    });
  }

  /**
   * Get identity verification status
   */
  async getVerificationStatus(): Promise<{
    success: boolean;
    hasSession: boolean;
    status: 'not_started' | 'requires_input' | 'processing' | 'verified' | 'canceled';
    isVerified: boolean;
  }> {
    return this.request('/payments/identity', {
      method: 'POST',
      body: { action: 'get-status' },
    });
  }

  /**
   * Create payment intent for identity verification ($14.90)
   */
  async createVerificationPaymentIntent(): Promise<{
    success: boolean;
    paymentIntent?: {
      id: string;
      clientSecret: string;
      amount: number;
      currency: string;
    };
    publishableKey?: string;
    message?: string;
  }> {
    return this.request('/payments/identity', {
      method: 'POST',
      body: { action: 'create-payment' },
    });
  }

  /**
   * Confirm payment and start verification session
   */
  async confirmVerificationPayment(paymentIntentId: string, returnUrl: string): Promise<{
    success: boolean;
    sessionId?: string;
    url?: string;
    message?: string;
  }> {
    return this.request('/payments/identity', {
      method: 'POST',
      body: { action: 'confirm-payment', paymentIntentId, returnUrl },
    });
  }

  // ==========================================
  // Platform Subscription API (Pro Creator/Business)
  // ==========================================

  /**
   * Get platform subscription status
   */
  async getPlatformSubscriptionStatus(): Promise<{
    success: boolean;
    hasSubscription: boolean;
    subscription?: {
      planType: 'pro_creator' | 'pro_business';
      status: string;
      currentPeriodEnd: string;
    };
  }> {
    return this.request('/payments/platform-subscription', {
      method: 'POST',
      body: { action: 'get-status' },
    });
  }

  /**
   * Subscribe to platform plan (Pro Creator $99 or Pro Business $49)
   */
  async subscribeToPlatform(planType: 'pro_creator' | 'pro_business'): Promise<{
    success: boolean;
    checkoutUrl?: string;
    error?: string;
  }> {
    return this.request('/payments/platform-subscription', {
      method: 'POST',
      body: { action: 'subscribe', planType },
    });
  }

  /**
   * Cancel platform subscription
   */
  async cancelPlatformSubscription(): Promise<{
    success: boolean;
    message?: string;
    cancelAt?: string;
  }> {
    return this.request('/payments/platform-subscription', {
      method: 'POST',
      body: { action: 'cancel' },
    });
  }

  // ==========================================
  // Channel Subscription API (Creator channels)
  // ==========================================

  /**
   * Subscribe to a creator's channel
   */
  async subscribeToChannel(creatorId: string): Promise<{
    success: boolean;
    checkoutUrl?: string;
    error?: string;
  }> {
    return this.request('/payments/channel-subscription', {
      method: 'POST',
      body: { action: 'subscribe', creatorId },
    });
  }

  /**
   * Get channel subscription status for a creator
   */
  async getChannelSubscriptionStatus(creatorId: string): Promise<{
    success: boolean;
    isSubscribed: boolean;
    subscription?: {
      status: string;
      currentPeriodEnd: string;
      price: number;
    };
  }> {
    return this.request('/payments/channel-subscription', {
      method: 'POST',
      body: { action: 'get-status', creatorId },
    });
  }

  /**
   * Cancel channel subscription
   */
  async cancelChannelSubscription(subscriptionId: string): Promise<{
    success: boolean;
    message?: string;
    cancelAt?: string;
  }> {
    return this.request('/payments/channel-subscription', {
      method: 'POST',
      body: { action: 'cancel', subscriptionId },
    });
  }

  /**
   * Get creator channel info (for subscription screen)
   */
  async getCreatorChannelInfo(creatorId: string): Promise<{
    success: boolean;
    creator?: {
      id: string;
      username: string;
      fullName: string;
      avatarUrl: string;
      subscriberCount: number;
      tier: string;
      subscriptionPrice: number;
      perks: string[];
    };
  }> {
    return this.request('/payments/channel-subscription', {
      method: 'POST',
      body: { action: 'get-creator-info', creatorId },
    });
  }

  // ==========================================
  // Creator Wallet API (Dashboard & Analytics)
  // ==========================================

  /**
   * Get creator wallet dashboard data
   */
  async getWalletDashboard(): Promise<{
    success: boolean;
    balance: {
      available: number;
      pending: number;
      currency: string;
    };
    tier: {
      name: string;
      revenueShare: number;
      fanCount: number;
      nextTier?: string;
      fansToNextTier?: number;
    };
    stats: {
      thisMonth: number;
      lifetime: number;
      subscribers: number;
    };
    recentTransactions: WalletTransaction[];
    revenueBreakdown: {
      sessions: number;
      packs: number;
      subscriptions: number;
      tips: number;
    };
  }> {
    return this.request('/payments/wallet', {
      method: 'POST',
      body: { action: 'get-dashboard' },
    });
  }

  /**
   * Get wallet transactions with pagination
   */
  async getWalletTransactions(params?: {
    limit?: number;
    cursor?: string;
    type?: 'all' | 'earnings' | 'payouts';
  }): Promise<{
    success: boolean;
    transactions: WalletTransaction[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    return this.request('/payments/wallet', {
      method: 'POST',
      body: { action: 'get-transactions', ...params },
    });
  }

  /**
   * Get revenue analytics
   */
  async getRevenueAnalytics(period: 'week' | 'month' | 'year'): Promise<{
    success: boolean;
    data: {
      date: string;
      amount: number;
    }[];
    total: number;
    growth: number;
  }> {
    return this.request('/payments/wallet', {
      method: 'POST',
      body: { action: 'get-analytics', period },
    });
  }

  /**
   * Request payout to connected account
   */
  async requestPayout(amount: number): Promise<{
    success: boolean;
    payoutId?: string;
    message?: string;
  }> {
    return this.request('/payments/wallet', {
      method: 'POST',
      body: { action: 'request-payout', amount },
    });
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  /**
   * Get CDN URL for a media path
   */
  getCDNUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    return `${CDN_URL}/${path}`;
  }
}

// Custom API Error class
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Types
export interface Post {
  id: string;
  authorId: string;
  content: string;
  mediaUrls: string[];
  mediaType: 'image' | 'video' | null;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  isLiked?: boolean;
  author: Profile;
}

export interface Profile {
  id: string;
  username: string;
  fullName: string | null;
  displayName?: string | null;
  avatarUrl: string | null;
  coverUrl?: string | null;
  bio: string | null;
  website?: string | null;
  isVerified: boolean;
  isPrivate: boolean;
  accountType: 'personal' | 'pro_creator' | 'pro_local';
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isFollowing?: boolean;
  isFollowedBy?: boolean;
  // Profile extras
  gender?: string;
  dateOfBirth?: string;
  interests?: string[];
  expertise?: string[];
  socialLinks?: Record<string, string>;
  onboardingCompleted?: boolean;
  // Business fields
  businessName?: string;
  businessCategory?: string;
  businessAddress?: string;
  businessPhone?: string;
  locationsMode?: string;
}

export interface Peak {
  id: string;
  authorId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  caption: string | null;
  duration: number;
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: string;
  isLiked?: boolean;
  author: Profile;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  likesCount: number;
  repliesCount: number;
  createdAt: string;
  author: Profile;
  replies?: Comment[];
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: any;
  read: boolean;
  createdAt: string;
}

export interface CreatePostInput {
  content?: string;
  mediaUrls?: string[];
  mediaType?: 'image' | 'video';
  visibility?: 'public' | 'followers' | 'private';
}

export interface CreatePeakInput {
  videoUrl: string;
  thumbnailUrl?: string;
  caption?: string;
  duration: number;
}

export interface UpdateProfileInput {
  username?: string;
  fullName?: string;
  bio?: string;
  avatarUrl?: string;
  isPrivate?: boolean;
  accountType?: 'personal' | 'pro_creator' | 'pro_local';
  gender?: string;
  dateOfBirth?: string;
  displayName?: string;
  website?: string;
  socialLinks?: Record<string, string>;
  interests?: string[];
  expertise?: string[];
  businessName?: string;
  businessCategory?: string;
  businessAddress?: string;
  businessPhone?: string;
  locationsMode?: string;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participants: Profile[];
  lastMessage: Message | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: 'text' | 'image' | 'video' | 'audio';
  mediaUrl: string | null;
  readAt: string | null;
  createdAt: string;
  sender?: Profile;
}

export interface Payment {
  id: string;
  stripePaymentIntentId: string;
  buyerId: string;
  creatorId: string;
  amount: number;
  currency: string;
  platformFee: number;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  createdAt: string;
}

export interface Subscription {
  id: string;
  subscriberId: string;
  creatorId: string;
  stripeSubscriptionId: string;
  status: 'active' | 'canceling' | 'canceled' | 'past_due' | 'paused';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  createdAt: string;
  // Joined fields
  username?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface SubscriptionTier {
  id: string;
  creatorId: string;
  stripePriceId: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  benefits: string[];
  isActive: boolean;
  subscriberCount: number;
}

export interface WalletTransaction {
  id: string;
  type: 'session' | 'pack' | 'subscription' | 'tip' | 'payout';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  description: string;
  createdAt: string;
  buyerName?: string;
  buyerAvatar?: string;
}

// Export singleton instance
export const awsAPI = new AWSAPIService();
export default awsAPI;
