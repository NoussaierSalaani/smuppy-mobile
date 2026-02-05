import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import SkeletonBase from './SkeletonBase';
import FeedPostSkeleton from './FeedPostSkeleton';
import { useTheme } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';

const FeedSkeleton = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Suggestions row skeleton */}
      <View style={[styles.suggestionsSection, { borderBottomColor: colors.grayBorder }]}>
        <View style={styles.suggestionsHeader}>
          <SkeletonBase width={100} height={16} borderRadius={8} />
          <SkeletonBase width={50} height={14} borderRadius={7} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsRow}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.suggestionItem}>
              <SkeletonBase width={72} height={72} borderRadius={36} />
              <SkeletonBase width={56} height={10} borderRadius={5} style={styles.suggestionName} />
              <SkeletonBase width={52} height={24} borderRadius={12} style={styles.suggestionButton} />
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Feed post skeletons */}
      <FeedPostSkeleton />
      <FeedPostSkeleton />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  suggestionsSection: {
    paddingTop: 0,
    paddingBottom: 6,
    borderBottomWidth: 1,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.base,
    marginBottom: 8,
  },
  suggestionsRow: {
    paddingHorizontal: SPACING.sm,
    gap: 12,
  },
  suggestionItem: {
    alignItems: 'center',
    width: 88,
  },
  suggestionName: {
    marginTop: 6,
  },
  suggestionButton: {
    marginTop: 6,
  },
});

export default React.memo(FeedSkeleton);
