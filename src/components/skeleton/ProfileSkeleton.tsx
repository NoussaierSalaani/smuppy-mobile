import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBase from './SkeletonBase';
import SkeletonLine from './SkeletonLine';
import { useTheme } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';

import { SCREEN_WIDTH, WIDTH_CAPPED } from '../../utils/responsive';
const AVATAR_SIZE = 96;
const GRID_COLS = 3;
const GRID_GAP = 2;
const GRID_ITEM_SIZE = (WIDTH_CAPPED - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

const ProfileSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Cover image placeholder */}
      <SkeletonBase width={SCREEN_WIDTH} height={200} borderRadius={0} />

      {/* Avatar + stats row */}
      <View style={styles.avatarRow}>
        <SkeletonBase
          width={AVATAR_SIZE}
          height={AVATAR_SIZE}
          borderRadius={AVATAR_SIZE / 2}
          style={styles.avatar}
        />
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <SkeletonBase width={36} height={18} borderRadius={4} />
            <SkeletonBase width={32} height={10} borderRadius={5} style={styles.statLabel} />
          </View>
          <View style={styles.statItem}>
            <SkeletonBase width={36} height={18} borderRadius={4} />
            <SkeletonBase width={32} height={10} borderRadius={5} style={styles.statLabel} />
          </View>
          <View style={styles.statItem}>
            <SkeletonBase width={36} height={18} borderRadius={4} />
            <SkeletonBase width={32} height={10} borderRadius={5} style={styles.statLabel} />
          </View>
        </View>
      </View>

      {/* Name + bio */}
      <View style={styles.infoSection}>
        <SkeletonLine width={160} height={18} />
        <SkeletonLine width="80%" height={12} style={styles.bioLine} />
        <SkeletonLine width="50%" height={12} style={styles.bioLine} />
      </View>

      {/* Tabs placeholder */}
      <View style={styles.tabsRow}>
        <SkeletonBase width={70} height={32} borderRadius={16} />
        <SkeletonBase width={70} height={32} borderRadius={16} style={styles.tabSpacing} />
        <SkeletonBase width={70} height={32} borderRadius={16} style={styles.tabSpacing} />
      </View>

      {/* Grid placeholder (3x2) */}
      <View style={styles.grid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBase
            key={i}
            width={GRID_ITEM_SIZE}
            height={GRID_ITEM_SIZE}
            borderRadius={0}
            style={i % GRID_COLS !== 0 ? styles.gridGap : undefined}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginTop: -AVATAR_SIZE / 2,
  },
  avatar: {
    borderWidth: 3,
    borderColor: 'transparent',
  },
  statsRow: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-evenly',
    marginLeft: SPACING.base,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    marginTop: 4,
  },
  infoSection: {
    paddingHorizontal: SPACING.base,
    marginTop: SPACING.md,
  },
  bioLine: {
    marginTop: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.base,
    marginTop: SPACING.lg,
    marginBottom: SPACING.md,
  },
  tabSpacing: {
    marginLeft: SPACING.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridGap: {
    marginLeft: GRID_GAP,
  },
});

export default React.memo(ProfileSkeleton);
