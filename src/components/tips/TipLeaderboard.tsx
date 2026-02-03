/**
 * TipLeaderboard
 * Shows top tippers for a creator
 */

import React, { useState, useEffect, useRef } from 'react';
import { AvatarImage } from '../OptimizedImage';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';

interface TopTipper {
  rank: number;
  user_id: string;
  username: string;
  profile_picture_url?: string;
  is_verified: boolean;
  total_tips: number;
  tip_count: number;
}

interface TipLeaderboardProps {
  creatorId: string;
  creatorUsername: string;
  compact?: boolean;
  maxItems?: number;
}

type Period = 'weekly' | 'monthly' | 'all_time';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'weekly', label: 'This Week' },
  { key: 'monthly', label: 'This Month' },
  { key: 'all_time', label: 'All Time' },
];

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const RANK_ICONS = ['trophy', 'medal', 'ribbon'];

export default function TipLeaderboard({
  creatorId,
  creatorUsername,
  compact = false,
  maxItems = 10,
}: TipLeaderboardProps) {
  const navigation = useNavigation<any>();
  const { formatAmount } = useCurrency();

  const [topTippers, setTopTippers] = useState<TopTipper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('all_time');

  const scaleAnims = useRef<Animated.Value[]>([]).current;

  useEffect(() => {
    loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  const loadLeaderboard = async () => {
    try {
      setIsLoading(true);
      const response = await awsAPI.getTipsLeaderboard(creatorId, selectedPeriod);

      if (response.success) {
        const tippers = (response.leaderboard || []).slice(0, maxItems);
        setTopTippers(tippers);

        // Initialize animations
        while (scaleAnims.length < tippers.length) {
          scaleAnims.push(new Animated.Value(0));
        }

        // Animate in
        tippers.forEach((_, i) => {
          Animated.spring(scaleAnims[i], {
            toValue: 1,
            useNativeDriver: true,
            delay: i * 50,
          }).start();
        });
      }
    } catch (error) {
      if (__DEV__) console.warn('Load leaderboard error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const renderPodiumItem = (tipper: TopTipper, position: number) => {
    const isFirst = position === 0;
    const containerHeight = isFirst ? 140 : 110;
    const avatarSize = isFirst ? 64 : 52;

    return (
      <Animated.View
        style={[
          styles.podiumItem,
          { height: containerHeight },
          position === 0 && styles.podiumFirst,
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.navigate('UserProfile', { userId: tipper.user_id })}
        >
          {/* Crown for #1 */}
          {position === 0 && (
            <View style={styles.crownContainer}>
              <Ionicons name="diamond" size={24} color="#FFD700" />
            </View>
          )}

          {/* Avatar */}
          <View
            style={[
              styles.podiumAvatarContainer,
              { borderColor: RANK_COLORS[position] },
            ]}
          >
            <AvatarImage source={tipper.profile_picture_url} size={avatarSize} />
            <View style={[styles.rankBadge, { backgroundColor: RANK_COLORS[position] }]}>
              <Text style={styles.rankText}>{position + 1}</Text>
            </View>
          </View>

          {/* Username */}
          <Text style={styles.podiumUsername} numberOfLines={1}>
            @{tipper.username}
          </Text>

          {/* Amount */}
          <LinearGradient
            colors={[`${RANK_COLORS[position]}44`, 'transparent']}
            style={styles.podiumAmountContainer}
          >
            <Text style={[styles.podiumAmount, { color: RANK_COLORS[position] }]}>
              {formatAmount(tipper.total_tips)}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderListItem = ({ item, index }: { item: TopTipper; index: number }) => {
    const scaleAnim = scaleAnims[index] || new Animated.Value(1);
    const isTopThree = index < 3;

    return (
      <Animated.View style={[styles.listItem, { transform: [{ scale: scaleAnim }] }]}>
        <TouchableOpacity
          style={styles.listItemContent}
          onPress={() => navigation.navigate('UserProfile', { userId: item.user_id })}
        >
          {/* Rank */}
          <View
            style={[
              styles.listRank,
              isTopThree && { backgroundColor: `${RANK_COLORS[index]}22` },
            ]}
          >
            {isTopThree ? (
              <Ionicons name={RANK_ICONS[index] as any} size={18} color={RANK_COLORS[index]} />
            ) : (
              <Text style={styles.listRankText}>{index + 1}</Text>
            )}
          </View>

          {/* Avatar & Name */}
          <AvatarImage source={item.profile_picture_url} size={40} style={styles.listAvatar} />
          <View style={styles.listInfo}>
            <View style={styles.listNameRow}>
              <Text style={styles.listUsername}>@{item.username}</Text>
              {item.is_verified && (
                <Ionicons name="checkmark-circle" size={14} color="#00BFFF" />
              )}
            </View>
            <Text style={styles.listTipCount}>{item.tip_count} tips</Text>
          </View>

          {/* Amount */}
          <View style={styles.listAmountContainer}>
            <Text style={[styles.listAmount, isTopThree && { color: RANK_COLORS[index] }]}>
              {formatAmount(item.total_tips)}
            </Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactHeader}>
          <View style={styles.compactHeaderLeft}>
            <Ionicons name="trophy" size={18} color="#FFD700" />
            <Text style={styles.compactTitle}>Top Supporters</Text>
          </View>
          <TouchableOpacity
            onPress={() =>
              navigation.navigate('UserProfile', { userId: creatorId })
            }
          >
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color="#FF6B35" style={styles.loader} />
        ) : topTippers.length > 0 ? (
          <View style={styles.compactList}>
            {topTippers.slice(0, 3).map((tipper, index) => (
              <TouchableOpacity
                key={tipper.user_id}
                style={styles.compactItem}
                onPress={() => navigation.navigate('UserProfile', { userId: tipper.user_id })}
              >
                <View
                  style={[
                    styles.compactAvatarContainer,
                    { borderColor: RANK_COLORS[index] },
                  ]}
                >
                  <Image
                    source={{
                      uri:
                        tipper.profile_picture_url ||
                        `https://ui-avatars.com/api/?name=${tipper.username}&background=random`,
                    }}
                    style={styles.compactAvatar}
                  />
                  <View style={[styles.compactRankBadge, { backgroundColor: RANK_COLORS[index] }]}>
                    <Text style={styles.compactRankText}>{index + 1}</Text>
                  </View>
                </View>
                <Text style={styles.compactUsername} numberOfLines={1}>
                  {tipper.username}
                </Text>
                <Text style={[styles.compactAmount, { color: RANK_COLORS[index] }]}>
                  {formatAmount(tipper.total_tips)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>No supporters yet</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.headerIconGradient}>
            <Ionicons name="trophy" size={24} color="#000" />
          </LinearGradient>
        </View>
        <View>
          <Text style={styles.headerTitle}>Top Supporters</Text>
          <Text style={styles.headerSubtitle}>@{creatorUsername}</Text>
        </View>
      </View>

      {/* Period Tabs */}
      <View style={styles.periodTabs}>
        {PERIODS.map((period) => (
          <TouchableOpacity
            key={period.key}
            style={[styles.periodTab, selectedPeriod === period.key && styles.periodTabActive]}
            onPress={() => setSelectedPeriod(period.key)}
          >
            <Text
              style={[
                styles.periodText,
                selectedPeriod === period.key && styles.periodTextActive,
              ]}
            >
              {period.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color="#FF6B35" size="large" style={styles.loader} />
      ) : topTippers.length > 0 ? (
        <>
          {/* Podium (Top 3) */}
          {topTippers.length >= 3 && (
            <View style={styles.podiumContainer}>
              {renderPodiumItem(topTippers[1], 1)}
              {renderPodiumItem(topTippers[0], 0)}
              {renderPodiumItem(topTippers[2], 2)}
            </View>
          )}

          {/* List (4+) */}
          <FlatList
            data={topTippers.slice(3)}
            keyExtractor={(item) => item.user_id}
            renderItem={({ item, index }) =>
              renderListItem({ item, index: index + 3 })
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="gift-outline" size={48} color="#444" />
          <Text style={styles.emptyTitle}>No supporters yet</Text>
          <Text style={styles.emptySubtitle}>
            Be the first to support @{creatorUsername}!
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  headerIcon: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  headerIconGradient: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#888',
  },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodTabActive: {
    backgroundColor: 'rgba(255,215,0,0.2)',
  },
  periodText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
  },
  periodTextActive: {
    color: '#FFD700',
  },
  podiumContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  podiumItem: {
    width: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  podiumFirst: {
    marginBottom: 20,
  },
  crownContainer: {
    marginBottom: 8,
  },
  podiumAvatarContainer: {
    position: 'relative',
    borderWidth: 3,
    borderRadius: 50,
    padding: 3,
  },
  podiumAvatar: {
    borderRadius: 50,
  },
  rankBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000',
  },
  podiumUsername: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
    maxWidth: 90,
    textAlign: 'center',
  },
  podiumAmountContainer: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  podiumAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    gap: 8,
  },
  listItem: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  listItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  listRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginRight: 12,
  },
  listRankText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
  },
  listAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  listInfo: {
    flex: 1,
  },
  listNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  listTipCount: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  listAmountContainer: {
    paddingLeft: 12,
  },
  listAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD700',
  },
  loader: {
    marginTop: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
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
    textAlign: 'center',
  },
  // Compact styles
  compactContainer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  compactHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  seeAllText: {
    fontSize: 13,
    color: '#FF6B35',
    fontWeight: '600',
  },
  compactList: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  compactItem: {
    alignItems: 'center',
    width: 80,
  },
  compactAvatarContainer: {
    position: 'relative',
    borderWidth: 2,
    borderRadius: 30,
    padding: 2,
    marginBottom: 6,
  },
  compactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  compactRankBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactRankText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#000',
  },
  compactUsername: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '500',
    maxWidth: 70,
    textAlign: 'center',
  },
  compactAmount: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
});
