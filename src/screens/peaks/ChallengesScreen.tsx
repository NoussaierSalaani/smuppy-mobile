import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ChallengeCard, { type Challenge } from '../../components/peaks/ChallengeCard';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { awsAPI } from '../../services/aws-api';

const { width } = Dimensions.get('window');

type RootStackParamList = {
  PeakView: { peaks: Array<{
    id: string;
    thumbnail: string;
    videoUrl?: string;
    duration: number;
    user: { id: string; name: string; avatar: string };
    views: number;
    createdAt: string;
    isChallenge?: boolean;
    challengeTitle?: string;
  }>; initialIndex: number };
  CreatePeak: { challengeId: string; challengeTitle: string };
  [key: string]: object | undefined;
};

const ChallengesScreen = (): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const [trendingChallenges, setTrendingChallenges] = useState<Challenge[]>([]);
  const [newChallenges, setNewChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchChallenges = useCallback(async () => {
    try {
      const [trendingRes, newRes] = await Promise.all([
        awsAPI.getChallenges({ filter: 'trending', limit: 10 }),
        awsAPI.getChallenges({ filter: 'new', limit: 20 }),
      ]);

      const mapChallenge = (c: Record<string, unknown>): Challenge => ({
        id: c.id as string,
        peakId: c.peakId as string,
        title: c.title as string,
        description: c.description as string | undefined,
        endsAt: c.endsAt as string | undefined,
        responseCount: (c.responseCount as number) || 0,
        viewCount: (c.viewCount as number) || 0,
        status: c.status as string,
        createdAt: c.createdAt as string,
        peak: c.peak as { videoUrl: string; thumbnailUrl: string },
        creator: c.creator as Challenge['creator'],
        hasResponded: c.hasResponded as boolean | undefined,
      });

      if (trendingRes.challenges) {
        setTrendingChallenges(trendingRes.challenges.map(mapChallenge));
      }
      if (newRes.challenges) {
        setNewChallenges(newRes.challenges.map(mapChallenge));
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch challenges:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchChallenges();
  }, [fetchChallenges]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchChallenges();
  }, [fetchChallenges]);

  const handleChallengePress = useCallback((challenge: Challenge) => {
    const toCdn = (url?: string | null) => {
      if (!url) return '';
      return url.startsWith('http') ? url : awsAPI.getCDNUrl(url);
    };

    navigation.navigate('PeakView', {
      peaks: [{
        id: challenge.peakId,
        thumbnail: toCdn(challenge.peak.thumbnailUrl),
        videoUrl: toCdn(challenge.peak.videoUrl) || undefined,
        duration: 0,
        user: {
          id: challenge.creator.id,
          name: challenge.creator.displayName || challenge.creator.username,
          avatar: toCdn(challenge.creator.avatarUrl),
        },
        views: challenge.viewCount,
        createdAt: challenge.createdAt,
        isChallenge: true,
        challengeTitle: challenge.title,
      }],
      initialIndex: 0,
    });
  }, [navigation]);

  const handleAcceptChallenge = useCallback((challenge: Challenge) => {
    navigation.navigate('CreatePeak', {
      challengeId: challenge.id,
      challengeTitle: challenge.title,
    });
  }, [navigation]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const renderTrendingItem = useCallback(({ item }: { item: Challenge }) => (
    <ChallengeCard
      challenge={item}
      onPress={handleChallengePress}
      onAccept={handleAcceptChallenge}
    />
  ), [handleChallengePress, handleAcceptChallenge]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={isDark ? colors.white : colors.dark} />
        </TouchableOpacity>
        <View style={styles.headerTitleRow}>
          <Ionicons name="trophy" size={22} color="#FFD700" />
          <Text style={styles.headerTitle}>Challenges</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Trending Challenges */}
        {trendingChallenges.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flame" size={18} color="#FF6B35" />
              <Text style={styles.sectionTitle}>Trending Challenges</Text>
            </View>
            <FlatList
              data={trendingChallenges}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              renderItem={renderTrendingItem}
              contentContainerStyle={styles.horizontalList}
            />
          </View>
        )}

        {/* New Challenges */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="sparkles" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>New Challenges</Text>
          </View>
          {newChallenges.length > 0 ? (
            <View style={styles.gridContainer}>
              {newChallenges.map((challenge) => (
                <View key={challenge.id} style={styles.gridItem}>
                  <ChallengeCard
                    challenge={challenge}
                    onPress={handleChallengePress}
                    onAccept={handleAcceptChallenge}
                    compact
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <Ionicons name="trophy-outline" size={40} color={colors.gray} />
              <Text style={styles.emptySectionText}>No new challenges yet</Text>
            </View>
          )}
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  horizontalList: {
    paddingHorizontal: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  gridItem: {
    width: (width - 44) / 2,
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptySectionText: {
    fontSize: 15,
    color: colors.gray,
  },
});

export default ChallengesScreen;
