import { useCallback, useRef, Dispatch, SetStateAction } from 'react';

import { likePost, savePost, unsavePost } from '../services/database';
import { useFeedStore } from '../stores/feedStore';

/**
 * Minimal post shape required for like/save interactions.
 */
interface InteractablePost {
  id: string;
  isLiked: boolean;
  likes: number;
  isSaved?: boolean;
  saves?: number;
}

interface UsePostInteractionsOptions<T extends InteractablePost> {
  setPosts: Dispatch<SetStateAction<T[]>>;
  /** Optional callback fired after a successful like (not unlike). */
  onLike?: (postId: string) => void;
  /** Optional callback fired after a successful save toggle. */
  onSaveToggle?: (postId: string, saved: boolean) => void;
  /** Optional callback fired when a like or save fails (for user feedback). */
  onError?: (action: 'like' | 'save', postId: string) => void;
}

/**
 * Shared hook for optimistic like/save with rollback.
 * Works with any post type that satisfies `InteractablePost`.
 */
export function usePostInteractions<T extends InteractablePost>({
  setPosts,
  onLike,
  onSaveToggle,
  onError,
}: UsePostInteractionsOptions<T>) {
  // Pending sets to prevent spam — skip if a like/save is already in-flight
  const pendingLikes = useRef(new Set<string>());
  const pendingSaves = useRef(new Set<string>());

  const toggleLike = useCallback(async (postId: string) => {
    // Prevent concurrent like requests for the same post
    if (pendingLikes.current.has(postId)) return;
    pendingLikes.current.add(postId);

    let wasLiked = false;

    // Optimistic update + capture previous state
    setPosts(prev => {
      const post = prev.find(p => p.id === postId);
      if (post) wasLiked = post.isLiked;

      return prev.map(p => {
        if (p.id !== postId) return p;
        return {
          ...p,
          isLiked: !p.isLiked,
          likes: Math.max(0, p.isLiked ? p.likes - 1 : p.likes + 1),
        };
      });
    });

    try {
      // Single toggle endpoint: backend returns { liked: true/false }
      const { error } = await likePost(postId);
      if (error) {
        // Revert optimistic update in both local state and feed store atomically
        setPosts(prev => prev.map(p => {
          if (p.id !== postId) return p;
          const revertedLikes = wasLiked ? p.likes + 1 : Math.max(0, p.likes - 1);
          return { ...p, isLiked: wasLiked, likes: revertedLikes };
        }));
        useFeedStore.getState().toggleLikeOptimistic(postId, wasLiked);
        onError?.('like', postId);
      } else {
        if (!wasLiked) {
          onLike?.(postId);
        }
        // Sync to feed store for cross-screen consistency
        useFeedStore.getState().toggleLikeOptimistic(postId, !wasLiked);
      }
    } catch (err) {
      if (__DEV__) console.warn('[usePostInteractions] Like error:', err);
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        const revertedLikes = wasLiked ? p.likes + 1 : Math.max(0, p.likes - 1);
        return { ...p, isLiked: wasLiked, likes: revertedLikes };
      }));
      useFeedStore.getState().toggleLikeOptimistic(postId, wasLiked);
      onError?.('like', postId);
    } finally {
      pendingLikes.current.delete(postId);
    }
  }, [setPosts, onLike, onError]);

  const toggleSave = useCallback(async (postId: string) => {
    // Prevent concurrent save requests for the same post
    if (pendingSaves.current.has(postId)) return;
    pendingSaves.current.add(postId);

    let wasSaved = false;

    setPosts(prev => {
      const post = prev.find(p => p.id === postId);
      if (post) wasSaved = post.isSaved ?? false;

      return prev.map(p => {
        if (p.id !== postId) return p;
        return {
          ...p,
          isSaved: !(p.isSaved ?? false),
          saves: (p.saves ?? 0) + ((p.isSaved ?? false) ? -1 : 1),
        };
      });
    });

    try {
      if (wasSaved) {
        const { error } = await unsavePost(postId);
        if (error) throw new Error(error);
        onSaveToggle?.(postId, false);
      } else {
        const { error } = await savePost(postId);
        if (error) throw new Error(error);
        onSaveToggle?.(postId, true);
      }
      // Sync to feed store for cross-screen consistency
      useFeedStore.getState().toggleSaveOptimistic(postId, !wasSaved);
    } catch {
      // Rollback local state + feed store
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return {
          ...p,
          isSaved: wasSaved,
          saves: (p.saves ?? 0) + (wasSaved ? 1 : -1),
        };
      }));
      useFeedStore.getState().toggleSaveOptimistic(postId, wasSaved);
      onError?.('save', postId);
    } finally {
      pendingSaves.current.delete(postId);
    }
  }, [setPosts, onSaveToggle, onError]);

  return { toggleLike, toggleSave };
}
