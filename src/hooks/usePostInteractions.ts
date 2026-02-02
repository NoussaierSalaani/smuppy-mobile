import { useCallback, Dispatch, SetStateAction } from 'react';

import { likePost, unlikePost, savePost, unsavePost } from '../services/database';

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
}

/**
 * Shared hook for optimistic like/save with rollback.
 * Works with any post type that satisfies `InteractablePost`.
 */
export function usePostInteractions<T extends InteractablePost>({
  setPosts,
  onLike,
}: UsePostInteractionsOptions<T>) {
  const toggleLike = useCallback(async (postId: string) => {
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
          likes: p.isLiked ? p.likes - 1 : p.likes + 1,
        };
      });
    });

    try {
      if (wasLiked) {
        const { error } = await unlikePost(postId);
        if (error) {
          // Revert
          setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, isLiked: true, likes: p.likes + 1 } : p
          ));
        }
      } else {
        const { error } = await likePost(postId);
        if (error) {
          // Revert
          setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, isLiked: false, likes: p.likes - 1 } : p
          ));
        } else {
          onLike?.(postId);
        }
      }
    } catch (err) {
      if (__DEV__) console.error('[usePostInteractions] Like error:', err);
    }
  }, [setPosts, onLike]);

  const toggleSave = useCallback(async (postId: string) => {
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
      } else {
        const { error } = await savePost(postId);
        if (error) throw new Error(error);
      }
    } catch {
      // Rollback
      setPosts(prev => prev.map(p => {
        if (p.id !== postId) return p;
        return {
          ...p,
          isSaved: wasSaved,
          saves: (p.saves ?? 0) + (wasSaved ? 1 : -1),
        };
      }));
    }
  }, [setPosts]);

  return { toggleLike, toggleSave };
}
