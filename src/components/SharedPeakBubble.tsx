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
import { getPeakById, Post } from '../services/database';
import { resolveDisplayName } from '../types/profile';
import { Ionicons } from '@expo/vector-icons';

interface SharedPeakBubbleProps {
  peakId: string;
  isFromMe: boolean;
}

function SharedPeakBubble({ peakId, isFromMe }: SharedPeakBubbleProps) {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void }>();
  const [peak, setPeak] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!peakId || !uuidPattern.test(peakId)) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadPeak = async () => {
      setLoading(true);
      try {
        const { data, error: fetchError } = await getPeakById(peakId);
        if (cancelled) return;
        if (fetchError || !data) {
          setError(true);
        } else {
          setPeak(data);
        }
      } catch {
        if (!cancelled) setError(true);
      }
      if (!cancelled) setLoading(false);
    };
    loadPeak();
    return () => { cancelled = true; };
  }, [peakId]);

  const handlePress = () => {
    if (peak) {
      navigation.navigate('PeakView', {
        peaks: [{
          id: peak.id,
          videoUrl: peak.media_urls?.[0],
          thumbnail: peak.media_urls?.[0],
          duration: peak.peak_duration || 15,
          user: {
            id: peak.author?.id || peak.author_id,
            name: resolveDisplayName(peak.author),
            avatar: peak.author?.avatar_url || '',
          },
          views: peak.views_count || 0,
          likes: peak.likes_count || 0,
          repliesCount: peak.comments_count || 0,
          isLiked: false,
          isOwnPeak: false,
          createdAt: peak.created_at,
        }],
        initialIndex: 0,
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

  if (error || !peak) {
    return (
      <View style={[styles.container, isFromMe ? styles.containerFromMe : styles.containerFromOther]}>
        <Text style={[styles.errorText, isFromMe && styles.textFromMe]}>
          Peak not available
        </Text>
      </View>
    );
  }

  const thumbnailUrl = peak.media_urls?.[0];
  const author = peak.author;

  return (
    <TouchableOpacity
      style={[styles.container, isFromMe ? styles.containerFromMe : styles.containerFromOther]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* Peak Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {thumbnailUrl ? (
          <OptimizedImage
            source={thumbnailUrl}
            style={styles.peakImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.peakImage, styles.peakImagePlaceholder]}>
            <Ionicons name="videocam" size={28} color={isFromMe ? 'rgba(255,255,255,0.6)' : colors.gray} />
          </View>
        )}
        {/* Play icon overlay */}
        <View style={styles.playOverlay}>
          <Ionicons name="play" size={20} color="#FFFFFF" />
        </View>
        {/* Duration badge */}
        {peak.peak_duration && (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{peak.peak_duration}s</Text>
          </View>
        )}
      </View>

      {/* Peak Info */}
      <View style={styles.peakInfo}>
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
        {peak.content && (
          <Text
            style={[styles.caption, isFromMe && styles.captionFromMe]}
            numberOfLines={2}
          >
            {peak.content}
          </Text>
        )}
      </View>

      {/* Shared badge */}
      <View style={[styles.sharedBadge, isFromMe && styles.sharedBadgeFromMe]}>
        <Ionicons name="videocam" size={10} color={isFromMe ? 'rgba(255,255,255,0.7)' : colors.gray} />
        <Text style={[styles.sharedText, isFromMe && styles.textFromMe]}>Shared Peak</Text>
      </View>
    </TouchableOpacity>
  );
}

export default React.memo(SharedPeakBubble);

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
  thumbnailContainer: {
    position: 'relative',
  },
  peakImage: {
    width: '100%',
    height: 180,
  },
  peakImagePlaceholder: {
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -16,
    marginLeft: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  peakInfo: {
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
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
