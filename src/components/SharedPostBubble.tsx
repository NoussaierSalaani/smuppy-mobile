import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import OptimizedImage, { AvatarImage } from './OptimizedImage';
import { AccountBadge } from './Badge';
import { SPACING } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import { getPostById, Post } from '../services/database';
import { resolveDisplayName } from '../types/profile';

type SharedPostBubbleProps = Readonly<{
  postId: string;
  isFromMe: boolean;
}>;


function SharedPostBubble({ postId, isFromMe }: SharedPostBubbleProps) {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    // Validate postId before loading
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!postId || !uuidPattern.test(postId)) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadPost = async () => {
      setLoading(true);
      try {
        const { data, error: fetchError } = await getPostById(postId);
        if (cancelled) return;
        if (fetchError || !data) {
          setError(true);
        } else {
          setPost(data);
        }
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    };
    loadPost();
    return () => { cancelled = true; };
  }, [postId]);

  const handlePress = () => {
    if (post) {
      navigation.navigate('PostDetailVibesFeed', {
        postId: post.id,
        vibesFeedPosts: [{
          id: post.id,
          type: post.media_type || 'image',
          media: post.media_urls?.[0] || post.media_url,
          thumbnail: post.media_urls?.[0] || post.media_url,
          description: post.content || post.caption,
          likes: post.likes_count || 0,
          comments: post.comments_count || 0,
          user: {
            id: post.author?.id || post.author_id,
            name: resolveDisplayName(post.author),
            avatar: post.author?.avatar_url,
            followsMe: false,
          },
        }],
      });
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, isFromMe ? styles.containerFromMe : styles.containerFromOther]}>
        <ActivityIndicator size="small" color={isFromMe ? '#fff' : colors.primary} />
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={[styles.container, isFromMe ? styles.containerFromMe : styles.containerFromOther]}>
        <Text style={[styles.errorText, isFromMe && styles.textFromMe]}>
          Post not available
        </Text>
      </View>
    );
  }

  const mediaUrl = post.media_urls?.[0] || post.media_url;
  const author = post.author;

  return (
    <TouchableOpacity
      style={[styles.container, isFromMe ? styles.containerFromMe : styles.containerFromOther]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* Post Image */}
      {mediaUrl && (
        <OptimizedImage
          source={mediaUrl}
          style={styles.postImage}
          contentFit="cover"
        />
      )}

      {/* Post Info */}
      <View style={styles.postInfo}>
        <View style={styles.authorRow}>
          <AvatarImage source={author?.avatar_url} size={24} />
          <Text style={[styles.authorName, isFromMe && styles.textFromMe]} numberOfLines={1}>
            {resolveDisplayName(author)}
          </Text>
          <AccountBadge
            size={12}
            isVerified={author?.is_verified}
            accountType={author?.account_type}
          />
        </View>
        {(post.content || post.caption) && (
          <Text
            style={[styles.caption, isFromMe && styles.captionFromMe]}
            numberOfLines={2}
          >
            {post.content || post.caption}
          </Text>
        )}
      </View>

      {/* Shared badge */}
      <View style={[styles.sharedBadge, isFromMe && styles.sharedBadgeFromMe]}>
        <Text style={[styles.sharedText, isFromMe && styles.textFromMe]}>Shared Post</Text>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(SharedPostBubble);

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    width: 220,
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerFromMe: {
    backgroundColor: colors.primary,
  },
  containerFromOther: {
    backgroundColor: colors.backgroundSecondary,
  },
  postImage: {
    width: '100%',
    height: 160,
  },
  postInfo: {
    padding: SPACING.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.dark,
    marginLeft: 6,
    marginRight: 4,
    flex: 1,
  },
  textFromMe: {
    color: '#fff',
  },
  caption: {
    fontSize: 12,
    color: colors.gray,
    marginTop: 4,
    lineHeight: 16,
  },
  captionFromMe: {
    color: 'rgba(255,255,255,0.8)',
  },
  sharedBadge: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingVertical: 4,
    alignItems: 'center',
  },
  sharedBadgeFromMe: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  sharedText: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.gray,
  },
  errorText: {
    fontSize: 13,
    color: colors.gray,
    fontStyle: 'italic',
    padding: SPACING.md,
  },
});
