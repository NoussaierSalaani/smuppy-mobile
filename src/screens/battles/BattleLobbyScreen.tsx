/**
 * BattleLobbyScreen
 * Live Battle lobby - waiting room before battle starts
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

const { width: _width } = Dimensions.get('window');

interface Participant {
  id: string;
  user_id: string;
  username: string;
  full_name?: string;
  profile_picture_url?: string;
  is_verified: boolean;
  status: 'pending' | 'accepted' | 'declined' | 'ready';
  is_host: boolean;
}

interface Battle {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'live' | 'ended';
  max_participants: number;
  agora_channel_name: string;
  participants: Participant[];
  created_at: string;
}

export default function BattleLobbyScreen() {
  const { showError, showDestructiveConfirm } = useSmuppyAlert();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useUserStore((state: any) => state.user);

  const battleId = route.params?.battleId;

  const [battle, setBattle] = useState<Battle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const scaleAnims = useRef<Animated.Value[]>([]).current;

  useEffect(() => {
    loadBattle();
    const interval = setInterval(loadBattle, 3000); // Poll for updates
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId]);

  useEffect(() => {
    // Pulse animation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    // Glow animation
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: false,
        }),
      ])
    );
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Check if all participants are ready
    if (battle) {
      const allReady = battle.participants
        .filter((p) => p.status === 'accepted' || p.status === 'ready')
        .every((p) => p.status === 'ready');

      const isHost = battle.participants.find((p) => p.user_id === user?.id)?.is_host;

      if (allReady && battle.participants.length >= 2 && isHost) {
        // Start countdown
        startCountdown();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle]);

  const loadBattle = async () => {
    try {
      const response = await awsAPI.getBattle(battleId);
      if (response.success) {
        setBattle(response.battle);

        // Initialize scale anims for participants
        while (scaleAnims.length < response.battle.participants.length) {
          scaleAnims.push(new Animated.Value(0));
        }

        // Animate in participants
        response.battle.participants.forEach((_: any, i: number) => {
          Animated.spring(scaleAnims[i], {
            toValue: 1,
            useNativeDriver: true,
            delay: i * 100,
          }).start();
        });

        // If battle is live, go to battle screen
        if (response.battle.status === 'live') {
          navigation.replace('BattleStream', {
            battleId,
            agoraToken: response.agora_token,
            agoraUid: response.agora_uid,
          });
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('Load battle error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const startCountdown = () => {
    setCountdown(3);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          handleStartBattle();
          return null;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        return prev - 1;
      });
    }, 1000);
  };

  const handleToggleReady = async () => {
    const newReady = !isReady;
    setIsReady(newReady);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await awsAPI.battleAction(battleId, newReady ? 'ready' : 'unready');
      loadBattle();
    } catch (error) {
      if (__DEV__) console.warn('Toggle ready error:', error);
      setIsReady(!newReady);
    }
  };

  const handleStartBattle = async () => {
    try {
      const response = await awsAPI.battleAction(battleId, 'start');
      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        navigation.replace('BattleStream', {
          battleId,
          agoraToken: response.agora_token,
          agoraUid: response.agora_uid,
        });
      }
    } catch (error) {
      if (__DEV__) console.warn('Start battle error:', error);
      showError('Error', 'Failed to start battle');
    }
  };

  const handleLeaveBattle = async () => {
    showDestructiveConfirm('Leave Battle?', 'Are you sure you want to leave this battle?', async () => {
      try {
        await awsAPI.battleAction(battleId, 'leave');
        navigation.goBack();
      } catch (error) {
        if (__DEV__) console.warn('Leave battle error:', error);
      }
    }, 'Leave');
  };

  const handleInvite = () => {
    navigation.navigate('InviteToBattle', { battleId });
  };

  const renderParticipant = (participant: Participant, index: number) => {
    const isCurrentUser = participant.user_id === user?.id;
    if (!scaleAnims[index]) {
      scaleAnims[index] = new Animated.Value(1);
    }
    const scaleAnim = scaleAnims[index];

    return (
      <Animated.View
        key={participant.id}
        style={[
          styles.participantCard,
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <LinearGradient
          colors={
            participant.status === 'ready'
              ? ['rgba(0,255,100,0.2)', 'rgba(0,255,100,0.05)']
              : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']
          }
          style={styles.participantGradient}
        >
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <Image
              source={{
                uri:
                  participant.profile_picture_url ||
                  `https://ui-avatars.com/api/?name=${participant.username}&background=random`,
              }}
              style={styles.participantAvatar}
            />
            {participant.is_host && (
              <View style={styles.hostBadge}>
                <Ionicons name="star" size={10} color="#FFD700" />
              </View>
            )}
            {participant.status === 'ready' && (
              <View style={styles.readyIndicator}>
                <Ionicons name="checkmark" size={12} color="#fff" />
              </View>
            )}
          </View>

          {/* Info */}
          <View style={styles.participantInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.participantName}>
                {isCurrentUser ? 'You' : participant.full_name || participant.username}
              </Text>
              {participant.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color="#00BFFF" />
              )}
            </View>
            <Text style={styles.participantStatus}>
              {participant.status === 'ready'
                ? 'Ready!'
                : participant.status === 'pending'
                  ? 'Invited'
                  : participant.status === 'accepted'
                    ? 'Waiting...'
                    : 'Declined'}
            </Text>
          </View>

          {/* Status indicator */}
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor:
                  participant.status === 'ready'
                    ? '#00FF64'
                    : participant.status === 'accepted'
                      ? '#FFD700'
                      : participant.status === 'pending'
                        ? '#888'
                        : '#FF4444',
              },
            ]}
          />
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderEmptySlot = (index: number) => (
    <TouchableOpacity key={`empty-${index}`} style={styles.emptySlot} onPress={handleInvite}>
      <View style={styles.emptySlotInner}>
        <View style={styles.emptyAvatar}>
          <Ionicons name="add" size={24} color="#666" />
        </View>
        <Text style={styles.emptyText}>Invite</Text>
      </View>
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!battle) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />
        <Text style={styles.errorText}>Battle not found</Text>
      </View>
    );
  }

  const isHost = battle.participants.find((p) => p.user_id === user?.id)?.is_host;
  const acceptedCount = battle.participants.filter(
    (p) => p.status === 'accepted' || p.status === 'ready'
  ).length;
  const emptySlots = Math.max(0, battle.max_participants - battle.participants.length);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      {/* Animated background glow */}
      <Animated.View
        style={[
          styles.backgroundGlow,
          {
            opacity: glowAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0.1, 0.3],
            }),
          },
        ]}
      >
        <LinearGradient
          colors={['#FF6B35', 'transparent']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </Animated.View>

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleLeaveBattle} style={styles.backButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Battle Lobby</Text>
            <Text style={styles.headerSubtitle}>
              {acceptedCount}/{battle.max_participants} ready
            </Text>
          </View>
          <TouchableOpacity onPress={handleInvite} style={styles.inviteButton}>
            <Ionicons name="person-add" size={20} color="#FF6B35" />
          </TouchableOpacity>
        </View>

        {/* Countdown Overlay */}
        {countdown !== null && (
          <View style={styles.countdownOverlay}>
            <BlurView intensity={80} style={StyleSheet.absoluteFill} />
            <Animated.Text
              style={[
                styles.countdownText,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              {countdown}
            </Animated.Text>
            <Text style={styles.countdownLabel}>Get Ready!</Text>
          </View>
        )}

        {/* Battle Title */}
        <View style={styles.titleContainer}>
          <Animated.View
            style={[
              styles.vsContainer,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <LinearGradient
              colors={['#FF6B35', '#FF4500']}
              style={styles.vsGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.vsText}>VS</Text>
            </LinearGradient>
          </Animated.View>
          <Text style={styles.battleTitle}>{battle.title}</Text>
          {battle.description && (
            <Text style={styles.battleDescription}>{battle.description}</Text>
          )}
        </View>

        {/* Participants Grid */}
        <View style={styles.participantsContainer}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <View style={styles.participantsGrid}>
            {battle.participants.map((p, i) => renderParticipant(p, i))}
            {Array.from({ length: emptySlots }).map((_, i) => renderEmptySlot(i))}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.readyButton, isReady && styles.readyButtonActive]}
            onPress={handleToggleReady}
          >
            <LinearGradient
              colors={isReady ? ['#00FF64', '#00CC50'] : ['#FF6B35', '#FF4500']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.readyGradient}
            >
              <Ionicons name={isReady ? 'checkmark-circle' : 'flash'} size={24} color="#fff" />
              <Text style={styles.readyText}>{isReady ? "I'm Ready!" : 'Ready Up'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {isHost && acceptedCount >= 2 && (
            <TouchableOpacity style={styles.startButton} onPress={startCountdown}>
              <Text style={styles.startText}>Start Battle</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#888',
  },
  backgroundGlow: {
    position: 'absolute',
    top: -100,
    left: -100,
    right: -100,
    height: 400,
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  inviteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,107,53,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    fontSize: 120,
    fontWeight: '900',
    color: '#FF6B35',
    textShadowColor: 'rgba(255,107,53,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  countdownLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
  },
  titleContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  vsContainer: {
    marginBottom: 16,
  },
  vsGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  vsText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
  },
  battleTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  battleDescription: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  participantsContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  participantsGrid: {
    gap: 12,
  },
  participantCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  participantGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  participantAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  hostBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyIndicator: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#00FF64',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  participantName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  participantStatus: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  emptySlot: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
  },
  emptySlotInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  emptyAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
  },
  footer: {
    padding: 16,
    paddingBottom: 20,
    gap: 12,
  },
  readyButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  readyButtonActive: {},
  readyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  readyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  startButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  startText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
  },
});
