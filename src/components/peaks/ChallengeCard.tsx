import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AvatarImage } from '../OptimizedImage';
import OptimizedImage from '../OptimizedImage';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { GRADIENTS, DARK_GRADIENTS } from '../../config/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.72;
const COMPACT_CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

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
  durationSeconds?: number;
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

/** Sanitize text: strip HTML tags and control characters */
const sanitize = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
};

function getTimeRemaining(endsAt?: string): string {
  if (!endsAt) return '';
  const end = new Date(endsAt);
  if (isNaN(end.getTime())) return '';
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d left`;
  if (hours > 0) return `${hours}h left`;
  return 'Ending soon';
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const ChallengeCard = memo(({ challenge, onPress, onAccept, compact }: ChallengeCardProps): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark, compact), [colors, isDark, compact]);
  const gradientColors = isDark ? DARK_GRADIENTS.button : GRADIENTS.button;
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
        {/* Bottom gradient fade */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          style={styles.thumbnailGradient}
        />
        {/* Trophy badge */}
        <View style={styles.trophyBadge}>
          <Ionicons name="trophy" size={compact ? 12 : 14} color={colors.gold} />
        </View>
        {/* Time remaining */}
        {timeRemaining ? (
          <View style={[styles.timeBadge, hasEnded && styles.timeBadgeEnded]}>
            <Ionicons
              name={hasEnded ? 'time-outline' : 'hourglass-outline'}
              size={10}
              color={hasEnded ? '#FFF' : colors.dark}
            />
            <Text style={[styles.timeBadgeText, hasEnded && styles.timeBadgeTextEnded]}>
              {timeRemaining}
            </Text>
          </View>
        ) : null}
        {/* Stats overlay on thumbnail */}
        <View style={styles.thumbnailStats}>
          <View style={styles.thumbnailStat}>
            <Ionicons name="people" size={11} color="#FFF" />
            <Text style={styles.thumbnailStatText}>{formatCount(challenge.responseCount)}</Text>
          </View>
          <View style={styles.thumbnailStat}>
            <Ionicons name="eye" size={11} color="#FFF" />
            <Text style={styles.thumbnailStatText}>{formatCount(challenge.viewCount)}</Text>
          </View>
        </View>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={compact ? 1 : 2}>
          {sanitize(challenge.title)}
        </Text>

        <View style={styles.creatorRow}>
          <AvatarImage source={challenge.creator.avatarUrl} size={compact ? 18 : 22} />
          <Text style={styles.creatorName} numberOfLines={1}>
            {sanitize(challenge.creator.displayName || challenge.creator.username)}
          </Text>
          {challenge.creator.isVerified && (
            <Ionicons name="checkmark-circle" size={12} color={colors.primary} />
          )}
        </View>

        {/* Action button */}
        {!hasEnded && !challenge.hasResponded && (
          <TouchableOpacity
            onPress={() => onAccept(challenge)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[...gradientColors]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.acceptButton}
            >
              <Ionicons name="flame" size={compact ? 12 : 14} color="#FFF" />
              <Text style={styles.acceptButtonText}>Accept</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {challenge.hasResponded && (
          <View style={styles.respondedBadge}>
            <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
            <Text style={styles.respondedText}>Responded</Text>
          </View>
        )}

        {hasEnded && !challenge.hasResponded && (
          <View style={styles.endedBadge}>
            <Text style={styles.endedText}>Ended</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

ChallengeCard.displayName = 'ChallengeCard';

const createStyles = (colors: ThemeColors, isDark: boolean, compact?: boolean) => {
  const cardWidth = compact ? COMPACT_CARD_WIDTH : CARD_WIDTH;
  const thumbHeight = compact ? 110 : 150;

  return StyleSheet.create({
    container: {
      width: cardWidth,
      backgroundColor: isDark ? colors.card : colors.white,
      borderRadius: 16,
      overflow: 'hidden',
      marginRight: compact ? 0 : 12,
      borderWidth: isDark ? 1 : 0,
      borderColor: isDark ? colors.border : 'transparent',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 12,
      elevation: isDark ? 0 : 3,
    },
    thumbnailContainer: {
      width: '100%',
      height: thumbHeight,
      position: 'relative',
    },
    thumbnail: {
      width: '100%',
      height: '100%',
    },
    thumbnailGradient: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: thumbHeight * 0.5,
    },
    trophyBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      width: compact ? 26 : 30,
      height: compact ? 26 : 30,
      borderRadius: compact ? 13 : 15,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    timeBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(255,215,0,0.92)',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 10,
    },
    timeBadgeEnded: {
      backgroundColor: 'rgba(255,59,48,0.85)',
    },
    timeBadgeText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: 10,
      color: '#1A1A2E',
    },
    timeBadgeTextEnded: {
      color: '#FFF',
    },
    thumbnailStats: {
      position: 'absolute',
      bottom: 8,
      left: 8,
      flexDirection: 'row',
      gap: 8,
    },
    thumbnailStat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    thumbnailStatText: {
      fontFamily: 'Poppins-Medium',
      fontSize: 11,
      color: '#FFF',
    },
    info: {
      padding: compact ? 10 : 12,
    },
    title: {
      fontFamily: 'WorkSans-Bold',
      fontSize: compact ? 13 : 15,
      lineHeight: compact ? 17 : 20,
      color: isDark ? colors.text : colors.dark,
      marginBottom: 8,
    },
    creatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    creatorName: {
      fontFamily: 'Poppins-Regular',
      fontSize: 12,
      color: colors.textSecondary,
      flex: 1,
    },
    acceptButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      borderRadius: 20,
      paddingVertical: compact ? 6 : 8,
    },
    acceptButtonText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: compact ? 12 : 13,
      color: '#FFF',
    },
    respondedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(14,191,138,0.12)' : 'rgba(14,191,138,0.08)',
      borderRadius: 20,
      paddingVertical: compact ? 6 : 8,
    },
    respondedText: {
      fontFamily: 'Poppins-Medium',
      fontSize: compact ? 12 : 13,
      color: colors.primary,
    },
    endedBadge: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.gray50,
      borderRadius: 20,
      paddingVertical: compact ? 6 : 8,
    },
    endedText: {
      fontFamily: 'Poppins-Medium',
      fontSize: compact ? 12 : 13,
      color: colors.textMuted,
    },
  });
};

export default ChallengeCard;
