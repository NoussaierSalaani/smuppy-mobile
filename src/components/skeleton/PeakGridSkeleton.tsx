import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBase from './SkeletonBase';
import { useTheme } from '../../hooks/useTheme';

import { WIDTH_CAPPED } from '../../utils/responsive';
const COLUMN_WIDTH = (WIDTH_CAPPED - 48) / 2;

const CARD_HEIGHTS = [180, 220, 160, 200, 190, 170];

const PeakGridSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.masonryContainer}>
        {/* NOSONAR — static skeleton arrays, index keys are safe */}
        <View style={styles.column}>
          {CARD_HEIGHTS.filter((_, i) => i % 2 === 0).map((h, i) => (
            <SkeletonBase key={`l${i}`} width={COLUMN_WIDTH} height={h} borderRadius={16} style={styles.card} />
          ))}
        </View>
        <View style={styles.column}>
          {CARD_HEIGHTS.filter((_, i) => i % 2 === 1).map((h, i) => (
            <SkeletonBase key={`r${i}`} width={COLUMN_WIDTH} height={h} borderRadius={16} style={styles.card} />
          ))}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  masonryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: {
    width: COLUMN_WIDTH,
  },
  card: {
    marginBottom: 12,
  },
});

export default React.memo(PeakGridSkeleton);
