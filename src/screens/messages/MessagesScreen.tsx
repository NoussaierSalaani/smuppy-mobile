import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../config/theme';
import { AccountBadge } from '../../components/Badge';
import { LiquidTabs } from '../../components/LiquidTabs';
import {
  getConversations,
  subscribeToConversations,
  Conversation,
} from '../../services/database';

interface MessagesScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export default function MessagesScreen({ navigation }: MessagesScreenProps) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load conversations
  const loadConversations = useCallback(async () => {
    const { data, error } = await getConversations();
    if (!error && data) {
      setConversations(data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToConversations(() => {
      loadConversations();
    });
    return unsubscribe;
  }, [loadConversations]);

  // Pull to refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadConversations();
  }, [loadConversations]);

  // Navigate to user profile
  const goToUserProfile = (userId: string) => {
    navigation.navigate('UserProfile', { userId });
  };

  // Filter conversations
  const filteredConversations = conversations.filter(conv => {
    const otherUserName = conv.other_user?.full_name || conv.other_user?.username || '';
    const matchesSearch = otherUserName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'all' || (activeFilter === 'unread' && (conv.unread_count || 0) > 0);
    return matchesSearch && matchesFilter;
  });

  // Format time
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  // Render conversation item
  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherUser = item.other_user;
    if (!otherUser) return null;

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => navigation.navigate('Chat', {
          conversationId: item.id,
          otherUser: otherUser
        })}
        activeOpacity={0.7}
      >
        {/* Avatar */}
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => goToUserProfile(otherUser.id)}
        >
          <AvatarImage source={otherUser.avatar_url} size={56} />
        </TouchableOpacity>

        {/* Content */}
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <TouchableOpacity
              style={styles.nameContainer}
              onPress={() => goToUserProfile(otherUser.id)}
            >
              <Text style={[
                styles.userName,
                (item.unread_count || 0) > 0 && styles.userNameUnread
              ]}>
                {otherUser.full_name || otherUser.username}
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
              (item.unread_count || 0) > 0 && styles.messageTimeUnread
            ]}>
              {formatTime(item.last_message_at || new Date().toISOString())}
            </Text>
          </View>

          <View style={styles.messagePreview}>
            <Text
              style={[
                styles.lastMessage,
                (item.unread_count || 0) > 0 && styles.lastMessageUnread
              ]}
              numberOfLines={1}
            >
              {item.last_message_preview || 'Start a conversation'}
            </Text>
          </View>
        </View>

        {/* Unread badge */}
        {(item.unread_count || 0) > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadCount}>{item.unread_count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <TouchableOpacity onPress={() => navigation.navigate('NewMessage')}>
          <Ionicons name="create-outline" size={24} color={COLORS.dark} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.gray} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages..."
            placeholderTextColor={COLORS.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={COLORS.gray} />
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
            tintColor={COLORS.primary}
          />
        }
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={60} color={COLORS.grayLight} />
            <Text style={styles.emptyTitle}>No messages</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery ? 'No results found' : 'Start a conversation!'}
            </Text>
            <TouchableOpacity
              style={styles.startChatBtn}
              onPress={() => navigation.navigate('NewMessage')}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.startChatText}>New Message</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
    color: COLORS.dark,
  },
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: 16,
    color: COLORS.dark,
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
    color: COLORS.dark,
  },
  userNameUnread: {
    fontWeight: '700',
  },
  verifiedBadge: {
    marginLeft: 4,
  },
  messageTime: {
    fontSize: 13,
    color: COLORS.gray,
  },
  messageTimeUnread: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  messagePreview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: COLORS.gray,
    flex: 1,
  },
  lastMessageUnread: {
    color: COLORS.dark,
    fontWeight: '500',
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadCount: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: SPACING.sm,
  },
  startChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: SPACING.lg,
  },
  startChatText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
});
