/**
 * BattleResultsScreen
 * Shows battle results with winner, stats, and tip leaderboard
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { AvatarImage } from '../../components/OptimizedImage';
import { isValidUUID } from '../../utils/formatters';
import { AccountBadge } from '../../components/Badge';
import TipLeaderboard from '../../components/tips/TipLeaderboard';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores/userStore';
import { awsAPI } from '../../services/aws-api';
import { GRADIENTS } from '../../config/theme';
import { resolveDisplayName } from '../../types/profile';

const { width } = Dimensions.get('window');

interface Participant {
  id: string;
  user_id: string;
  username: string;
  display_name?: string;
  profile_picture_url?: string;
  avatar_url?: string;
  is_verified: boolean;
  tips_received: number;
  tip_count: number;
  is_host: boolean;
}

interface RouteParams {
  battleId: string;
  winner?: Participant;
  participants: Participant[];
}

export default function BattleResultsScreen() {
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; reset: (state: { index: number; routes: { name: string }[] }) => void }>();
  const route = useRoute<{ key: string; name: string; params: RouteParams }>();
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const currentUserId = useUserStore((s) => s.user?.id);
  const [rematchLoading, setRematchLoading] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { battleId: _battleId, winner, participants = [] } = (route.params || {}) as RouteParams;

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;
  const participantAnims = useRef<Animated.Value[]>([]).current;

  // Sort participants by tips received
  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => b.tips_received - a.tips_received);
  }, [participants]);

  useEffect(() => {
    // Initialize participant animations — cap to prevent unbounded growth
    const targetLength = Math.min(sortedParticipants.length, 50);
    while (participantAnims.length < targetLength) {
      participantAnims.push(new Animated.Value(0));
    }

    // Play entrance animations
    const entranceComposite = Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]);
    entranceComposite.start();

    // Confetti animation — store reference for cleanup
    let confettiLoop: Animated.CompositeAnimation | null = null;
    if (winner) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      confettiLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(confettiAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(confettiAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      );
      confettiLoop.start();
    }

    // Stagger participant animations
    const participantComposites: Animated.CompositeAnimation[] = [];
    sortedParticipants.forEach((_, i) => {
      if (i < participantAnims.length) {
        const anim = Animated.spring(participantAnims[i], {
          toValue: 1,
          useNativeDriver: true,
          delay: 300 + i * 100,
        });
        anim.start();
        participantComposites.push(anim);
      }
    });

    return () => {
      entranceComposite.stop();
      if (confettiLoop) confettiLoop.stop();
      participantComposites.forEach((a) => a.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoHome = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  };

  const handleViewProfile = (userId: string) => {
    if (!isValidUUID(userId)) {
      if (__DEV__) console.warn('[BattleResultsScreen] Invalid userId:', userId);
      return;
    }
    navigation.navigate('UserProfile', { userId });
  };

  const handleRematch = useCallback(async () => {
    if (rematchLoading) return;
    setRematchLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const opponents = participants
      .filter(p => p.user_id !== currentUserId)
      .map(p => p.user_id);
    if (opponents.length === 0) { setRematchLoading(false); return; }
    try {
      const result = await awsAPI.createBattle({
        battleType: 'tips',
        invitedUserIds: opponents,
      });
      if (result.success && result.battle) {
        navigation.navigate('BattleLobby', { battleId: result.battle.id });
      } else {
        Alert.alert('Rematch Failed', 'Could not create a rematch. Please try again.');
      }
    } catch {
      Alert.alert('Rematch Failed', 'Something went wrong. Please try again.');
    } finally {
      setRematchLoading(false);
    }
  }, [participants, currentUserId, navigation, rematchLoading]);

  const totalTips = useMemo(() => {
    return participants.reduce((sum, p) => sum + p.tips_received, 0);
  }, [participants]);

  const renderParticipant = (participant: Participant, index: number) => {
    const isWinner = winner?.user_id === participant.user_id;
    const anim = participantAnims[index] || new Animated.Value(1);

    return (
      <Animated.View
        key={participant.id}
        style={[
          styles.participantCard,
          isWinner && styles.winnerCard,
          {
            opacity: anim,
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [30, 0],
                }),
              },
            ],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.participantContent}
          onPress={() => handleViewProfile(participant.user_id)}
          activeOpacity={0.7}
        >
          <View style={styles.rankBadge}>
            <Text style={styles.rankText}>{index + 1}</Text>
          </View>

          <AvatarImage
            source={participant.avatar_url || participant.profile_picture_url}
            size={60}
          />

          <View style={styles.participantInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.participantName} numberOfLines={1}>
                {resolveDisplayName(participant)}
              </Text>
              {participant.is_verified && (
                <AccountBadge size={16} isVerified style={styles.badge} />
              )}
              {isWinner && (
                <View style={styles.winnerBadge}>
                  <Ionicons name="trophy" size={14} color="#FFD700" />
                  <Text style={styles.winnerText}>Winner</Text>
                </View>
              )}
            </View>
            <Text style={styles.username}>{resolveDisplayName(participant)}</Text>
          </View>

          <View style={styles.tipsSection}>
            <Text style={styles.tipsAmount}>{formatAmount(participant.tips_received)}</Text>
            <Text style={styles.tipsLabel}>{participant.tip_count} tips</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={isDark ? ['#1a1a2e', '#16213e'] : ['#667eea', '#764ba2']}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <TouchableOpacity onPress={handleGoHome} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Battle Ended</Text>
          <View style={styles.closeButton} />
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Winner Section */}
          {winner && (
            <Animated.View
              style={[
                styles.winnerSection,
                {
                  opacity: fadeAnim,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.confettiOverlay,
                  {
                    opacity: confettiAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.3, 0.6, 0.3],
                    }),
                  },
                ]}
              >
                <Ionicons name="sparkles" size={100} color="rgba(255,215,0,0.3)" />
              </Animated.View>

              <View style={styles.crownContainer}>
                <Ionicons name="trophy" size={40} color="#FFD700" />
              </View>

              <TouchableOpacity
                onPress={() => handleViewProfile(winner.user_id)}
                activeOpacity={0.8}
              >
                <View style={styles.winnerAvatarContainer}>
                  <AvatarImage
                    source={winner.avatar_url || winner.profile_picture_url}
                    size={100}
                  />
                  <View style={styles.winnerGlow} />
                </View>
              </TouchableOpacity>

              <Text style={styles.winnerName}>
                {resolveDisplayName(winner)}
              </Text>
              <Text style={styles.winnerTitle}>Battle Champion!</Text>

              <View style={styles.winnerStats}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{formatAmount(winner.tips_received)}</Text>
                  <Text style={styles.statLabel}>Tips Earned</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{winner.tip_count}</Text>
                  <Text style={styles.statLabel}>Supporters</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* Battle Stats */}
          <View style={styles.statsCard}>
            <Text style={styles.sectionTitle}>Battle Stats</Text>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Ionicons name="people" size={24} color={colors.primary} />
                <Text style={styles.statBoxValue}>{participants.length}</Text>
                <Text style={styles.statBoxLabel}>Participants</Text>
              </View>
              <View style={styles.statBox}>
                <Ionicons name="heart" size={24} color="#FF6B6B" />
                <Text style={styles.statBoxValue}>{formatAmount(totalTips)}</Text>
                <Text style={styles.statBoxLabel}>Total Tips</Text>
              </View>
            </View>
          </View>

          {/* Participants Leaderboard */}
          <View style={styles.leaderboardSection}>
            <Text style={styles.sectionTitle}>Final Standings</Text>
            {sortedParticipants.map((p, i) => renderParticipant(p, i))}
          </View>

          {/* Top Supporters */}
          {winner && (
            <View style={styles.supportersSection}>
              <Text style={styles.sectionTitle}>Top Supporters</Text>
              <TipLeaderboard
                creatorId={winner.user_id}
                creatorUsername={winner.username}
                compact
                maxItems={5}
              />
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.primaryButton, rematchLoading && { opacity: 0.6 }]}
              onPress={handleRematch}
              activeOpacity={0.8}
              disabled={rematchLoading}
            >
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.buttonGradient}
              >
                <Ionicons name="refresh" size={20} color={colors.white} />
                <Text style={styles.buttonText}>Rematch</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleGoHome}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeArea: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.white,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    winnerSection: {
      alignItems: 'center',
      paddingVertical: 30,
      position: 'relative',
    },
    confettiOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    crownContainer: {
      marginBottom: 10,
    },
    winnerAvatarContainer: {
      position: 'relative',
    },
    winnerGlow: {
      position: 'absolute',
      top: -10,
      left: -10,
      right: -10,
      bottom: -10,
      borderRadius: 60,
      backgroundColor: 'rgba(255,215,0,0.3)',
    },
    winnerName: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.white,
      marginTop: 16,
    },
    winnerTitle: {
      fontSize: 16,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 4,
    },
    winnerStats: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 20,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 30,
    },
    statItem: {
      alignItems: 'center',
    },
    statValue: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.white,
    },
    statLabel: {
      fontSize: 12,
      color: 'rgba(255,255,255,0.7)',
      marginTop: 4,
    },
    statDivider: {
      width: 1,
      height: 40,
      backgroundColor: 'rgba(255,255,255,0.2)',
      marginHorizontal: 30,
    },
    statsCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.95)',
      borderRadius: 16,
      padding: 20,
      marginTop: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.white : colors.dark,
      marginBottom: 16,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    statBox: {
      alignItems: 'center',
    },
    statBoxValue: {
      fontSize: 24,
      fontWeight: 'bold',
      color: isDark ? colors.white : colors.dark,
      marginTop: 8,
    },
    statBoxLabel: {
      fontSize: 12,
      color: colors.gray,
      marginTop: 4,
    },
    leaderboardSection: {
      marginTop: 24,
    },
    participantCard: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.white,
      borderRadius: 16,
      marginBottom: 12,
      overflow: 'hidden',
    },
    winnerCard: {
      borderWidth: 2,
      borderColor: '#FFD700',
    },
    participantContent: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    rankBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    rankText: {
      color: colors.white,
      fontWeight: 'bold',
      fontSize: 14,
    },
    participantInfo: {
      flex: 1,
      marginLeft: 12,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    participantName: {
      fontSize: 16,
      fontWeight: '600',
      color: isDark ? colors.white : colors.dark,
      maxWidth: width * 0.35,
    },
    badge: {
      marginLeft: 4,
    },
    winnerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(255,215,0,0.2)',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      marginLeft: 8,
    },
    winnerText: {
      fontSize: 11,
      fontWeight: '600',
      color: '#FFD700',
      marginLeft: 4,
    },
    username: {
      fontSize: 13,
      color: colors.gray,
      marginTop: 2,
    },
    tipsSection: {
      alignItems: 'flex-end',
    },
    tipsAmount: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.primary,
    },
    tipsLabel: {
      fontSize: 11,
      color: colors.gray,
      marginTop: 2,
    },
    supportersSection: {
      marginTop: 24,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.white,
      borderRadius: 16,
      padding: 20,
    },
    actionsSection: {
      marginTop: 30,
      gap: 12,
    },
    primaryButton: {
      borderRadius: 25,
      overflow: 'hidden',
    },
    buttonGradient: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 16,
      gap: 8,
    },
    buttonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    secondaryButtonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: '500',
    },
  });
