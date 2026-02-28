/**
 * AWS API Service
 * AWS API Gateway client for Smuppy backend
 */

import { AWS_CONFIG } from '../config/aws-config';
import { awsAuth } from './aws-auth';
import { secureFetch } from '../utils/certificatePinning';
import type { Spot, SpotReview, GroupActivity, MapMarker, LivePin, Subcategory } from '../types';
import type {
  Profile, Post, Peak, Comment,
  Notification, NotificationPreferences,
  Conversation, Message,
  Payment, Subscription, SubscriptionTier,
  WalletTransaction, Session, SessionPack, UserSessionPack,
  ActivityItem,
  CreatePostInput, CreatePeakInput, UpdateProfileInput,
} from './api/types';
import { APIError } from './api/error';
import { addBreadcrumb, captureException } from '../lib/sentry';
import { devLog, nowMs, safeJson } from './observability';
import {
  smartSignup as _smartSignup,
  confirmSignup as _confirmSignup,
  resendConfirmationCode as _resendConfirmationCode,
  forgotPassword as _forgotPassword,
  confirmForgotPassword as _confirmForgotPassword,
} from './api/authApi';
import {
  getNotifications as _getNotifications,
  getActivityHistory as _getActivityHistory,
  markNotificationRead as _markNotificationRead,
  markAllNotificationsRead as _markAllNotificationsRead,
  getUnreadCount as _getUnreadCount,
  deleteNotification as _deleteNotification,
  registerPushToken as _registerPushToken,
  unregisterPushToken as _unregisterPushToken,
  getNotificationPreferences as _getNotificationPreferences,
  updateNotificationPreferences as _updateNotificationPreferences,
} from './api/notificationsApi';
import {
  followUser as _followUser,
  unfollowUser as _unfollowUser,
  getFollowers as _getFollowers,
  getFollowing as _getFollowing,
  getPostLikers as _getPostLikers,
  getFollowingUsers as _getFollowingUsers,
} from './api/socialApi';
import {
  getProfile as _getProfile,
  getProfileByUsername as _getProfileByUsername,
  updateProfile as _updateProfile,
  upgradeToProCreator as _upgradeToProCreator,
  checkCreationLimits as _checkCreationLimits,
  searchProfiles as _searchProfiles,
} from './api/profileApi';
import {
  getFeed as _getFeed,
} from './api/feedApi';
import {
  withMediaReadyRetry as _withMediaReadyRetry,
  isMediaNotReadyError as _isMediaNotReadyError,
} from './api/helpers';
import {
  getPosts as _getPosts,
  getPost as _getPost,
  createPost as _createPost,
  updatePost as _updatePost,
  deletePost as _deletePost,
  likePost as _likePost,
} from './api/postApi';
import {
  getUploadUrl as _getUploadUrl,
  getUploadQuota as _getUploadQuota,
} from './api/uploadApi';
import {
  getPeaks as _getPeaks,
  getPeak as _getPeak,
  createPeak as _createPeak,
  likePeak as _likePeak,
  reactToPeak as _reactToPeak,
  removeReactionFromPeak as _removeReactionFromPeak,
  tagFriendOnPeak as _tagFriendOnPeak,
  getPeakTags as _getPeakTags,
  hidePeak as _hidePeak,
  getPeakComments as _getPeakComments,
  commentOnPeak as _commentOnPeak,
  deletePeak as _deletePeak,
  getExpiredPeaks as _getExpiredPeaks,
  savePeakDecision as _savePeakDecision,
  createChallenge as _createChallenge,
  getChallenges as _getChallenges,
  getChallengeDetail as _getChallengeDetail,
  getChallengeResponses as _getChallengeResponses,
  respondToChallenge as _respondToChallenge,
  voteChallengeResponse as _voteChallengeResponse,
} from './api/peaksApi';
import {
  getConversations as _getConversations,
  getConversation as _getConversation,
  createConversation as _createConversation,
  getOrCreateConversation as _getOrCreateConversation,
  getMessages as _getMessages,
  sendMessage as _sendMessage,
  deleteMessage as _deleteMessage,
  markConversationRead as _markConversationRead,
} from './api/messagingApi';
import {
  createSpot as _createSpot,
  getSpot as _getSpot,
  getNearbySpots as _getNearbySpots,
  createReview as _createReview,
  getReviews as _getReviews,
  getCategories as _getCategories,
  suggestSubcategory as _suggestSubcategory,
  createLivePin as _createLivePin,
  deleteLivePin as _deleteLivePin,
  startLiveStream as _startLiveStream,
  endLiveStream as _endLiveStream,
  getActiveLiveStreams as _getActiveLiveStreams,
  getNearbyLivePins as _getNearbyLivePins,
  getMapMarkers as _getMapMarkers,
  searchMap as _searchMap,
} from './api/mapApi';
import {
  createEvent as _createEvent,
  getEvents as _getEvents,
  getEventDetail as _getEventDetail,
  getEventParticipants as _getEventParticipants,
  joinEvent as _joinEvent,
  leaveEvent as _leaveEvent,
  createEventPayment as _createEventPayment,
  confirmEventPayment as _confirmEventPayment,
  updateEvent as _updateEvent,
  cancelEvent as _cancelEvent,
  removeEventParticipant as _removeEventParticipant,
  eventAction as _eventAction,
  createGroup as _createGroup,
  getGroups as _getGroups,
  getGroup as _getGroup,
  joinGroup as _joinGroup,
  leaveGroup as _leaveGroup,
} from './api/eventsApi';
import type {
  RequestOptions, PaginatedResponse, ApiPagination,
  DeviceSession, TipEntry, LeaderboardEntry,
  ApiChallenge, ChallengeResponseEntry,
  ApiBattle, BattleParticipant, BattleTip, BattleComment,
  ApiEvent, EventParticipant,
  BusinessSummary, BusinessProfileData, BusinessServiceData,
  BusinessActivityData, BusinessReviewData, BookingSlotData,
  BusinessBookingData, SubscriptionPlanData, BusinessSubscriptionData,
  BusinessScheduleSlotData, BusinessTagData,
} from './api/internal-types';

// Re-export all types so existing imports from 'aws-api' continue working
export * from './api/types';
export { APIError } from './api/error';

const API_BASE_URL = AWS_CONFIG.api.restEndpoint;
const API_BASE_URL_2 = AWS_CONFIG.api.restEndpoint2;
const API_BASE_URL_3 = AWS_CONFIG.api.restEndpoint3;
const API_BASE_URL_DISPUTES = AWS_CONFIG.api.restEndpointDisputes;
const CDN_URL = AWS_CONFIG.storage.cdnDomain;

// Endpoints routed to API Gateway 3 (business access + spots)
const API3_ENDPOINTS = [
  '/businesses/validate-access',
  '/businesses/log-entry',
  '/businesses/subscriptions/my',
] as const;

// Prefix-based routing to API Gateway 3
const API3_PREFIXES = [
  '/spots',
  '/businesses/subscriptions/',
  '/reports',
  '/feed/',
  '/posts/search',
  '/posts/likes/batch',
  '/posts/saves/batch',
  '/posts/saved',
  '/peaks/search',
] as const;

// Prefix-based routing to Disputes API (dedicated API Gateway)
const DISPUTES_PREFIXES = [
  '/disputes',
  '/admin/disputes',
] as const;

// Endpoints routed to API Gateway 2 (secondary)
const API2_PREFIXES = [
  '/sessions', '/packs', '/payments', '/tips', '/earnings',
  '/challenges', '/battles', '/events', '/settings', '/admin',
  '/businesses', '/interests', '/expertise', '/hashtags',
  '/devices', '/contacts', '/support', '/account', '/categories',
  '/groups', '/reviews', '/map', '/search/map', '/live-streams',
] as const;

const MEDIA_NOT_READY_MAX_ATTEMPTS = 10;
const MEDIA_NOT_READY_BASE_DELAY_MS = 1500;

export class AWSAPIService {
  private defaultTimeout = 30000;
  // Prevent concurrent signOut calls from racing (double 401 scenario)
  private signingOut = false;
  // Prevent N simultaneous token refreshes — one refresh, others wait
  private refreshPromise: Promise<string | null> | null = null;
  // Deduplicate identical in-flight GET requests
  private inFlightGets = new Map<string, Promise<unknown>>();

  /**
   * Make authenticated API request.
   * GET requests are deduplicated — identical in-flight GETs share one promise.
   */
  async request<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const resolvedOptions: RequestOptions = options ?? { method: 'GET' };
    const method = resolvedOptions.method || 'GET';
    const meta = resolvedOptions.meta;
    const logPath = endpoint.split('?')[0]; // strip query params for safe logging
    const start = nowMs();

    // Deduplicate identical in-flight GET requests
    if (method === 'GET') {
      const existing = this.inFlightGets.get(endpoint);
      if (existing) return existing as Promise<T>;

      const promise = this._requestWithRetry<T>(endpoint, resolvedOptions)
        .then((result) => {
          const ms = nowMs() - start;
          devLog(`[API] ${method} ${logPath} OK ${ms}ms`);
          addBreadcrumb(`${method} ${logPath}`, 'api', { ms, status: 'ok', feature: meta?.feature, action: meta?.action });
          return result;
        })
        .catch((error_: unknown) => {
          const ms = nowMs() - start;
          devLog(`[API][ERR] ${method} ${logPath} ${ms}ms`, safeJson(error_));
          addBreadcrumb(`${method} ${logPath}`, 'api-error', { ms, status: 'error', feature: meta?.feature, action: meta?.action });
          throw error_;
        })
        .finally(() => {
          this.inFlightGets.delete(endpoint);
        });
      this.inFlightGets.set(endpoint, promise);
      return promise;
    }

    try {
      const result = await this._requestWithRetry<T>(endpoint, resolvedOptions);
      const ms = nowMs() - start;
      devLog(`[API] ${method} ${logPath} OK ${ms}ms`);
      addBreadcrumb(`${method} ${logPath}`, 'api', { ms, status: 'ok', feature: meta?.feature, action: meta?.action });
      return result;
    } catch (error_: unknown) {
      const ms = nowMs() - start;
      devLog(`[API][ERR] ${method} ${logPath} ${ms}ms`, safeJson(error_));
      addBreadcrumb(`${method} ${logPath}`, 'api-error', { ms, status: 'error', feature: meta?.feature, action: meta?.action });
      throw error_;
    }
  }

  private async _requestWithRetry<T>(endpoint: string, options: RequestOptions): Promise<T> {
    const MAX_RETRIES = 2;
    const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this._requestOnce<T>(endpoint, options);
      } catch (error_: unknown) {
        lastError = error_ as Error;
        const apiErr = error_ as { statusCode?: number; status?: number; data?: { retryAfter?: number } };
        const status = apiErr.statusCode || apiErr.status;
        // Retry on retryable HTTP statuses OR transient network errors (no status)
        const isNetworkError = !status && error_ instanceof Error && (
          error_.message.includes('Network') ||
          error_.message.includes('network') ||
          error_.message.includes('fetch') ||
          error_.message.includes('ECONNREFUSED') ||
          error_.message.includes('timeout') ||
          error_.name === 'TypeError' ||
          error_.name === 'AbortError'
        );
        const isRetryable = isNetworkError || (status ? RETRYABLE_STATUSES.has(status) : false);

        if (!isRetryable || attempt === MAX_RETRIES) {
          if (attempt > 0 && error_ instanceof Error) {
            error_.message = `${error_.message} (after ${attempt + 1} attempts)`;
          }
          // Report non-retryable or exhausted-retry errors to Sentry
          if (error_ instanceof Error) {
            captureException(error_, { endpoint, method: options.method, attempts: attempt + 1, status });
          }
          throw error_;
        }

        // Exponential backoff: 1s, 2s
        if (status === 429 && apiErr.data?.retryAfter) {
          await new Promise(r => setTimeout(r, apiErr.data!.retryAfter! * 1000));
        } else {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    throw lastError;
  }

  private async _requestOnce<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const resolvedOpts: RequestOptions = options ?? { method: 'GET' };
    const { method, body, headers = {}, authenticated = true, timeout = this.defaultTimeout } = resolvedOpts;

    addBreadcrumb(`${method} ${endpoint}`, 'api', { method, endpoint, authenticated });

    // Determine which API to use (checked in priority order):
    // 1. API 3: exact endpoint matches OR prefix matches (spots, business subscriptions)
    // 2. Disputes API: /disputes and /admin/disputes prefixes
    // 3. API 2: all other secondary prefixes
    // 4. API 1: default
    const isApi3Endpoint = (API3_ENDPOINTS as readonly string[]).includes(endpoint) ||
      API3_PREFIXES.some(prefix => endpoint.startsWith(prefix));

    const isDisputesEndpoint = DISPUTES_PREFIXES.some(prefix => endpoint.startsWith(prefix));

    let baseUrl: string;
    if (isApi3Endpoint) {
      baseUrl = API_BASE_URL_3;
    } else if (isDisputesEndpoint) {
      baseUrl = API_BASE_URL_DISPUTES;
    } else if (API2_PREFIXES.some(prefix => endpoint.startsWith(prefix))) {
      baseUrl = API_BASE_URL_2;
    } else {
      baseUrl = API_BASE_URL;
    }
    const url = `${baseUrl}${endpoint}`;

    const isFormData = body instanceof FormData;
    const requestHeaders: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    };
    // When sending FormData, remove Content-Type so fetch auto-sets it with boundary
    if (isFormData) {
      delete requestHeaders['Content-Type'];
    }

    // Add authentication header if needed
    // Cognito Authorizer expects the ID token (not Access token)
    if (authenticated) {
      const token = await awsAuth.getIdToken();
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`;
      } else if (__DEV__) {
        console.warn('[AWS API] No ID token available for authenticated request');
      }
    }

    if (__DEV__) console.log(`[AWS API] ${method} ${url} auth=${!!requestHeaders['Authorization']}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      let serializedBody: BodyInit | undefined;
      if (!body) {
        serializedBody = undefined;
      } else if (isFormData) {
        serializedBody = body as unknown as BodyInit;
      } else {
        serializedBody = JSON.stringify(body);
      }
      const response = await secureFetch(url, {
        method,
        headers: requestHeaders,
        body: serializedBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 && authenticated) {
        // Token may have expired between getIdToken() and server receipt.
        // Use a shared refresh promise so concurrent 401s don't trigger N refreshes.
        const oldToken = requestHeaders['Authorization']?.startsWith('Bearer ')
          ? requestHeaders['Authorization'].slice(7)
          : requestHeaders['Authorization'];
        const newToken = await this._refreshToken();
        if (newToken && newToken !== oldToken) {
          requestHeaders['Authorization'] = `Bearer ${newToken}`;
          const retryController = new AbortController();
          const retryTimeoutId = setTimeout(() => retryController.abort(), timeout);
          try {
            const retryResponse = await secureFetch(url, {
              method,
              headers: requestHeaders,
              body: serializedBody,
              signal: retryController.signal,
            });
            clearTimeout(retryTimeoutId);
            if (!retryResponse.ok) {
              // Double 401 = session is truly dead. Force sign out (deduplicated).
              if (retryResponse.status === 401 && !this.signingOut) {
                this.signingOut = true;
                if (__DEV__) console.warn('[AWS API] Double 401 — forcing sign out');
                awsAuth.signOut().catch(() => {}).finally(() => { this.signingOut = false; });
              }
              const retryError = await retryResponse.json().catch(() => ({}));
              throw new APIError(
                retryError.message || `Request failed with status ${retryResponse.status}`,
                retryResponse.status,
                retryError
              );
            }
            const retryRaw = await retryResponse.text();
            if (!retryRaw) {
              if (method === 'GET' && __DEV__) {
                console.warn(`[AWS API] Empty response body for GET ${endpoint} (retry)`);
              }
              return {} as T;
            }
            try {
              return JSON.parse(retryRaw) as T;
            } catch (error_) {
              if (__DEV__) console.warn('[AWS API] Invalid JSON response (retry)', (error_ as Error).message);
              throw new APIError('Invalid JSON response', retryResponse.status);
            }
          } catch (error_: unknown) {
            clearTimeout(retryTimeoutId);
            if (error_ instanceof Error && error_.name === 'AbortError') throw new APIError('Request timeout', 408);
            throw error_;
          }
        } else if (!newToken && !this.signingOut) {
          // getIdToken returned null = refresh failed = session dead
          this.signingOut = true;
          if (__DEV__) console.warn('[AWS API] 401 and no valid token — forcing sign out');
          awsAuth.signOut().catch(() => {}).finally(() => { this.signingOut = false; });
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (__DEV__) console.warn(`[AWS API] ERROR ${response.status}:`, JSON.stringify(errorData).substring(0, 200));

        // Detect account moderation (suspended/banned)
        if (response.status === 403 && errorData.moderationStatus) {
          try {
            const { useModerationStore } = require('../stores/moderationStore');
            useModerationStore.getState().setModeration(
              errorData.moderationStatus,
              errorData.reason || 'Community guidelines violation',
              errorData.suspendedUntil,
            );
          } catch {
            // Expected: moderation store may not be initialized during early API calls
          }
        }

        throw new APIError(
          errorData.message || errorData.error || `Request failed with status ${response.status}`,
          response.status,
          errorData
        );
      }

      const raw = await response.text();
      if (!raw) {
        // 204 No Content is expected for DELETE/POST mutations — return empty object
        // For GET requests, empty body is unexpected — log warning
        if (method === 'GET' && __DEV__) {
          console.warn(`[AWS API] Empty response body for GET ${endpoint}`);
        }
        return {} as T;
      }

      try {
        return JSON.parse(raw) as T;
      } catch (error_) {
        if (__DEV__) console.warn('[AWS API] Invalid JSON response', (error_ as Error).message);
        throw new APIError('Invalid JSON response', response.status);
      }
    } catch (error_: unknown) {
      clearTimeout(timeoutId);

      if (error_ instanceof Error && error_.name === 'AbortError') {
        throw new APIError('Request timeout', 408);
      }

      throw error_;
    }
  }

  /**
   * Queued token refresh — concurrent 401s share one refresh call.
   */
  private _refreshToken(): Promise<string | null> {
    this.refreshPromise ??= awsAuth.getIdToken().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private isMediaNotReadyError(error: unknown): boolean {
    return _isMediaNotReadyError(error);
  }

  private async withMediaReadyRetry<T>(
    operation: () => Promise<T>,
    maxAttempts = MEDIA_NOT_READY_MAX_ATTEMPTS,
    baseDelayMs = MEDIA_NOT_READY_BASE_DELAY_MS,
  ): Promise<T> {
    return _withMediaReadyRetry(operation, maxAttempts, baseDelayMs);
  }

  // ==========================================
  // Posts API
  // ==========================================

  async getPosts(params?: {
    limit?: number;
    cursor?: string;
    type?: 'all' | 'following' | 'explore';
    userId?: string;
  }) {
    return _getPosts(this, params);
  }

  async getPost(id: string) {
    return _getPost(this, id);
  }

  async createPost(data: CreatePostInput): Promise<Post> {
    return _createPost(this, data);
  }

  async updatePost(id: string, data: Partial<CreatePostInput>): Promise<Post> {
    return _updatePost(this, id, data);
  }

  async deletePost(id: string): Promise<void> {
    return _deletePost(this, id);
  }

  async likePost(id: string) {
    return _likePost(this, id);
  }

  // ==========================================
  // Profiles API
  // ==========================================

  async getProfile(id: string): Promise<Profile> {
    return _getProfile(this, id);
  }

  async getProfileByUsername(username: string): Promise<Profile> {
    return _getProfileByUsername(this, username);
  }

  async updateProfile(data: UpdateProfileInput): Promise<Profile> {
    return _updateProfile(this, data);
  }

  /**
   * @deprecated Account type upgrades can ONLY happen via Stripe webhook — never via direct API call.
   * This method is retained for reference but must not be used.
   */
  async upgradeToProCreator(): Promise<{ success: boolean; message?: string }> {
    return _upgradeToProCreator();
  }

  /**
   * Check event/group creation limits for personal accounts
   */
  async checkCreationLimits(): Promise<{
    canCreateEvent: boolean;
    canCreateGroup: boolean;
    eventsThisMonth: number;
    groupsThisMonth: number;
    maxEventsPerMonth: number;
    maxGroupsPerMonth: number;
    nextResetDate: string;
  }> {
    return _checkCreationLimits(this);
  }

  async searchProfiles(query: string, limit = 20, cursor?: string): Promise<PaginatedResponse<Profile>> {
    return _searchProfiles(this, query, limit, cursor);
  }

  // ==========================================
  // Follows API
  // ==========================================

  async followUser(userId: string): Promise<{
    success: boolean;
    type: string;
    message: string;
    cooldown?: { blocked: boolean; until: string; daysRemaining: number };
  }> {
    return _followUser(this, userId);
  }

  async unfollowUser(userId: string): Promise<{
    success: boolean;
    message: string;
    cooldown?: { blocked: boolean; until: string; message: string };
  }> {
    return _unfollowUser(this, userId);
  }

  async getFollowers(userId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Profile>> {
    return _getFollowers(this, userId, params);
  }

  async getFollowing(userId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Profile>> {
    return _getFollowing(this, userId, params);
  }

  // ==========================================
  // Post Likers
  // ==========================================

  async getPostLikers(postId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Profile>> {
    return _getPostLikers(this, postId, params);
  }

  // ==========================================
  // Feed API
  // ==========================================

  async getFeed(params?: { limit?: number; cursor?: string }) {
    return _getFeed(this, params);
  }

  // ==========================================
  // Peaks API
  // ==========================================

  async getPeaks(params?: { limit?: number; cursor?: string; userId?: string }): Promise<PaginatedResponse<Peak>> {
    return _getPeaks(this, params);
  }

  async getPeak(id: string): Promise<Peak> {
    return _getPeak(this, id);
  }

  async createPeak(data: CreatePeakInput): Promise<Peak> {
    return _createPeak(this, data);
  }

  async likePeak(id: string): Promise<void> {
    return _likePeak(this, id);
  }

  async reactToPeak(id: string, reaction: string): Promise<{
    success: boolean;
    reaction: string;
    reactionCounts: Record<string, number>;
  }> {
    return _reactToPeak(this, id, reaction);
  }

  async removeReactionFromPeak(id: string): Promise<{ success: boolean }> {
    return _removeReactionFromPeak(this, id);
  }

  async tagFriendOnPeak(peakId: string, friendId: string): Promise<{
    success: boolean;
    tag: {
      id: string;
      taggedUser: {
        id: string;
        username: string;
        displayName: string;
        avatarUrl: string;
      };
      taggedBy: string;
      createdAt: string;
    };
  }> {
    return _tagFriendOnPeak(this, peakId, friendId);
  }

  async getPeakTags(peakId: string): Promise<{
    success: boolean;
    tags: Array<{
      id: string;
      userId: string;
      username: string;
      displayName?: string;
      avatarUrl?: string;
      taggedBy: string;
      createdAt: string;
    }>;
  }> {
    return _getPeakTags(this, peakId);
  }

  async hidePeak(id: string, reason: 'not_interested' | 'seen_too_often' | 'irrelevant' | 'other' = 'not_interested'): Promise<{
    success: boolean;
    message: string;
    reason: string;
  }> {
    return _hidePeak(this, id, reason);
  }

  async getPeakComments(peakId: string, params?: { limit?: number; cursor?: string }): Promise<{
    success: boolean;
    data: Array<{
      id: string;
      text: string;
      createdAt: string;
      author: { id: string; username: string; fullName: string; avatarUrl: string; isVerified: boolean };
    }>;
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    return _getPeakComments(this, peakId, params);
  }

  async commentOnPeak(peakId: string, text: string): Promise<{
    success: boolean;
    comment: {
      id: string;
      text: string;
      createdAt: string;
      author: { id: string; username: string; fullName: string; avatarUrl: string; isVerified: boolean };
    };
  }> {
    return _commentOnPeak(this, peakId, text);
  }

  async deletePeak(id: string): Promise<{ success: boolean }> {
    return _deletePeak(this, id);
  }

  async getExpiredPeaks(): Promise<{ data: Peak[]; total: number }> {
    return _getExpiredPeaks(this);
  }

  async savePeakDecision(id: string, action: 'save_to_profile' | 'dismiss'): Promise<{ success: boolean }> {
    return _savePeakDecision(this, id, action);
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
    return _getNotifications(this, params);
  }

  async getActivityHistory(params?: { limit?: number; cursor?: string; type?: string }): Promise<PaginatedResponse<ActivityItem>> {
    return _getActivityHistory(this, params);
  }

  async markNotificationRead(id: string): Promise<void> {
    return _markNotificationRead(this, id);
  }

  async markAllNotificationsRead(): Promise<void> {
    return _markAllNotificationsRead(this);
  }

  async getUnreadCount(): Promise<{ unreadCount: number }> {
    return _getUnreadCount(this);
  }

  async deleteNotification(id: string): Promise<void> {
    return _deleteNotification(this, id);
  }

  // ==========================================
  // Account Management
  // ==========================================

  async deleteAccount(): Promise<void> {
    return this.request('/account', {
      method: 'DELETE',
    });
  }

  /** GDPR Art. 15 — Export all user data (rate limited: 3/hour) */
  async exportData(): Promise<Record<string, unknown>> {
    return this.request('/profiles/export-data', { method: 'GET' });
  }

  /** GDPR Art. 7 — Record user consent for terms/privacy */
  async recordConsent(consents: Array<{ type: string; version?: string }>): Promise<{ success: boolean }> {
    return this.request('/profiles/consent', {
      method: 'POST',
      body: { consents },
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

  async getUserDevices(): Promise<DeviceSession[]> {
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
    return _registerPushToken(this, data);
  }

  async unregisterPushToken(deviceId: string): Promise<void> {
    return _unregisterPushToken(this, deviceId);
  }

  // ==========================================
  // Notification Preferences
  // ==========================================

  async getNotificationPreferences(): Promise<NotificationPreferences> {
    return _getNotificationPreferences(this);
  }

  async updateNotificationPreferences(prefs: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    return _updateNotificationPreferences(this, prefs);
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
    canSignup: boolean;
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
    return _getFollowingUsers(this, userId, params);
  }

  // ==========================================
  // Media Upload
  // ==========================================

  async getUploadUrl(
    filename: string,
    contentType: string,
    fileSize: number,
    duration?: number
  ) {
    return _getUploadUrl(this, filename, contentType, fileSize, duration);
  }

  async getUploadQuota() {
    return _getUploadQuota(this);
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
  }) {
    return _smartSignup(this, data);
  }

  /**
   * Confirm signup with verification code
   */
  async confirmSignup(data: {
    email: string;
    code: string;
  }) {
    return _confirmSignup(this, data);
  }

  /**
   * Resend confirmation code
   */
  async resendConfirmationCode(email: string) {
    return _resendConfirmationCode(this, email);
  }

  /**
   * Initiate forgot password flow
   */
  async forgotPassword(email: string) {
    return _forgotPassword(this, email);
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
    return _confirmForgotPassword(this, data);
  }

  // ==========================================
  // Conversations & Messages API
  // ==========================================

  async getConversations(params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Conversation>> {
    return _getConversations(this, params);
  }

  async getConversation(id: string): Promise<Conversation> {
    return _getConversation(this, id);
  }

  async createConversation(participantId: string): Promise<Conversation> {
    return _createConversation(this, participantId);
  }

  async getOrCreateConversation(participantId: string): Promise<Conversation> {
    return _getOrCreateConversation(this, participantId);
  }

  async getMessages(conversationId: string, params?: { limit?: number; cursor?: string }): Promise<PaginatedResponse<Message>> {
    return _getMessages(this, conversationId, params);
  }

  async sendMessage(conversationId: string, data: {
    content: string;
    messageType?: 'text' | 'image' | 'video' | 'audio';
    mediaUrl?: string;
  }): Promise<Message> {
    return _sendMessage(this, conversationId, data);
  }

  async deleteMessage(messageId: string): Promise<void> {
    return _deleteMessage(this, messageId);
  }

  async markConversationRead(conversationId: string): Promise<void> {
    return _markConversationRead(this, conversationId);
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
    packId?: string;
    type?: 'session' | 'pack';
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
    checkoutUrl?: string;
    sessionId?: string;
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
   * Get current verification pricing/config (amount, currency, interval)
   */
  async getVerificationConfig(): Promise<{
    success: boolean;
    priceId?: string;
    amount?: number;
    currency?: string;
    interval?: string;
  }> {
    return this.request('/payments/identity', {
      method: 'POST',
      body: { action: 'get-config' },
    });
  }

  /**
   * Create payment intent for identity verification
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
    sessionId?: string;
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
  // Sessions API
  // ==========================================

  /**
   * List user's sessions
   */
  async listSessions(params?: {
    status?: 'upcoming' | 'past' | 'pending';
    role?: 'fan' | 'creator';
  }): Promise<{
    success: boolean;
    sessions: Session[];
    message?: string;
  }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.role) query.set('role', params.role);
    return this.request(`/sessions?${query.toString()}`);
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<{
    success: boolean;
    session?: Session;
    message?: string;
  }> {
    return this.request(`/sessions/${sessionId}`);
  }

  /**
   * Book a new session
   */
  async bookSession(data: {
    creatorId: string;
    scheduledAt: string;
    duration: number;
    price: number;
    notes?: string;
    fromPackId?: string;
  }): Promise<{
    success: boolean;
    session?: Session;
    message?: string;
  }> {
    return this.request('/sessions', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Accept a session request (creator)
   */
  async acceptSession(sessionId: string): Promise<{
    success: boolean;
    session?: Session;
    message?: string;
  }> {
    return this.request(`/sessions/${sessionId}/accept`, {
      method: 'POST',
    });
  }

  /**
   * Decline a session request (creator)
   */
  async declineSession(sessionId: string, reason?: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/sessions/${sessionId}/decline`, {
      method: 'POST',
      body: { reason },
    });
  }

  /**
   * Get creator's availability for sessions
   */
  async getCreatorAvailability(creatorId: string, params?: {
    startDate?: string;
    days?: number;
  }): Promise<{
    success: boolean;
    creator?: {
      id: string;
      name: string;
      username: string;
      avatar: string;
      sessionPrice: number;
      sessionDuration: number;
      timezone: string;
    };
    availableSlots?: Array<{
      date: string;
      time: string;
      datetime: string;
    }>;
    message?: string;
  }> {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.days) query.set('days', params.days.toString());
    return this.request(`/sessions/availability/${creatorId}?${query.toString()}`);
  }

  // ==========================================
  // Session Packs API
  // ==========================================

  /**
   * List available packs for a creator
   */
  async listCreatorPacks(creatorId: string): Promise<{
    success: boolean;
    packs: SessionPack[];
    message?: string;
  }> {
    return this.request(`/packs?creatorId=${creatorId}`);
  }

  /**
   * List user's purchased packs
   */
  async listMyPacks(): Promise<{
    success: boolean;
    packs: UserSessionPack[];
    message?: string;
  }> {
    return this.request('/packs?owned=true');
  }

  /**
   * Purchase a session pack
   */
  async purchasePack(data: {
    packId: string;
    creatorId: string;
  }): Promise<{
    success: boolean;
    paymentIntent?: {
      id: string;
      clientSecret: string;
      amount: number;
    };
    pack?: SessionPack;
    message?: string;
  }> {
    return this.request('/packs/purchase', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Get Agora token for a session video call
   */
  async getSessionToken(sessionId: string): Promise<{
    success: boolean;
    token?: string;
    channelName?: string;
    uid?: number;
    appId?: string;
    message?: string;
  }> {
    return this.request(`/sessions/${sessionId}/token`, {
      method: 'POST',
    });
  }

  /**
   * Update creator's session settings (availability, pricing, etc.)
   */
  async updateSessionSettings(data: {
    sessionsEnabled?: boolean;
    sessionPrice?: number;
    sessionDuration?: number;
    sessionAvailability?: {
      [day: string]: { start: string; end: string }[];
    };
    timezone?: string;
  }): Promise<{
    success: boolean;
    settings?: {
      sessionsEnabled: boolean;
      sessionPrice: number;
      sessionDuration: number;
      sessionAvailability: { [day: string]: { start: string; end: string }[] };
      timezone: string;
    };
    message?: string;
  }> {
    return this.request('/sessions/settings', {
      method: 'PUT',
      body: data,
    });
  }

  // ==========================================
  // Pack Management (Creator)
  // ==========================================

  /**
   * Create a new session pack (creator only)
   */
  async createPack(data: {
    name: string;
    description?: string;
    sessionsIncluded: number;
    sessionDuration: number;
    validityDays: number;
    price: number;
    savingsPercent?: number;
  }): Promise<{
    success: boolean;
    pack?: SessionPack;
    message?: string;
  }> {
    return this.request('/packs', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Update an existing pack (creator only)
   */
  async updatePack(
    packId: string,
    data: {
      name?: string;
      description?: string;
      sessionsIncluded?: number;
      sessionDuration?: number;
      validityDays?: number;
      price?: number;
      savingsPercent?: number;
      isActive?: boolean;
    }
  ): Promise<{
    success: boolean;
    pack?: SessionPack;
    message?: string;
  }> {
    return this.request(`/packs/${packId}`, {
      method: 'PUT',
      body: data,
    });
  }

  /**
   * Delete a pack (creator only)
   */
  async deletePack(packId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/packs/${packId}`, {
      method: 'DELETE',
    });
  }

  // ==========================================
  // Creator Earnings
  // ==========================================

  /**
   * Get creator earnings summary and transactions
   */
  async getEarnings(params?: {
    period?: 'week' | 'month' | 'year' | 'all';
    limit?: number;
  }): Promise<{
    success: boolean;
    earnings?: {
      period: string;
      totalEarnings: number;
      availableBalance: number;
      pendingBalance: number;
      breakdown: {
        sessions: { count: number; total: number };
        packs: { count: number; total: number };
        subscriptions: { count: number; total: number };
      };
      transactions: Array<{
        id: string;
        type: 'session' | 'pack' | 'subscription';
        amount: number;
        currency: string;
        status: string;
        description: string;
        buyer: { name: string; avatar: string } | null;
        createdAt: string;
      }>;
    };
    message?: string;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.period) queryParams.set('period', params.period);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    const query = queryParams.toString();
    return this.request(`/earnings${query ? `?${query}` : ''}`);
  }

  // ==========================================
  // Refunds
  // ==========================================

  /**
   * List refunds (admin or user's own refunds)
   */
  async listRefunds(params?: {
    limit?: number;
    cursor?: string;
    status?: 'pending' | 'succeeded' | 'failed';
  }): Promise<{
    success: boolean;
    refunds?: Array<{
      id: string;
      paymentId: string;
      stripeRefundId: string | null;
      amount: number;
      reason: string;
      status: string;
      notes: string | null;
      buyer: { username: string; name: string };
      creator: { username: string; name: string };
      createdAt: string;
      processedAt: string | null;
    }>;
    nextCursor?: string | null;
    hasMore?: boolean;
    message?: string;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.cursor) queryParams.set('cursor', params.cursor);
    if (params?.status) queryParams.set('status', params.status);
    const query = queryParams.toString();
    return this.request(`/payments/refunds${query ? `?${query}` : ''}`);
  }

  /**
   * Get refund details
   */
  async getRefund(refundId: string): Promise<{
    success: boolean;
    refund?: {
      id: string;
      paymentId: string;
      stripeRefundId: string | null;
      amount: number;
      reason: string;
      status: string;
      notes: string | null;
      buyer: { id: string; username: string; name: string };
      creator: { id: string; username: string; name: string };
      stripeDetails: {
        status: string;
        amount: number;
        currency: string;
        created: string;
      } | null;
      createdAt: string;
      processedAt: string | null;
    };
    message?: string;
  }> {
    return this.request(`/payments/refunds/${refundId}`);
  }

  /**
   * Request a refund
   */
  async createRefund(data: {
    paymentId: string;
    amount?: number; // Optional for partial refunds
    reason: 'duplicate' | 'fraudulent' | 'requested_by_customer' | 'session_cancelled' | 'technical_issue' | 'creator_unavailable' | 'other';
    notes?: string;
  }): Promise<{
    success: boolean;
    refund?: {
      id: string;
      stripeRefundId: string;
      amount: number;
      status: string;
      reason: string;
    };
    message?: string;
  }> {
    return this.request('/payments/refunds', {
      method: 'POST',
      body: data,
    });
  }

  // ==========================================
  // Payment Methods (Saved Cards)
  // ==========================================

  /**
   * Create a setup intent for adding a new payment method
   */
  async createSetupIntent(): Promise<{
    success: boolean;
    setupIntent?: {
      clientSecret: string;
      id: string;
    };
    checkoutUrl?: string;
    message?: string;
  }> {
    return this.request('/payments/methods/setup-intent', {
      method: 'POST',
    });
  }

  /**
   * List saved payment methods
   */
  async listPaymentMethods(): Promise<{
    success: boolean;
    paymentMethods?: Array<{
      id: string;
      type: string;
      isDefault: boolean;
      card: {
        brand: string;
        last4: string;
        expMonth: number;
        expYear: number;
        funding: string;
        country: string;
      } | null;
      billingDetails: {
        name: string | null;
        email: string | null;
      };
      created: string;
    }>;
    defaultPaymentMethodId?: string | null;
    message?: string;
  }> {
    return this.request('/payments/methods');
  }

  /**
   * Attach a payment method to the user
   */
  async attachPaymentMethod(data: {
    paymentMethodId: string;
    setAsDefault?: boolean;
  }): Promise<{
    success: boolean;
    paymentMethod?: {
      id: string;
      type: string;
      isDefault: boolean;
      card: {
        brand: string;
        last4: string;
        expMonth: number;
        expYear: number;
      } | null;
    };
    message?: string;
  }> {
    return this.request('/payments/methods', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Remove a payment method
   */
  async removePaymentMethod(paymentMethodId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/payments/methods/${paymentMethodId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Set a payment method as default
   */
  async setDefaultPaymentMethod(paymentMethodId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/payments/methods/${paymentMethodId}/default`, {
      method: 'PUT',
    });
  }

  // ==========================================
  // Business Checkout
  // ==========================================

  async createBusinessCheckout(data: {
    businessId: string;
    serviceId?: string;
    planId?: string;
    date?: string;
    slotId?: string;
  }): Promise<{
    success: boolean;
    checkoutUrl?: string;
    sessionId?: string;
    message?: string;
  }> {
    return this.request('/payments/business-checkout', {
      method: 'POST',
      body: data,
    });
  }

  // ==========================================
  // Web Checkout (Avoids 30% App Store Fees)
  // ==========================================

  /**
   * Create a web checkout session
   * Opens Stripe Checkout in browser to avoid app store fees
   */
  async createWebCheckout(data: {
    productType: 'session' | 'pack' | 'channel_subscription' | 'platform_subscription' | 'tip';
    productId?: string;
    creatorId?: string;
    amount?: number;
    planType?: 'pro_creator' | 'pro_business';
  }): Promise<{
    success: boolean;
    checkoutUrl?: string;
    sessionId?: string;
    expiresAt?: number;
    message?: string;
  }> {
    return this.request('/payments/web-checkout', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Check web checkout session status
   */
  async getWebCheckoutStatus(sessionId: string): Promise<{
    success: boolean;
    status?: string;
    paymentStatus?: string;
    metadata?: Record<string, string>;
    amountTotal?: number;
    currency?: string;
    message?: string;
  }> {
    return this.request(`/payments/web-checkout/status/${sessionId}`);
  }

  // ==========================================
  // IAP (In-App Purchase) Verification
  // ==========================================

  /**
   * Verify an IAP receipt with the backend.
   * Called by useIAPCheckout after a successful store purchase.
   */
  async verifyIAPReceipt(data: {
    platform: 'ios' | 'android';
    productId: string;
    transactionId: string;
    receipt?: string;        // iOS: transaction receipt
    purchaseToken?: string;  // Android: purchase token
  }): Promise<{
    success: boolean;
    productType?: string;
    message?: string;
  }> {
    return this.request('/payments/iap/verify', {
      method: 'POST',
      body: data,
    });
  }

  // ==========================================
  // Tips
  // ==========================================

  /**
   * Send a tip to a creator
   */
  async sendTip(data: {
    receiverId: string;
    amount: number; // in cents
    currency?: string;
    contextType: 'profile' | 'live' | 'peak' | 'battle';
    contextId?: string;
    message?: string;
    isAnonymous?: boolean;
  }): Promise<{
    success: boolean;
    tipId?: string;
    clientSecret?: string;
    checkoutUrl?: string;
    sessionId?: string;
    paymentIntentId?: string;
    amount?: number;
    currency?: string;
    platformFee?: number;
    creatorAmount?: number;
    message?: string;
  }> {
    return this.request('/tips/send', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Get tips history
   */
  async getTipsHistory(params: {
    type?: 'sent' | 'received';
    contextType?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    success: boolean;
    type?: string;
    tips?: TipEntry[];
    totals?: { count: number; totalAmount: number; monthAmount: number };
    nextCursor?: string | null;
    hasMore?: boolean;
  }> {
    const query = new URLSearchParams();
    if (params.type) query.append('type', params.type);
    if (params.contextType) query.append('contextType', params.contextType);
    if (params.limit) query.append('limit', params.limit.toString());
    if (params.cursor) query.append('cursor', params.cursor);
    return this.request(`/tips/history?${query.toString()}`);
  }

  /**
   * Get tips leaderboard for a creator
   */
  async getTipsLeaderboard(creatorId: string, period?: 'all_time' | 'monthly' | 'weekly'): Promise<{
    success: boolean;
    period?: string;
    leaderboard?: LeaderboardEntry[];
    stats?: { uniqueTippers: number; totalAmount: number; creatorTotal: number };
  }> {
    const query = period ? `?period=${period}` : '';
    return this.request(`/tips/leaderboard/${creatorId}${query}`);
  }

  // ==========================================
  // Challenges
  // ==========================================

  async createChallenge(data: {
    peakId: string;
    title: string;
    description?: string;
    rules?: string;
    challengeTypeId?: string;
    challengeTypeSlug?: string;
    durationSeconds?: number;
    endsAt?: string;
    isPublic?: boolean;
    allowAnyone?: boolean;
    maxParticipants?: number;
    taggedUserIds?: string[];
    hasPrize?: boolean;
    prizeDescription?: string;
    prizeAmount?: number;
    tipsEnabled?: boolean;
  }): Promise<{ success: boolean; challenge?: ApiChallenge; message?: string }> {
    return _createChallenge(this, data);
  }

  async getChallenges(params?: {
    filter?: 'trending' | 'new' | 'ending_soon' | 'created' | 'tagged' | 'responded';
    creatorId?: string;
    category?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ success: boolean; challenges?: ApiChallenge[]; pagination?: ApiPagination }> {
    return _getChallenges(this, params);
  }

  async getChallengeDetail(challengeId: string): Promise<{
    success: boolean;
    challenge?: ApiChallenge;
    message?: string;
  }> {
    return _getChallengeDetail(this, challengeId);
  }

  async getChallengeResponses(challengeId: string, params?: {
    sortBy?: 'recent' | 'popular';
    limit?: number;
    cursor?: string;
  }): Promise<{
    success: boolean;
    responses?: ChallengeResponseEntry[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }> {
    return _getChallengeResponses(this, challengeId, params);
  }

  async respondToChallenge(challengeId: string, data: {
    peakId: string;
    score?: number;
    timeSeconds?: number;
  }): Promise<{ success: boolean; response?: ChallengeResponseEntry; message?: string }> {
    return _respondToChallenge(this, challengeId, data);
  }

  async voteChallengeResponse(challengeId: string, responseId: string): Promise<{
    success: boolean;
    voted?: boolean;
    voteCount?: number;
    message?: string;
  }> {
    return _voteChallengeResponse(this, challengeId, responseId);
  }

  // ==========================================
  // Live Battles
  // ==========================================

  /**
   * Create a live battle
   */
  async createBattle(data: {
    title?: string;
    description?: string;
    battleType?: 'tips' | 'votes' | 'challenge';
    maxParticipants?: number;
    durationMinutes?: number;
    scheduledAt?: string;
    invitedUserIds: string[];
  }): Promise<{ success: boolean; battle?: ApiBattle; message?: string }> {
    return this.request('/battles', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Join/leave a battle
   */
  async battleAction(battleId: string, action: 'accept' | 'decline' | 'start' | 'leave' | 'ready' | 'unready' | 'end'): Promise<{
    success: boolean;
    message?: string;
    agora?: { appId: string; channelName: string; token: string; uid: number };
    agora_token?: string;
    agora_uid?: number;
    position?: number;
  }> {
    return this.request(`/battles/${battleId}/join`, {
      method: 'POST',
      body: { action },
    });
  }

  /**
   * Invite creators to a battle
   */
  async inviteToBattle(battleId: string, invitedUserIds: string[]): Promise<{ success: boolean; message?: string }> {
    return this.request(`/battles/${battleId}/invite`, {
      method: 'POST',
      body: { invitedUserIds },
    });
  }

  async getBattle(battleId: string): Promise<{
    success: boolean;
    battle?: ApiBattle;
    agora_token?: string;
    agora_uid?: number;
    message?: string;
  }> {
    return this.request(`/battles/${battleId}`, { method: 'GET' });
  }

  async getBattleState(battleId: string): Promise<{
    success: boolean;
    status?: string;
    participants?: BattleParticipant[];
    viewer_count?: number;
    new_tips?: BattleTip[];
    new_comments?: BattleComment[];
    winner?: BattleParticipant;
    message?: string;
  }> {
    return this.request(`/battles/${battleId}/state`, { method: 'GET' });
  }

  // ==========================================
  // Events (Xplorer)
  // ==========================================

  async createEvent(data: {
    title: string;
    description?: string;
    categorySlug: string;
    locationName: string;
    address?: string;
    latitude: number;
    longitude: number;
    startsAt: string;
    endsAt?: string;
    timezone?: string;
    maxParticipants?: number;
    minParticipants?: number;
    isFree?: boolean;
    price?: number;
    currency?: string;
    isPublic?: boolean;
    isFansOnly?: boolean;
    coverImageUrl?: string;
    images?: string[];
    hasRoute?: boolean;
    routeDistanceKm?: number;
    routeElevationGainM?: number;
    routeDifficulty?: 'easy' | 'moderate' | 'hard' | 'expert';
    routePolyline?: string;
    routeWaypoints?: { lat: number; lng: number; name?: string }[];
  }): Promise<{ success: boolean; event?: ApiEvent; message?: string }> {
    return _createEvent(this, data);
  }

  async getEvents(params?: {
    filter?: 'upcoming' | 'nearby' | 'category' | 'my-events' | 'joined';
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    category?: string;
    startDate?: string;
    endDate?: string;
    isFree?: boolean;
    hasRoute?: boolean;
    limit?: number;
    cursor?: string;
  }): Promise<{ success: boolean; events?: ApiEvent[]; pagination?: ApiPagination }> {
    return _getEvents(this, params);
  }

  async getEventDetail(eventId: string): Promise<{
    success: boolean;
    event?: ApiEvent;
    message?: string;
  }> {
    return _getEventDetail(this, eventId);
  }

  async getEventParticipants(eventId: string, params?: {
    limit?: number;
    offset?: number;
  }): Promise<{
    success: boolean;
    participants?: EventParticipant[];
    total?: number;
    message?: string;
  }> {
    return _getEventParticipants(this, eventId, params);
  }

  async joinEvent(eventId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return _joinEvent(this, eventId);
  }

  async leaveEvent(eventId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return _leaveEvent(this, eventId);
  }

  async createEventPayment(data: {
    eventId: string;
    amount: number;
    currency: string;
  }): Promise<{
    success: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    checkoutUrl?: string;
    sessionId?: string;
    message?: string;
  }> {
    return _createEventPayment(this, data);
  }

  async confirmEventPayment(data: {
    eventId: string;
    paymentIntentId: string;
  }): Promise<{
    success: boolean;
    message?: string;
  }> {
    return _confirmEventPayment(this, data);
  }

  async updateEvent(eventId: string, data: {
    title?: string;
    description?: string;
    price_cents?: number;
    max_participants?: number;
    location_name?: string;
    address?: string;
  }): Promise<{
    success: boolean;
    event?: ApiEvent;
    message?: string;
  }> {
    return _updateEvent(this, eventId, data);
  }

  async cancelEvent(eventId: string): Promise<{
    success: boolean;
    message?: string;
    refundsIssued?: number;
  }> {
    return _cancelEvent(this, eventId);
  }

  async removeEventParticipant(eventId: string, userId: string): Promise<{
    success: boolean;
    message?: string;
    refundIssued?: boolean;
  }> {
    return _removeEventParticipant(this, eventId, userId);
  }

  async eventAction(eventId: string, action: 'register' | 'cancel' | 'interested', notes?: string): Promise<{
    success: boolean;
    message?: string;
    participationStatus?: string;
    currentParticipants?: number;
    spotsLeft?: number;
    requiresPayment?: boolean;
    price?: number;
    currency?: string;
  }> {
    return _eventAction(this, eventId, action, notes);
  }

  // ==========================================
  // Currency Settings
  // ==========================================

  /**
   * Get currency settings
   */
  async getCurrencySettings(): Promise<{
    success: boolean;
    currency?: { code: string; symbol: string; detected?: string; countryCode?: string };
    supported?: { code: string; name: string; symbol: string }[];
  }> {
    return this.request('/settings/currency');
  }

  /**
   * Update currency preference
   */
  async updateCurrencySettings(currency: string): Promise<{
    success: boolean;
    currency?: { code: string; symbol: string };
    message?: string;
  }> {
    return this.request('/settings/currency', {
      method: 'PUT',
      body: { currency },
    });
  }

  // ==========================================
  // Business Discovery & Profiles
  // ==========================================

  /**
   * Discover businesses (map/list view)
   */
  async discoverBusinesses(params?: {
    category?: string;
    lat?: number;
    lng?: number;
    radius?: number;
    is_open?: boolean;
    min_rating?: number;
    price_range?: string[];
    search?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    success: boolean;
    businesses?: BusinessSummary[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.lat) queryParams.append('lat', params.lat.toString());
    if (params?.lng) queryParams.append('lng', params.lng.toString());
    if (params?.radius) queryParams.append('radius', params.radius.toString());
    if (params?.is_open !== undefined) queryParams.append('is_open', params.is_open.toString());
    if (params?.min_rating) queryParams.append('min_rating', params.min_rating.toString());
    if (params?.price_range) queryParams.append('price_range', params.price_range.join(','));
    if (params?.search) queryParams.append('search', params.search);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.cursor) queryParams.append('cursor', params.cursor);

    return this.request(`/businesses/discover?${queryParams.toString()}`);
  }

  /**
   * Get business profile
   */
  async getBusinessProfile(businessId: string): Promise<{
    success: boolean;
    business?: BusinessProfileData;
    message?: string;
  }> {
    return this.request(`/businesses/${businessId}`);
  }

  /**
   * Get business services
   */
  async getBusinessServices(businessId: string): Promise<{
    success: boolean;
    services?: BusinessServiceData[];
  }> {
    return this.request(`/businesses/${businessId}/services`);
  }

  /**
   * Get business schedule/activities
   */
  async getBusinessSchedule(businessId: string): Promise<{
    success: boolean;
    activities?: BusinessActivityData[];
  }> {
    return this.request(`/businesses/${businessId}/schedule`);
  }

  /**
   * Get business reviews
   */
  async getBusinessReviews(businessId: string, params?: { limit?: number; offset?: number }): Promise<{
    success: boolean;
    reviews?: BusinessReviewData[];
    total?: number;
  }> {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    return this.request(`/businesses/${businessId}/reviews?${queryParams.toString()}`);
  }

  /**
   * Get business availability for booking
   */
  async getBusinessAvailability(businessId: string, params: { serviceId: string; date: string }): Promise<{
    success: boolean;
    slots?: BookingSlotData[];
  }> {
    return this.request(`/businesses/${businessId}/availability?serviceId=${params.serviceId}&date=${params.date}`);
  }

  /**
   * Follow/unfollow business
   */
  async followBusiness(businessId: string): Promise<{ success: boolean; message?: string }> {
    return this.request(`/businesses/${businessId}/follow`, { method: 'POST' });
  }

  async unfollowBusiness(businessId: string): Promise<{ success: boolean; message?: string }> {
    return this.request(`/businesses/${businessId}/follow`, { method: 'DELETE' });
  }

  // ==========================================
  // Business Booking
  // ==========================================

  /**
   * Create booking payment intent
   */
  async createBusinessBookingPayment(data: {
    businessId: string;
    serviceId: string;
    date: string;
    slotId: string;
    amount: number;
    currency: string;
  }): Promise<{
    success: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    bookingId?: string;
    message?: string;
  }> {
    return this.request('/businesses/bookings/create-payment', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Confirm booking after payment
   */
  async confirmBusinessBooking(data: {
    bookingId: string;
    paymentIntentId: string;
  }): Promise<{
    success: boolean;
    booking?: BusinessBookingData;
    message?: string;
  }> {
    return this.request('/businesses/bookings/confirm', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Get my bookings
   */
  async getMyBusinessBookings(params?: { status?: string; limit?: number }): Promise<{
    success: boolean;
    bookings?: BusinessBookingData[];
  }> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.append('status', params.status);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    return this.request(`/businesses/bookings/my?${queryParams.toString()}`);
  }

  /**
   * Cancel booking
   */
  async cancelBusinessBooking(bookingId: string): Promise<{
    success: boolean;
    refundAmount?: number;
    message?: string;
  }> {
    return this.request(`/businesses/bookings/${bookingId}/cancel`, { method: 'POST' });
  }

  // ==========================================
  // Business Subscriptions
  // ==========================================

  /**
   * Get subscription plans for a business
   */
  async getBusinessSubscriptionPlans(businessId: string): Promise<{
    success: boolean;
    plans?: SubscriptionPlanData[];
  }> {
    return this.request(`/businesses/${businessId}/subscription-plans`);
  }

  /**
   * Get user's subscription to a business
   */
  async getUserBusinessSubscription(businessId: string): Promise<{
    success: boolean;
    subscription?: BusinessSubscriptionData;
  }> {
    return this.request(`/businesses/${businessId}/my-subscription`);
  }

  /**
   * Create subscription
   */
  async createBusinessSubscription(data: {
    businessId: string;
    planId: string;
    currency: string;
  }): Promise<{
    success: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    subscriptionId?: string;
    message?: string;
  }> {
    return this.request('/businesses/subscriptions/create', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Confirm subscription after payment
   */
  async confirmBusinessSubscription(data: {
    subscriptionId: string;
    paymentIntentId: string;
  }): Promise<{
    success: boolean;
    subscription?: BusinessSubscriptionData;
    message?: string;
  }> {
    return this.request('/businesses/subscriptions/confirm', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Get my subscriptions
   */
  async getMyBusinessSubscriptions(): Promise<{
    success: boolean;
    subscriptions?: BusinessSubscriptionData[];
  }> {
    return this.request('/businesses/subscriptions/my');
  }

  /**
   * Cancel subscription
   */
  async cancelBusinessSubscription(subscriptionId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/businesses/subscriptions/${subscriptionId}/cancel`, { method: 'POST' });
  }

  /**
   * Reactivate subscription
   */
  async reactivateBusinessSubscription(subscriptionId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/businesses/subscriptions/${subscriptionId}/reactivate`, { method: 'POST' });
  }

  // ==========================================
  // Business Program Management (for owners)
  // ==========================================

  /**
   * Get my business program (activities, schedule, tags)
   */
  async getMyBusinessProgram(): Promise<{
    success: boolean;
    activities?: BusinessActivityData[];
    schedule?: BusinessScheduleSlotData[];
    tags?: BusinessTagData[];
  }> {
    return this.request('/businesses/my/program');
  }

  /**
   * Create activity
   */
  async createBusinessActivity(data: Record<string, unknown>): Promise<{
    success: boolean;
    activity?: BusinessActivityData;
    message?: string;
  }> {
    return this.request('/businesses/my/activities', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Update activity
   */
  async updateBusinessActivity(activityId: string, data: Record<string, unknown>): Promise<{
    success: boolean;
    activity?: BusinessActivityData;
    message?: string;
  }> {
    return this.request(`/businesses/my/activities/${activityId}`, {
      method: 'PUT',
      body: data,
    });
  }

  /**
   * Delete activity
   */
  async deleteBusinessActivity(activityId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/businesses/my/activities/${activityId}`, { method: 'DELETE' });
  }

  /**
   * Create schedule slot
   */
  async createBusinessScheduleSlot(data: Record<string, unknown>): Promise<{
    success: boolean;
    slot?: BusinessScheduleSlotData;
    message?: string;
  }> {
    return this.request('/businesses/my/schedule', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Delete schedule slot
   */
  async deleteBusinessScheduleSlot(slotId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/businesses/my/schedule/${slotId}`, { method: 'DELETE' });
  }

  /**
   * Add tag to business
   */
  async addBusinessTag(data: { name: string; category: string }): Promise<{
    success: boolean;
    tag?: BusinessTagData;
    message?: string;
  }> {
    return this.request('/businesses/my/tags', {
      method: 'POST',
      body: data,
    });
  }

  /**
   * Remove tag from business
   */
  async removeBusinessTag(tagId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/businesses/my/tags/${tagId}`, { method: 'DELETE' });
  }

  // ==========================================
  // Business QR Code Access System
  // ==========================================

  /**
   * Get member access pass (QR code data)
   */
  async getMemberAccessPass(subscriptionId: string): Promise<{
    success: boolean;
    accessPass?: {
      id: string;
      qrCode: string;
      memberName: string;
      membershipType: string;
      validUntil: string;
      status: 'active' | 'expired' | 'suspended';
      remainingSessions?: number;
      businessName: string;
      businessLogo?: string;
    };
    message?: string;
  }> {
    return this.request(`/businesses/subscriptions/${subscriptionId}/access-pass`);
  }

  /**
   * Validate member access (for business scanner)
   */
  async validateMemberAccess(params: {
    subscriptionId: string;
    businessId: string;
    userId: string;
  }): Promise<{
    success: boolean;
    valid: boolean;
    memberName: string;
    membershipType: string;
    validUntil: string;
    remainingSessions?: number;
    photo?: string;
    message?: string;
  }> {
    return this.request('/businesses/validate-access', {
      method: 'POST',
      body: params,
    });
  }

  /**
   * Log member entry/check-in
   */
  async logMemberEntry(params: {
    subscriptionId: string;
    businessId: string;
  }): Promise<{
    success: boolean;
    entryId?: string;
    message?: string;
  }> {
    return this.request('/businesses/log-entry', {
      method: 'POST',
      body: params,
    });
  }

  // ==========================================
  // Business Owner Dashboard
  // ==========================================

  /**
   * Get business dashboard stats
   */
  async getBusinessDashboard(): Promise<{
    success: boolean;
    stats?: {
      todayBookings: number;
      activeMembers: number;
      monthlyRevenue: number;
      pendingRequests: number;
      todayCheckIns: number;
      upcomingClasses: number;
    };
    recentActivity?: Array<{
      id: string;
      type: 'booking' | 'check_in' | 'subscription' | 'cancellation';
      memberName: string;
      serviceName?: string;
      time: string;
    }>;
    message?: string;
  }> {
    return this.request('/businesses/my/dashboard');
  }

  // ==========================================
  // Business Services Management
  // ==========================================

  /**
   * Create a new business service
   */
  async createBusinessService(serviceData: {
    name: string;
    description?: string;
    category: string;
    price_cents: number;
    duration_minutes?: number;
    is_subscription: boolean;
    subscription_period?: 'weekly' | 'monthly' | 'yearly';
    trial_days?: number;
    max_capacity?: number;
    is_active: boolean;
  }): Promise<{
    success: boolean;
    service?: BusinessServiceData;
    message?: string;
  }> {
    return this.request('/businesses/my/services', {
      method: 'POST',
      body: serviceData,
    });
  }

  /**
   * Update a business service
   */
  async updateBusinessService(serviceId: string, serviceData: Partial<{
    name: string;
    description?: string;
    category: string;
    price_cents: number;
    duration_minutes?: number;
    is_subscription: boolean;
    subscription_period?: 'weekly' | 'monthly' | 'yearly';
    trial_days?: number;
    max_capacity?: number;
    is_active: boolean;
  }>): Promise<{
    success: boolean;
    service?: BusinessServiceData;
    message?: string;
  }> {
    return this.request(`/businesses/my/services/${serviceId}`, {
      method: 'PATCH',
      body: serviceData,
    });
  }

  /**
   * Delete a business service
   */
  async deleteBusinessService(serviceId: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    return this.request(`/businesses/my/services/${serviceId}`, { method: 'DELETE' });
  }

  // ==========================================
  // AI Schedule Analysis
  // ==========================================

  /**
   * Analyze schedule document with AI
   */
  async analyzeScheduleDocument(params: {
    fileUri: string;
    fileType: 'image' | 'pdf';
    mimeType: string;
  }): Promise<{
    success: boolean;
    activities?: Array<{
      name: string;
      day: string;
      startTime: string;
      endTime: string;
      instructor?: string;
      description?: string;
      category?: string;
      confidence: number;
    }>;
    message?: string;
  }> {
    // For file upload, we need to use FormData
    const formData = new FormData();
    formData.append('file', {
      uri: params.fileUri,
      type: params.mimeType,
      name: params.fileType === 'pdf' ? 'schedule.pdf' : 'schedule.jpg',
    } as unknown as Blob);
    formData.append('fileType', params.fileType);

    return this.request('/businesses/my/analyze-schedule', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Import extracted activities to schedule
   */
  async importScheduleActivities(params: {
    activities: Array<{
      name: string;
      day: string;
      startTime: string;
      endTime: string;
      instructor?: string;
      description?: string;
      category?: string;
    }>;
  }): Promise<{
    success: boolean;
    imported?: number;
    message?: string;
  }> {
    return this.request('/businesses/my/import-schedule', {
      method: 'POST',
      body: params,
    });
  }

  // ==========================================
  // WebSocket Auth
  // ==========================================

  /**
   * Get a short-lived ephemeral token for WebSocket connections
   */
  async getWsToken(): Promise<{ token: string; expiresIn: number }> {
    return this.request('/auth/ws-token', { method: 'POST' });
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

  // ============================================
  // GROUP ACTIVITIES
  // ============================================

  async createGroup(data: {
    name: string;
    description?: string;
    category: string;
    subcategory: string;
    sport_type?: string;
    latitude: number;
    longitude: number;
    address?: string;
    cover_image_url?: string;
    starts_at: string;
    ends_at?: string;
    timezone?: string;
    max_participants?: number;
    is_free: boolean;
    price?: number;
    currency?: string;
    is_public: boolean;
    is_fans_only: boolean;
    is_route: boolean;
    route_start?: { lat: number; lng: number };
    route_end?: { lat: number; lng: number };
    route_waypoints?: { lat: number; lng: number }[];
    route_geojson?: object;
    route_profile?: string;
    route_distance_km?: number;
    route_duration_min?: number;
    route_elevation_gain?: number;
    difficulty?: string;
  }): Promise<{ success: boolean; group?: GroupActivity; message?: string }> {
    return _createGroup(this, data);
  }

  async getGroups(params: {
    filter?: 'upcoming' | 'nearby' | 'my-groups' | 'joined';
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    category?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{ success: boolean; groups?: GroupActivity[]; pagination?: ApiPagination }> {
    return _getGroups(this, params);
  }

  async getGroup(groupId: string): Promise<{ success: boolean; group?: GroupActivity }> {
    return _getGroup(this, groupId);
  }

  async joinGroup(groupId: string): Promise<{ success: boolean; message?: string }> {
    return _joinGroup(this, groupId);
  }

  async leaveGroup(groupId: string): Promise<{ success: boolean; message?: string }> {
    return _leaveGroup(this, groupId);
  }

  // ============================================
  // SPOTS (enhanced)
  // ============================================

  async createSpot(data: {
    name: string;
    description?: string;
    category: string;
    subcategory: string;
    sport_type?: string;
    latitude: number;
    longitude: number;
    address?: string;
    cover_image_url?: string;
    images?: string[];
    tags?: string[];
    qualities?: string[];
    is_route: boolean;
    route_start?: { lat: number; lng: number };
    route_end?: { lat: number; lng: number };
    route_waypoints?: { lat: number; lng: number }[];
    route_geojson?: object;
    route_profile?: string;
    route_distance_km?: number;
    route_duration_min?: number;
    route_elevation_gain?: number;
    difficulty?: string;
    initial_rating?: number;
    initial_review?: string;
  }): Promise<{ success: boolean; spot?: Spot; message?: string }> {
    return _createSpot(this, data);
  }

  async getSpot(spotId: string): Promise<{ success: boolean; spot?: Spot }> {
    return _getSpot(this, spotId);
  }

  async getNearbySpots(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    category?: string;
    limit?: number;
  }): Promise<{ success: boolean; data?: Spot[] }> {
    return _getNearbySpots(this, params);
  }

  // ============================================
  // REVIEWS
  // ============================================

  async createReview(data: {
    target_id: string;
    target_type: 'spot' | 'business' | 'event' | 'live';
    rating: number;
    comment?: string;
    photos?: string[];
    qualities?: string[];
  }): Promise<{ success: boolean; review?: SpotReview; message?: string }> {
    return _createReview(this, data);
  }

  async getReviews(params: {
    target_id: string;
    target_type: string;
    limit?: number;
    offset?: number;
  }): Promise<{ success: boolean; reviews?: SpotReview[]; pagination?: ApiPagination }> {
    return _getReviews(this, params);
  }

  // ============================================
  // DYNAMIC CATEGORIES
  // ============================================

  async getCategories(): Promise<{ success: boolean; categories?: Subcategory[] }> {
    return _getCategories(this);
  }

  async suggestSubcategory(data: {
    parent_category: string;
    name: string;
  }): Promise<{ success: boolean; subcategory?: Subcategory; message?: string }> {
    return _suggestSubcategory(this, data);
  }

  // ============================================
  // LIVE PINS (Map)
  // ============================================

  async createLivePin(data: {
    channel_name: string;
    title?: string;
    latitude: number;
    longitude: number;
  }): Promise<{ success: boolean; livePin?: LivePin }> {
    return _createLivePin(this, data);
  }

  async deleteLivePin(): Promise<{ success: boolean }> {
    return _deleteLivePin(this);
  }

  // ============================================
  // LIVE STREAMS
  // ============================================

  async startLiveStream(title?: string): Promise<{ success: boolean; data?: { id: string; channelName: string; title: string; startedAt: string } }> {
    return _startLiveStream(this, title);
  }

  async endLiveStream(): Promise<{ success: boolean; data?: { id: string; durationSeconds: number; maxViewers: number; totalComments: number; totalReactions: number } }> {
    return _endLiveStream(this);
  }

  async getActiveLiveStreams(): Promise<{ success: boolean; data?: Array<{ id: string; channelName: string; title: string; startedAt: string; viewerCount: number; host: { id: string; username: string; displayName: string; avatarUrl: string } }> }> {
    return _getActiveLiveStreams(this);
  }

  async getNearbyLivePins(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
  }): Promise<{ success: boolean; livePins?: LivePin[] }> {
    return _getNearbyLivePins(this, params);
  }

  // ============================================
  // MAP MARKERS (unified endpoint)
  // ============================================

  async getMapMarkers(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    filters?: string;
    subcategories?: string;
    limit?: number;
  }): Promise<{ success: boolean; markers?: MapMarker[] }> {
    return _getMapMarkers(this, params);
  }

  // ============================================
  // MAP SEARCH (unified search with schedule indexing)
  // ============================================

  async searchMap(params: {
    query: string;
    latitude?: number;
    longitude?: number;
    radiusKm?: number;
    limit?: number;
  }): Promise<{ success: boolean; results?: MapMarker[] }> {
    return _searchMap(this, params);
  }
}

// Export singleton instance
export const awsAPI = new AWSAPIService();
export default awsAPI;
