import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import OptimizedImage from '../OptimizedImage';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const CARD_HEIGHT = CARD_WIDTH * 1.6;

interface PeakUser {
  id: string;
  avatar: string;
  name: string;
}

interface Peak {
  id: string;
  thumbnail: string;
  repliesCount?: number;
  duration: number;
  user: PeakUser;
  views: number;
  likes: number;
  createdAt: string; // ISO string for React Navigation serialization
}

interface PeakCardProps {
  peak: Peak;
  onPress: (peak: Peak) => void;
}

const PeakCard = memo(({ peak, onPress }: PeakCardProps): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const formatViews = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(peak)}
      activeOpacity={0.9}
    >
      {/* Thumbnail */}
      <OptimizedImage
        source={peak.thumbnail || undefined}
        style={styles.thumbnail as StyleProp<ImageStyle>}
        contentFit="cover"
        priority="normal"
      />

      {/* Replies indicator (Peak Chain) */}
      {peak.repliesCount && peak.repliesCount > 0 ? (
        <View style={styles.chainBadge}>
          <Ionicons name="link" size={12} color={colors.white} />
          <Text style={styles.chainText}>{peak.repliesCount}</Text>
        </View>
      ) : null}

      {/* Duration */}
      <View style={styles.durationBadge}>
        <Text style={styles.durationText}>{peak.duration}s</Text>
      </View>

      {/* Overlay with info */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={styles.overlay}
      >
        {/* User info */}
        <View style={styles.userInfo}>
          <OptimizedImage
            source={peak.user.avatar}
            style={styles.avatar as StyleProp<ImageStyle>}
            contentFit="cover"
            priority="high"
          />
          <Text style={styles.userName} numberOfLines={1}>
            {peak.user.name}
          </Text>
        </View>

        {/* Views */}
        <View style={styles.viewsContainer}>
          <Ionicons name="eye-outline" size={12} color={colors.white} />
          <Text style={styles.viewsText}>{formatViews(peak.views)}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

PeakCard.displayName = 'PeakCard';

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.darkCard,
    marginBottom: 12,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  chainBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  chainText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dark,
  },
  durationBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingTop: 40,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.primary,
    marginRight: 8,
  },
  userName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  viewsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewsText: {
    fontSize: 11,
    color: colors.white,
    opacity: 0.9,
  },
});

export default PeakCard;
