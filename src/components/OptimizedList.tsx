/**
 * OptimizedList Component
 * High-performance list using @shopify/flash-list
 * 10x faster than FlatList for large lists
 */

import React, { memo, useCallback, forwardRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { COLORS, SPACING, TYPOGRAPHY } from '../config/theme';

/**
 * Optimized List component for high-performance scrolling
 */
const OptimizedList = forwardRef(({
  data,
  renderItem,
  keyExtractor,
  estimatedItemSize = 100,
  onEndReached,
  onEndReachedThreshold = 0.5,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  refreshing = false,
  onRefresh,
  isLoading = false,
  isLoadingMore = false,
  emptyText = 'No items to display',
  emptyIcon,
  numColumns = 1,
  horizontal = false,
  showsVerticalScrollIndicator = false,
  showsHorizontalScrollIndicator = false,
  contentContainerStyle,
  ...props
}, ref) => {

  // Default key extractor
  const defaultKeyExtractor = useCallback((item, index) => {
    return item?.id?.toString() || index.toString();
  }, []);

  // Loading footer
  const renderFooter = useCallback(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.loadingFooter}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      );
    }
    if (ListFooterComponent) {
      return typeof ListFooterComponent === 'function'
        ? <ListFooterComponent />
        : ListFooterComponent;
    }
    return null;
  }, [isLoadingMore, ListFooterComponent]);

  // Empty component
  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }
    if (ListEmptyComponent) {
      return typeof ListEmptyComponent === 'function'
        ? <ListEmptyComponent />
        : ListEmptyComponent;
    }
    return (
      <View style={styles.emptyContainer}>
        {emptyIcon}
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }, [isLoading, ListEmptyComponent, emptyText, emptyIcon]);

  // Don't render if no data and not loading
  if (!data && !isLoading) {
    return renderEmpty();
  }

  return (
    <FlashList
      ref={ref}
      data={data || []}
      renderItem={renderItem}
      keyExtractor={keyExtractor || defaultKeyExtractor}
      estimatedItemSize={estimatedItemSize}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={renderEmpty}
      refreshing={refreshing}
      onRefresh={onRefresh}
      numColumns={numColumns}
      horizontal={horizontal}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      showsHorizontalScrollIndicator={showsHorizontalScrollIndicator}
      contentContainerStyle={contentContainerStyle}
      // Performance optimizations
      drawDistance={250}
      removeClippedSubviews={true}
      {...props}
    />
  );
});

/**
 * Feed List - Optimized for social feed
 */
export const FeedList = memo(forwardRef(({
  posts,
  renderPost,
  onLoadMore,
  onRefresh,
  refreshing,
  isLoadingMore,
  ListHeaderComponent,
  ...props
}, ref) => {
  return (
    <OptimizedList
      ref={ref}
      data={posts}
      renderItem={renderPost}
      estimatedItemSize={400} // Average post height
      onEndReached={onLoadMore}
      onRefresh={onRefresh}
      refreshing={refreshing}
      isLoadingMore={isLoadingMore}
      ListHeaderComponent={ListHeaderComponent}
      emptyText="No posts yet"
      {...props}
    />
  );
}));

/**
 * User List - Optimized for followers/following lists
 */
export const UserList = memo(forwardRef(({
  users,
  renderUser,
  onLoadMore,
  onRefresh,
  refreshing,
  isLoadingMore,
  ...props
}, ref) => {
  return (
    <OptimizedList
      ref={ref}
      data={users}
      renderItem={renderUser}
      estimatedItemSize={70} // User item height
      onEndReached={onLoadMore}
      onRefresh={onRefresh}
      refreshing={refreshing}
      isLoadingMore={isLoadingMore}
      emptyText="No users found"
      {...props}
    />
  );
}));

/**
 * Comment List - Optimized for comments
 */
export const CommentList = memo(forwardRef(({
  comments,
  renderComment,
  onLoadMore,
  isLoadingMore,
  ListHeaderComponent,
  ...props
}, ref) => {
  return (
    <OptimizedList
      ref={ref}
      data={comments}
      renderItem={renderComment}
      estimatedItemSize={80} // Comment height
      onEndReached={onLoadMore}
      isLoadingMore={isLoadingMore}
      ListHeaderComponent={ListHeaderComponent}
      emptyText="No comments yet. Be the first!"
      {...props}
    />
  );
}));

/**
 * Grid List - For media galleries
 */
export const GridList = memo(forwardRef(({
  items,
  renderItem,
  numColumns = 3,
  onLoadMore,
  isLoadingMore,
  spacing = SPACING.xs,
  ...props
}, ref) => {
  return (
    <OptimizedList
      ref={ref}
      data={items}
      renderItem={renderItem}
      estimatedItemSize={120}
      numColumns={numColumns}
      onEndReached={onLoadMore}
      isLoadingMore={isLoadingMore}
      contentContainerStyle={{ padding: spacing }}
      {...props}
    />
  );
}));

const styles = StyleSheet.create({
  loadingFooter: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    paddingHorizontal: SPACING.xl,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});

OptimizedList.displayName = 'OptimizedList';
FeedList.displayName = 'FeedList';
UserList.displayName = 'UserList';
CommentList.displayName = 'CommentList';
GridList.displayName = 'GridList';

export default OptimizedList;
