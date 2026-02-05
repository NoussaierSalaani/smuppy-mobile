import React from 'react';
import { View, StyleSheet } from 'react-native';
import SkeletonBase from './SkeletonBase';
import SkeletonLine from './SkeletonLine';
import { useTheme } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';

const ROW_COUNT = 7;

const ConversationRow = () => (
  <View style={styles.row}>
    <SkeletonBase width={56} height={56} borderRadius={28} />
    <View style={styles.textArea}>
      <SkeletonLine width={140} height={14} />
      <SkeletonLine width={200} height={11} style={styles.subLine} />
    </View>
    <SkeletonBase width={40} height={10} borderRadius={5} style={styles.time} />
  </View>
);

const ConversationListSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Array.from({ length: ROW_COUNT }).map((_, i) => (
        <ConversationRow key={i} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: SPACING.sm,
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
  time: {
    marginLeft: SPACING.sm,
  },
});

export default React.memo(ConversationListSkeleton);
