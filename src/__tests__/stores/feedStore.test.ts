/**
 * Feed Store Tests
 *
 * Tests for feedStore: feed cache management, optimistic likes,
 * deletion tracking, staleness checks, and selectors.
 */

import {
  useFeedStore,
  selectFeedCache,
  selectOptimisticLikes,
  selectOptimisticPeakLikes,
  selectDeletedPostIds,
  selectDeletedPeakIds,
  Post,
} from '../../stores/feedStore';

/** Helper to generate a post with a given id and optional overrides */
function makePost(id: string, overrides: Partial<Post> = {}): Post {
  return { id, likes_count: 0, ...overrides };
}

/** Helper to generate N posts with sequential ids */
function makePosts(count: number, prefix = 'post'): Post[] {
  return Array.from({ length: count }, (_, i) => makePost(`${prefix}-${i + 1}`));
}

describe('FeedStore', () => {
  beforeEach(() => {
    // Reset to pristine initial state before every test
    useFeedStore.getState().clearFeed();
  });

  // ==========================================================================
  // 1. Initial State
  // ==========================================================================
  describe('Initial State', () => {
    it('should have an empty feedCache', () => {
      const state = useFeedStore.getState();
      expect(state.feedCache).toEqual([]);
    });

    it('should have null lastFetchTime', () => {
      const state = useFeedStore.getState();
      expect(state.lastFetchTime).toBeNull();
    });

    it('should have empty optimisticLikes', () => {
      const state = useFeedStore.getState();
      expect(state.optimisticLikes).toEqual({});
    });

    it('should have empty optimisticPeakLikes', () => {
      const state = useFeedStore.getState();
      expect(state.optimisticPeakLikes).toEqual({});
    });

    it('should have empty deletedPostIds', () => {
      const state = useFeedStore.getState();
      expect(state.deletedPostIds).toEqual({});
    });

    it('should have empty deletedPeakIds', () => {
      const state = useFeedStore.getState();
      expect(state.deletedPeakIds).toEqual({});
    });
  });

  // ==========================================================================
  // 2. setFeedCache
  // ==========================================================================
  describe('setFeedCache', () => {
    it('should set the feed cache with provided posts', () => {
      const posts = [makePost('a'), makePost('b'), makePost('c')];
      useFeedStore.getState().setFeedCache(posts);

      const state = useFeedStore.getState();
      expect(state.feedCache).toHaveLength(3);
      expect(state.feedCache.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    });

    it('should set lastFetchTime to current timestamp', () => {
      const before = Date.now();
      useFeedStore.getState().setFeedCache([makePost('a')]);
      const after = Date.now();

      const { lastFetchTime } = useFeedStore.getState();
      expect(lastFetchTime).toBeGreaterThanOrEqual(before);
      expect(lastFetchTime).toBeLessThanOrEqual(after);
    });

    it('should cap the cache at 100 posts (MAX_FEED_CACHE)', () => {
      const posts = makePosts(150);
      useFeedStore.getState().setFeedCache(posts);

      const state = useFeedStore.getState();
      expect(state.feedCache).toHaveLength(100);
      // slice(0, 100) means it keeps the FIRST 100
      expect(state.feedCache[0].id).toBe('post-1');
      expect(state.feedCache[99].id).toBe('post-100');
    });

    it('should prune orphaned optimisticLikes not present in new cache', () => {
      // Pre-populate optimistic likes including one that won't be in new cache
      useFeedStore.setState({
        optimisticLikes: { 'a': true, 'b': false, 'orphan': true },
      });

      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);

      const state = useFeedStore.getState();
      expect(state.optimisticLikes).toHaveProperty('a');
      expect(state.optimisticLikes).toHaveProperty('b');
      expect(state.optimisticLikes).not.toHaveProperty('orphan');
    });

    it('should prune orphaned optimisticPeakLikes not present in new cache', () => {
      useFeedStore.setState({
        optimisticPeakLikes: { 'peak-1': true, 'orphan-peak': false },
      });

      useFeedStore.getState().setFeedCache([makePost('peak-1')]);

      const state = useFeedStore.getState();
      expect(state.optimisticPeakLikes).toHaveProperty('peak-1');
      expect(state.optimisticPeakLikes).not.toHaveProperty('orphan-peak');
    });

    it('should replace the entire cache, not merge', () => {
      useFeedStore.getState().setFeedCache([makePost('old-1'), makePost('old-2')]);
      useFeedStore.getState().setFeedCache([makePost('new-1')]);

      const state = useFeedStore.getState();
      expect(state.feedCache).toHaveLength(1);
      expect(state.feedCache[0].id).toBe('new-1');
    });

    it('should handle empty posts array', () => {
      useFeedStore.getState().setFeedCache([makePost('a')]);
      useFeedStore.getState().setFeedCache([]);

      const state = useFeedStore.getState();
      expect(state.feedCache).toEqual([]);
      expect(state.lastFetchTime).not.toBeNull();
    });
  });

  // ==========================================================================
  // 3. appendToFeed
  // ==========================================================================
  describe('appendToFeed', () => {
    it('should append new posts to the end', () => {
      useFeedStore.getState().setFeedCache([makePost('a')]);
      useFeedStore.getState().appendToFeed([makePost('b'), makePost('c')]);

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['a', 'b', 'c']);
    });

    it('should deduplicate posts already in cache', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);
      useFeedStore.getState().appendToFeed([makePost('b'), makePost('c')]);

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['a', 'b', 'c']);
    });

    it('should cap combined length at 100 (MAX_FEED_CACHE)', () => {
      const initial = makePosts(90, 'init');
      useFeedStore.getState().setFeedCache(initial);

      const extra = makePosts(20, 'extra');
      useFeedStore.getState().appendToFeed(extra);

      const state = useFeedStore.getState();
      expect(state.feedCache).toHaveLength(100);
    });

    it('should keep the LAST 100 posts when capping (drops oldest)', () => {
      const initial = makePosts(90, 'init');
      useFeedStore.getState().setFeedCache(initial);

      const extra = makePosts(20, 'extra');
      useFeedStore.getState().appendToFeed(extra);

      const state = useFeedStore.getState();
      // combined = 90 + 20 = 110, keeps last 100 => drops first 10
      expect(state.feedCache[0].id).toBe('init-11');
      expect(state.feedCache[state.feedCache.length - 1].id).toBe('extra-20');
    });

    it('should handle appending empty array', () => {
      useFeedStore.getState().setFeedCache([makePost('a')]);
      useFeedStore.getState().appendToFeed([]);

      expect(useFeedStore.getState().feedCache).toHaveLength(1);
    });

    it('should handle appending when cache is empty', () => {
      useFeedStore.getState().appendToFeed([makePost('a'), makePost('b')]);

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['a', 'b']);
    });

    it('should handle all duplicates (no new unique posts)', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);
      useFeedStore.getState().appendToFeed([makePost('a'), makePost('b')]);

      expect(useFeedStore.getState().feedCache).toHaveLength(2);
    });
  });

  // ==========================================================================
  // 4. prependToFeed
  // ==========================================================================
  describe('prependToFeed', () => {
    it('should add a post to the beginning of the cache', () => {
      useFeedStore.getState().setFeedCache([makePost('b'), makePost('c')]);
      useFeedStore.getState().prependToFeed(makePost('a'));

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['a', 'b', 'c']);
    });

    it('should cap the cache at 100 (MAX_FEED_CACHE), dropping from the end', () => {
      const initial = makePosts(100);
      useFeedStore.getState().setFeedCache(initial);

      useFeedStore.getState().prependToFeed(makePost('new-first'));

      const state = useFeedStore.getState();
      expect(state.feedCache).toHaveLength(100);
      expect(state.feedCache[0].id).toBe('new-first');
      // The last post (post-100) should have been dropped
      expect(state.feedCache[99].id).toBe('post-99');
    });

    it('should work when cache is empty', () => {
      useFeedStore.getState().prependToFeed(makePost('solo'));

      expect(useFeedStore.getState().feedCache).toHaveLength(1);
      expect(useFeedStore.getState().feedCache[0].id).toBe('solo');
    });
  });

  // ==========================================================================
  // 5. removeFromFeed
  // ==========================================================================
  describe('removeFromFeed', () => {
    it('should remove a post by id', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b'), makePost('c')]);
      useFeedStore.getState().removeFromFeed('b');

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['a', 'c']);
    });

    it('should be a no-op if post id is not found', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);
      useFeedStore.getState().removeFromFeed('nonexistent');

      expect(useFeedStore.getState().feedCache).toHaveLength(2);
    });

    it('should handle removing from empty cache', () => {
      useFeedStore.getState().removeFromFeed('whatever');
      expect(useFeedStore.getState().feedCache).toEqual([]);
    });

    it('should only remove the first matching post (splice removes one)', () => {
      // Even though IDs should be unique, test the splice behavior
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);
      useFeedStore.getState().removeFromFeed('a');

      expect(useFeedStore.getState().feedCache).toHaveLength(1);
      expect(useFeedStore.getState().feedCache[0].id).toBe('b');
    });
  });

  // ==========================================================================
  // 6. markPostDeleted
  // ==========================================================================
  describe('markPostDeleted', () => {
    it('should add postId to deletedPostIds', () => {
      useFeedStore.getState().markPostDeleted('post-42');

      expect(useFeedStore.getState().deletedPostIds['post-42']).toBe(true);
    });

    it('should remove the post from feedCache', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b'), makePost('c')]);
      useFeedStore.getState().markPostDeleted('b');

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['a', 'c']);
    });

    it('should mark as deleted even if post is not in cache', () => {
      useFeedStore.getState().markPostDeleted('not-in-cache');

      expect(useFeedStore.getState().deletedPostIds['not-in-cache']).toBe(true);
      expect(useFeedStore.getState().feedCache).toEqual([]);
    });

    it('should handle marking the same post deleted twice', () => {
      useFeedStore.getState().setFeedCache([makePost('a')]);
      useFeedStore.getState().markPostDeleted('a');
      useFeedStore.getState().markPostDeleted('a');

      expect(useFeedStore.getState().deletedPostIds['a']).toBe(true);
      expect(useFeedStore.getState().feedCache).toEqual([]);
    });
  });

  // ==========================================================================
  // 7. markPeakDeleted
  // ==========================================================================
  describe('markPeakDeleted', () => {
    it('should add peakId to deletedPeakIds', () => {
      useFeedStore.getState().markPeakDeleted('peak-7');

      expect(useFeedStore.getState().deletedPeakIds['peak-7']).toBe(true);
    });

    it('should NOT remove anything from feedCache (peaks are separate)', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);
      useFeedStore.getState().markPeakDeleted('peak-7');

      expect(useFeedStore.getState().feedCache).toHaveLength(2);
    });

    it('should handle marking the same peak deleted twice', () => {
      useFeedStore.getState().markPeakDeleted('peak-1');
      useFeedStore.getState().markPeakDeleted('peak-1');

      expect(useFeedStore.getState().deletedPeakIds['peak-1']).toBe(true);
    });
  });

  // ==========================================================================
  // 8. toggleLikeOptimistic
  // ==========================================================================
  describe('toggleLikeOptimistic', () => {
    it('should set the optimistic like state', () => {
      useFeedStore.getState().setFeedCache([makePost('post-1', { likes_count: 5 })]);
      useFeedStore.getState().toggleLikeOptimistic('post-1', true);

      expect(useFeedStore.getState().optimisticLikes['post-1']).toBe(true);
    });

    it('should increment likes_count when liked', () => {
      useFeedStore.getState().setFeedCache([makePost('post-1', { likes_count: 5 })]);
      useFeedStore.getState().toggleLikeOptimistic('post-1', true);

      const post = useFeedStore.getState().feedCache.find((p) => p.id === 'post-1');
      expect(post?.likes_count).toBe(6);
    });

    it('should decrement likes_count when unliked', () => {
      useFeedStore.getState().setFeedCache([makePost('post-1', { likes_count: 5 })]);
      useFeedStore.getState().toggleLikeOptimistic('post-1', false);

      const post = useFeedStore.getState().feedCache.find((p) => p.id === 'post-1');
      expect(post?.likes_count).toBe(4);
    });

    it('should never let likes_count go below 0', () => {
      useFeedStore.getState().setFeedCache([makePost('post-1', { likes_count: 0 })]);
      useFeedStore.getState().toggleLikeOptimistic('post-1', false);

      const post = useFeedStore.getState().feedCache.find((p) => p.id === 'post-1');
      expect(post?.likes_count).toBe(0);
    });

    it('should handle undefined likes_count (treat as 0)', () => {
      useFeedStore.getState().setFeedCache([{ id: 'post-1' }]); // no likes_count
      useFeedStore.getState().toggleLikeOptimistic('post-1', true);

      const post = useFeedStore.getState().feedCache.find((p) => p.id === 'post-1');
      expect(post?.likes_count).toBe(1);
    });

    it('should handle undefined likes_count when unliking (clamped to 0)', () => {
      useFeedStore.getState().setFeedCache([{ id: 'post-1' }]); // no likes_count
      useFeedStore.getState().toggleLikeOptimistic('post-1', false);

      const post = useFeedStore.getState().feedCache.find((p) => p.id === 'post-1');
      expect(post?.likes_count).toBe(0);
    });

    it('should be idempotent - skip if already in desired like state', () => {
      useFeedStore.getState().setFeedCache([makePost('post-1', { likes_count: 5 })]);
      useFeedStore.getState().toggleLikeOptimistic('post-1', true);

      // Second call with same state should be a no-op
      useFeedStore.getState().toggleLikeOptimistic('post-1', true);

      const post = useFeedStore.getState().feedCache.find((p) => p.id === 'post-1');
      // Should only have incremented once, not twice
      expect(post?.likes_count).toBe(6);
    });

    it('should allow toggling from true to false', () => {
      useFeedStore.getState().setFeedCache([makePost('post-1', { likes_count: 5 })]);
      useFeedStore.getState().toggleLikeOptimistic('post-1', true);
      useFeedStore.getState().toggleLikeOptimistic('post-1', false);

      const post = useFeedStore.getState().feedCache.find((p) => p.id === 'post-1');
      expect(post?.likes_count).toBe(5); // +1 then -1 = net 0
      expect(useFeedStore.getState().optimisticLikes['post-1']).toBe(false);
    });

    it('should set optimistic state even if post is not in cache', () => {
      useFeedStore.getState().toggleLikeOptimistic('not-in-cache', true);

      expect(useFeedStore.getState().optimisticLikes['not-in-cache']).toBe(true);
    });
  });

  // ==========================================================================
  // 9. setPeakLikeOverride
  // ==========================================================================
  describe('setPeakLikeOverride', () => {
    it('should set the peak like override to true', () => {
      useFeedStore.getState().setPeakLikeOverride('peak-1', true);

      expect(useFeedStore.getState().optimisticPeakLikes['peak-1']).toBe(true);
    });

    it('should set the peak like override to false', () => {
      useFeedStore.getState().setPeakLikeOverride('peak-1', false);

      expect(useFeedStore.getState().optimisticPeakLikes['peak-1']).toBe(false);
    });

    it('should overwrite previous value', () => {
      useFeedStore.getState().setPeakLikeOverride('peak-1', true);
      useFeedStore.getState().setPeakLikeOverride('peak-1', false);

      expect(useFeedStore.getState().optimisticPeakLikes['peak-1']).toBe(false);
    });

    it('should handle multiple peaks independently', () => {
      useFeedStore.getState().setPeakLikeOverride('peak-1', true);
      useFeedStore.getState().setPeakLikeOverride('peak-2', false);

      expect(useFeedStore.getState().optimisticPeakLikes['peak-1']).toBe(true);
      expect(useFeedStore.getState().optimisticPeakLikes['peak-2']).toBe(false);
    });
  });

  // ==========================================================================
  // 10. clearOptimisticLikes / clearOptimisticPeakLikes
  // ==========================================================================
  describe('clearOptimisticLikes', () => {
    it('should remove specified post ids from optimisticLikes', () => {
      useFeedStore.setState({
        optimisticLikes: { 'a': true, 'b': false, 'c': true },
      });

      useFeedStore.getState().clearOptimisticLikes(['a', 'c']);

      const state = useFeedStore.getState();
      expect(state.optimisticLikes).not.toHaveProperty('a');
      expect(state.optimisticLikes).toHaveProperty('b');
      expect(state.optimisticLikes).not.toHaveProperty('c');
    });

    it('should handle clearing ids that do not exist (no-op for missing)', () => {
      useFeedStore.setState({
        optimisticLikes: { 'a': true },
      });

      useFeedStore.getState().clearOptimisticLikes(['nonexistent']);

      expect(useFeedStore.getState().optimisticLikes).toHaveProperty('a');
    });

    it('should handle empty array', () => {
      useFeedStore.setState({
        optimisticLikes: { 'a': true },
      });

      useFeedStore.getState().clearOptimisticLikes([]);

      expect(useFeedStore.getState().optimisticLikes).toHaveProperty('a');
    });
  });

  describe('clearOptimisticPeakLikes', () => {
    it('should remove specified peak ids from optimisticPeakLikes', () => {
      useFeedStore.setState({
        optimisticPeakLikes: { 'p1': true, 'p2': false, 'p3': true },
      });

      useFeedStore.getState().clearOptimisticPeakLikes(['p1', 'p3']);

      const state = useFeedStore.getState();
      expect(state.optimisticPeakLikes).not.toHaveProperty('p1');
      expect(state.optimisticPeakLikes).toHaveProperty('p2');
      expect(state.optimisticPeakLikes).not.toHaveProperty('p3');
    });

    it('should handle clearing ids that do not exist', () => {
      useFeedStore.setState({
        optimisticPeakLikes: { 'p1': true },
      });

      useFeedStore.getState().clearOptimisticPeakLikes(['nonexistent']);

      expect(useFeedStore.getState().optimisticPeakLikes).toHaveProperty('p1');
    });

    it('should handle empty array', () => {
      useFeedStore.setState({
        optimisticPeakLikes: { 'p1': true },
      });

      useFeedStore.getState().clearOptimisticPeakLikes([]);

      expect(useFeedStore.getState().optimisticPeakLikes).toHaveProperty('p1');
    });
  });

  // ==========================================================================
  // 11. cleanOrphanedOptimistic
  // ==========================================================================
  describe('cleanOrphanedOptimistic', () => {
    it('should remove optimisticLikes not present in feedCache', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);
      useFeedStore.setState({
        optimisticLikes: { 'a': true, 'b': false, 'orphan': true },
      });

      useFeedStore.getState().cleanOrphanedOptimistic();

      const state = useFeedStore.getState();
      expect(state.optimisticLikes).toHaveProperty('a');
      expect(state.optimisticLikes).toHaveProperty('b');
      expect(state.optimisticLikes).not.toHaveProperty('orphan');
    });

    it('should remove optimisticPeakLikes not present in feedCache', () => {
      useFeedStore.getState().setFeedCache([makePost('x')]);
      useFeedStore.setState({
        optimisticPeakLikes: { 'x': true, 'orphan-peak': false },
      });

      useFeedStore.getState().cleanOrphanedOptimistic();

      const state = useFeedStore.getState();
      expect(state.optimisticPeakLikes).toHaveProperty('x');
      expect(state.optimisticPeakLikes).not.toHaveProperty('orphan-peak');
    });

    it('should clear all optimistic state when cache is empty', () => {
      useFeedStore.setState({
        optimisticLikes: { 'a': true, 'b': false },
        optimisticPeakLikes: { 'p1': true },
      });

      useFeedStore.getState().cleanOrphanedOptimistic();

      expect(useFeedStore.getState().optimisticLikes).toEqual({});
      expect(useFeedStore.getState().optimisticPeakLikes).toEqual({});
    });

    it('should be a no-op when there are no orphaned entries', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);
      useFeedStore.setState({
        optimisticLikes: { 'a': true },
        optimisticPeakLikes: { 'b': false },
      });

      useFeedStore.getState().cleanOrphanedOptimistic();

      expect(useFeedStore.getState().optimisticLikes).toEqual({ 'a': true });
      expect(useFeedStore.getState().optimisticPeakLikes).toEqual({ 'b': false });
    });
  });

  // ==========================================================================
  // 12. purgeUserContent
  // ==========================================================================
  describe('purgeUserContent', () => {
    it('should remove posts with matching authorId (camelCase)', () => {
      useFeedStore.getState().setFeedCache([
        makePost('p1', { authorId: 'user-A' }),
        makePost('p2', { authorId: 'user-B' }),
        makePost('p3', { authorId: 'user-A' }),
      ]);

      useFeedStore.getState().purgeUserContent('user-A');

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['p2']);
    });

    it('should remove posts with matching author_id (snake_case)', () => {
      useFeedStore.getState().setFeedCache([
        makePost('p1', { author_id: 'user-X' }),
        makePost('p2', { author_id: 'user-Y' }),
      ]);

      useFeedStore.getState().purgeUserContent('user-X');

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['p2']);
    });

    it('should remove posts matching either authorId or author_id', () => {
      useFeedStore.getState().setFeedCache([
        makePost('p1', { authorId: 'user-Z' }),
        makePost('p2', { author_id: 'user-Z' }),
        makePost('p3', { authorId: 'safe-user' }),
      ]);

      useFeedStore.getState().purgeUserContent('user-Z');

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['p3']);
    });

    it('should be a no-op if no posts match the userId', () => {
      useFeedStore.getState().setFeedCache([makePost('p1'), makePost('p2')]);
      useFeedStore.getState().purgeUserContent('nonexistent-user');

      expect(useFeedStore.getState().feedCache).toHaveLength(2);
    });

    it('should handle empty cache', () => {
      useFeedStore.getState().purgeUserContent('any-user');

      expect(useFeedStore.getState().feedCache).toEqual([]);
    });
  });

  // ==========================================================================
  // 13. clearFeed
  // ==========================================================================
  describe('clearFeed', () => {
    it('should reset feedCache to empty array', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b')]);
      useFeedStore.getState().clearFeed();

      expect(useFeedStore.getState().feedCache).toEqual([]);
    });

    it('should reset lastFetchTime to null', () => {
      useFeedStore.getState().setFeedCache([makePost('a')]);
      expect(useFeedStore.getState().lastFetchTime).not.toBeNull();

      useFeedStore.getState().clearFeed();
      expect(useFeedStore.getState().lastFetchTime).toBeNull();
    });

    it('should reset optimisticLikes to empty object', () => {
      useFeedStore.setState({ optimisticLikes: { 'a': true, 'b': false } });
      useFeedStore.getState().clearFeed();

      expect(useFeedStore.getState().optimisticLikes).toEqual({});
    });

    it('should reset optimisticPeakLikes to empty object', () => {
      useFeedStore.setState({ optimisticPeakLikes: { 'p1': true } });
      useFeedStore.getState().clearFeed();

      expect(useFeedStore.getState().optimisticPeakLikes).toEqual({});
    });

    it('should reset deletedPostIds to empty object', () => {
      useFeedStore.getState().markPostDeleted('post-1');
      useFeedStore.getState().clearFeed();

      expect(useFeedStore.getState().deletedPostIds).toEqual({});
    });

    it('should reset deletedPeakIds to empty object', () => {
      useFeedStore.getState().markPeakDeleted('peak-1');
      useFeedStore.getState().clearFeed();

      expect(useFeedStore.getState().deletedPeakIds).toEqual({});
    });

    it('should produce a completely pristine state', () => {
      // Populate everything
      useFeedStore.getState().setFeedCache([makePost('a')]);
      useFeedStore.getState().toggleLikeOptimistic('a', true);
      useFeedStore.getState().setPeakLikeOverride('peak-1', true);
      useFeedStore.getState().markPostDeleted('a');
      useFeedStore.getState().markPeakDeleted('peak-1');

      useFeedStore.getState().clearFeed();

      const state = useFeedStore.getState();
      expect(state.feedCache).toEqual([]);
      expect(state.lastFetchTime).toBeNull();
      expect(state.optimisticLikes).toEqual({});
      expect(state.optimisticPeakLikes).toEqual({});
      expect(state.deletedPostIds).toEqual({});
      expect(state.deletedPeakIds).toEqual({});
    });
  });

  // ==========================================================================
  // 14. isCacheStale
  // ==========================================================================
  describe('isCacheStale', () => {
    it('should return true when lastFetchTime is null', () => {
      expect(useFeedStore.getState().isCacheStale()).toBe(true);
    });

    it('should return false when lastFetchTime is recent (within 5 min)', () => {
      useFeedStore.getState().setFeedCache([makePost('a')]);

      expect(useFeedStore.getState().isCacheStale()).toBe(false);
    });

    it('should return true when lastFetchTime is older than 5 minutes', () => {
      const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
      useFeedStore.setState({ lastFetchTime: sixMinutesAgo });

      expect(useFeedStore.getState().isCacheStale()).toBe(true);
    });

    it('should return false at exactly 5 minutes (boundary test)', () => {
      // At exactly 5 min, Date.now() - lastFetchTime === 5 * 60 * 1000
      // The condition is > (strictly greater), so exactly 5 min is NOT stale
      const exactlyFiveMin = Date.now() - 5 * 60 * 1000;
      useFeedStore.setState({ lastFetchTime: exactlyFiveMin });

      expect(useFeedStore.getState().isCacheStale()).toBe(false);
    });

    it('should return true at 5 minutes + 1 ms', () => {
      const justOverFiveMin = Date.now() - (5 * 60 * 1000 + 1);
      useFeedStore.setState({ lastFetchTime: justOverFiveMin });

      expect(useFeedStore.getState().isCacheStale()).toBe(true);
    });
  });

  // ==========================================================================
  // 15. Selectors
  // ==========================================================================
  describe('Selectors', () => {
    it('selectFeedCache should return feedCache', () => {
      const posts = [makePost('a'), makePost('b')];
      useFeedStore.getState().setFeedCache(posts);

      const state = useFeedStore.getState();
      expect(selectFeedCache(state)).toBe(state.feedCache);
      expect(selectFeedCache(state)).toHaveLength(2);
    });

    it('selectOptimisticLikes should return optimisticLikes', () => {
      useFeedStore.setState({ optimisticLikes: { 'x': true } });

      const state = useFeedStore.getState();
      expect(selectOptimisticLikes(state)).toBe(state.optimisticLikes);
      expect(selectOptimisticLikes(state)).toEqual({ 'x': true });
    });

    it('selectOptimisticPeakLikes should return optimisticPeakLikes', () => {
      useFeedStore.setState({ optimisticPeakLikes: { 'p1': false } });

      const state = useFeedStore.getState();
      expect(selectOptimisticPeakLikes(state)).toBe(state.optimisticPeakLikes);
      expect(selectOptimisticPeakLikes(state)).toEqual({ 'p1': false });
    });

    it('selectDeletedPostIds should return deletedPostIds', () => {
      useFeedStore.getState().markPostDeleted('post-99');

      const state = useFeedStore.getState();
      expect(selectDeletedPostIds(state)).toBe(state.deletedPostIds);
      expect(selectDeletedPostIds(state)).toEqual({ 'post-99': true });
    });

    it('selectDeletedPeakIds should return deletedPeakIds', () => {
      useFeedStore.getState().markPeakDeleted('peak-55');

      const state = useFeedStore.getState();
      expect(selectDeletedPeakIds(state)).toBe(state.deletedPeakIds);
      expect(selectDeletedPeakIds(state)).toEqual({ 'peak-55': true });
    });

    it('selectors should return empty initial state', () => {
      const state = useFeedStore.getState();
      expect(selectFeedCache(state)).toEqual([]);
      expect(selectOptimisticLikes(state)).toEqual({});
      expect(selectOptimisticPeakLikes(state)).toEqual({});
      expect(selectDeletedPostIds(state)).toEqual({});
      expect(selectDeletedPeakIds(state)).toEqual({});
    });
  });

  // ==========================================================================
  // 16. MAX_DELETED_IDS pruning
  // ==========================================================================
  describe('MAX_DELETED_IDS pruning (>200 entries get trimmed)', () => {
    it('should prune deletedPostIds when exceeding 200 entries on setFeedCache', () => {
      // Build a deletedPostIds map with 210 entries
      const deletedPostIds: Record<string, true> = {};
      for (let i = 1; i <= 210; i++) {
        deletedPostIds[`deleted-post-${i}`] = true;
      }
      useFeedStore.setState({ deletedPostIds });

      // Trigger pruning via setFeedCache
      useFeedStore.getState().setFeedCache([makePost('new-post')]);

      const state = useFeedStore.getState();
      const remainingKeys = Object.keys(state.deletedPostIds);
      expect(remainingKeys.length).toBe(200);
    });

    it('should prune deletedPeakIds when exceeding 200 entries on setFeedCache', () => {
      const deletedPeakIds: Record<string, true> = {};
      for (let i = 1; i <= 250; i++) {
        deletedPeakIds[`deleted-peak-${i}`] = true;
      }
      useFeedStore.setState({ deletedPeakIds });

      useFeedStore.getState().setFeedCache([makePost('new-post')]);

      const state = useFeedStore.getState();
      const remainingKeys = Object.keys(state.deletedPeakIds);
      expect(remainingKeys.length).toBe(200);
    });

    it('should NOT prune when exactly at 200 entries', () => {
      const deletedPostIds: Record<string, true> = {};
      for (let i = 1; i <= 200; i++) {
        deletedPostIds[`deleted-post-${i}`] = true;
      }
      useFeedStore.setState({ deletedPostIds });

      useFeedStore.getState().setFeedCache([makePost('new-post')]);

      const state = useFeedStore.getState();
      expect(Object.keys(state.deletedPostIds).length).toBe(200);
    });

    it('should remove the OLDEST entries (beginning of the keys) when pruning', () => {
      const deletedPostIds: Record<string, true> = {};
      for (let i = 1; i <= 210; i++) {
        deletedPostIds[`dp-${i}`] = true;
      }
      useFeedStore.setState({ deletedPostIds });

      useFeedStore.getState().setFeedCache([]);

      const state = useFeedStore.getState();
      const keys = Object.keys(state.deletedPostIds);
      // 210 - 200 = 10 entries removed from the beginning
      // The first 10 (dp-1 through dp-10) should be pruned
      expect(keys.length).toBe(200);
      expect(state.deletedPostIds['dp-1']).toBeUndefined();
      expect(state.deletedPostIds['dp-10']).toBeUndefined();
      expect(state.deletedPostIds['dp-11']).toBe(true);
      expect(state.deletedPostIds['dp-210']).toBe(true);
    });

    it('should prune both deletedPostIds and deletedPeakIds in the same setFeedCache call', () => {
      const deletedPostIds: Record<string, true> = {};
      const deletedPeakIds: Record<string, true> = {};
      for (let i = 1; i <= 205; i++) {
        deletedPostIds[`post-${i}`] = true;
        deletedPeakIds[`peak-${i}`] = true;
      }
      useFeedStore.setState({ deletedPostIds, deletedPeakIds });

      useFeedStore.getState().setFeedCache([]);

      const state = useFeedStore.getState();
      expect(Object.keys(state.deletedPostIds).length).toBe(200);
      expect(Object.keys(state.deletedPeakIds).length).toBe(200);
    });
  });

  // ==========================================================================
  // Edge Cases & Integration
  // ==========================================================================
  describe('Edge Cases', () => {
    it('should handle rapid sequential operations', () => {
      useFeedStore.getState().setFeedCache([
        makePost('p1', { likes_count: 10 }),
        makePost('p2', { likes_count: 5 }),
      ]);

      // Like, unlike, like again
      useFeedStore.getState().toggleLikeOptimistic('p1', true);  // 11
      useFeedStore.getState().toggleLikeOptimistic('p1', false); // 10
      useFeedStore.getState().toggleLikeOptimistic('p1', true);  // 11

      const post = useFeedStore.getState().feedCache.find((p) => p.id === 'p1');
      expect(post?.likes_count).toBe(11);
    });

    it('should maintain state consistency across multiple action types', () => {
      // Set initial cache
      useFeedStore.getState().setFeedCache([
        makePost('p1', { authorId: 'user-A', likes_count: 3 }),
        makePost('p2', { authorId: 'user-B', likes_count: 7 }),
        makePost('p3', { authorId: 'user-A', likes_count: 1 }),
      ]);

      // Like p1
      useFeedStore.getState().toggleLikeOptimistic('p1', true);
      // Delete p2
      useFeedStore.getState().markPostDeleted('p2');
      // Prepend a new post
      useFeedStore.getState().prependToFeed(makePost('p4', { authorId: 'user-C' }));

      const state = useFeedStore.getState();
      expect(state.feedCache.map((p) => p.id)).toEqual(['p4', 'p1', 'p3']);
      expect(state.deletedPostIds['p2']).toBe(true);
      expect(state.optimisticLikes['p1']).toBe(true);
      expect(state.feedCache.find((p) => p.id === 'p1')?.likes_count).toBe(4);
    });

    it('appendToFeed with a mix of duplicates and new posts', () => {
      useFeedStore.getState().setFeedCache([makePost('a'), makePost('b'), makePost('c')]);
      useFeedStore.getState().appendToFeed([makePost('b'), makePost('d'), makePost('a'), makePost('e')]);

      const ids = useFeedStore.getState().feedCache.map((p) => p.id);
      expect(ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    it('should handle setFeedCache with posts that have no likes_count', () => {
      useFeedStore.getState().setFeedCache([{ id: 'no-likes' }]);

      const post = useFeedStore.getState().feedCache[0];
      expect(post.id).toBe('no-likes');
      expect(post.likes_count).toBeUndefined();
    });
  });
});
