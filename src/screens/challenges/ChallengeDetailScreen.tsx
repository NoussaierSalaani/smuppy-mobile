/**
 * ChallengeDetailScreen
 * View a Peak Challenge and its responses
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Animated,
  Dimensions,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Video, ResizeMode } from 'expo-av';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import TipButton from '../../components/tips/TipButton';

const { width, height } = Dimensions.get('window');

interface ChallengeResponse {
  id: string;
  peak_id: string;
  user: {
    id: string;
    username: string;
    profile_picture_url?: string;
    is_verified: boolean;
  };
  media_url: string;
  thumbnail_url?: string;
  view_count: number;
  like_count: number;
  tips_received: number;
  is_winner?: boolean;
  created_at: string;
}

interface Challenge {
  id: string;
  peak_id: string;
  creator: {
    id: string;
    username: string;
    profile_picture_url?: string;
    is_verified: boolean;
    is_pro_creator?: boolean;
  };
  challenge_type: {
    name: string;
    icon: string;
    color: string;
  };
  title: string;
  description?: string;
  rules?: string;
  media_url?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  total_prize_pool: number;
  response_count: number;
  view_count: number;
  is_public: boolean;
  tips_enabled: boolean;
  expires_at?: string;
  created_at: string;
}

export default function ChallengeDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { formatAmount } = useCurrency();

  const { challengeId } = route.params;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [responses, setResponses] = useState<ChallengeResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'responses' | 'rules'>('responses');
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const videoRef = useRef<Video>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadChallenge();
  }, [challengeId]);

  const loadChallenge = async () => {
    try {
      const [challengeRes, responsesRes] = await Promise.all([
        awsAPI.getChallengeDetail(challengeId),
        awsAPI.getChallengeResponses(challengeId),
      ]);

      if (challengeRes.success) {
        setChallenge(challengeRes.challenge);
      }

      if (responsesRes.success) {
        setResponses(responsesRes.responses || []);
      }
    } catch (error) {
      console.error('Load challenge error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadChallenge();
  };

  const handleShare = async () => {
    if (!challenge) return;

    try {
      await Share.share({
        message: `Check out this challenge on Smuppy: "${challenge.title}" by @${challenge.creator.username}`,
        url: `https://smuppy.com/challenge/${challengeId}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleAcceptChallenge = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('CreatePeak', { challengeId, replyToChallenge: challenge });
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;

    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${minutes}m left`;
  };

  const renderResponseCard = ({ item, index }: { item: ChallengeResponse; index: number }) => (
    <TouchableOpacity
      style={styles.responseCard}
      onPress={() => navigation.navigate('PeakView', { peakId: item.peak_id })}
      activeOpacity={0.9}
    >
      <Image
        source={{ uri: item.thumbnail_url || item.media_url }}
        style={styles.responseThumbnail}
      />

      {/* Winner Badge */}
      {item.is_winner && (
        <View style={styles.winnerBadge}>
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            style={styles.winnerGradient}
          >
            <Ionicons name="trophy" size={12} color="#000" />
            <Text style={styles.winnerText}>Winner</Text>
          </LinearGradient>
        </View>
      )}

      {/* Rank */}
      {index < 3 && !item.is_winner && (
        <View style={[styles.rankBadge, { backgroundColor: getRankColor(index) }]}>
          <Text style={styles.rankText}>#{index + 1}</Text>
        </View>
      )}

      {/* Stats overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.responseOverlay}
      >
        <View style={styles.responseUserRow}>
          <Image
            source={{
              uri:
                item.user.profile_picture_url ||
                `https://ui-avatars.com/api/?name=${item.user.username}&background=random`,
            }}
            style={styles.responseAvatar}
          />
          <Text style={styles.responseUsername}>@{item.user.username}</Text>
          {item.user.is_verified && (
            <Ionicons name="checkmark-circle" size={12} color="#00BFFF" />
          )}
        </View>

        <View style={styles.responseStats}>
          <View style={styles.responseStat}>
            <Ionicons name="eye" size={12} color="#fff" />
            <Text style={styles.responseStatText}>{item.view_count}</Text>
          </View>
          <View style={styles.responseStat}>
            <Ionicons name="heart" size={12} color="#fff" />
            <Text style={styles.responseStatText}>{item.like_count}</Text>
          </View>
          {item.tips_received > 0 && (
            <View style={[styles.responseStat, styles.tipStat]}>
              <Ionicons name="gift" size={12} color="#FFD700" />
              <Text style={[styles.responseStatText, { color: '#FFD700' }]}>
                {formatAmount(item.tips_received)}
              </Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  const getRankColor = (index: number) => {
    const colors = ['#FFD700', '#C0C0C0', '#CD7F32'];
    return colors[index] || '#888';
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!challenge) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />
        <Text style={styles.errorText}>Challenge not found</Text>
      </View>
    );
  }

  const isExpired = challenge.expires_at && new Date(challenge.expires_at) < new Date();

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#FF6B35" />
        }
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
          useNativeDriver: true,
        })}
        scrollEventThrottle={16}
      >
        {/* Header Video/Image */}
        <View style={styles.mediaContainer}>
          {challenge.media_url ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setIsVideoPlaying(!isVideoPlaying)}
            >
              <Video
                ref={videoRef}
                source={{ uri: challenge.media_url }}
                style={styles.media}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay={isVideoPlaying}
                isMuted={false}
              />
              {!isVideoPlaying && (
                <View style={styles.playButton}>
                  <Ionicons name="play" size={40} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <LinearGradient
              colors={[challenge.challenge_type.color, `${challenge.challenge_type.color}66`]}
              style={styles.media}
            >
              <Text style={styles.challengeIcon}>{challenge.challenge_type.icon}</Text>
            </LinearGradient>
          )}

          <LinearGradient colors={['transparent', '#0f0f1a']} style={styles.mediaOverlay} />

          {/* Back Button */}
          <SafeAreaView style={styles.headerOverlay}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <BlurView intensity={50} style={styles.blurButton}>
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </BlurView>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <BlurView intensity={50} style={styles.blurButton}>
                <Ionicons name="share-outline" size={22} color="#fff" />
              </BlurView>
            </TouchableOpacity>
          </SafeAreaView>

          {/* Time remaining badge */}
          {challenge.expires_at && !isExpired && (
            <View style={styles.timeBadge}>
              <Ionicons name="timer" size={14} color="#fff" />
              <Text style={styles.timeText}>{formatTimeRemaining(challenge.expires_at)}</Text>
            </View>
          )}
        </View>

        {/* Challenge Info */}
        <View style={styles.infoContainer}>
          {/* Type & Stats */}
          <View style={styles.typeRow}>
            <View
              style={[styles.typeBadge, { backgroundColor: `${challenge.challenge_type.color}33` }]}
            >
              <Text style={styles.typeIcon}>{challenge.challenge_type.icon}</Text>
              <Text style={[styles.typeName, { color: challenge.challenge_type.color }]}>
                {challenge.challenge_type.name}
              </Text>
            </View>

            {challenge.tips_enabled && challenge.total_prize_pool > 0 && (
              <View style={styles.prizeBadge}>
                <Ionicons name="gift" size={14} color="#FFD700" />
                <Text style={styles.prizeText}>{formatAmount(challenge.total_prize_pool)}</Text>
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={styles.title}>{challenge.title}</Text>

          {/* Creator */}
          <TouchableOpacity
            style={styles.creatorRow}
            onPress={() => navigation.navigate('UserProfile', { userId: challenge.creator.id })}
          >
            <Image
              source={{
                uri:
                  challenge.creator.profile_picture_url ||
                  `https://ui-avatars.com/api/?name=${challenge.creator.username}&background=random`,
              }}
              style={styles.creatorAvatar}
            />
            <View style={styles.creatorInfo}>
              <View style={styles.creatorNameRow}>
                <Text style={styles.creatorName}>@{challenge.creator.username}</Text>
                {challenge.creator.is_verified && (
                  <Ionicons name="checkmark-circle" size={14} color="#00BFFF" />
                )}
              </View>
              <Text style={styles.creatorLabel}>Challenge Creator</Text>
            </View>

            {/* Tip creator button (only for pro creators) */}
            {challenge.creator.is_pro_creator && (
              <TipButton
                recipient={{
                  id: challenge.creator.id,
                  username: challenge.creator.username,
                  avatarUrl: challenge.creator.profile_picture_url,
                }}
                contextType="peak"
                contextId={challenge.peak_id}
                variant="icon"
              />
            )}
          </TouchableOpacity>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{challenge.response_count}</Text>
              <Text style={styles.statLabel}>Responses</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{challenge.view_count.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Views</Text>
            </View>
            {challenge.duration_seconds && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{challenge.duration_seconds}s</Text>
                  <Text style={styles.statLabel}>Max Duration</Text>
                </View>
              </>
            )}
          </View>

          {/* Description */}
          {challenge.description && (
            <View style={styles.descriptionContainer}>
              <Text style={styles.description}>{challenge.description}</Text>
            </View>
          )}

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'responses' && styles.tabActive]}
              onPress={() => setActiveTab('responses')}
            >
              <Text style={[styles.tabText, activeTab === 'responses' && styles.tabTextActive]}>
                Responses ({responses.length})
              </Text>
            </TouchableOpacity>

            {challenge.rules && (
              <TouchableOpacity
                style={[styles.tab, activeTab === 'rules' && styles.tabActive]}
                onPress={() => setActiveTab('rules')}
              >
                <Text style={[styles.tabText, activeTab === 'rules' && styles.tabTextActive]}>
                  Rules
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Tab Content */}
          {activeTab === 'responses' ? (
            <View style={styles.responsesGrid}>
              {responses.length > 0 ? (
                responses.map((response, index) => (
                  <View key={response.id} style={styles.responseWrapper}>
                    {renderResponseCard({ item: response, index })}
                  </View>
                ))
              ) : (
                <View style={styles.emptyResponses}>
                  <Ionicons name="videocam-outline" size={48} color="#444" />
                  <Text style={styles.emptyTitle}>No responses yet</Text>
                  <Text style={styles.emptySubtitle}>Be the first to accept this challenge!</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.rulesContainer}>
              <Text style={styles.rulesText}>{challenge.rules}</Text>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* Accept Challenge Button */}
      {!isExpired && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.acceptButton} onPress={handleAcceptChallenge}>
            <LinearGradient
              colors={['#FF6B35', '#FF4500']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.acceptGradient}
            >
              <Ionicons name="videocam" size={22} color="#fff" />
              <Text style={styles.acceptText}>Accept Challenge</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
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
  mediaContainer: {
    height: height * 0.45,
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeIcon: {
    fontSize: 80,
  },
  mediaOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  playButton: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  shareButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  blurButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeBadge: {
    position: 'absolute',
    bottom: 20,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  infoContainer: {
    padding: 16,
    paddingBottom: 120,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  typeIcon: {
    fontSize: 16,
  },
  typeName: {
    fontSize: 13,
    fontWeight: '600',
  },
  prizeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  prizeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFD700',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 16,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  creatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  creatorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  creatorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  creatorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  creatorLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  descriptionContainer: {
    marginBottom: 20,
  },
  description: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FF6B35',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#FF6B35',
  },
  responsesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  responseWrapper: {
    width: (width - 40) / 2,
  },
  responseCard: {
    aspectRatio: 9 / 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  responseThumbnail: {
    width: '100%',
    height: '100%',
  },
  winnerBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  winnerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  winnerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  rankBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000',
  },
  responseOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
  },
  responseUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 4,
  },
  responseAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  responseUsername: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  responseStats: {
    flexDirection: 'row',
    gap: 8,
  },
  responseStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  responseStatText: {
    fontSize: 10,
    color: '#fff',
  },
  tipStat: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  emptyResponses: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    width: '100%',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
  },
  rulesContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  rulesText: {
    fontSize: 15,
    color: '#ccc',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: 'rgba(15,15,26,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  acceptButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  acceptGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  acceptText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
