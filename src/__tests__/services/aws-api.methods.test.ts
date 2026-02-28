/**
 * AWS API Service — Contract Tests for ALL API Methods
 *
 * Tests that each public method on awsAPI calls this.request()
 * with the correct endpoint, HTTP method, body, and query params.
 *
 * The HTTP layer (request -> _requestWithRetry -> _requestOnce) is already
 * tested in aws-api.service.test.ts. These tests focus on the CONTRACT
 * of each individual method — verifying that they build the correct request.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).__DEV__ = true;

// =============================================
// Mock declarations — MUST be before imports
// =============================================

jest.mock('../../services/aws-auth', () => ({
  awsAuth: {
    getIdToken: jest.fn().mockResolvedValue('mock-token'),
    signOut: jest.fn().mockResolvedValue(undefined),
    getCurrentUser: jest.fn().mockResolvedValue({ id: 'user-123' }),
  },
}));

jest.mock('../../config/aws-config', () => ({
  AWS_CONFIG: {
    region: 'us-east-1',
    cognito: { userPoolId: 'pool', userPoolClientId: 'client', identityPoolId: 'identity' },
    api: {
      restEndpoint: 'https://api1.test',
      restEndpoint2: 'https://api2.test',
      restEndpoint3: 'https://api3.test',
      restEndpointDisputes: 'https://disputes.test',
      graphqlEndpoint: '',
      websocketEndpoint: '',
    },
    storage: { bucket: 'test', cdnDomain: 'https://cdn.test' },
  },
}));

jest.mock('../../utils/certificatePinning', () => ({
  secureFetch: jest.fn(),
}));

jest.mock('../../lib/sentry', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  initSentry: jest.fn(),
  setUserContext: jest.fn(),
}));

jest.mock('../../stores/moderationStore', () => ({
  useModerationStore: { getState: () => ({ setModeration: jest.fn() }) },
}));

jest.mock('../../config/env', () => ({
  ENV: { GOOGLE_API_KEY: '', SENTRY_DSN: '' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  setUser: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  startSpan: jest.fn(),
  Severity: { Info: 'info', Warning: 'warning', Error: 'error' },
}));

// =============================================
// Import AFTER mocks
// =============================================

import { awsAPI, APIError } from '../../services/aws-api';
import type { CreatePostInput, UpdateProfileInput, CreatePeakInput, NotificationPreferences } from '../../services/api/types';

// =============================================
// Test setup
// =============================================

let requestSpy: jest.SpyInstance;

beforeEach(() => {
  requestSpy = jest.spyOn(awsAPI, 'request').mockResolvedValue({});
  jest.clearAllMocks();
});

afterEach(() => {
  requestSpy.mockRestore();
});

// =============================================
// Posts API
// =============================================

describe('Posts API', () => {
  it('getPosts() with no params should GET /posts', async () => {
    requestSpy.mockResolvedValueOnce({ posts: [], nextCursor: null, hasMore: false });
    const result = await awsAPI.getPosts();
    expect(requestSpy).toHaveBeenCalledWith('/posts');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ data: [], nextCursor: null, hasMore: false, total: 0 });
  });

  it('getPosts() with limit and cursor should add query params', async () => {
    requestSpy.mockResolvedValueOnce({ posts: [{ id: 'p1' }], nextCursor: 'c2', hasMore: true, total: 5 });
    const result = await awsAPI.getPosts({ limit: 10, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/posts?limit=10&cursor=c1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(1);
    expect(result.data.nextCursor).toBe('c2');
  });

  it('getPosts() with type=following should route to /feed/following', async () => {
    requestSpy.mockResolvedValueOnce({ posts: [] });
    await awsAPI.getPosts({ type: 'following', limit: 20 });
    expect(requestSpy).toHaveBeenCalledWith('/feed/following?limit=20');
  });

  it('getPosts() with type=explore should use /posts?type=explore', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: 'p1' }] });
    const result = await awsAPI.getPosts({ type: 'explore' });
    expect(requestSpy).toHaveBeenCalledWith('/posts?type=explore');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(1);
  });

  it('getPosts() with userId should add userId param', async () => {
    requestSpy.mockResolvedValueOnce({ posts: [] });
    await awsAPI.getPosts({ userId: 'u1' });
    expect(requestSpy).toHaveBeenCalledWith('/posts?userId=u1');
  });

  it('getPost(id) should GET /posts/:id', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'p1', content: 'test' });
    const result = await awsAPI.getPost('p1');
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ id: 'p1', content: 'test' });
  });

  it('createPost(data) should POST /posts with body', async () => {
    const data = { content: 'hello', mediaUrls: [] };
    requestSpy.mockResolvedValueOnce({ id: 'p1', ...data });
    await awsAPI.createPost(data as CreatePostInput);
    expect(requestSpy).toHaveBeenCalledWith('/posts', { method: 'POST', body: data });
  });

  it('createPost(data) should retry when backend returns MEDIA_NOT_READY', async () => {
    const data = { content: 'hello', mediaUrls: ['https://cdn.test/posts/u1/p1.jpg'] };
    requestSpy
      .mockRejectedValueOnce(new APIError('Media is still processing', 409, { code: 'MEDIA_NOT_READY' }))
      .mockResolvedValueOnce({ id: 'p1', ...data });

    await awsAPI.createPost(data as CreatePostInput);

    expect(requestSpy).toHaveBeenNthCalledWith(1, '/posts', { method: 'POST', body: data });
    expect(requestSpy).toHaveBeenNthCalledWith(2, '/posts', { method: 'POST', body: data });
    expect(requestSpy).toHaveBeenCalledTimes(2);
  });

  it('updatePost(id, data) should PATCH /posts/:id', async () => {
    const data = { content: 'updated' };
    requestSpy.mockResolvedValueOnce({ id: 'p1', content: 'updated' });
    await awsAPI.updatePost('p1', data as Partial<CreatePostInput>);
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1', { method: 'PATCH', body: data });
  });

  it('deletePost(id) should DELETE /posts/:id', async () => {
    await awsAPI.deletePost('p1');
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1', { method: 'DELETE' });
  });

  it('likePost(id) should POST /posts/:id/like', async () => {
    await awsAPI.likePost('p1');
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1/like', { method: 'POST' });
  });
});

// =============================================
// Profiles API
// =============================================

describe('Profiles API', () => {
  it('getProfile(id) should GET /profiles/:id', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'u1', username: 'test' });
    const result = await awsAPI.getProfile('u1');
    expect(requestSpy).toHaveBeenCalledWith('/profiles/u1');
    expect(result).toEqual({ id: 'u1', username: 'test' });
  });

  it('getProfileByUsername(username) should GET /profiles/username/:username', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'u1', username: 'johndoe' });
    const result = await awsAPI.getProfileByUsername('johndoe');
    expect(requestSpy).toHaveBeenCalledWith('/profiles/username/johndoe');
    expect(result).toEqual({ id: 'u1', username: 'johndoe' });
  });

  it('updateProfile(data) should PATCH /profiles/me', async () => {
    const data = { fullName: 'Updated Name' };
    requestSpy.mockResolvedValueOnce({ id: 'u1', fullName: 'Updated Name' });
    await awsAPI.updateProfile(data as UpdateProfileInput);
    expect(requestSpy).toHaveBeenCalledWith('/profiles/me', { method: 'PATCH', body: data });
  });

  it('upgradeToProCreator() should throw (deprecated)', async () => {
    await expect(awsAPI.upgradeToProCreator()).rejects.toThrow('Account upgrades are handled via Stripe webhook only');
  });

  it('checkCreationLimits() should GET /profiles/creation-limits', async () => {
    requestSpy.mockResolvedValueOnce({ canCreateEvent: true, eventsThisMonth: 0 });
    await awsAPI.checkCreationLimits();
    expect(requestSpy).toHaveBeenCalledWith('/profiles/creation-limits', { method: 'GET' });
  });

  it('searchProfiles(query) should GET /profiles with search param', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: 'u1' }], nextCursor: null, hasMore: false });
    const result = await awsAPI.searchProfiles('john');
    expect(requestSpy).toHaveBeenCalledWith(expect.stringContaining('/profiles?'));
    expect(requestSpy).toHaveBeenCalledWith(expect.stringContaining('search=john'));
    expect(requestSpy).toHaveBeenCalledWith(expect.stringContaining('limit=20'));
    expect(result.data).toHaveLength(1);
  });

  it('searchProfiles with custom limit and cursor', async () => {
    requestSpy.mockResolvedValueOnce({ data: [], nextCursor: 'c2', hasMore: true });
    const result = await awsAPI.searchProfiles('test', 5, 'c1');
    expect(requestSpy).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
    expect(requestSpy).toHaveBeenCalledWith(expect.stringContaining('cursor=c1'));
    expect(result.nextCursor).toBe('c2');
  });
});

// =============================================
// Follows API
// =============================================

describe('Follows API', () => {
  it('followUser(userId) should POST /follows with followingId body', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, type: 'follow', message: 'ok' });
    await awsAPI.followUser('u2');
    expect(requestSpy).toHaveBeenCalledWith('/follows', {
      method: 'POST',
      body: { followingId: 'u2' },
    });
  });

  it('unfollowUser(userId) should DELETE /follows/:userId', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, message: 'ok' });
    await awsAPI.unfollowUser('u2');
    expect(requestSpy).toHaveBeenCalledWith('/follows/u2', { method: 'DELETE' });
  });

  it('getFollowers(userId) should GET /profiles/:id/followers and map response', async () => {
    requestSpy.mockResolvedValueOnce({ followers: [{ id: 'f1' }], cursor: 'c1', hasMore: true, totalCount: 5 });
    const result = await awsAPI.getFollowers('u1');
    expect(requestSpy).toHaveBeenCalledWith('/profiles/u1/followers');
    expect(result.data).toEqual([{ id: 'f1' }]);
    expect(result.nextCursor).toBe('c1');
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(5);
  });

  it('getFollowers with pagination params', async () => {
    requestSpy.mockResolvedValueOnce({ followers: [], cursor: null, hasMore: false, totalCount: 0 });
    await awsAPI.getFollowers('u1', { limit: 10, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/profiles/u1/followers?limit=10&cursor=c1');
  });

  it('getFollowing(userId) should GET /profiles/:id/following and map response', async () => {
    requestSpy.mockResolvedValueOnce({ following: [{ id: 'f2' }], cursor: null, hasMore: false, totalCount: 1 });
    const result = await awsAPI.getFollowing('u1');
    expect(requestSpy).toHaveBeenCalledWith('/profiles/u1/following');
    expect(result.data).toEqual([{ id: 'f2' }]);
    expect(result.total).toBe(1);
  });

  it('getFollowing with pagination params', async () => {
    requestSpy.mockResolvedValueOnce({ following: [], cursor: null, hasMore: false, totalCount: 0 });
    await awsAPI.getFollowing('u1', { limit: 5, cursor: 'abc' });
    expect(requestSpy).toHaveBeenCalledWith('/profiles/u1/following?limit=5&cursor=abc');
  });
});

// =============================================
// Post Likers
// =============================================

describe('Post Likers API', () => {
  it('getPostLikers(postId) should GET /posts/:id/likers', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: 'u1' }], nextCursor: null, hasMore: false });
    const result = await awsAPI.getPostLikers('p1');
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1/likers');
    expect(result.data).toHaveLength(1);
  });

  it('getPostLikers with pagination params', async () => {
    requestSpy.mockResolvedValueOnce({ data: [], nextCursor: 'c2', hasMore: true });
    await awsAPI.getPostLikers('p1', { limit: 10, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1/likers?limit=10&cursor=c1');
  });
});

// =============================================
// Feed API
// =============================================

describe('Feed API', () => {
  it('getFeed() with no params should GET /feed', async () => {
    requestSpy.mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    await awsAPI.getFeed();
    expect(requestSpy).toHaveBeenCalledWith('/feed');
  });

  it('getFeed() with params should add query string', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getFeed({ limit: 20, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/feed?limit=20&cursor=c1');
  });
});

// =============================================
// Peaks API
// =============================================

describe('Peaks API', () => {
  it('getPeaks() with no params should GET /peaks', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getPeaks();
    expect(requestSpy).toHaveBeenCalledWith('/peaks');
  });

  it('getPeaks() with userId should set both authorId and author_id', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getPeaks({ userId: 'u1', limit: 10 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('authorId=u1');
    expect(call).toContain('author_id=u1');
    expect(call).toContain('limit=10');
  });

  it('getPeak(id) should GET /peaks/:id', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'pk1' });
    const result = await awsAPI.getPeak('pk1');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1');
    expect(result).toEqual(expect.objectContaining({ id: 'pk1' }));
  });

  it('createPeak(data) should POST /peaks', async () => {
    const data = { mediaUrl: 'url', type: 'image' };
    requestSpy.mockResolvedValueOnce({ id: 'pk1' });
    await awsAPI.createPeak(data as unknown as CreatePeakInput);
    expect(requestSpy).toHaveBeenCalledWith('/peaks', { method: 'POST', body: data });
  });

  it('createPeak(data) should retry on MEDIA_NOT_READY', async () => {
    const data = { videoUrl: 'https://cdn.test/peaks/u1/v1.mp4', duration: 10 };
    requestSpy
      .mockRejectedValueOnce(new APIError('Media is still processing', 409, { code: 'MEDIA_NOT_READY' }))
      .mockResolvedValueOnce({ success: true, peak: { id: 'pk1' } });

    await awsAPI.createPeak(data as CreatePeakInput);

    expect(requestSpy).toHaveBeenNthCalledWith(1, '/peaks', { method: 'POST', body: data });
    expect(requestSpy).toHaveBeenNthCalledWith(2, '/peaks', { method: 'POST', body: data });
    expect(requestSpy).toHaveBeenCalledTimes(2);
  });

  it('likePeak(id) should POST /peaks/:id/like', async () => {
    await awsAPI.likePeak('pk1');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/like', { method: 'POST' });
  });

  it('reactToPeak(id, reaction) should POST /peaks/:id/react with body', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, reaction: '🔥', reactionCounts: {} });
    await awsAPI.reactToPeak('pk1', '🔥');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/react', {
      method: 'POST',
      body: { reaction: '🔥' },
    });
  });

  it('removeReactionFromPeak(id) should DELETE /peaks/:id/react', async () => {
    await awsAPI.removeReactionFromPeak('pk1');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/react', { method: 'DELETE' });
  });

  it('tagFriendOnPeak(peakId, friendId) should POST /peaks/:id/tags', async () => {
    requestSpy.mockResolvedValueOnce({ success: true });
    await awsAPI.tagFriendOnPeak('pk1', 'f1');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/tags', {
      method: 'POST',
      body: { friendId: 'f1' },
    });
  });

  it('getPeakTags(peakId) should GET /peaks/:id/tags', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, tags: [] });
    await awsAPI.getPeakTags('pk1');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/tags');
  });

  it('hidePeak(id) should POST /peaks/:id/hide with default reason', async () => {
    await awsAPI.hidePeak('pk1');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/hide', {
      method: 'POST',
      body: { reason: 'not_interested' },
    });
  });

  it('hidePeak(id, reason) should POST with specified reason', async () => {
    await awsAPI.hidePeak('pk1', 'seen_too_often');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/hide', {
      method: 'POST',
      body: { reason: 'seen_too_often' },
    });
  });

  it('getPeakComments(peakId) should GET /peaks/:id/comments', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, data: [], nextCursor: null, hasMore: false });
    await awsAPI.getPeakComments('pk1');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/comments');
  });

  it('getPeakComments with pagination', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, data: [] });
    await awsAPI.getPeakComments('pk1', { limit: 10, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/comments?limit=10&cursor=c1');
  });

  it('commentOnPeak(peakId, text) should POST /peaks/:id/comments', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, comment: { id: 'c1', text: 'great' } });
    await awsAPI.commentOnPeak('pk1', 'great');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/comments', {
      method: 'POST',
      body: { text: 'great' },
    });
  });

  it('deletePeak(id) should DELETE /peaks/:id', async () => {
    await awsAPI.deletePeak('pk1');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1', { method: 'DELETE' });
  });

  it('getExpiredPeaks() should GET /peaks/expired', async () => {
    requestSpy.mockResolvedValueOnce({ data: [], total: 0 });
    await awsAPI.getExpiredPeaks();
    expect(requestSpy).toHaveBeenCalledWith('/peaks/expired');
  });

  it('savePeakDecision(id, action) should POST /peaks/:id/save-decision', async () => {
    await awsAPI.savePeakDecision('pk1', 'save_to_profile');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/save-decision', {
      method: 'POST',
      body: { action: 'save_to_profile' },
    });
  });

  it('savePeakDecision with dismiss action', async () => {
    await awsAPI.savePeakDecision('pk1', 'dismiss');
    expect(requestSpy).toHaveBeenCalledWith('/peaks/pk1/save-decision', {
      method: 'POST',
      body: { action: 'dismiss' },
    });
  });
});

// =============================================
// Comments API
// =============================================

describe('Comments API', () => {
  it('getComments(postId) should GET /posts/:id/comments', async () => {
    requestSpy.mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    await awsAPI.getComments('p1');
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1/comments');
  });

  it('getComments with pagination', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getComments('p1', { limit: 20, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1/comments?limit=20&cursor=c1');
  });

  it('createComment(postId, content) should POST /posts/:id/comments', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'c1', content: 'nice' });
    await awsAPI.createComment('p1', 'nice');
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1/comments', {
      method: 'POST',
      body: { content: 'nice', parentId: undefined },
    });
  });

  it('createComment with parentId should include parentId in body', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'c2' });
    await awsAPI.createComment('p1', 'reply', 'c1');
    expect(requestSpy).toHaveBeenCalledWith('/posts/p1/comments', {
      method: 'POST',
      body: { content: 'reply', parentId: 'c1' },
    });
  });

  it('deleteComment(commentId) should DELETE /comments/:id', async () => {
    await awsAPI.deleteComment('c1');
    expect(requestSpy).toHaveBeenCalledWith('/comments/c1', { method: 'DELETE' });
  });
});

// =============================================
// Notifications API
// =============================================

describe('Notifications API', () => {
  it('getNotifications() with no params should GET /notifications', async () => {
    requestSpy.mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    const result = await awsAPI.getNotifications();
    expect(requestSpy).toHaveBeenCalledWith('/notifications');
    expect(result.data).toEqual([]);
  });

  it('getNotifications() with params should add query string', async () => {
    requestSpy.mockResolvedValueOnce({ notifications: [{ id: 'n1' }], cursor: 'c2', hasMore: true });
    const result = await awsAPI.getNotifications({ limit: 10, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/notifications?limit=10&cursor=c1');
    expect(result.data).toEqual([{ id: 'n1' }]);
    expect(result.nextCursor).toBe('c2');
  });

  it('getActivityHistory() should GET /activity', async () => {
    requestSpy.mockResolvedValueOnce({ data: [], nextCursor: null, hasMore: false });
    const result = await awsAPI.getActivityHistory();
    expect(requestSpy).toHaveBeenCalledWith('/activity');
    expect(result.data).toEqual([]);
  });

  it('getActivityHistory with params', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: 'a1' }], nextCursor: 'c2', hasMore: true });
    const result = await awsAPI.getActivityHistory({ limit: 5, cursor: 'c1', type: 'like' });
    expect(requestSpy).toHaveBeenCalledWith('/activity?limit=5&cursor=c1&type=like');
    expect(result.data).toHaveLength(1);
  });

  it('markNotificationRead(id) should POST /notifications/:id/read', async () => {
    await awsAPI.markNotificationRead('n1');
    expect(requestSpy).toHaveBeenCalledWith('/notifications/n1/read', { method: 'POST' });
  });

  it('markAllNotificationsRead() should POST /notifications/read-all', async () => {
    await awsAPI.markAllNotificationsRead();
    expect(requestSpy).toHaveBeenCalledWith('/notifications/read-all', { method: 'POST' });
  });

  it('getUnreadCount() should GET /notifications/unread-count', async () => {
    requestSpy.mockResolvedValueOnce({ unreadCount: 5 });
    const result = await awsAPI.getUnreadCount();
    expect(requestSpy).toHaveBeenCalledWith('/notifications/unread-count');
    expect(result.unreadCount).toBe(5);
  });

  it('deleteNotification(id) should DELETE /notifications/:id', async () => {
    await awsAPI.deleteNotification('n1');
    expect(requestSpy).toHaveBeenCalledWith('/notifications/n1', { method: 'DELETE' });
  });
});

// =============================================
// Account Management
// =============================================

describe('Account Management', () => {
  it('deleteAccount() should DELETE /account', async () => {
    await awsAPI.deleteAccount();
    expect(requestSpy).toHaveBeenCalledWith('/account', { method: 'DELETE' });
  });

  it('exportData() should GET /profiles/export-data', async () => {
    requestSpy.mockResolvedValueOnce({ user: {}, posts: [] });
    await awsAPI.exportData();
    expect(requestSpy).toHaveBeenCalledWith('/profiles/export-data', { method: 'GET' });
  });

  it('recordConsent(consents) should POST /profiles/consent', async () => {
    const consents = [{ type: 'terms', version: '1.0' }];
    await awsAPI.recordConsent(consents);
    expect(requestSpy).toHaveBeenCalledWith('/profiles/consent', {
      method: 'POST',
      body: { consents },
    });
  });
});

// =============================================
// Device Sessions
// =============================================

describe('Device Sessions', () => {
  it('registerDeviceSession(info) should POST /devices/sessions', async () => {
    const info = {
      deviceId: 'd1',
      deviceName: 'iPhone',
      deviceType: 'phone',
      platform: 'ios',
      osVersion: '17.0',
      appVersion: '1.0.0',
    };
    requestSpy.mockResolvedValueOnce({ success: true, isNewDevice: true, sessionId: 's1' });
    await awsAPI.registerDeviceSession(info);
    expect(requestSpy).toHaveBeenCalledWith('/devices/sessions', {
      method: 'POST',
      body: info,
    });
  });

  it('getUserDevices() should GET /devices', async () => {
    requestSpy.mockResolvedValueOnce([]);
    await awsAPI.getUserDevices();
    expect(requestSpy).toHaveBeenCalledWith('/devices');
  });

  it('revokeDeviceSession(sessionId) should DELETE /devices/sessions/:id', async () => {
    await awsAPI.revokeDeviceSession('s1');
    expect(requestSpy).toHaveBeenCalledWith('/devices/sessions/s1', { method: 'DELETE' });
  });
});

// =============================================
// Push Notifications
// =============================================

describe('Push Notifications', () => {
  it('registerPushToken(data) should POST /notifications/push-token', async () => {
    const data = { token: 'tok123', platform: 'ios' as const, deviceId: 'd1' };
    await awsAPI.registerPushToken(data);
    expect(requestSpy).toHaveBeenCalledWith('/notifications/push-token', {
      method: 'POST',
      body: data,
    });
  });

  it('unregisterPushToken(deviceId) should DELETE /notifications/push-token/:deviceId', async () => {
    await awsAPI.unregisterPushToken('d1');
    expect(requestSpy).toHaveBeenCalledWith('/notifications/push-token/d1', { method: 'DELETE' });
  });
});

// =============================================
// Notification Preferences
// =============================================

describe('Notification Preferences', () => {
  it('getNotificationPreferences() should GET /notifications/preferences and return .preferences', async () => {
    const prefs = { likes: true, comments: true };
    requestSpy.mockResolvedValueOnce({ success: true, preferences: prefs });
    const result = await awsAPI.getNotificationPreferences();
    expect(requestSpy).toHaveBeenCalledWith('/notifications/preferences');
    expect(result).toEqual(prefs);
  });

  it('updateNotificationPreferences(prefs) should PUT /notifications/preferences', async () => {
    const prefs = { likes: false };
    requestSpy.mockResolvedValueOnce({ success: true, preferences: { likes: false, comments: true } });
    const result = await awsAPI.updateNotificationPreferences(prefs as Partial<NotificationPreferences>);
    expect(requestSpy).toHaveBeenCalledWith('/notifications/preferences', {
      method: 'PUT',
      body: prefs,
    });
    expect(result.likes).toBe(false);
  });
});

// =============================================
// Email Validation & Auth Helpers
// =============================================

describe('Email Validation & Auth', () => {
  it('validateEmail(email) should POST /auth/validate-email (unauthenticated)', async () => {
    requestSpy.mockResolvedValueOnce({ valid: true, email: 'test@test.com' });
    await awsAPI.validateEmail('test@test.com');
    expect(requestSpy).toHaveBeenCalledWith('/auth/validate-email', {
      method: 'POST',
      body: { email: 'test@test.com' },
      authenticated: false,
    });
  });

  it('checkUserExists(email) should POST /auth/check-user (unauthenticated)', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, canSignup: true });
    await awsAPI.checkUserExists('test@test.com');
    expect(requestSpy).toHaveBeenCalledWith('/auth/check-user', {
      method: 'POST',
      body: { email: 'test@test.com' },
      authenticated: false,
    });
  });

  it('smartSignup(data) should POST /auth/signup (unauthenticated)', async () => {
    const data = { email: 'test@test.com', password: 'pass123', username: 'testuser' };
    requestSpy.mockResolvedValueOnce({ success: true, confirmationRequired: true });
    await awsAPI.smartSignup(data);
    expect(requestSpy).toHaveBeenCalledWith('/auth/signup', {
      method: 'POST',
      body: data,
      authenticated: false,
    });
  });

  it('confirmSignup(data) should POST /auth/confirm-signup (unauthenticated)', async () => {
    const data = { email: 'test@test.com', code: '123456' };
    await awsAPI.confirmSignup(data);
    expect(requestSpy).toHaveBeenCalledWith('/auth/confirm-signup', {
      method: 'POST',
      body: data,
      authenticated: false,
    });
  });

  it('resendConfirmationCode(email) should POST /auth/resend-code (unauthenticated)', async () => {
    await awsAPI.resendConfirmationCode('test@test.com');
    expect(requestSpy).toHaveBeenCalledWith('/auth/resend-code', {
      method: 'POST',
      body: { email: 'test@test.com' },
      authenticated: false,
    });
  });

  it('forgotPassword(email) should POST /auth/forgot-password (unauthenticated)', async () => {
    await awsAPI.forgotPassword('test@test.com');
    expect(requestSpy).toHaveBeenCalledWith('/auth/forgot-password', {
      method: 'POST',
      body: { email: 'test@test.com' },
      authenticated: false,
    });
  });

  it('confirmForgotPassword(data) should POST /auth/confirm-forgot-password (unauthenticated)', async () => {
    const data = { email: 'test@test.com', code: '123456', newPassword: 'newpass' };
    await awsAPI.confirmForgotPassword(data);
    expect(requestSpy).toHaveBeenCalledWith('/auth/confirm-forgot-password', {
      method: 'POST',
      body: data,
      authenticated: false,
    });
  });
});

// =============================================
// Contacts
// =============================================

describe('Contacts', () => {
  it('storeContacts(contacts) should POST /contacts/sync', async () => {
    const contacts = [{ name: 'John', emails: ['john@test.com'], phones: [] }];
    requestSpy.mockResolvedValueOnce({ success: true, friendsOnApp: 2 });
    await awsAPI.storeContacts(contacts);
    expect(requestSpy).toHaveBeenCalledWith('/contacts/sync', {
      method: 'POST',
      body: { contacts },
    });
  });
});

// =============================================
// Problem Reports
// =============================================

describe('Problem Reports', () => {
  it('submitProblemReport(data) should POST /support/report', async () => {
    const data = { message: 'Bug found', email: 'user@test.com' };
    await awsAPI.submitProblemReport(data);
    expect(requestSpy).toHaveBeenCalledWith('/support/report', {
      method: 'POST',
      body: data,
    });
  });
});

// =============================================
// Following Users (for tagging)
// =============================================

describe('Following Users (Tagging)', () => {
  it('getFollowingUsers(userId) should GET /profiles/:id/following and extract following array', async () => {
    requestSpy.mockResolvedValueOnce({ following: [{ id: 'f1' }] });
    const result = await awsAPI.getFollowingUsers('u1');
    expect(requestSpy).toHaveBeenCalledWith('/profiles/u1/following');
    expect(result).toEqual([{ id: 'f1' }]);
  });

  it('getFollowingUsers with limit', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: 'f2' }] });
    const result = await awsAPI.getFollowingUsers('u1', { limit: 5 });
    expect(requestSpy).toHaveBeenCalledWith('/profiles/u1/following?limit=5');
    expect(result).toEqual([{ id: 'f2' }]);
  });
});

// =============================================
// Media Upload
// =============================================

describe('Media Upload', () => {
  it('getUploadUrl should POST /media/upload-url with post uploadType', async () => {
    requestSpy.mockResolvedValueOnce({ uploadUrl: 'https://s3.test/upload', fileUrl: 'https://cdn.test/file' });
    await awsAPI.getUploadUrl('images/photo.jpg', 'image/jpeg', 5000);
    expect(requestSpy).toHaveBeenCalledWith('/media/upload-url', {
      method: 'POST',
      body: { filename: 'images/photo.jpg', contentType: 'image/jpeg', uploadType: 'post', fileSize: 5000 },
    });
  });

  it('getUploadUrl detects avatar uploadType', async () => {
    requestSpy.mockResolvedValueOnce({ uploadUrl: '', fileUrl: '' });
    await awsAPI.getUploadUrl('avatars/photo.jpg', 'image/jpeg', 5000);
    expect(requestSpy).toHaveBeenCalledWith('/media/upload-url', expect.objectContaining({
      body: expect.objectContaining({ uploadType: 'avatar' }),
    }));
  });

  it('getUploadUrl detects cover uploadType', async () => {
    requestSpy.mockResolvedValueOnce({ uploadUrl: '', fileUrl: '' });
    await awsAPI.getUploadUrl('covers/photo.jpg', 'image/jpeg', 5000);
    expect(requestSpy).toHaveBeenCalledWith('/media/upload-url', expect.objectContaining({
      body: expect.objectContaining({ uploadType: 'cover' }),
    }));
  });

  it('getUploadUrl detects peak uploadType', async () => {
    requestSpy.mockResolvedValueOnce({ uploadUrl: '', fileUrl: '' });
    await awsAPI.getUploadUrl('peaks/video.mp4', 'video/mp4', 10000, 30);
    expect(requestSpy).toHaveBeenCalledWith('/media/upload-url', expect.objectContaining({
      body: expect.objectContaining({ uploadType: 'peak', duration: 30 }),
    }));
  });

  it('getUploadUrl detects message uploadType', async () => {
    requestSpy.mockResolvedValueOnce({ uploadUrl: '', fileUrl: '' });
    await awsAPI.getUploadUrl('messages/photo.jpg', 'image/jpeg', 5000);
    expect(requestSpy).toHaveBeenCalledWith('/media/upload-url', expect.objectContaining({
      body: expect.objectContaining({ uploadType: 'message' }),
    }));
  });

  it('getUploadQuota() should GET /media/upload-quota', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, accountType: 'personal', quotas: {}, resetsAt: '' });
    await awsAPI.getUploadQuota();
    expect(requestSpy).toHaveBeenCalledWith('/media/upload-quota');
  });
});

// =============================================
// Conversations & Messages API
// =============================================

describe('Conversations & Messages API', () => {
  it('getConversations() should GET /conversations', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getConversations();
    expect(requestSpy).toHaveBeenCalledWith('/conversations');
  });

  it('getConversations with params', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getConversations({ limit: 10, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/conversations?limit=10&cursor=c1');
  });

  it('getConversation(id) should GET /conversations/:id', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'conv1' });
    await awsAPI.getConversation('conv1');
    expect(requestSpy).toHaveBeenCalledWith('/conversations/conv1');
  });

  it('createConversation(participantId) should POST /conversations', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'conv1' });
    await awsAPI.createConversation('u2');
    expect(requestSpy).toHaveBeenCalledWith('/conversations', {
      method: 'POST',
      body: { participantId: 'u2' },
    });
  });

  it('getOrCreateConversation(participantId) should POST /conversations/get-or-create', async () => {
    requestSpy.mockResolvedValueOnce({ id: 'conv1' });
    await awsAPI.getOrCreateConversation('u2');
    expect(requestSpy).toHaveBeenCalledWith('/conversations/get-or-create', {
      method: 'POST',
      body: { participantId: 'u2' },
    });
  });

  it('getMessages(conversationId) should GET /conversations/:id/messages', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getMessages('conv1');
    expect(requestSpy).toHaveBeenCalledWith('/conversations/conv1/messages');
  });

  it('getMessages with pagination', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getMessages('conv1', { limit: 50, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/conversations/conv1/messages?limit=50&cursor=c1');
  });

  it('sendMessage should POST /conversations/:id/messages', async () => {
    const msgData = { content: 'hello', messageType: 'text' as const };
    requestSpy.mockResolvedValueOnce({ id: 'm1' });
    await awsAPI.sendMessage('conv1', msgData);
    expect(requestSpy).toHaveBeenCalledWith('/conversations/conv1/messages', {
      method: 'POST',
      body: msgData,
    });
  });

  it('deleteMessage(messageId) should DELETE /messages/:id', async () => {
    await awsAPI.deleteMessage('m1');
    expect(requestSpy).toHaveBeenCalledWith('/messages/m1', { method: 'DELETE' });
  });

  it('markConversationRead(conversationId) should POST /conversations/:id/read', async () => {
    await awsAPI.markConversationRead('conv1');
    expect(requestSpy).toHaveBeenCalledWith('/conversations/conv1/read', { method: 'POST' });
  });
});

// =============================================
// Payments API
// =============================================

describe('Payments API', () => {
  it('createPaymentIntent(data) should POST /payments/create-intent', async () => {
    const data = { creatorId: 'c1', amount: 1000 };
    requestSpy.mockResolvedValueOnce({ success: true });
    await awsAPI.createPaymentIntent(data);
    expect(requestSpy).toHaveBeenCalledWith('/payments/create-intent', {
      method: 'POST',
      body: data,
    });
  });

  it('getPaymentHistory() should GET /payments/history', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getPaymentHistory();
    expect(requestSpy).toHaveBeenCalledWith('/payments/history');
  });

  it('getPaymentHistory with params', async () => {
    requestSpy.mockResolvedValueOnce({ data: [] });
    await awsAPI.getPaymentHistory({ limit: 10, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/payments/history?limit=10&cursor=c1');
  });
});

// =============================================
// Subscriptions API
// =============================================

describe('Subscriptions API', () => {
  it('createSubscription should POST /payments/subscriptions with action=create', async () => {
    const data = { creatorId: 'c1', priceId: 'price_123' };
    await awsAPI.createSubscription(data);
    expect(requestSpy).toHaveBeenCalledWith('/payments/subscriptions', {
      method: 'POST',
      body: { action: 'create', ...data },
    });
  });

  it('cancelSubscription should POST /payments/subscriptions with action=cancel', async () => {
    await awsAPI.cancelSubscription('sub_123');
    expect(requestSpy).toHaveBeenCalledWith('/payments/subscriptions', {
      method: 'POST',
      body: { action: 'cancel', subscriptionId: 'sub_123' },
    });
  });

  it('listSubscriptions should POST /payments/subscriptions with action=list', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, subscriptions: [] });
    await awsAPI.listSubscriptions();
    expect(requestSpy).toHaveBeenCalledWith('/payments/subscriptions', {
      method: 'POST',
      body: { action: 'list' },
    });
  });

  it('getCreatorPrices should POST /payments/subscriptions with action=get-prices', async () => {
    await awsAPI.getCreatorPrices('c1');
    expect(requestSpy).toHaveBeenCalledWith('/payments/subscriptions', {
      method: 'POST',
      body: { action: 'get-prices', creatorId: 'c1' },
    });
  });
});

// =============================================
// Stripe Connect API
// =============================================

describe('Stripe Connect API', () => {
  it('createConnectAccount should POST /payments/connect with action=create-account', async () => {
    await awsAPI.createConnectAccount();
    expect(requestSpy).toHaveBeenCalledWith('/payments/connect', {
      method: 'POST',
      body: { action: 'create-account' },
    });
  });

  it('getConnectOnboardingLink should POST /payments/connect with action=create-link', async () => {
    await awsAPI.getConnectOnboardingLink('https://return.url', 'https://refresh.url');
    expect(requestSpy).toHaveBeenCalledWith('/payments/connect', {
      method: 'POST',
      body: { action: 'create-link', returnUrl: 'https://return.url', refreshUrl: 'https://refresh.url' },
    });
  });

  it('getConnectStatus should POST /payments/connect with action=get-status', async () => {
    await awsAPI.getConnectStatus();
    expect(requestSpy).toHaveBeenCalledWith('/payments/connect', {
      method: 'POST',
      body: { action: 'get-status' },
    });
  });

  it('getStripeDashboardLink should POST /payments/connect with action=get-dashboard-link', async () => {
    await awsAPI.getStripeDashboardLink();
    expect(requestSpy).toHaveBeenCalledWith('/payments/connect', {
      method: 'POST',
      body: { action: 'get-dashboard-link' },
    });
  });

  it('getCreatorBalance should POST /payments/connect with action=get-balance', async () => {
    await awsAPI.getCreatorBalance();
    expect(requestSpy).toHaveBeenCalledWith('/payments/connect', {
      method: 'POST',
      body: { action: 'get-balance' },
    });
  });
});

// =============================================
// Stripe Identity API
// =============================================

describe('Stripe Identity API', () => {
  it('createVerificationSession should POST /payments/identity with action=create-session', async () => {
    await awsAPI.createVerificationSession('https://return.url');
    expect(requestSpy).toHaveBeenCalledWith('/payments/identity', {
      method: 'POST',
      body: { action: 'create-session', returnUrl: 'https://return.url' },
    });
  });

  it('getVerificationStatus should POST /payments/identity with action=get-status', async () => {
    await awsAPI.getVerificationStatus();
    expect(requestSpy).toHaveBeenCalledWith('/payments/identity', {
      method: 'POST',
      body: { action: 'get-status' },
    });
  });

  it('getVerificationConfig should POST /payments/identity with action=get-config', async () => {
    await awsAPI.getVerificationConfig();
    expect(requestSpy).toHaveBeenCalledWith('/payments/identity', {
      method: 'POST',
      body: { action: 'get-config' },
    });
  });

  it('createVerificationPaymentIntent should POST /payments/identity with action=create-payment', async () => {
    await awsAPI.createVerificationPaymentIntent();
    expect(requestSpy).toHaveBeenCalledWith('/payments/identity', {
      method: 'POST',
      body: { action: 'create-payment' },
    });
  });

  it('confirmVerificationPayment should POST /payments/identity with action=confirm-payment', async () => {
    await awsAPI.confirmVerificationPayment('pi_123', 'https://return.url');
    expect(requestSpy).toHaveBeenCalledWith('/payments/identity', {
      method: 'POST',
      body: { action: 'confirm-payment', paymentIntentId: 'pi_123', returnUrl: 'https://return.url' },
    });
  });
});

// =============================================
// Platform Subscription API
// =============================================

describe('Platform Subscription API', () => {
  it('getPlatformSubscriptionStatus should POST /payments/platform-subscription with action=get-status', async () => {
    await awsAPI.getPlatformSubscriptionStatus();
    expect(requestSpy).toHaveBeenCalledWith('/payments/platform-subscription', {
      method: 'POST',
      body: { action: 'get-status' },
    });
  });

  it('subscribeToPlatform should POST with action=subscribe and planType', async () => {
    await awsAPI.subscribeToPlatform('pro_creator');
    expect(requestSpy).toHaveBeenCalledWith('/payments/platform-subscription', {
      method: 'POST',
      body: { action: 'subscribe', planType: 'pro_creator' },
    });
  });

  it('cancelPlatformSubscription should POST with action=cancel', async () => {
    await awsAPI.cancelPlatformSubscription();
    expect(requestSpy).toHaveBeenCalledWith('/payments/platform-subscription', {
      method: 'POST',
      body: { action: 'cancel' },
    });
  });
});

// =============================================
// Channel Subscription API
// =============================================

describe('Channel Subscription API', () => {
  it('subscribeToChannel should POST with action=subscribe', async () => {
    await awsAPI.subscribeToChannel('c1');
    expect(requestSpy).toHaveBeenCalledWith('/payments/channel-subscription', {
      method: 'POST',
      body: { action: 'subscribe', creatorId: 'c1' },
    });
  });

  it('getChannelSubscriptionStatus should POST with action=get-status', async () => {
    await awsAPI.getChannelSubscriptionStatus('c1');
    expect(requestSpy).toHaveBeenCalledWith('/payments/channel-subscription', {
      method: 'POST',
      body: { action: 'get-status', creatorId: 'c1' },
    });
  });

  it('cancelChannelSubscription should POST with action=cancel', async () => {
    await awsAPI.cancelChannelSubscription('sub_123');
    expect(requestSpy).toHaveBeenCalledWith('/payments/channel-subscription', {
      method: 'POST',
      body: { action: 'cancel', subscriptionId: 'sub_123' },
    });
  });

  it('getCreatorChannelInfo should POST with action=get-creator-info', async () => {
    await awsAPI.getCreatorChannelInfo('c1');
    expect(requestSpy).toHaveBeenCalledWith('/payments/channel-subscription', {
      method: 'POST',
      body: { action: 'get-creator-info', creatorId: 'c1' },
    });
  });
});

// =============================================
// Creator Wallet API
// =============================================

describe('Creator Wallet API', () => {
  it('getWalletDashboard should POST /payments/wallet with action=get-dashboard', async () => {
    await awsAPI.getWalletDashboard();
    expect(requestSpy).toHaveBeenCalledWith('/payments/wallet', {
      method: 'POST',
      body: { action: 'get-dashboard' },
    });
  });

  it('getWalletTransactions should POST /payments/wallet with action=get-transactions', async () => {
    await awsAPI.getWalletTransactions({ limit: 10, cursor: 'c1', type: 'earnings' });
    expect(requestSpy).toHaveBeenCalledWith('/payments/wallet', {
      method: 'POST',
      body: { action: 'get-transactions', limit: 10, cursor: 'c1', type: 'earnings' },
    });
  });

  it('getWalletTransactions with no params', async () => {
    await awsAPI.getWalletTransactions();
    expect(requestSpy).toHaveBeenCalledWith('/payments/wallet', {
      method: 'POST',
      body: { action: 'get-transactions' },
    });
  });

  it('getRevenueAnalytics should POST /payments/wallet with action=get-analytics', async () => {
    await awsAPI.getRevenueAnalytics('month');
    expect(requestSpy).toHaveBeenCalledWith('/payments/wallet', {
      method: 'POST',
      body: { action: 'get-analytics', period: 'month' },
    });
  });

  it('requestPayout should POST /payments/wallet with action=request-payout', async () => {
    await awsAPI.requestPayout(5000);
    expect(requestSpy).toHaveBeenCalledWith('/payments/wallet', {
      method: 'POST',
      body: { action: 'request-payout', amount: 5000 },
    });
  });
});

// =============================================
// Sessions API
// =============================================

describe('Sessions API', () => {
  it('listSessions() should GET /sessions', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, sessions: [] });
    await awsAPI.listSessions();
    expect(requestSpy).toHaveBeenCalledWith('/sessions?');
  });

  it('listSessions with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, sessions: [] });
    await awsAPI.listSessions({ status: 'upcoming', role: 'fan' });
    expect(requestSpy).toHaveBeenCalledWith('/sessions?status=upcoming&role=fan');
  });

  it('getSession(id) should GET /sessions/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, session: {} });
    await awsAPI.getSession('s1');
    expect(requestSpy).toHaveBeenCalledWith('/sessions/s1');
  });

  it('bookSession(data) should POST /sessions', async () => {
    const data = { creatorId: 'c1', scheduledAt: '2026-03-01', duration: 60, price: 5000 };
    await awsAPI.bookSession(data);
    expect(requestSpy).toHaveBeenCalledWith('/sessions', {
      method: 'POST',
      body: data,
    });
  });

  it('acceptSession(id) should POST /sessions/:id/accept', async () => {
    await awsAPI.acceptSession('s1');
    expect(requestSpy).toHaveBeenCalledWith('/sessions/s1/accept', { method: 'POST' });
  });

  it('declineSession(id, reason) should POST /sessions/:id/decline', async () => {
    await awsAPI.declineSession('s1', 'busy');
    expect(requestSpy).toHaveBeenCalledWith('/sessions/s1/decline', {
      method: 'POST',
      body: { reason: 'busy' },
    });
  });

  it('getCreatorAvailability(creatorId) should GET /sessions/availability/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, availableSlots: [] });
    await awsAPI.getCreatorAvailability('c1');
    expect(requestSpy).toHaveBeenCalledWith('/sessions/availability/c1?');
  });

  it('getCreatorAvailability with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true });
    await awsAPI.getCreatorAvailability('c1', { startDate: '2026-03-01', days: 7 });
    expect(requestSpy).toHaveBeenCalledWith('/sessions/availability/c1?startDate=2026-03-01&days=7');
  });
});

// =============================================
// Session Packs API
// =============================================

describe('Session Packs API', () => {
  it('listCreatorPacks(creatorId) should GET /packs?creatorId=...', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, packs: [] });
    await awsAPI.listCreatorPacks('c1');
    expect(requestSpy).toHaveBeenCalledWith('/packs?creatorId=c1');
  });

  it('listMyPacks() should GET /packs?owned=true', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, packs: [] });
    await awsAPI.listMyPacks();
    expect(requestSpy).toHaveBeenCalledWith('/packs?owned=true');
  });

  it('purchasePack(data) should POST /packs/purchase', async () => {
    const data = { packId: 'pk1', creatorId: 'c1' };
    await awsAPI.purchasePack(data);
    expect(requestSpy).toHaveBeenCalledWith('/packs/purchase', {
      method: 'POST',
      body: data,
    });
  });

  it('getSessionToken(sessionId) should POST /sessions/:id/token', async () => {
    await awsAPI.getSessionToken('s1');
    expect(requestSpy).toHaveBeenCalledWith('/sessions/s1/token', { method: 'POST' });
  });

  it('updateSessionSettings(data) should PUT /sessions/settings', async () => {
    const data = { sessionsEnabled: true, sessionPrice: 5000 };
    await awsAPI.updateSessionSettings(data);
    expect(requestSpy).toHaveBeenCalledWith('/sessions/settings', {
      method: 'PUT',
      body: data,
    });
  });
});

// =============================================
// Pack Management (Creator)
// =============================================

describe('Pack Management', () => {
  it('createPack(data) should POST /packs', async () => {
    const data = { name: 'Pack A', sessionsIncluded: 5, sessionDuration: 60, validityDays: 30, price: 10000 };
    await awsAPI.createPack(data);
    expect(requestSpy).toHaveBeenCalledWith('/packs', {
      method: 'POST',
      body: data,
    });
  });

  it('updatePack(packId, data) should PUT /packs/:id', async () => {
    const data = { name: 'Updated Pack' };
    await awsAPI.updatePack('pk1', data);
    expect(requestSpy).toHaveBeenCalledWith('/packs/pk1', {
      method: 'PUT',
      body: data,
    });
  });

  it('deletePack(packId) should DELETE /packs/:id', async () => {
    await awsAPI.deletePack('pk1');
    expect(requestSpy).toHaveBeenCalledWith('/packs/pk1', { method: 'DELETE' });
  });
});

// =============================================
// Creator Earnings
// =============================================

describe('Creator Earnings', () => {
  it('getEarnings() should GET /earnings', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, earnings: {} });
    await awsAPI.getEarnings();
    expect(requestSpy).toHaveBeenCalledWith('/earnings');
  });

  it('getEarnings with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, earnings: {} });
    await awsAPI.getEarnings({ period: 'month', limit: 10 });
    expect(requestSpy).toHaveBeenCalledWith('/earnings?period=month&limit=10');
  });
});

// =============================================
// Refunds
// =============================================

describe('Refunds API', () => {
  it('listRefunds() should GET /payments/refunds', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, refunds: [] });
    await awsAPI.listRefunds();
    expect(requestSpy).toHaveBeenCalledWith('/payments/refunds');
  });

  it('listRefunds with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, refunds: [] });
    await awsAPI.listRefunds({ limit: 10, cursor: 'c1', status: 'pending' });
    expect(requestSpy).toHaveBeenCalledWith('/payments/refunds?limit=10&cursor=c1&status=pending');
  });

  it('getRefund(refundId) should GET /payments/refunds/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, refund: {} });
    await awsAPI.getRefund('r1');
    expect(requestSpy).toHaveBeenCalledWith('/payments/refunds/r1');
  });

  it('createRefund(data) should POST /payments/refunds', async () => {
    const data = { paymentId: 'pay1', reason: 'requested_by_customer' as const };
    await awsAPI.createRefund(data);
    expect(requestSpy).toHaveBeenCalledWith('/payments/refunds', {
      method: 'POST',
      body: data,
    });
  });
});

// =============================================
// Payment Methods
// =============================================

describe('Payment Methods API', () => {
  it('createSetupIntent should POST /payments/methods/setup-intent', async () => {
    await awsAPI.createSetupIntent();
    expect(requestSpy).toHaveBeenCalledWith('/payments/methods/setup-intent', { method: 'POST' });
  });

  it('listPaymentMethods should GET /payments/methods', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, paymentMethods: [] });
    await awsAPI.listPaymentMethods();
    expect(requestSpy).toHaveBeenCalledWith('/payments/methods');
  });

  it('attachPaymentMethod(data) should POST /payments/methods', async () => {
    const data = { paymentMethodId: 'pm_123', setAsDefault: true };
    await awsAPI.attachPaymentMethod(data);
    expect(requestSpy).toHaveBeenCalledWith('/payments/methods', {
      method: 'POST',
      body: data,
    });
  });

  it('removePaymentMethod(id) should DELETE /payments/methods/:id', async () => {
    await awsAPI.removePaymentMethod('pm_123');
    expect(requestSpy).toHaveBeenCalledWith('/payments/methods/pm_123', { method: 'DELETE' });
  });

  it('setDefaultPaymentMethod(id) should PUT /payments/methods/:id/default', async () => {
    await awsAPI.setDefaultPaymentMethod('pm_123');
    expect(requestSpy).toHaveBeenCalledWith('/payments/methods/pm_123/default', { method: 'PUT' });
  });
});

// =============================================
// Business Checkout
// =============================================

describe('Business Checkout', () => {
  it('createBusinessCheckout should POST /payments/business-checkout', async () => {
    const data = { businessId: 'b1', serviceId: 's1' };
    await awsAPI.createBusinessCheckout(data);
    expect(requestSpy).toHaveBeenCalledWith('/payments/business-checkout', {
      method: 'POST',
      body: data,
    });
  });
});

// =============================================
// Web Checkout
// =============================================

describe('Web Checkout', () => {
  it('createWebCheckout should POST /payments/web-checkout', async () => {
    const data = { productType: 'session' as const, creatorId: 'c1', amount: 5000 };
    await awsAPI.createWebCheckout(data);
    expect(requestSpy).toHaveBeenCalledWith('/payments/web-checkout', {
      method: 'POST',
      body: data,
    });
  });

  it('getWebCheckoutStatus should GET /payments/web-checkout/status/:sessionId', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, status: 'complete' });
    await awsAPI.getWebCheckoutStatus('cs_123');
    expect(requestSpy).toHaveBeenCalledWith('/payments/web-checkout/status/cs_123');
  });
});

// =============================================
// Tips
// =============================================

describe('Tips API', () => {
  it('sendTip should POST /tips/send', async () => {
    const data = { receiverId: 'c1', amount: 500, contextType: 'profile' as const };
    await awsAPI.sendTip(data);
    expect(requestSpy).toHaveBeenCalledWith('/tips/send', {
      method: 'POST',
      body: data,
    });
  });

  it('getTipsHistory should GET /tips/history with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, tips: [] });
    await awsAPI.getTipsHistory({ type: 'sent', limit: 10 });
    expect(requestSpy).toHaveBeenCalledWith('/tips/history?type=sent&limit=10');
  });

  it('getTipsHistory with all params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true });
    await awsAPI.getTipsHistory({ type: 'received', contextType: 'live', limit: 5, cursor: 'c1' });
    expect(requestSpy).toHaveBeenCalledWith('/tips/history?type=received&contextType=live&limit=5&cursor=c1');
  });

  it('getTipsLeaderboard should GET /tips/leaderboard/:creatorId', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, leaderboard: [] });
    await awsAPI.getTipsLeaderboard('c1');
    expect(requestSpy).toHaveBeenCalledWith('/tips/leaderboard/c1');
  });

  it('getTipsLeaderboard with period', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, leaderboard: [] });
    await awsAPI.getTipsLeaderboard('c1', 'monthly');
    expect(requestSpy).toHaveBeenCalledWith('/tips/leaderboard/c1?period=monthly');
  });
});

// =============================================
// Challenges
// =============================================

describe('Challenges API', () => {
  it('createChallenge should POST /challenges', async () => {
    const data = { peakId: 'pk1', title: 'Challenge One' };
    await awsAPI.createChallenge(data);
    expect(requestSpy).toHaveBeenCalledWith('/challenges', {
      method: 'POST',
      body: data,
    });
  });

  it('getChallenges() should GET /challenges', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, challenges: [] });
    await awsAPI.getChallenges();
    expect(requestSpy).toHaveBeenCalledWith('/challenges?');
  });

  it('getChallenges with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, challenges: [] });
    await awsAPI.getChallenges({ filter: 'trending', limit: 10, cursor: 'c1' });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('filter=trending');
    expect(call).toContain('limit=10');
    expect(call).toContain('cursor=c1');
  });

  it('getChallengeDetail(id) should GET /challenges/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, challenge: {} });
    await awsAPI.getChallengeDetail('ch1');
    expect(requestSpy).toHaveBeenCalledWith('/challenges/ch1', { method: 'GET' });
  });

  it('getChallengeResponses(id) should GET /challenges/:id/responses', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, responses: [] });
    await awsAPI.getChallengeResponses('ch1');
    expect(requestSpy).toHaveBeenCalledWith('/challenges/ch1/responses?', { method: 'GET' });
  });

  it('getChallengeResponses with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, responses: [] });
    await awsAPI.getChallengeResponses('ch1', { sortBy: 'popular', limit: 5 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('sortBy=popular');
    expect(call).toContain('limit=5');
  });

  it('respondToChallenge should POST /challenges/:id/respond', async () => {
    const data = { peakId: 'pk2' };
    await awsAPI.respondToChallenge('ch1', data);
    expect(requestSpy).toHaveBeenCalledWith('/challenges/ch1/respond', {
      method: 'POST',
      body: data,
    });
  });

  it('voteChallengeResponse should POST /challenges/:id/responses/:id/vote', async () => {
    await awsAPI.voteChallengeResponse('ch1', 'resp1');
    expect(requestSpy).toHaveBeenCalledWith('/challenges/ch1/responses/resp1/vote', { method: 'POST' });
  });
});

// =============================================
// Live Battles
// =============================================

describe('Live Battles API', () => {
  it('createBattle should POST /battles', async () => {
    const data = { invitedUserIds: ['u2', 'u3'], title: 'Epic battle' };
    await awsAPI.createBattle(data);
    expect(requestSpy).toHaveBeenCalledWith('/battles', {
      method: 'POST',
      body: data,
    });
  });

  it('battleAction should POST /battles/:id/join with action body', async () => {
    await awsAPI.battleAction('b1', 'accept');
    expect(requestSpy).toHaveBeenCalledWith('/battles/b1/join', {
      method: 'POST',
      body: { action: 'accept' },
    });
  });

  it('inviteToBattle should POST /battles/:id/invite', async () => {
    await awsAPI.inviteToBattle('b1', ['u4']);
    expect(requestSpy).toHaveBeenCalledWith('/battles/b1/invite', {
      method: 'POST',
      body: { invitedUserIds: ['u4'] },
    });
  });

  it('getBattle(id) should GET /battles/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, battle: {} });
    await awsAPI.getBattle('b1');
    expect(requestSpy).toHaveBeenCalledWith('/battles/b1', { method: 'GET' });
  });

  it('getBattleState(id) should GET /battles/:id/state', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, status: 'active' });
    await awsAPI.getBattleState('b1');
    expect(requestSpy).toHaveBeenCalledWith('/battles/b1/state', { method: 'GET' });
  });
});

// =============================================
// Events (Xplorer)
// =============================================

describe('Events API', () => {
  it('createEvent should POST /events', async () => {
    const data = {
      title: 'Yoga class',
      categorySlug: 'yoga',
      locationName: 'Park',
      latitude: 48.85,
      longitude: 2.35,
      startsAt: '2026-03-01T10:00:00Z',
    };
    await awsAPI.createEvent(data);
    expect(requestSpy).toHaveBeenCalledWith('/events', {
      method: 'POST',
      body: data,
    });
  });

  it('getEvents() should GET /events', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, events: [] });
    await awsAPI.getEvents();
    expect(requestSpy).toHaveBeenCalledWith('/events?');
  });

  it('getEvents with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, events: [] });
    await awsAPI.getEvents({ filter: 'nearby', latitude: 48.85, longitude: 2.35, limit: 10 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('filter=nearby');
    expect(call).toContain('latitude=48.85');
    expect(call).toContain('longitude=2.35');
    expect(call).toContain('limit=10');
  });

  it('getEventDetail(id) should GET /events/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, event: {} });
    await awsAPI.getEventDetail('e1');
    expect(requestSpy).toHaveBeenCalledWith('/events/e1');
  });

  it('getEventParticipants(id) should GET /events/:id/participants', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, participants: [] });
    await awsAPI.getEventParticipants('e1');
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/participants?');
  });

  it('getEventParticipants with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, participants: [] });
    await awsAPI.getEventParticipants('e1', { limit: 20, offset: 10 });
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/participants?limit=20&offset=10');
  });

  it('joinEvent(id) should POST /events/:id/join', async () => {
    await awsAPI.joinEvent('e1');
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/join', {
      method: 'POST',
      body: { action: 'join' },
    });
  });

  it('leaveEvent(id) should POST /events/:id/leave', async () => {
    await awsAPI.leaveEvent('e1');
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/leave', { method: 'POST' });
  });

  it('createEventPayment should POST /events/:id/payment', async () => {
    const data = { eventId: 'e1', amount: 2000, currency: 'eur' };
    await awsAPI.createEventPayment(data);
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/payment', {
      method: 'POST',
      body: { amount: 2000, currency: 'eur' },
    });
  });

  it('confirmEventPayment should POST /events/:id/payment/confirm', async () => {
    const data = { eventId: 'e1', paymentIntentId: 'pi_123' };
    await awsAPI.confirmEventPayment(data);
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/payment/confirm', {
      method: 'POST',
      body: { paymentIntentId: 'pi_123' },
    });
  });

  it('updateEvent should PUT /events/:id', async () => {
    const data = { title: 'Updated Event' };
    await awsAPI.updateEvent('e1', data);
    expect(requestSpy).toHaveBeenCalledWith('/events/e1', {
      method: 'PUT',
      body: data,
    });
  });

  it('cancelEvent(id) should POST /events/:id/cancel', async () => {
    await awsAPI.cancelEvent('e1');
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/cancel', { method: 'POST' });
  });

  it('removeEventParticipant should DELETE /events/:id/participants/:userId', async () => {
    await awsAPI.removeEventParticipant('e1', 'u2');
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/participants/u2', { method: 'DELETE' });
  });

  it('eventAction should POST /events/:id/join with action body', async () => {
    await awsAPI.eventAction('e1', 'register', 'some notes');
    expect(requestSpy).toHaveBeenCalledWith('/events/e1/join', {
      method: 'POST',
      body: { action: 'register', notes: 'some notes' },
    });
  });
});

// =============================================
// Currency Settings
// =============================================

describe('Currency Settings', () => {
  it('getCurrencySettings should GET /settings/currency', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, currency: { code: 'EUR', symbol: '€' } });
    await awsAPI.getCurrencySettings();
    expect(requestSpy).toHaveBeenCalledWith('/settings/currency');
  });

  it('updateCurrencySettings should PUT /settings/currency', async () => {
    await awsAPI.updateCurrencySettings('USD');
    expect(requestSpy).toHaveBeenCalledWith('/settings/currency', {
      method: 'PUT',
      body: { currency: 'USD' },
    });
  });
});

// =============================================
// Business Discovery & Profiles
// =============================================

describe('Business Discovery & Profiles', () => {
  it('discoverBusinesses() should GET /businesses/discover', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, businesses: [] });
    await awsAPI.discoverBusinesses();
    expect(requestSpy).toHaveBeenCalledWith('/businesses/discover?');
  });

  it('discoverBusinesses with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, businesses: [] });
    await awsAPI.discoverBusinesses({ category: 'gym', lat: 48.85, lng: 2.35, limit: 10 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('category=gym');
    expect(call).toContain('lat=48.85');
    expect(call).toContain('lng=2.35');
    expect(call).toContain('limit=10');
  });

  it('getBusinessProfile(id) should GET /businesses/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, business: {} });
    await awsAPI.getBusinessProfile('b1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1');
  });

  it('getBusinessServices(id) should GET /businesses/:id/services', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, services: [] });
    await awsAPI.getBusinessServices('b1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/services');
  });

  it('getBusinessSchedule(id) should GET /businesses/:id/schedule', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, activities: [] });
    await awsAPI.getBusinessSchedule('b1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/schedule');
  });

  it('getBusinessReviews(id) should GET /businesses/:id/reviews', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, reviews: [] });
    await awsAPI.getBusinessReviews('b1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/reviews?');
  });

  it('getBusinessReviews with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, reviews: [] });
    await awsAPI.getBusinessReviews('b1', { limit: 10, offset: 5 });
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/reviews?limit=10&offset=5');
  });

  it('getBusinessAvailability should GET /businesses/:id/availability', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, slots: [] });
    await awsAPI.getBusinessAvailability('b1', { serviceId: 's1', date: '2026-03-01' });
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/availability?serviceId=s1&date=2026-03-01');
  });

  it('followBusiness(id) should POST /businesses/:id/follow', async () => {
    await awsAPI.followBusiness('b1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/follow', { method: 'POST' });
  });

  it('unfollowBusiness(id) should DELETE /businesses/:id/follow', async () => {
    await awsAPI.unfollowBusiness('b1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/follow', { method: 'DELETE' });
  });
});

// =============================================
// Business Booking
// =============================================

describe('Business Booking', () => {
  it('createBusinessBookingPayment should POST /businesses/bookings/create-payment', async () => {
    const data = { businessId: 'b1', serviceId: 's1', date: '2026-03-01', slotId: 'sl1', amount: 3000, currency: 'eur' };
    await awsAPI.createBusinessBookingPayment(data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/bookings/create-payment', {
      method: 'POST',
      body: data,
    });
  });

  it('confirmBusinessBooking should POST /businesses/bookings/confirm', async () => {
    const data = { bookingId: 'bk1', paymentIntentId: 'pi_123' };
    await awsAPI.confirmBusinessBooking(data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/bookings/confirm', {
      method: 'POST',
      body: data,
    });
  });

  it('getMyBusinessBookings() should GET /businesses/bookings/my', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, bookings: [] });
    await awsAPI.getMyBusinessBookings();
    expect(requestSpy).toHaveBeenCalledWith('/businesses/bookings/my?');
  });

  it('getMyBusinessBookings with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, bookings: [] });
    await awsAPI.getMyBusinessBookings({ status: 'confirmed', limit: 10 });
    expect(requestSpy).toHaveBeenCalledWith('/businesses/bookings/my?status=confirmed&limit=10');
  });

  it('cancelBusinessBooking(id) should POST /businesses/bookings/:id/cancel', async () => {
    await awsAPI.cancelBusinessBooking('bk1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/bookings/bk1/cancel', { method: 'POST' });
  });
});

// =============================================
// Business Subscriptions
// =============================================

describe('Business Subscriptions', () => {
  it('getBusinessSubscriptionPlans(id) should GET /businesses/:id/subscription-plans', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, plans: [] });
    await awsAPI.getBusinessSubscriptionPlans('b1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/subscription-plans');
  });

  it('getUserBusinessSubscription(id) should GET /businesses/:id/my-subscription', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, subscription: null });
    await awsAPI.getUserBusinessSubscription('b1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/b1/my-subscription');
  });

  it('createBusinessSubscription should POST /businesses/subscriptions/create', async () => {
    const data = { businessId: 'b1', planId: 'plan1', currency: 'eur' };
    await awsAPI.createBusinessSubscription(data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/subscriptions/create', {
      method: 'POST',
      body: data,
    });
  });

  it('confirmBusinessSubscription should POST /businesses/subscriptions/confirm', async () => {
    const data = { subscriptionId: 'sub1', paymentIntentId: 'pi_123' };
    await awsAPI.confirmBusinessSubscription(data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/subscriptions/confirm', {
      method: 'POST',
      body: data,
    });
  });

  it('getMyBusinessSubscriptions should GET /businesses/subscriptions/my', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, subscriptions: [] });
    await awsAPI.getMyBusinessSubscriptions();
    expect(requestSpy).toHaveBeenCalledWith('/businesses/subscriptions/my');
  });

  it('cancelBusinessSubscription(id) should POST /businesses/subscriptions/:id/cancel', async () => {
    await awsAPI.cancelBusinessSubscription('sub1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/subscriptions/sub1/cancel', { method: 'POST' });
  });

  it('reactivateBusinessSubscription(id) should POST /businesses/subscriptions/:id/reactivate', async () => {
    await awsAPI.reactivateBusinessSubscription('sub1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/subscriptions/sub1/reactivate', { method: 'POST' });
  });
});

// =============================================
// Business Program Management
// =============================================

describe('Business Program Management', () => {
  it('getMyBusinessProgram should GET /businesses/my/program', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, activities: [], schedule: [], tags: [] });
    await awsAPI.getMyBusinessProgram();
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/program');
  });

  it('createBusinessActivity should POST /businesses/my/activities', async () => {
    const data = { name: 'Yoga', day: 'Monday' };
    await awsAPI.createBusinessActivity(data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/activities', {
      method: 'POST',
      body: data,
    });
  });

  it('updateBusinessActivity should PUT /businesses/my/activities/:id', async () => {
    const data = { name: 'Pilates' };
    await awsAPI.updateBusinessActivity('act1', data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/activities/act1', {
      method: 'PUT',
      body: data,
    });
  });

  it('deleteBusinessActivity should DELETE /businesses/my/activities/:id', async () => {
    await awsAPI.deleteBusinessActivity('act1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/activities/act1', { method: 'DELETE' });
  });

  it('createBusinessScheduleSlot should POST /businesses/my/schedule', async () => {
    const data = { day: 'Monday', startTime: '09:00' };
    await awsAPI.createBusinessScheduleSlot(data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/schedule', {
      method: 'POST',
      body: data,
    });
  });

  it('deleteBusinessScheduleSlot should DELETE /businesses/my/schedule/:id', async () => {
    await awsAPI.deleteBusinessScheduleSlot('slot1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/schedule/slot1', { method: 'DELETE' });
  });

  it('addBusinessTag should POST /businesses/my/tags', async () => {
    const data = { name: 'CrossFit', category: 'sport' };
    await awsAPI.addBusinessTag(data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/tags', {
      method: 'POST',
      body: data,
    });
  });

  it('removeBusinessTag should DELETE /businesses/my/tags/:id', async () => {
    await awsAPI.removeBusinessTag('tag1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/tags/tag1', { method: 'DELETE' });
  });
});

// =============================================
// Business QR Code Access System
// =============================================

describe('Business QR Code Access', () => {
  it('getMemberAccessPass should GET /businesses/subscriptions/:id/access-pass', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, accessPass: {} });
    await awsAPI.getMemberAccessPass('sub1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/subscriptions/sub1/access-pass');
  });

  it('validateMemberAccess should POST /businesses/validate-access', async () => {
    const params = { subscriptionId: 'sub1', businessId: 'b1', userId: 'u1' };
    await awsAPI.validateMemberAccess(params);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/validate-access', {
      method: 'POST',
      body: params,
    });
  });

  it('logMemberEntry should POST /businesses/log-entry', async () => {
    const params = { subscriptionId: 'sub1', businessId: 'b1' };
    await awsAPI.logMemberEntry(params);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/log-entry', {
      method: 'POST',
      body: params,
    });
  });
});

// =============================================
// Business Owner Dashboard
// =============================================

describe('Business Owner Dashboard', () => {
  it('getBusinessDashboard should GET /businesses/my/dashboard', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, stats: {} });
    await awsAPI.getBusinessDashboard();
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/dashboard');
  });
});

// =============================================
// Business Services Management
// =============================================

describe('Business Services Management', () => {
  it('createBusinessService should POST /businesses/my/services', async () => {
    const data = { name: 'CrossFit', category: 'fitness', price_cents: 2000, is_subscription: false, is_active: true };
    await awsAPI.createBusinessService(data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/services', {
      method: 'POST',
      body: data,
    });
  });

  it('updateBusinessService should PATCH /businesses/my/services/:id', async () => {
    const data = { name: 'Updated Service' };
    await awsAPI.updateBusinessService('svc1', data);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/services/svc1', {
      method: 'PATCH',
      body: data,
    });
  });

  it('deleteBusinessService should DELETE /businesses/my/services/:id', async () => {
    await awsAPI.deleteBusinessService('svc1');
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/services/svc1', { method: 'DELETE' });
  });
});

// =============================================
// AI Schedule Analysis
// =============================================

describe('AI Schedule Analysis', () => {
  it('analyzeScheduleDocument should POST /businesses/my/analyze-schedule with FormData', async () => {
    const params = { fileUri: 'file:///photo.jpg', fileType: 'image' as const, mimeType: 'image/jpeg' };
    await awsAPI.analyzeScheduleDocument(params);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/analyze-schedule', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });

  it('importScheduleActivities should POST /businesses/my/import-schedule', async () => {
    const params = { activities: [{ name: 'Yoga', day: 'Monday', startTime: '09:00', endTime: '10:00' }] };
    await awsAPI.importScheduleActivities(params);
    expect(requestSpy).toHaveBeenCalledWith('/businesses/my/import-schedule', {
      method: 'POST',
      body: params,
    });
  });
});

// =============================================
// WebSocket Auth
// =============================================

describe('WebSocket Auth', () => {
  it('getWsToken should POST /auth/ws-token', async () => {
    requestSpy.mockResolvedValueOnce({ token: 'ws-token', expiresIn: 300 });
    const result = await awsAPI.getWsToken();
    expect(requestSpy).toHaveBeenCalledWith('/auth/ws-token', { method: 'POST' });
    expect(result).toEqual({ token: 'ws-token', expiresIn: 300 });
  });
});

// =============================================
// Utility Methods
// =============================================

describe('Utility Methods', () => {
  it('getCDNUrl should return full URL for relative paths', () => {
    const result = awsAPI.getCDNUrl('images/photo.jpg');
    expect(result).toBe('https://cdn.test/images/photo.jpg');
  });

  it('getCDNUrl should return path as-is if it starts with http', () => {
    const result = awsAPI.getCDNUrl('https://other.cdn.com/photo.jpg');
    expect(result).toBe('https://other.cdn.com/photo.jpg');
  });
});

// =============================================
// Group Activities
// =============================================

describe('Group Activities API', () => {
  it('createGroup should POST /groups', async () => {
    const data = {
      name: 'Running Group',
      category: 'sport',
      subcategory: 'running',
      latitude: 48.85,
      longitude: 2.35,
      starts_at: '2026-03-01T10:00:00Z',
      is_free: true,
      is_public: true,
      is_fans_only: false,
      is_route: false,
    };
    await awsAPI.createGroup(data);
    expect(requestSpy).toHaveBeenCalledWith('/groups', { method: 'POST', body: data });
  });

  it('getGroups should GET /groups with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, groups: [] });
    await awsAPI.getGroups({ filter: 'upcoming', limit: 10 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('/groups?');
    expect(call).toContain('filter=upcoming');
    expect(call).toContain('limit=10');
  });

  it('getGroup(id) should GET /groups/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, group: {} });
    await awsAPI.getGroup('g1');
    expect(requestSpy).toHaveBeenCalledWith('/groups/g1');
  });

  it('joinGroup(id) should POST /groups/:id/join', async () => {
    await awsAPI.joinGroup('g1');
    expect(requestSpy).toHaveBeenCalledWith('/groups/g1/join', { method: 'POST' });
  });

  it('leaveGroup(id) should DELETE /groups/:id/leave', async () => {
    await awsAPI.leaveGroup('g1');
    expect(requestSpy).toHaveBeenCalledWith('/groups/g1/leave', { method: 'DELETE' });
  });
});

// =============================================
// Spots
// =============================================

describe('Spots API', () => {
  it('createSpot should POST /spots', async () => {
    const data = {
      name: 'Nice Trail',
      category: 'outdoor',
      subcategory: 'trail',
      latitude: 48.85,
      longitude: 2.35,
      is_route: true,
    };
    await awsAPI.createSpot(data);
    expect(requestSpy).toHaveBeenCalledWith('/spots', { method: 'POST', body: data });
  });

  it('getSpot(id) should GET /spots/:id', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, spot: {} });
    await awsAPI.getSpot('sp1');
    expect(requestSpy).toHaveBeenCalledWith('/spots/sp1');
  });

  it('getNearbySpots should GET /spots/nearby with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, data: [] });
    await awsAPI.getNearbySpots({ latitude: 48.85, longitude: 2.35, radiusKm: 5, limit: 10 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('/spots/nearby?');
    expect(call).toContain('lat=48.85');
    expect(call).toContain('lng=2.35');
    expect(call).toContain('radius=5000');
    expect(call).toContain('limit=10');
  });

  it('getNearbySpots with category filter', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, data: [] });
    await awsAPI.getNearbySpots({ latitude: 48.85, longitude: 2.35, category: 'climbing' });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('category=climbing');
  });
});

// =============================================
// Reviews
// =============================================

describe('Reviews API', () => {
  it('createReview should POST /reviews', async () => {
    const data = { target_id: 'sp1', target_type: 'spot' as const, rating: 4, comment: 'Great spot!' };
    await awsAPI.createReview(data);
    expect(requestSpy).toHaveBeenCalledWith('/reviews', { method: 'POST', body: data });
  });

  it('getReviews should GET /reviews with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, reviews: [] });
    await awsAPI.getReviews({ target_id: 'sp1', target_type: 'spot', limit: 10 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('/reviews?');
    expect(call).toContain('target_id=sp1');
    expect(call).toContain('target_type=spot');
    expect(call).toContain('limit=10');
  });
});

// =============================================
// Dynamic Categories
// =============================================

describe('Categories API', () => {
  it('getCategories should GET /categories', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, categories: [] });
    await awsAPI.getCategories();
    expect(requestSpy).toHaveBeenCalledWith('/categories');
  });

  it('suggestSubcategory should POST /categories/suggest', async () => {
    const data = { parent_category: 'sport', name: 'Padel' };
    await awsAPI.suggestSubcategory(data);
    expect(requestSpy).toHaveBeenCalledWith('/categories/suggest', { method: 'POST', body: data });
  });
});

// =============================================
// Live Pins (Map)
// =============================================

describe('Live Pins API', () => {
  it('createLivePin should POST /map/live-pin', async () => {
    const data = { channel_name: 'ch1', title: 'Live!', latitude: 48.85, longitude: 2.35 };
    await awsAPI.createLivePin(data);
    expect(requestSpy).toHaveBeenCalledWith('/map/live-pin', { method: 'POST', body: data });
  });

  it('deleteLivePin should DELETE /map/live-pin', async () => {
    await awsAPI.deleteLivePin();
    expect(requestSpy).toHaveBeenCalledWith('/map/live-pin', { method: 'DELETE' });
  });
});

// =============================================
// Live Streams
// =============================================

describe('Live Streams API', () => {
  it('startLiveStream with title should POST /live-streams/start', async () => {
    await awsAPI.startLiveStream('My Stream');
    expect(requestSpy).toHaveBeenCalledWith('/live-streams/start', {
      method: 'POST',
      body: { title: 'My Stream' },
    });
  });

  it('startLiveStream without title should POST with empty body', async () => {
    await awsAPI.startLiveStream();
    expect(requestSpy).toHaveBeenCalledWith('/live-streams/start', {
      method: 'POST',
      body: {},
    });
  });

  it('endLiveStream should POST /live-streams/end', async () => {
    await awsAPI.endLiveStream();
    expect(requestSpy).toHaveBeenCalledWith('/live-streams/end', { method: 'POST' });
  });

  it('getActiveLiveStreams should GET /live-streams/active', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, data: [] });
    await awsAPI.getActiveLiveStreams();
    expect(requestSpy).toHaveBeenCalledWith('/live-streams/active');
  });

  it('getNearbyLivePins should GET /map/live-pins with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, livePins: [] });
    await awsAPI.getNearbyLivePins({ latitude: 48.85, longitude: 2.35, radiusKm: 5 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('/map/live-pins?');
    expect(call).toContain('latitude=48.85');
    expect(call).toContain('longitude=2.35');
    expect(call).toContain('radiusKm=5');
  });
});

// =============================================
// Map Markers
// =============================================

describe('Map Markers API', () => {
  it('getMapMarkers should GET /map/markers with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, markers: [] });
    await awsAPI.getMapMarkers({ latitude: 48.85, longitude: 2.35, radiusKm: 10, limit: 50 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('/map/markers?');
    expect(call).toContain('latitude=48.85');
    expect(call).toContain('longitude=2.35');
    expect(call).toContain('radiusKm=10');
    expect(call).toContain('limit=50');
  });

  it('getMapMarkers with filters', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, markers: [] });
    await awsAPI.getMapMarkers({ latitude: 48.85, longitude: 2.35, filters: 'coaches,gyms' });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('filters=coaches%2Cgyms');
  });
});

// =============================================
// Map Search
// =============================================

describe('Map Search API', () => {
  it('searchMap should GET /search/map with params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, results: [] });
    await awsAPI.searchMap({ query: 'yoga', latitude: 48.85, longitude: 2.35 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('/search/map?');
    expect(call).toContain('query=yoga');
    expect(call).toContain('latitude=48.85');
    expect(call).toContain('longitude=2.35');
  });

  it('searchMap with all params', async () => {
    requestSpy.mockResolvedValueOnce({ success: true, results: [] });
    await awsAPI.searchMap({ query: 'crossfit', latitude: 48.85, longitude: 2.35, radiusKm: 5, limit: 20 });
    const call = requestSpy.mock.calls[0][0] as string;
    expect(call).toContain('query=crossfit');
    expect(call).toContain('radiusKm=5');
    expect(call).toContain('limit=20');
  });
});

// =============================================
// Response Transformation Tests
// =============================================

describe('Response Transformations', () => {
  it('getPosts maps response.posts to data', async () => {
    requestSpy.mockResolvedValueOnce({ posts: [{ id: '1' }, { id: '2' }], nextCursor: 'c2', hasMore: true, total: 10 });
    const result = await awsAPI.getPosts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(2);
    expect(result.data.nextCursor).toBe('c2');
    expect(result.data.hasMore).toBe(true);
    expect(result.data.total).toBe(10);
  });

  it('getPosts maps response.data to data when posts is missing', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: '1' }], nextCursor: null, hasMore: false });
    const result = await awsAPI.getPosts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(1);
  });

  it('getPosts returns empty array when neither posts nor data exist', async () => {
    requestSpy.mockResolvedValueOnce({});
    const result = await awsAPI.getPosts();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toEqual([]);
    expect(result.data.nextCursor).toBeNull();
    expect(result.data.hasMore).toBe(false);
    expect(result.data.total).toBe(0);
  });

  it('getNotifications maps notifications array (old format)', async () => {
    requestSpy.mockResolvedValueOnce({ notifications: [{ id: 'n1' }], cursor: 'c2', hasMore: true });
    const result = await awsAPI.getNotifications();
    expect(result.data).toEqual([{ id: 'n1' }]);
    expect(result.nextCursor).toBe('c2');
    expect(result.hasMore).toBe(true);
  });

  it('getNotifications maps data array (new format)', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: 'n1' }], nextCursor: 'c2', hasMore: false });
    const result = await awsAPI.getNotifications();
    expect(result.data).toEqual([{ id: 'n1' }]);
    expect(result.nextCursor).toBe('c2');
  });

  it('getFollowers maps followers array to data', async () => {
    requestSpy.mockResolvedValueOnce({ followers: [{ id: 'f1' }], cursor: 'c1', hasMore: true, totalCount: 100 });
    const result = await awsAPI.getFollowers('u1');
    expect(result.data).toEqual([{ id: 'f1' }]);
    expect(result.nextCursor).toBe('c1');
    expect(result.total).toBe(100);
  });

  it('getFollowing maps following array to data', async () => {
    requestSpy.mockResolvedValueOnce({ following: [{ id: 'f2' }], cursor: null, hasMore: false, totalCount: 50 });
    const result = await awsAPI.getFollowing('u1');
    expect(result.data).toEqual([{ id: 'f2' }]);
    expect(result.total).toBe(50);
  });

  it('getNotificationPreferences extracts .preferences from response', async () => {
    const prefs = { likes: true, comments: false, follows: true };
    requestSpy.mockResolvedValueOnce({ success: true, preferences: prefs });
    const result = await awsAPI.getNotificationPreferences();
    expect(result).toEqual(prefs);
  });

  it('updateNotificationPreferences extracts .preferences from response', async () => {
    const prefs = { likes: false, comments: true, follows: true };
    requestSpy.mockResolvedValueOnce({ success: true, preferences: prefs });
    const result = await awsAPI.updateNotificationPreferences({ likes: false } as Partial<NotificationPreferences>);
    expect(result).toEqual(prefs);
  });

  it('searchProfiles maps data and defaults total to 0', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: 'u1' }], nextCursor: 'c2', hasMore: true });
    const result = await awsAPI.searchProfiles('test');
    expect(result.data).toEqual([{ id: 'u1' }]);
    expect(result.total).toBe(0);
    expect(result.nextCursor).toBe('c2');
  });

  it('searchProfiles handles missing data gracefully', async () => {
    requestSpy.mockResolvedValueOnce({});
    const result = await awsAPI.searchProfiles('test');
    expect(result.data).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('getPostLikers handles missing data gracefully', async () => {
    requestSpy.mockResolvedValueOnce({});
    const result = await awsAPI.getPostLikers('p1');
    expect(result.data).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(0);
  });

  it('getFollowingUsers returns following array', async () => {
    requestSpy.mockResolvedValueOnce({ following: [{ id: 'u1' }, { id: 'u2' }] });
    const result = await awsAPI.getFollowingUsers('u1');
    expect(result).toEqual([{ id: 'u1' }, { id: 'u2' }]);
  });

  it('getFollowingUsers falls back to data array', async () => {
    requestSpy.mockResolvedValueOnce({ data: [{ id: 'u3' }] });
    const result = await awsAPI.getFollowingUsers('u1');
    expect(result).toEqual([{ id: 'u3' }]);
  });

  it('getFollowingUsers returns empty array if neither key exists', async () => {
    requestSpy.mockResolvedValueOnce({});
    const result = await awsAPI.getFollowingUsers('u1');
    expect(result).toEqual([]);
  });

  it('getActivityHistory returns defaults on empty response', async () => {
    requestSpy.mockResolvedValueOnce({});
    const result = await awsAPI.getActivityHistory();
    expect(result.data).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(0);
  });
});
