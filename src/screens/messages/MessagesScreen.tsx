import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  AppState,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { SPACING } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useTranslation } from 'react-i18next';
import { AccountBadge } from '../../components/Badge';
import { LiquidTabs } from '../../components/LiquidTabs';
import { resolveDisplayName } from '../../types/profile';
import {
  getConversations,
  Conversation,
} from '../../services/database';
import { useAppStore } from '../../stores/appStore';
import { ConversationListSkeleton } from '../../components/skeleton';
import { usePrefetchProfile } from '../../hooks/queries';
import { formatRelativeTimeShort } from '../../utils/dateFormatters';
import { isValidUUID } from '../../utils/formatters';

interface MessagesScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

interface ConversationItemProps {
  item: Conversation;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  onNavigate: (screen: string, params?: Record<string, unknown>) => void;
  onProfilePress: (userId: string) => void;
  formatTime: (dateString: string) => string;
}

const ConversationItem = memo(({ item, colors, styles, onNavigate, onProfilePress, formatTime }: ConversationItemProps) => {
  const otherUser = item.other_user;
  if (!otherUser) return null;

  return (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() => onNavigate('Chat', {
        conversationId: item.id,
        otherUser: otherUser,
        unreadCount: item.unread_count || 0,
      })}
      activeOpacity={0.7}
    >
      <TouchableOpacity
        style={styles.avatarContainer}
        onPress={() => onProfilePress(otherUser.id)}
      >
        <AvatarImage source={otherUser.avatar_url} size={56} />
      </TouchableOpacity>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <TouchableOpacity
            style={styles.nameContainer}
            onPress={() => onProfilePress(otherUser.id)}
          >
            <Text style={[
              styles.userName,
              { color: colors.dark },
              (item.unread_count || 0) > 0 && styles.userNameUnread
            ]}>
              {resolveDisplayName(otherUser)}
            </Text>
            <AccountBadge
              size={16}
              style={styles.verifiedBadge}
              isVerified={otherUser.is_verified}
              accountType={otherUser.account_type}
            />
          </TouchableOpacity>
          <Text style={[
            styles.messageTime,
            { color: colors.gray },
            (item.unread_count || 0) > 0 && { color: colors.primary, fontWeight: '600' as const }
          ]}>
            {formatTime(item.last_message_at || new Date().toISOString())}
          </Text>
        </View>

        <View style={styles.messagePreview}>
          <Text
            style={[
              styles.lastMessage,
              { color: colors.gray },
              (item.unread_count || 0) > 0 && { color: colors.dark, fontWeight: '500' as const }
            ]}
            numberOfLines={1}
          >
            {item.last_message_preview || 'Start a conversation'}
          </Text>
        </View>
      </View>

      {(item.unread_count || 0) > 0 && (
        <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.unreadCount, { color: colors.white }]}>{item.unread_count}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

export default function MessagesScreen({ navigation }: MessagesScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors, isDark: _isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fingerprint for smart diffing — avoid re-renders when nothing changed
  const conversationsFingerprint = useRef('');

  // Load conversations and sync unread badge to accurate total
  const loadConversations = useCallback(async () => {
    const { data, error } = await getConversations();
    if (!error && data) {
      // Smart diff: only update state if conversations actually changed
      const fingerprint = data.map(c => `${c.id}:${c.last_message_at}:${c.unread_count}`).join('|');
      if (fingerprint !== conversationsFingerprint.current) {
        conversationsFingerprint.current = fingerprint;
        setConversations(data);
      }
      const total = data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      useAppStore.getState().setUnreadMessages(total);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Reload and resync badge when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadConversations();
    }, [loadConversations])
  );

  // Poll for conversation updates every 15s when app is active
  useEffect(() => {
    const POLL_INTERVAL_MS = 15000;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      intervalId = setInterval(() => {
        loadConversations();
      }, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    startPolling();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadConversations();
        startPolling();
      } else {
        stopPolling();
      }
    });

    return () => {
      stopPolling();
      subscription.remove();
    };
  }, [loadConversations]);

  // Pull to refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadConversations();
  }, [loadConversations]);

  // Prefetch + navigate to user profile with UUID validation
  const prefetchProfile = usePrefetchProfile();
  const goToUserProfile = useCallback((userId: string) => {
    if (!isValidUUID(userId)) {
      if (__DEV__) console.warn('[MessagesScreen] Invalid userId:', userId);
      return;
    }
    prefetchProfile(userId);
    navigation.navigate('UserProfile', { userId });
  }, [navigation, prefetchProfile]);

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    const otherUserName = resolveDisplayName(conv.other_user, '');
    const matchesSearch = otherUserName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'all' || (activeFilter === 'unread' && (conv.unread_count || 0) > 0);
    return matchesSearch && matchesFilter;
  });

  // Render conversation item
  const renderConversation = useCallback(({ item }: { item: Conversation }) => (
    <ConversationItem
      item={item}
      colors={colors}
      styles={styles}
      onNavigate={navigation.navigate}
      onProfilePress={goToUserProfile}
      formatTime={formatRelativeTimeShort}
    />
  ), [colors, styles, navigation.navigate, goToUserProfile]);

  // Only show skeleton on first load when no cached data exists
  if (loading && conversations.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ConversationListSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.dark }]}>Messages</Text>
        <TouchableOpacity onPress={() => navigation.navigate('NewMessage')}>
          <Ionicons name="create-outline" size={24} color={colors.dark} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: colors.gray100 }]}>
          <Ionicons name="search" size={20} color={colors.gray} />
          <TextInput
            style={[styles.searchInput, { color: colors.dark }]}
            placeholder="Search messages..."
            placeholderTextColor={colors.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            maxLength={100}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters - Liquid Tabs */}
      <View style={styles.filtersContainer}>
        <LiquidTabs
          tabs={[
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread' },
          ]}
          activeTab={activeFilter}
          onTabChange={(key) => setActiveFilter(key)}
          size="small"
          fullWidth={false}
          variant="glass"
        />
      </View>

      {/* Conversations List */}
      <FlashList
        data={filteredConversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={60} color={colors.grayLight} />
            <Text style={[styles.emptyTitle, { color: colors.dark }]}>No messages</Text>
            <Text style={[styles.emptySubtitle, { color: colors.gray }]}>
              {searchQuery ? 'No results found' : 'Start a conversation!'}
            </Text>
            <TouchableOpacity
              style={[styles.startChatBtn, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('NewMessage')}
            >
              <Ionicons name="add" size={20} color={colors.white} />
              <Text style={[styles.startChatText, { color: colors.white }]}>New Message</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.dark,
  },
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: 16,
    color: colors.dark,
  },
  filtersContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    alignItems: 'flex-start',
  },
  listContent: {
    paddingBottom: 100,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  avatarContainer: {
    position: 'relative',
  },
  conversationContent: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.dark,
  },
  userNameUnread: {
    fontWeight: '700',
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  messageTime: {
    fontSize: 13,
    color: colors.gray,
  },
  messagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: colors.gray,
    flex: 1,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.white,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
    marginTop: SPACING.sm,
  },
  startChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: SPACING.lg,
  },
  startChatText: {
    color: colors.white,
    fontWeight: '600',
    marginLeft: 8,
  },
});
