import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DARK_COLORS as COLORS } from '../../config/theme';

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
  reactions: number;
  createdAt: Date;
}

interface PeakCardProps {
  peak: Peak;
  onPress: (peak: Peak) => void;
}

const PeakCard = memo(({ peak, onPress }: PeakCardProps): React.JSX.Element => {
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
      <Image
        source={{ uri: peak.thumbnail }}
        style={styles.thumbnail}
        resizeMode="cover"
      />

      {/* Replies indicator (Peak Chain) */}
      {peak.repliesCount && peak.repliesCount > 0 ? (
        <View style={styles.chainBadge}>
          <Ionicons name="link" size={12} color={COLORS.white} />
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
          <Image
            source={{ uri: peak.user.avatar }}
            style={styles.avatar}
          />
          <Text style={styles.userName} numberOfLines={1}>
            {peak.user.name}
          </Text>
        </View>

        {/* Views */}
        <View style={styles.viewsContainer}>
          <Ionicons name="eye-outline" size={12} color={COLORS.white} />
          <Text style={styles.viewsText}>{formatViews(peak.views)}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

PeakCard.displayName = 'PeakCard';

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
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
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  chainText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.dark,
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
    color: COLORS.white,
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
    borderColor: COLORS.primary,
    marginRight: 8,
  },
  userName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  viewsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewsText: {
    fontSize: 11,
    color: COLORS.white,
    opacity: 0.9,
  },
});

export default PeakCard;
