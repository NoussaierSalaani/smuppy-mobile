import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBase from './SkeletonBase';
import SkeletonLine from './SkeletonLine';
import { useTheme } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';

import { WIDTH_CAPPED } from '../../utils/responsive';
const CARD_WIDTH = WIDTH_CAPPED - SPACING.base * 2;

const SessionCardSkeleton = () => (
  <View style={styles.card}>
    <View style={styles.cardRow}>
      <SkeletonBase width={48} height={48} borderRadius={24} />
      <View style={styles.cardInfo}>
        <SkeletonLine width="60%" height={14} />
        <SkeletonLine width="40%" height={12} style={styles.gap} />
      </View>
      <SkeletonBase width={60} height={28} borderRadius={14} />
    </View>
    <View style={styles.cardDetails}>
      <SkeletonLine width="50%" height={12} />
      <SkeletonLine width="35%" height={12} style={styles.gap} />
    </View>
  </View>
);

const SessionListSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Tab bar skeleton */}
      <View style={styles.tabs}>
        <SkeletonBase width={CARD_WIDTH / 2 - 4} height={36} borderRadius={10} />
        <SkeletonBase width={CARD_WIDTH / 2 - 4} height={36} borderRadius={10} />
      </View>

      {/* Session cards */}
      <SessionCardSkeleton />
      <SessionCardSkeleton />
      <SessionCardSkeleton />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.base,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    marginTop: SPACING.md,
  },
  card: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  cardDetails: {
    marginTop: SPACING.sm,
    paddingLeft: 60,
  },
  gap: {
    marginTop: 6,
  },
});

export default React.memo(SessionListSkeleton);
