/**
 * OptimizedList Component
 * High-performance list using @shopify/flash-list v2
 * 10x faster than FlatList for large lists
 */

import React, { memo, useCallback, forwardRef, ReactNode, ReactElement, useMemo } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, ViewStyle, StyleProp } from 'react-native';
import { FlashList, FlashListRef, ListRenderItem } from '@shopify/flash-list';
import { useTheme } from '../hooks/useTheme';
import { SPACING, TYPOGRAPHY } from '../config/theme';

interface OptimizedListProps<T> {
  data: T[] | null;
  renderItem: ListRenderItem<T>;
  keyExtractor?: (item: T, index: number) => string;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  ListHeaderComponent?: ReactElement | (() => ReactElement) | null;
  ListFooterComponent?: ReactElement | (() => ReactElement) | null;
  ListEmptyComponent?: ReactElement | (() => ReactElement) | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  emptyText?: string;
  emptyIcon?: ReactNode;
  numColumns?: number;
  horizontal?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  drawDistance?: number;
}

interface FeedListProps<T> {
  posts: T[] | null;
  renderPost: ListRenderItem<T>;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  isLoadingMore?: boolean;
  ListHeaderComponent?: ReactElement | (() => ReactElement) | null;
}

interface UserListProps<T> {
  users: T[] | null;
  renderUser: ListRenderItem<T>;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  isLoadingMore?: boolean;
}

interface CommentListProps<T> {
  comments: T[] | null;
  renderComment: ListRenderItem<T>;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  ListHeaderComponent?: ReactElement | (() => ReactElement) | null;
}

interface GridListProps<T> {
  items: T[] | null;
  renderItem: ListRenderItem<T>;
  numColumns?: number;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  spacing?: number;
}

// Define a type for items with optional id
interface ItemWithId {
  id?: string | number;
}

/**
 * Optimized List component for high-performance scrolling
 */
function OptimizedListInner<T extends ItemWithId>(
  {
    data,
    renderItem,
    keyExtractor,
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
    drawDistance = 250,
    ...props
  }: OptimizedListProps<T>,
  ref: React.Ref<FlashListRef<T>>
) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Default key extractor
  const defaultKeyExtractor = useCallback((item: T, index: number): string => {
    return item?.id?.toString() || index.toString();
  }, []);

  // Loading footer
  const renderFooter = useCallback(() => {
    if (isLoadingMore) {
      return (
        <View style={styles.loadingFooter}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }
    if (ListFooterComponent) {
      return typeof ListFooterComponent === 'function'
        ? <ListFooterComponent />
        : ListFooterComponent;
    }
    return null;
  }, [isLoadingMore, ListFooterComponent, colors.primary, styles.loadingFooter]);

  // Empty component
  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
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
  }, [isLoading, ListEmptyComponent, emptyText, emptyIcon, colors.primary, styles.emptyContainer, styles.emptyText]);

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
      drawDistance={drawDistance}
      {...props}
    />
  );
}

const OptimizedList = forwardRef(OptimizedListInner) as <T extends ItemWithId>(
  props: OptimizedListProps<T> & { ref?: React.Ref<FlashListRef<T>> }
) => ReactElement;

/**
 * Feed List - Optimized for social feed
 */
function FeedListInner<T extends ItemWithId>(
  {
    posts,
    renderPost,
    onLoadMore,
    onRefresh,
    refreshing,
    isLoadingMore,
    ListHeaderComponent,
    ...props
  }: FeedListProps<T>,
  ref: React.Ref<FlashListRef<T>>
) {
  return (
    <OptimizedList
      ref={ref}
      data={posts}
      renderItem={renderPost}
      onEndReached={onLoadMore}
      onRefresh={onRefresh}
      refreshing={refreshing}
      isLoadingMore={isLoadingMore}
      ListHeaderComponent={ListHeaderComponent}
      emptyText="No posts yet"
      {...props}
    />
  );
}

export const FeedList = memo(forwardRef(FeedListInner)) as <T extends ItemWithId>(
  props: FeedListProps<T> & { ref?: React.Ref<FlashListRef<T>> }
) => ReactElement;

/**
 * User List - Optimized for followers/following lists
 */
function UserListInner<T extends ItemWithId>(
  {
    users,
    renderUser,
    onLoadMore,
    onRefresh,
    refreshing,
    isLoadingMore,
    ...props
  }: UserListProps<T>,
  ref: React.Ref<FlashListRef<T>>
) {
  return (
    <OptimizedList
      ref={ref}
      data={users}
      renderItem={renderUser}
      onEndReached={onLoadMore}
      onRefresh={onRefresh}
      refreshing={refreshing}
      isLoadingMore={isLoadingMore}
      emptyText="No users found"
      {...props}
    />
  );
}

export const UserList = memo(forwardRef(UserListInner)) as <T extends ItemWithId>(
  props: UserListProps<T> & { ref?: React.Ref<FlashListRef<T>> }
) => ReactElement;

/**
 * Comment List - Optimized for comments
 */
function CommentListInner<T extends ItemWithId>(
  {
    comments,
    renderComment,
    onLoadMore,
    isLoadingMore,
    ListHeaderComponent,
    ...props
  }: CommentListProps<T>,
  ref: React.Ref<FlashListRef<T>>
) {
  return (
    <OptimizedList
      ref={ref}
      data={comments}
      renderItem={renderComment}
      onEndReached={onLoadMore}
      isLoadingMore={isLoadingMore}
      ListHeaderComponent={ListHeaderComponent}
      emptyText="No comments yet. Be the first!"
      {...props}
    />
  );
}

export const CommentList = memo(forwardRef(CommentListInner)) as <T extends ItemWithId>(
  props: CommentListProps<T> & { ref?: React.Ref<FlashListRef<T>> }
) => ReactElement;

/**
 * Grid List - For media galleries
 */
function GridListInner<T extends ItemWithId>(
  {
    items,
    renderItem,
    numColumns = 3,
    onLoadMore,
    isLoadingMore,
    spacing = SPACING.xs,
    ...props
  }: GridListProps<T>,
  ref: React.Ref<FlashListRef<T>>
) {
  return (
    <OptimizedList
      ref={ref}
      data={items}
      renderItem={renderItem}
      numColumns={numColumns}
      onEndReached={onLoadMore}
      isLoadingMore={isLoadingMore}
      contentContainerStyle={{ padding: spacing }}
      {...props}
    />
  );
}

export const GridList = memo(forwardRef(GridListInner)) as <T extends ItemWithId>(
  props: GridListProps<T> & { ref?: React.Ref<FlashListRef<T>> }
) => ReactElement;

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
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
    color: colors.gray,
    textAlign: 'center',
    marginTop: SPACING.md,
  },
});

// Note: displayName not set on generic function components as TypeScript doesn't support it well

export default OptimizedList;
