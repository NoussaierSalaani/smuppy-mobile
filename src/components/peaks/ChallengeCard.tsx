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
import { GRADIENTS, DARK_GRADIENTS, SHADOWS } from '../../config/theme';
import { resolveDisplayName } from '../../types/profile';
import { sanitizeOptionalText } from '../../utils/sanitize';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;
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
      onPress={() => onPress(challenge)}
      activeOpacity={0.88}
      style={styles.outerWrapper}
    >
      {/* Gradient border wrapper */}
      <LinearGradient
        colors={isDark
          ? ['rgba(10,158,114,0.4)', 'rgba(0,138,148,0.4)']
          : ['#0EBF8A', '#00B3C7', '#72D1AD']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBorder}
      >
        <View style={styles.container}>
          {/* Thumbnail */}
          <View style={styles.thumbnailContainer}>
            <OptimizedImage
              source={challenge.peak.thumbnailUrl}
              style={styles.thumbnail}
            />
            {/* Bottom gradient fade */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.thumbnailGradient}
            />
            {/* Green accent line at top of thumbnail */}
            <LinearGradient
              colors={[...gradientColors]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.topAccentLine}
            />
            {/* Trophy badge */}
            <View style={styles.trophyBadge}>
              <Ionicons name="trophy" size={compact ? 11 : 13} color="#FFD700" />
            </View>
            {/* Time remaining */}
            {timeRemaining ? (
              <View style={[styles.timeBadge, hasEnded && styles.timeBadgeEnded]}>
                <Ionicons
                  name={hasEnded ? 'time-outline' : 'hourglass-outline'}
                  size={10}
                  color={hasEnded ? '#FFF' : '#1A1A2E'}
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
              <View style={styles.statDot} />
              <View style={styles.thumbnailStat}>
                <Ionicons name="eye" size={11} color="#FFF" />
                <Text style={styles.thumbnailStatText}>{formatCount(challenge.viewCount)}</Text>
              </View>
            </View>
          </View>

          {/* Info */}
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={compact ? 1 : 2}>
              {sanitizeOptionalText(challenge.title)}
            </Text>

            <View style={styles.creatorRow}>
              <View style={styles.avatarRing}>
                <AvatarImage source={challenge.creator.avatarUrl} size={compact ? 20 : 24} />
              </View>
              <Text style={styles.creatorName} numberOfLines={1}>
                {sanitizeOptionalText(resolveDisplayName(challenge.creator))}
              </Text>
              {challenge.creator.isVerified && (
                <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
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
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
});

ChallengeCard.displayName = 'ChallengeCard';

const createStyles = (colors: ThemeColors, isDark: boolean, compact?: boolean) => {
  const cardWidth = compact ? COMPACT_CARD_WIDTH : CARD_WIDTH;
  const thumbHeight = compact ? 120 : 180;
  const borderWidth = compact ? 1.5 : 2;

  return StyleSheet.create({
    outerWrapper: {
      width: cardWidth,
      marginRight: 0,
      ...(!isDark ? {
        shadowColor: '#0EBF8A',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 4,
      } : {}),
    },
    gradientBorder: {
      borderRadius: compact ? 14 : 18,
      padding: borderWidth,
    },
    container: {
      backgroundColor: isDark ? colors.card : '#FFFFFF',
      borderRadius: compact ? 12.5 : 16,
      overflow: 'hidden',
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
      height: thumbHeight * 0.55,
    },
    topAccentLine: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 3,
    },
    trophyBadge: {
      position: 'absolute',
      top: 10,
      left: 10,
      width: compact ? 28 : 32,
      height: compact ? 28 : 32,
      borderRadius: compact ? 14 : 16,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderWidth: 1.5,
      borderColor: 'rgba(255,215,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    timeBadge: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(14,191,138,0.9)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    timeBadgeEnded: {
      backgroundColor: 'rgba(255,59,48,0.85)',
    },
    timeBadgeText: {
      fontFamily: 'Poppins-SemiBold',
      fontSize: 10,
      color: '#FFF',
    },
    timeBadgeTextEnded: {
      color: '#FFF',
    },
    thumbnailStats: {
      position: 'absolute',
      bottom: 10,
      left: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(0,0,0,0.4)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 10,
    },
    thumbnailStat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    statDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: 'rgba(255,255,255,0.5)',
    },
    thumbnailStatText: {
      fontFamily: 'Poppins-Medium',
      fontSize: 11,
      color: '#FFF',
    },
    info: {
      padding: compact ? 10 : 14,
    },
    title: {
      fontFamily: 'WorkSans-Bold',
      fontSize: compact ? 13 : 16,
      lineHeight: compact ? 17 : 21,
      color: isDark ? colors.text : colors.dark,
      marginBottom: 8,
    },
    creatorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    avatarRing: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: compact ? 12 : 14,
      padding: 1,
    },
    creatorName: {
      fontFamily: 'Poppins-Medium',
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
      paddingVertical: compact ? 7 : 9,
      ...SHADOWS.button,
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
      backgroundColor: isDark ? 'rgba(14,191,138,0.15)' : 'rgba(14,191,138,0.1)',
      borderRadius: 20,
      paddingVertical: compact ? 7 : 9,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(14,191,138,0.3)' : 'rgba(14,191,138,0.2)',
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
      paddingVertical: compact ? 7 : 9,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.grayBorder,
    },
    endedText: {
      fontFamily: 'Poppins-Medium',
      fontSize: compact ? 12 : 13,
      color: colors.textMuted,
    },
  });
};

export default ChallengeCard;
