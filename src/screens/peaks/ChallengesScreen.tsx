import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ChallengeCard, { type Challenge } from '../../components/peaks/ChallengeCard';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { GRADIENTS, DARK_GRADIENTS, SHADOWS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import type { MainStackParamList } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COMPACT_CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

type TabFilter = 'trending' | 'new';

const TABS: { key: TabFilter; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'trending', label: 'Trending', icon: 'flame' },
  { key: 'new', label: 'New', icon: 'sparkles' },
];

const ChallengesScreen = (): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
  const user = useUserStore((state) => state.user);
  const isBusiness = user?.accountType === 'pro_business';
  const { showError: errorAlert } = useSmuppyAlert();
  const gradientColors = isDark ? DARK_GRADIENTS.button : GRADIENTS.button;

  const [activeTab, setActiveTab] = useState<TabFilter>('trending');
  const [trendingChallenges, setTrendingChallenges] = useState<Challenge[]>([]);
  const [newChallenges, setNewChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  const fetchChallenges = useCallback(async () => {
    try {
      setFetchError(false);
      const [trendingRes, newRes] = await Promise.all([
        awsAPI.getChallenges({ filter: 'trending', limit: 10 }),
        awsAPI.getChallenges({ filter: 'new', limit: 20 }),
      ]);

      const mapChallenge = (c: Record<string, unknown>): Challenge => ({
        id: c.id as string,
        peakId: c.peakId as string,
        title: c.title as string,
        description: c.description as string | undefined,
        durationSeconds: (c.durationSeconds as number) || undefined,
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
        setTrendingChallenges((trendingRes.challenges as unknown as Record<string, unknown>[]).map(mapChallenge));
      }
      if (newRes.challenges) {
        setNewChallenges((newRes.challenges as unknown as Record<string, unknown>[]).map(mapChallenge));
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch challenges:', error);
      setFetchError(true);
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
        user_id: challenge.creator.id,
        media_url: toCdn(challenge.peak.videoUrl) || toCdn(challenge.peak.thumbnailUrl),
        media_type: 'video',
        duration: challenge.durationSeconds || 15,
        user: {
          id: challenge.creator.id,
          username: challenge.creator.username,
          full_name: challenge.creator.displayName || challenge.creator.username,
          avatar_url: toCdn(challenge.creator.avatarUrl) || null,
        },
        views_count: challenge.viewCount,
        created_at: challenge.createdAt,
        isChallenge: true,
        challengeId: challenge.id,
        challengeTitle: challenge.title,
      }],
      initialIndex: 0,
    });
  }, [navigation]);

  const handleAcceptChallenge = useCallback((challenge: Challenge) => {
    if (isBusiness) {
      errorAlert('Unavailable', 'Business accounts cannot participate in challenges.');
      return;
    }
    navigation.navigate('CreatePeak', {
      challengeId: challenge.id,
      challengeTitle: challenge.title,
    });
  }, [navigation, isBusiness, errorAlert]);

  const activeChallenges = activeTab === 'trending' ? trendingChallenges : newChallenges;
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const renderGridItem = useCallback(({ item }: { item: Challenge }) => (
    <View style={styles.gridItem}>
      <ChallengeCard
        challenge={item}
        onPress={handleChallengePress}
        onAccept={handleAcceptChallenge}
        compact
      />
    </View>
  ), [handleChallengePress, handleAcceptChallenge, styles.gridItem]);

  // Featured card for trending — first item displayed large
  const featuredChallenge = activeTab === 'trending' && trendingChallenges.length > 0
    ? trendingChallenges[0]
    : null;
  const gridChallenges = activeTab === 'trending' && trendingChallenges.length > 1
    ? trendingChallenges.slice(1)
    : activeChallenges;

  const renderHeader = useCallback(() => (
    <>
      {/* Featured card (trending only) */}
      {featuredChallenge && (
        <View style={styles.featuredSection}>
          <ChallengeCard
            challenge={featuredChallenge}
            onPress={handleChallengePress}
            onAccept={handleAcceptChallenge}
          />
        </View>
      )}

      {/* Grid section header */}
      {gridChallenges.length > 0 && activeTab === 'trending' && (
        <View style={styles.gridSectionHeader}>
          <Text style={styles.gridSectionTitle}>More Challenges</Text>
        </View>
      )}
    </>
  ), [featuredChallenge, gridChallenges.length, activeTab, handleChallengePress, handleAcceptChallenge, styles]);

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
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={isDark ? colors.text : colors.dark} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="trophy" size={20} color={colors.gold} />
          <Text style={styles.headerTitle}>Challenges</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              {isActive ? (
                <LinearGradient
                  colors={[...gradientColors]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.tabActive}
                >
                  <Ionicons name={tab.icon} size={15} color="#FFF" />
                  <Text style={styles.tabActiveText}>{tab.label}</Text>
                </LinearGradient>
              ) : (
                <View style={styles.tabInactive}>
                  <Ionicons name={tab.icon} size={15} color={colors.textMuted} />
                  <Text style={styles.tabInactiveText}>{tab.label}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {fetchError && activeChallenges.length === 0 ? (
        <View style={[styles.centered, { flex: 1, gap: 16 }]}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>Could not load challenges</Text>
          <TouchableOpacity onPress={onRefresh} activeOpacity={0.8}>
            <LinearGradient
              colors={[...gradientColors]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : activeChallenges.length === 0 ? (
        <View style={[styles.centered, { flex: 1, gap: 12 }]}>
          <Ionicons name="trophy-outline" size={48} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            {activeTab === 'trending' ? 'No trending challenges yet' : 'No new challenges yet'}
          </Text>
          <Text style={styles.emptySubText}>Be the first to create one!</Text>
        </View>
      ) : (
        <FlatList
          data={gridChallenges}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={renderGridItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListFooterComponent={<View style={{ height: insets.bottom + 20 }} />}
        />
      )}
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
  // Header
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 22,
    color: isDark ? colors.text : colors.dark,
  },
  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
  },
  tabActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 24,
    ...SHADOWS.button,
  },
  tabActiveText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: '#FFF',
  },
  tabInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: isDark ? colors.card : colors.gray50,
    borderWidth: 1,
    borderColor: isDark ? colors.border : colors.grayBorder,
  },
  tabInactiveText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.textMuted,
  },
  // Featured
  featuredSection: {
    paddingHorizontal: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  // Grid
  gridSectionHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  gridSectionTitle: {
    fontFamily: 'WorkSans-SemiBold',
    fontSize: 17,
    color: isDark ? colors.text : colors.dark,
  },
  gridContent: {
    paddingHorizontal: 16,
  },
  gridRow: {
    gap: 12,
    marginBottom: 12,
  },
  gridItem: {
    width: COMPACT_CARD_WIDTH,
  },
  // Empty
  emptyText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptySubText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.textMuted,
  },
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 24,
  },
  retryButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
    color: '#FFF',
  },
});

export default ChallengesScreen;
