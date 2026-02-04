import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBase from './SkeletonBase';
import SkeletonLine from './SkeletonLine';
import { useTheme } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';

const ROW_COUNT = 9;

const NotificationRow = () => (
  <View style={styles.row}>
    <SkeletonBase width={40} height={40} borderRadius={20} />
    <View style={styles.textArea}>
      <SkeletonLine width={180} height={12} />
      <SkeletonLine width={120} height={10} style={styles.subLine} />
    </View>
    <SkeletonBase width={40} height={40} borderRadius={6} />
  </View>
);

const NotificationsSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Filter chips placeholder */}
      <View style={styles.filters}>
        <SkeletonBase width={50} height={28} borderRadius={14} />
        <SkeletonBase width={70} height={28} borderRadius={14} style={styles.filterGap} />
        <SkeletonBase width={60} height={28} borderRadius={14} style={styles.filterGap} />
      </View>

      {Array.from({ length: ROW_COUNT }).map((_, i) => (
        <NotificationRow key={i} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: SPACING.sm,
  },
  filters: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
  },
  filterGap: {
    marginLeft: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.md,
  },
  textArea: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  subLine: {
    marginTop: 6,
  },
});

export default React.memo(NotificationsSkeleton);
