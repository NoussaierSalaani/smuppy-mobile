import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBase from './SkeletonBase';
import SkeletonLine from './SkeletonLine';
import { useTheme } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';

import { WIDTH_CAPPED } from '../../utils/responsive';

const ScreenSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header placeholder */}
      <View style={styles.header}>
        <SkeletonBase width={32} height={32} borderRadius={16} />
        <SkeletonBase width={140} height={20} borderRadius={10} />
        <SkeletonBase width={32} height={32} borderRadius={16} />
      </View>

      {/* Content area */}
      <View style={styles.content}>
        <SkeletonLine width="70%" height={16} />
        <SkeletonLine width="90%" height={12} style={styles.line} />
        <SkeletonLine width="80%" height={12} style={styles.line} />
        <SkeletonBase width={WIDTH_CAPPED - SPACING.base * 2} height={180} borderRadius={12} style={styles.block} />
        <SkeletonLine width="60%" height={12} style={styles.line} />
        <SkeletonLine width="85%" height={12} style={styles.line} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
  },
  content: {
    paddingHorizontal: SPACING.base,
    paddingTop: SPACING.lg,
  },
  line: {
    marginTop: SPACING.md,
  },
  block: {
    marginTop: SPACING.lg,
  },
});

export default React.memo(ScreenSkeleton);
