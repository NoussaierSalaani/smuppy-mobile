import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBase from './SkeletonBase';
import SkeletonLine from './SkeletonLine';
import { useTheme } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';

import { WIDTH_CAPPED } from '../../utils/responsive';

const SearchSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search bar placeholder */}
      <View style={styles.searchBar}>
        <SkeletonBase width={WIDTH_CAPPED - SPACING.base * 2} height={44} borderRadius={22} />
      </View>

      {/* Trending section */}
      <View style={styles.section}>
        <SkeletonLine width={100} height={16} style={styles.sectionTitle} />
        {/* NOSONAR — static skeleton array, index keys are safe */}
        <View style={styles.trendingRow}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBase key={`trending-skeleton-${i}`} width={80} height={30} borderRadius={15} style={styles.trendingChip} />
          ))}
        </View>
      </View>

      {/* Suggested users */}
      <View style={styles.section}>
        <SkeletonLine width={120} height={16} style={styles.sectionTitle} />
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={`user-skeleton-${i}`} style={styles.userRow}> {/* NOSONAR */}
            <SkeletonBase width={44} height={44} borderRadius={22} />
            <View style={styles.userText}>
              <SkeletonLine width={130} height={13} />
              <SkeletonLine width={90} height={10} style={styles.userSub} />
            </View>
            <SkeletonBase width={64} height={28} borderRadius={14} />
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
  },
  section: {
    paddingHorizontal: SPACING.base,
    marginTop: SPACING.md,
  },
  sectionTitle: {
    marginBottom: SPACING.md,
  },
  trendingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  trendingChip: {
    marginBottom: SPACING.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  userText: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  userSub: {
    marginTop: 4,
  },
});

export default React.memo(SearchSkeleton);
