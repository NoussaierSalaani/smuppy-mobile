import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBase from './SkeletonBase';
import SkeletonLine from './SkeletonLine';
import { SPACING } from '../../config/theme';

import { WIDTH_CAPPED } from '../../utils/responsive';
const CARD_WIDTH = WIDTH_CAPPED - 48;

const MapListSkeleton = () => (
  <View style={styles.container}>
    {/* Card skeletons that appear in list-empty state */}
    {Array.from({ length: 3 }).map((_, i) => (
      <View key={i} style={styles.card}>
        <SkeletonBase width={CARD_WIDTH} height={140} borderRadius={16} />
        <View style={styles.cardContent}>
          <SkeletonLine width="70%" height={16} />
          <SkeletonLine width="50%" height={12} style={styles.gap} />
          <View style={styles.row}>
            <SkeletonBase width={80} height={24} borderRadius={12} />
            <SkeletonBase width={60} height={24} borderRadius={12} />
          </View>
        </View>
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: SPACING.md,
    gap: 16,
  },
  card: {
    marginBottom: 8,
  },
  cardContent: {
    paddingTop: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: SPACING.sm,
  },
  gap: {
    marginTop: 6,
  },
});

export default React.memo(MapListSkeleton);
