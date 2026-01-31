import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Dimensions,
  ListRenderItem,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import PeakCard from '../../components/peaks/PeakCard';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useUserStore } from '../../stores';

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
  const [peaks] = useState<Peak[]>([]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  }, []);

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
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Ionicons name="chevron-back" size={28} color={colors.white} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Peaks</Text>

        {!isBusiness && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreatePeak}
          >
            <Ionicons name="add" size={28} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Grid */}
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
        ListFooterComponent={<View style={{ height: 100 }} />}
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark,
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
    color: colors.white,
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
});

export default PeaksFeedScreen;
