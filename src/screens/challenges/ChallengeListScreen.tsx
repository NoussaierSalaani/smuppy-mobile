/**
 * ChallengeListScreen
 * Browse and discover Peak Challenges
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Animated,
  Dimensions,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';

const { width, height } = Dimensions.get('window');
const CARD_WIDTH = width - 32;
const CARD_HEIGHT = 220;

interface Challenge {
  id: string;
  peak_id: string;
  creator: {
    id: string;
    username: string;
    profile_picture_url?: string;
    is_verified: boolean;
  };
  challenge_type: {
    name: string;
    icon: string;
    color: string;
  };
  title: string;
  description?: string;
  rules?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  total_prize_pool: number;
  response_count: number;
  view_count: number;
  is_featured: boolean;
  tips_enabled: boolean;
  expires_at?: string;
  created_at: string;
}

type FilterType = 'trending' | 'new' | 'ending_soon' | 'tagged';

const FILTERS: { key: FilterType; label: string; icon: string }[] = [
  { key: 'trending', label: 'Trending', icon: 'flame' },
  { key: 'new', label: 'New', icon: 'sparkles' },
  { key: 'ending_soon', label: 'Ending Soon', icon: 'timer' },
  { key: 'tagged', label: 'For You', icon: 'person' },
];

export default function ChallengeListScreen() {
  const navigation = useNavigation<any>();
  const { formatAmount } = useCurrency();

  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('trending');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const scrollY = useRef(new Animated.Value(0)).current;
  const filterAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadChallenges(true);
  }, [activeFilter]);

  const loadChallenges = async (reset = false) => {
    if (!reset && !hasMore) return;

    try {
      const newPage = reset ? 1 : page;
      const response = await awsAPI.getChallenges({
        filter: activeFilter,
        page: newPage,
        limit: 10,
      });

      if (response.success) {
        const newChallenges = response.challenges || [];
        setChallenges(reset ? newChallenges : [...challenges, ...newChallenges]);
        setHasMore(newChallenges.length === 10);
        setPage(newPage + 1);
      }
    } catch (error) {
      console.error('Load challenges error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadChallenges(true);
  };

  const handleFilterChange = (filter: FilterType) => {
    if (filter === activeFilter) return;

    Animated.spring(filterAnim, {
      toValue: FILTERS.findIndex((f) => f.key === filter),
      useNativeDriver: true,
      friction: 6,
    }).start();

    setActiveFilter(filter);
    setIsLoading(true);
  };

  const renderChallengeCard = ({ item, index }: { item: Challenge; index: number }) => {
    const inputRange = [
      (index - 1) * CARD_HEIGHT,
      index * CARD_HEIGHT,
      (index + 1) * CARD_HEIGHT,
    ];

    const scale = scrollY.interpolate({
      inputRange,
      outputRange: [0.95, 1, 0.95],
      extrapolate: 'clamp',
    });

    const opacity = scrollY.interpolate({
      inputRange,
      outputRange: [0.7, 1, 0.7],
      extrapolate: 'clamp',
    });

    const isExpiringSoon =
      item.expires_at && new Date(item.expires_at).getTime() - Date.now() < 24 * 60 * 60 * 1000;

    return (
      <Animated.View style={[styles.cardContainer, { transform: [{ scale }], opacity }]}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ChallengeDetail', { challengeId: item.id })}
        >
          <View style={styles.card}>
            {item.thumbnail_url ? (
              <Image source={{ uri: item.thumbnail_url }} style={styles.cardBackground} />
            ) : (
              <LinearGradient
                colors={[item.challenge_type?.color || '#FF6B35', '#000']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardBackground}
              />
            )}

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.9)']}
              style={styles.cardOverlay}
            />

            {/* Featured Badge */}
            {item.is_featured && (
              <View style={styles.featuredBadge}>
                <LinearGradient
                  colors={['#FFD700', '#FFA500']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.featuredGradient}
                >
                  <Ionicons name="star" size={12} color="#000" />
                  <Text style={styles.featuredText}>Featured</Text>
                </LinearGradient>
              </View>
            )}

            {/* Expiring Soon Badge */}
            {isExpiringSoon && (
              <View style={[styles.featuredBadge, { right: item.is_featured ? 100 : 12 }]}>
                <View style={styles.expiringBadge}>
                  <Ionicons name="timer" size={12} color="#FF4444" />
                  <Text style={styles.expiringText}>Ending Soon</Text>
                </View>
              </View>
            )}

            {/* Challenge Type */}
            <View style={styles.challengeType}>
              <Text style={styles.challengeTypeIcon}>{item.challenge_type?.icon || '🎯'}</Text>
              <Text style={styles.challengeTypeName}>{item.challenge_type?.name || 'Challenge'}</Text>
            </View>

            {/* Card Content */}
            <View style={styles.cardContent}>
              {/* Creator */}
              <View style={styles.creatorRow}>
                <Image
                  source={{
                    uri:
                      item.creator.profile_picture_url ||
                      `https://ui-avatars.com/api/?name=${item.creator.username}&background=random`,
                  }}
                  style={styles.creatorAvatar}
                />
                <Text style={styles.creatorName}>@{item.creator.username}</Text>
                {item.creator.is_verified && (
                  <Ionicons name="checkmark-circle" size={14} color="#00BFFF" />
                )}
              </View>

              {/* Title */}
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Ionicons name="people" size={16} color="#fff" />
                  <Text style={styles.statText}>{item.response_count} responses</Text>
                </View>

                <View style={styles.stat}>
                  <Ionicons name="eye" size={16} color="#fff" />
                  <Text style={styles.statText}>{item.view_count.toLocaleString()}</Text>
                </View>

                {item.tips_enabled && item.total_prize_pool > 0 && (
                  <View style={[styles.stat, styles.prizeStat]}>
                    <Ionicons name="gift" size={16} color="#FFD700" />
                    <Text style={[styles.statText, styles.prizeText]}>
                      {formatAmount(item.total_prize_pool)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => navigation.navigate('CreateChallengeResponse', { challengeId: item.id })}
            >
              <LinearGradient
                colors={['#FF6B35', '#FF4500']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaGradient}
              >
                <Ionicons name="videocam" size={18} color="#fff" />
                <Text style={styles.ctaText}>Accept Challenge</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Challenges</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('CreateChallenge')}
        >
          <LinearGradient
            colors={['#FF6B35', '#FF4500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createGradient}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {FILTERS.map((filter, index) => (
          <TouchableOpacity
            key={filter.key}
            style={[styles.filterTab, activeFilter === filter.key && styles.filterTabActive]}
            onPress={() => handleFilterChange(filter.key)}
          >
            <Ionicons
              name={filter.icon as any}
              size={18}
              color={activeFilter === filter.key ? '#FF6B35' : '#888'}
            />
            <Text
              style={[styles.filterText, activeFilter === filter.key && styles.filterTextActive]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="trophy-outline" size={64} color="#444" />
      <Text style={styles.emptyTitle}>No Challenges Yet</Text>
      <Text style={styles.emptySubtitle}>
        {activeFilter === 'tagged'
          ? "You haven't been tagged in any challenges"
          : 'Be the first to create a challenge!'}
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => navigation.navigate('CreateChallenge')}
      >
        <LinearGradient
          colors={['#FF6B35', '#FF4500']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.emptyButtonGradient}
        >
          <Text style={styles.emptyButtonText}>Create Challenge</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {renderHeader()}

        {isLoading && challenges.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF6B35" />
          </View>
        ) : (
          <Animated.FlatList
            data={challenges}
            keyExtractor={(item) => item.id}
            renderItem={renderChallengeCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
              useNativeDriver: true,
            })}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FF6B35"
                colors={['#FF6B35']}
              />
            }
            onEndReached={() => loadChallenges(false)}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={renderEmpty}
            ListFooterComponent={
              hasMore && challenges.length > 0 ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color="#FF6B35" />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  createButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  createGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 4,
  },
  filterTabActive: {
    backgroundColor: 'rgba(255,107,53,0.2)',
  },
  filterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  filterTextActive: {
    color: '#FF6B35',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  cardContainer: {
    marginBottom: 16,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  cardBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  featuredGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  featuredText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  expiringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,68,68,0.2)',
    gap: 4,
  },
  expiringText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF4444',
  },
  challengeType: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  challengeTypeIcon: {
    fontSize: 14,
  },
  challengeTypeName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  cardContent: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  creatorAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fff',
  },
  creatorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  prizeStat: {
    backgroundColor: 'rgba(255,215,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  prizeText: {
    color: '#FFD700',
    fontWeight: '700',
  },
  ctaButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 24,
    borderRadius: 25,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
