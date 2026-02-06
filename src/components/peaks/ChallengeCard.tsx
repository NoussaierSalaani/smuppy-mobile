import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarImage } from '../OptimizedImage';
import OptimizedImage from '../OptimizedImage';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width * 0.7;
const CARD_HEIGHT = CARD_WIDTH * 0.6;

interface ChallengeCreator {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  isVerified?: boolean;
}

interface ChallengePeak {
  videoUrl: string;
  thumbnailUrl: string;
}

export interface Challenge {
  id: string;
  peakId: string;
  title: string;
  description?: string;
  endsAt?: string;
  responseCount: number;
  viewCount: number;
  status: string;
  createdAt: string;
  peak: ChallengePeak;
  creator: ChallengeCreator;
  hasResponded?: boolean;
}

interface ChallengeCardProps {
  challenge: Challenge;
  onPress: (challenge: Challenge) => void;
  onAccept: (challenge: Challenge) => void;
  compact?: boolean;
}

function getTimeRemaining(endsAt?: string): string {
  if (!endsAt) return '';
  const now = new Date();
  const end = new Date(endsAt);
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  return 'Ending soon';
}

const ChallengeCard = memo(({ challenge, onPress, onAccept, compact }: ChallengeCardProps): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark, compact), [colors, isDark, compact]);
  const timeRemaining = getTimeRemaining(challenge.endsAt);
  const hasEnded = timeRemaining === 'Ended';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(challenge)}
      activeOpacity={0.85}
    >
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        <OptimizedImage
          source={challenge.peak.thumbnailUrl}
          style={styles.thumbnail}
        />
        <View style={styles.thumbnailOverlay}>
          <Ionicons name="trophy" size={20} color="#FFD700" />
        </View>
        {timeRemaining ? (
          <View style={[styles.timeBadge, hasEnded && styles.timeBadgeEnded]}>
            <Text style={[styles.timeBadgeText, hasEnded && styles.timeBadgeTextEnded]}>
              {timeRemaining}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {challenge.title}
        </Text>

        <View style={styles.creatorRow}>
          <AvatarImage source={challenge.creator.avatarUrl} size={20} />
          <Text style={styles.creatorName} numberOfLines={1}>
            {challenge.creator.displayName || challenge.creator.username}
          </Text>
          {challenge.creator.isVerified && (
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="people-outline" size={14} color={colors.gray} />
            <Text style={styles.statText}>{challenge.responseCount} responses</Text>
          </View>
        </View>

        {!hasEnded && !challenge.hasResponded && (
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => onAccept(challenge)}
            activeOpacity={0.8}
          >
            <Ionicons name="flame" size={14} color="#1A1A2E" />
            <Text style={styles.acceptButtonText}>Accept</Text>
          </TouchableOpacity>
        )}

        {challenge.hasResponded && (
          <View style={styles.respondedBadge}>
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
            <Text style={styles.respondedText}>Responded</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

ChallengeCard.displayName = 'ChallengeCard';

const createStyles = (colors: ThemeColors, isDark: boolean, compact?: boolean) => StyleSheet.create({
  container: {
    width: compact ? CARD_WIDTH * 0.65 : CARD_WIDTH,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0 : 0.08,
    shadowRadius: 8,
    elevation: isDark ? 0 : 3,
  },
  thumbnailContainer: {
    width: '100%',
    height: compact ? CARD_HEIGHT * 0.6 : CARD_HEIGHT,
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,215,0,0.9)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timeBadgeEnded: {
    backgroundColor: 'rgba(255,59,48,0.9)',
  },
  timeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  timeBadgeTextEnded: {
    color: colors.white,
  },
  info: {
    padding: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
    marginBottom: 8,
    lineHeight: 18,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  creatorName: {
    fontSize: 12,
    color: colors.gray,
    flex: 1,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 11,
    color: colors.gray,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFD700',
    borderRadius: 8,
    paddingVertical: 7,
  },
  acceptButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  respondedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: isDark ? 'rgba(17,227,163,0.15)' : 'rgba(17,227,163,0.1)',
    borderRadius: 8,
    paddingVertical: 7,
  },
  respondedText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
});

export default ChallengeCard;
