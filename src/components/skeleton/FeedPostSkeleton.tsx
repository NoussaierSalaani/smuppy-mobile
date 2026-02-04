import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import SkeletonBase from './SkeletonBase';
import SkeletonLine from './SkeletonLine';
import { useTheme } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';

const { width } = Dimensions.get('window');

const FeedPostSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.grayBorder }]}>
      {/* Header: avatar + name lines */}
      <View style={styles.header}>
        <SkeletonBase width={40} height={40} borderRadius={20} />
        <View style={styles.headerText}>
          <SkeletonLine width={120} height={12} />
          <SkeletonLine width={80} height={10} style={styles.metaLine} />
        </View>
      </View>

      {/* Image placeholder */}
      <SkeletonBase width={width} height={width * 1.1} borderRadius={0} style={styles.image} />

      {/* Actions row */}
      <View style={styles.actions}>
        <SkeletonBase width={26} height={26} borderRadius={13} />
        <SkeletonBase width={22} height={22} borderRadius={11} style={styles.actionSpacing} />
      </View>

      {/* Likes + caption */}
      <View style={styles.captionArea}>
        <SkeletonLine width={80} height={12} />
        <SkeletonLine width="90%" height={12} style={styles.captionLine} />
        <SkeletonLine width="60%" height={12} style={styles.captionLine} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginBottom: 8,
  },
  headerText: {
    marginLeft: SPACING.sm,
    flex: 1,
  },
  metaLine: {
    marginTop: 6,
  },
  image: {
    marginVertical: 4,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
  },
  actionSpacing: {
    marginLeft: SPACING.base,
  },
  captionArea: {
    paddingHorizontal: SPACING.base,
    paddingBottom: 8,
  },
  captionLine: {
    marginTop: 8,
  },
});

export default React.memo(FeedPostSkeleton);
