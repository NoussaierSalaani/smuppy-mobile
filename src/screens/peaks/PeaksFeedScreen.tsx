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
  ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import PeakCard from '../../components/peaks/PeakCard';
import { PeakGridSkeleton } from '../../components/skeleton';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useUserStore } from '../../stores';
import { awsAPI } from '../../services/aws-api';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

interface PeakUser {
  id: string;
  name: string;
  avatar: string;
}

interface Peak {
  id: string;
  thumbnail: string;
  duration: number;
  user: PeakUser;
  views: number;
  reactions: number;
  repliesCount?: number;
  createdAt: string; // ISO string for React Navigation serialization
  isChallenge?: boolean;
  challengeTitle?: string;
}

type RootStackParamList = {
  PeakView: { peaks: Peak[]; initialIndex: number };
  CreatePeak: undefined;
  [key: string]: object | undefined;
};

const PeaksFeedScreen = (): React.JSX.Element => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const user = useUserStore((state) => state.user);
  const isBusiness = user?.accountType === 'pro_business';
  const [refreshing, setRefreshing] = useState(false);
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetchPeaks = useCallback(async (reset = false) => {
    try {
      const params: { limit: number; cursor?: string } = { limit: 20 };
      if (!reset && cursor) params.cursor = cursor;
      const response = await awsAPI.getPeaks(params);
      const mapped: Peak[] = (response.data || []).map((p) => ({
        id: p.id,
        thumbnail: p.thumbnailUrl || p.videoUrl,
        duration: p.duration,
        user: {
          id: p.author?.id || p.authorId,
          name: p.author?.displayName || p.author?.username || 'User',
          avatar: p.author?.avatarUrl || '',
        },
        views: p.viewsCount,
        reactions: p.likesCount,
        repliesCount: p.commentsCount,
        createdAt: p.createdAt,
      }));
      setPeaks(reset ? mapped : (prev) => [...prev, ...mapped]);
      setCursor(response.nextCursor);
      setHasMore(!!response.nextCursor);
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch peaks:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cursor]);

  useEffect(() => {
    fetchPeaks(true);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setCursor(null);
    fetchPeaks(true);
  }, [fetchPeaks]);

  const handlePeakPress = (peak: Peak): void => {
    const index = peaks.findIndex(p => p.id === peak.id);
    navigation.navigate('PeakView', {
      peaks: peaks,
      initialIndex: index,
    });
  };

  const handleCreatePeak = (): void => {
    navigation.navigate('CreatePeak');
  };

  const handleGoBack = (): void => {
    navigation.goBack();
  };

  const getColumns = (): { leftColumn: Peak[]; rightColumn: Peak[] } => {
    const leftColumn: Peak[] = [];
    const rightColumn: Peak[] = [];

    peaks.forEach((peak, index) => {
      if (index % 2 === 0) {
        leftColumn.push(peak);
      } else {
        rightColumn.push(peak);
      }
    });

    return { leftColumn, rightColumn };
  };

  const { leftColumn, rightColumn } = getColumns();

  const renderColumn = (columnPeaks: Peak[]): React.JSX.Element => (
    <View style={styles.column}>
      {columnPeaks.map((peak) => (
        <View key={peak.id} style={{ position: 'relative' }}>
          <PeakCard
            peak={peak}
            onPress={handlePeakPress}
          />
          {peak.isChallenge && (
            <View style={styles.challengeBadge}>
              <Ionicons name="trophy" size={12} color="#FFD700" />
            </View>
          )}
        </View>
      ))}
    </View>
  );

  const renderItem: ListRenderItem<number> = () => (
    <View style={styles.masonryContainer}>
      {renderColumn(leftColumn)}
      {renderColumn(rightColumn)}
    </View>
  );

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Ionicons name="chevron-back" size={28} color={isDark ? colors.white : colors.dark} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Peaks</Text>

        {!isBusiness && peaks.length > 0 ? (
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreatePeak}
          >
            <Ionicons name="add" size={28} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.createButton} />
        )}
      </View>

      {/* Loading skeleton */}
      {loading && peaks.length === 0 ? (
        <PeakGridSkeleton />
      ) : !loading && peaks.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="videocam-outline" size={56} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Aucun Peak pour l'instant</Text>
            <Text style={styles.emptySubtitle}>
              Les Peaks sont des vidéos courtes de 6 à 60 secondes pour partager tes moments fitness
            </Text>
            {!isBusiness && (
              <TouchableOpacity style={styles.emptyButton} onPress={handleCreatePeak}>
                <Ionicons name="add-circle" size={22} color={colors.white} />
                <Text style={styles.emptyButtonText}>Créer mon premier Peak</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      ) : (
        /* Grid */
        <FlatList
          data={[1]}
          keyExtractor={() => 'grid'}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.gridContainer}
          renderItem={renderItem}
          onEndReached={() => { if (hasMore && !loading) fetchPeaks(false); }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loading ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : (
              <View style={{ height: 100 }} />
            )
          }
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  createButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    paddingHorizontal: 16,
  },
  masonryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: {
    width: COLUMN_WIDTH,
  },
  challengeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyScrollContent: {
    flexGrow: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 10,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});

export default PeaksFeedScreen;
