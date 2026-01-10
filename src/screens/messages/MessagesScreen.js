import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../../config/theme';

// Sample conversations data
const CONVERSATIONS = [
  {
    id: 1,
    user: {
      id: '1',
      name: 'Hannah Smith',
      avatar: 'https://i.pravatar.cc/100?img=1',
      isOnline: true,
      isVerified: true,
    },
    lastMessage: {
      text: 'Hey! Are you coming to the gym today? 💪',
      time: '2m',
      isRead: false,
      isFromMe: false,
      type: 'text',
    },
    unreadCount: 2,
  },
  {
    id: 2,
    user: {
      id: '2',
      name: 'Thomas Lefèvre',
      avatar: 'https://i.pravatar.cc/100?img=3',
      isOnline: true,
      isVerified: false,
    },
    lastMessage: {
      text: 'Check out this workout video!',
      time: '15m',
      isRead: true,
      isFromMe: false,
      type: 'video',
    },
    unreadCount: 0,
  },
  {
    id: 3,
    user: {
      id: '3',
      name: 'Mariam Fiori',
      avatar: 'https://i.pravatar.cc/100?img=5',
      isOnline: false,
      isVerified: true,
    },
    lastMessage: {
      text: 'Voice message (0:32)',
      time: '1h',
      isRead: true,
      isFromMe: true,
      type: 'voice',
    },
    unreadCount: 0,
  },
  {
    id: 4,
    user: {
      id: '4',
      name: 'Alex Runner',
      avatar: 'https://i.pravatar.cc/100?img=8',
      isOnline: false,
      isVerified: false,
    },
    lastMessage: {
      text: 'Thanks for sharing the route! 🏃‍♂️',
      time: '3h',
      isRead: true,
      isFromMe: false,
      type: 'text',
    },
    unreadCount: 0,
  },
  {
    id: 5,
    user: {
      id: '5',
      name: 'FitCoach Pro',
      avatar: 'https://i.pravatar.cc/100?img=12',
      isOnline: true,
      isVerified: true,
    },
    lastMessage: {
      text: 'Sent a photo',
      time: '5h',
      isRead: false,
      isFromMe: false,
      type: 'image',
    },
    unreadCount: 1,
  },
  {
    id: 6,
    user: {
      id: '6',
      name: 'Emma Wilson',
      avatar: 'https://i.pravatar.cc/100?img=9',
      isOnline: false,
      isVerified: false,
    },
    lastMessage: {
      text: 'See you at the yoga class!',
      time: '1d',
      isRead: true,
      isFromMe: true,
      type: 'text',
    },
    unreadCount: 0,
  },
  {
    id: 7,
    user: {
      id: '7',
      name: 'James Chen',
      avatar: 'https://i.pravatar.cc/100?img=11',
      isOnline: false,
      isVerified: false,
    },
    lastMessage: {
      text: 'https://smuppy.com/workout/hiit-30min',
      time: '2d',
      isRead: true,
      isFromMe: false,
      type: 'link',
    },
    unreadCount: 0,
  },
];

export default function MessagesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // Navigate to user profile
  const goToUserProfile = (userId) => {
    navigation.navigate('UserProfile', { userId });
  };

  // Filter conversations
  const filteredConversations = CONVERSATIONS.filter(conv => {
    const matchesSearch = conv.user.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = activeFilter === 'all' || (activeFilter === 'unread' && conv.unreadCount > 0);
    return matchesSearch && matchesFilter;
  });

  // Get message type icon
  const getMessageTypeIcon = (type) => {
    switch (type) {
      case 'image': return 'image-outline';
      case 'video': return 'videocam-outline';
      case 'voice': return 'mic-outline';
      case 'link': return 'link-outline';
      default: return null;
    }
  };

  // Render conversation item
  const renderConversation = ({ item }) => (
    <TouchableOpacity 
      style={styles.conversationItem}
      onPress={() => navigation.navigate('Chat', { conversation: item })}
      activeOpacity={0.7}
    >
      {/* Avatar with online indicator */}
      <TouchableOpacity 
        style={styles.avatarContainer}
        onPress={() => goToUserProfile(item.user.id)}
      >
        <Image source={{ uri: item.user.avatar }} style={styles.avatar} />
        {item.user.isOnline && <View style={styles.onlineIndicator} />}
      </TouchableOpacity>

      {/* Content */}
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <TouchableOpacity 
            style={styles.nameContainer}
            onPress={() => goToUserProfile(item.user.id)}
          >
            <Text style={[
              styles.userName,
              item.unreadCount > 0 && styles.userNameUnread
            ]}>
              {item.user.name}
            </Text>
            {item.user.isVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={[
            styles.messageTime,
            item.unreadCount > 0 && styles.messageTimeUnread
          ]}>
            {item.lastMessage.time}
          </Text>
        </View>

        <View style={styles.messagePreview}>
          {item.lastMessage.isFromMe && (
            <Text style={styles.youLabel}>You: </Text>
          )}
          {getMessageTypeIcon(item.lastMessage.type) && (
            <Ionicons 
              name={getMessageTypeIcon(item.lastMessage.type)} 
              size={14} 
              color={item.unreadCount > 0 ? COLORS.dark : COLORS.gray}
              style={styles.messageTypeIcon}
            />
          )}
          <Text 
            style={[
              styles.lastMessage,
              item.unreadCount > 0 && styles.lastMessageUnread
            ]}
            numberOfLines={1}
          >
            {item.lastMessage.text}
          </Text>
        </View>
      </View>

      {/* Unread badge */}
      {item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadCount}>{item.unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

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

      {/* Filters */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
          onPress={() => setActiveFilter('all')}
        >
          <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'unread' && styles.filterChipActive]}
          onPress={() => setActiveFilter('unread')}
        >
          <Text style={[styles.filterText, activeFilter === 'unread' && styles.filterTextActive]}>
            Unread
          </Text>
        </TouchableOpacity>
      </View>

      {/* Conversations List */}
      <FlatList
        data={filteredConversations}
        renderItem={renderConversation}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={60} color={COLORS.grayLight} />
            <Text style={styles.emptyTitle}>No messages</Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery ? 'No results found' : 'Start a conversation!'}
            </Text>
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
  filters: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: SPACING.sm,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray,
  },
  filterTextActive: {
    color: '#fff',
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
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: COLORS.white,
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
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
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
  youLabel: {
    fontSize: 14,
    color: COLORS.gray,
  },
  messageTypeIcon: {
    marginRight: 4,
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
});