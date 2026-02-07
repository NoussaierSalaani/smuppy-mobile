/**
 * BattleStreamScreen
 * Live Battle streaming with split-screen view and tips
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
  FlatList,
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
import { useCurrency } from '../../hooks/useCurrency';
import TipModal from '../../components/tips/TipModal';

// Get user from store
const getUser = (state: { user: { id: string } | null }) => state.user;

const { height } = Dimensions.get('window');
const STREAM_HEIGHT = (height - 200) / 2;

interface Participant {
  id: string;
  user_id: string;
  username: string;
  full_name?: string;
  profile_picture_url?: string;
  is_verified: boolean;
  tips_received: number;
  tip_count: number;
  is_host: boolean;
}

interface TipEvent {
  id: string;
  sender_username: string;
  sender_full_name?: string;
  receiver_username: string;
  amount: number;
  created_at: string;
}

interface Comment {
  id: string;
  user_id: string;
  username: string;
  full_name?: string;
  profile_picture_url?: string;
  text: string;
  created_at: string;
}

export default function BattleStreamScreen() {
  const { showDestructiveConfirm } = useSmuppyAlert();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const route = useRoute<{ key: string; name: string; params: { battleId: string; agoraToken: string; agoraUid: number } }>();
  const _user = useUserStore(getUser);
  const { formatAmount } = useCurrency();

  // agoraToken and agoraUid will be used when integrating Agora RTC
  const { battleId, agoraToken: _agoraToken, agoraUid: _agoraUid } = route.params;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [viewerCount, setViewerCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [tipEvents, setTipEvents] = useState<TipEvent[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [showTipModal, setShowTipModal] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  const tipAnimations = useRef<Animated.Value[]>([]).current;
  const commentsRef = useRef<FlatList<Comment>>(null);
  const durationInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadBattleState();
    const interval = setInterval(loadBattleState, 2000);

    // Duration counter
    durationInterval.current = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    return () => {
      clearInterval(interval);
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
      // Clear animation references to prevent memory leak
      tipAnimations.length = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBattleState = async () => {
    try {
      const response = await awsAPI.getBattleState(battleId);
      if (response.success) {
        setParticipants(response.participants || []);
        setViewerCount(response.viewer_count || 0);

        // Handle new tips
        if (response.new_tips && response.new_tips.length > 0) {
          handleNewTips(response.new_tips);
        }

        // Handle new comments
        if (response.new_comments && response.new_comments.length > 0) {
          const newComments = response.new_comments as Comment[];
          setComments((prev) => [...prev, ...newComments].slice(-50));
        }

        // Check if battle ended
        if (response.status === 'ended') {
          handleBattleEnded(response.winner);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('Load battle state error:', error);
    }
  };

  const handleNewTips = (newTips: TipEvent[]) => {
    newTips.forEach((tip) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Animate tip — cap array size to prevent unbounded growth
      if (tipAnimations.length > 20) {
        tipAnimations.splice(0, tipAnimations.length - 10);
      }
      const anim = new Animated.Value(0);
      tipAnimations.push(anim);

      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2000),
        Animated.timing(anim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        const index = tipAnimations.indexOf(anim);
        if (index > -1) tipAnimations.splice(index, 1);
      });

      setTipEvents((prev) => [...prev, tip].slice(-10));
    });
  };

  const handleBattleEnded = (winner?: Participant) => {
    setIsEnding(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    setTimeout(() => {
      navigation.replace('BattleResults', {
        battleId,
        winner,
        participants,
      });
    }, 3000);
  };

  const handleTip = (participant: Participant) => {
    setSelectedParticipant(participant);
    setShowTipModal(true);
  };

  const handleEndBattle = () => {
    showDestructiveConfirm('End Battle?', 'Are you sure you want to end this battle?', async () => {
      try {
        await awsAPI.battleAction(battleId, 'end');
      } catch (error) {
        if (__DEV__) console.warn('End battle error:', error);
      }
    }, 'End Battle');
  };

  const handleLeaveBattle = () => {
    showDestructiveConfirm('Leave Battle?', 'Are you sure you want to leave?', () => navigation.goBack(), 'Leave');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderParticipantStream = (participant: Participant, index: number) => {
    const isLeading =
      participants.length > 1 &&
      participant.tips_received ===
        Math.max(...participants.map((p) => p.tips_received)) &&
      participant.tips_received > 0;

    return (
      <View key={participant.id} style={styles.streamContainer}>
        {/* Video placeholder - would use Agora RTC View here */}
        <View style={styles.videoPlaceholder}>
          <LinearGradient
            colors={index === 0 ? ['#FF6B35', '#FF4500'] : ['#00BFFF', '#0066FF']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Image
            source={{
              uri:
                participant.profile_picture_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(participant.username)}&background=random`,
            }}
            style={styles.streamAvatar}
          />
          <Text style={styles.streamUsername}>{participant.full_name || participant.username}</Text>
        </View>

        {/* Leading indicator */}
        {isLeading && (
          <View style={styles.leadingBadge}>
            <LinearGradient
              colors={['#FFD700', '#FFA500']}
              style={styles.leadingGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="trophy" size={12} color="#000" />
              <Text style={styles.leadingText}>Leading</Text>
            </LinearGradient>
          </View>
        )}

        {/* Tip count */}
        <View style={styles.tipCount}>
          <LinearGradient
            colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.5)']}
            style={styles.tipCountGradient}
          >
            <Ionicons name="gift" size={16} color="#FFD700" />
            <Text style={styles.tipCountText}>{formatAmount(participant.tips_received)}</Text>
          </LinearGradient>
        </View>

        {/* Tip button */}
        <TouchableOpacity
          style={styles.tipButton}
          onPress={() => handleTip(participant)}
        >
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            style={styles.tipButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.tipButtonText}>Tip</Text>
            <Ionicons name="gift" size={16} color="#000" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTipAnimation = (tip: TipEvent, index: number) => {
    const anim = tipAnimations[index];
    if (!anim) return null;

    return (
      <Animated.View
        key={tip.id}
        style={[
          styles.tipAnimation,
          {
            opacity: anim,
            transform: [
              {
                translateY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [50, 0],
                }),
              },
              {
                scale: anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0.5, 1.2, 1],
                }),
              },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,215,0,0.9)', 'rgba(255,165,0,0.9)']}
          style={styles.tipAnimationGradient}
        >
          <Ionicons name="gift" size={20} color="#000" />
          <View>
            <Text style={styles.tipAnimationSender}>{tip.sender_full_name || tip.sender_username}</Text>
            <Text style={styles.tipAnimationAmount}>sent {formatAmount(tip.amount)}</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    );
  };

  const renderComment = ({ item }: { item: Comment }) => (
    <View style={styles.comment}>
      <Text style={styles.commentUsername}>{item.full_name || item.username}</Text>
      <Text style={styles.commentText}>{item.text}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Battle Ended Overlay */}
      {isEnding && (
        <View style={styles.endingOverlay}>
          <BlurView intensity={80} style={StyleSheet.absoluteFill} />
          <Text style={styles.endingText}>Battle Ended!</Text>
          <Text style={styles.endingSubtext}>Calculating results...</Text>
        </View>
      )}

      {/* Split Screen Streams */}
      <View style={styles.streamsContainer}>
        {participants.slice(0, 2).map((p, i) => renderParticipantStream(p, i))}

        {/* VS Indicator */}
        <View style={styles.vsIndicator}>
          <LinearGradient
            colors={['#FF6B35', '#FF4500']}
            style={styles.vsGradient}
          >
            <Text style={styles.vsText}>VS</Text>
          </LinearGradient>
        </View>
      </View>

      {/* Header Overlay */}
      <SafeAreaView style={styles.headerOverlay}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleLeaveBattle} style={styles.closeButton}>
            <BlurView intensity={50} style={styles.blurButton}>
              <Ionicons name="close" size={24} color="#fff" />
            </BlurView>
          </TouchableOpacity>

          <View style={styles.headerStats}>
            <View style={styles.statBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.statText}>LIVE</Text>
            </View>
            <View style={styles.statBadge}>
              <Ionicons name="eye" size={14} color="#fff" />
              <Text style={styles.statText}>{viewerCount.toLocaleString()}</Text>
            </View>
            <View style={styles.statBadge}>
              <Ionicons name="time" size={14} color="#fff" />
              <Text style={styles.statText}>{formatDuration(duration)}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={handleEndBattle} style={styles.endButton}>
            <BlurView intensity={50} style={styles.blurButton}>
              <Ionicons name="stop" size={20} color="#FF4444" />
            </BlurView>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Tip Animations */}
      <View style={styles.tipAnimationsContainer}>
        {tipEvents.slice(-5).map((tip, i) => renderTipAnimation(tip, i))}
      </View>

      {/* Comments */}
      <View style={styles.commentsContainer}>
        <FlatList
          ref={commentsRef}
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderComment}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => commentsRef.current?.scrollToEnd()}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
        />
      </View>

      {/* Tip Modal */}
      {selectedParticipant && (
        <TipModal
          visible={showTipModal}
          onClose={() => setShowTipModal(false)}
          onConfirm={async (amount, message, isAnonymous) => {
            try {
              await awsAPI.sendTip({
                receiverId: selectedParticipant.user_id,
                amount: amount,
                message,
                isAnonymous,
                contextType: 'battle',
                contextId: battleId,
              });
              setShowTipModal(false);
              loadBattleState();
            } catch (error) {
              if (__DEV__) console.warn('Send tip error:', error);
            }
          }}
          receiver={{
            id: selectedParticipant.user_id,
            username: selectedParticipant.username,
            displayName: selectedParticipant.full_name || selectedParticipant.username,
            avatarUrl: selectedParticipant.profile_picture_url,
          }}
          contextType="battle"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  streamsContainer: {
    flex: 1,
  },
  streamContainer: {
    height: STREAM_HEIGHT,
    position: 'relative',
  },
  videoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#fff',
    marginBottom: 8,
  },
  streamUsername: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  leadingBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  leadingGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  leadingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  tipCount: {
    position: 'absolute',
    top: 12,
    right: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  tipCountGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  tipCountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
  },
  tipButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  tipButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  tipButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  vsIndicator: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -25,
    marginTop: -25,
    zIndex: 10,
  },
  vsGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  vsText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  blurButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF4444',
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  endButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  tipAnimationsContainer: {
    position: 'absolute',
    left: 16,
    bottom: 150,
    gap: 8,
  },
  tipAnimation: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tipAnimationGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  tipAnimationSender: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  tipAnimationAmount: {
    fontSize: 11,
    color: '#333',
  },
  commentsContainer: {
    position: 'absolute',
    left: 16,
    right: 100,
    bottom: 40,
    height: 100,
  },
  comment: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 4,
    gap: 6,
    alignSelf: 'flex-start',
  },
  commentUsername: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF6B35',
  },
  commentText: {
    fontSize: 12,
    color: '#fff',
    flex: 1,
  },
  endingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endingText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FFD700',
    textShadowColor: 'rgba(255,215,0,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  endingSubtext: {
    fontSize: 16,
    color: '#fff',
    marginTop: 8,
  },
});
