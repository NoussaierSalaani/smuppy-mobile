import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSmuppyAlert } from '../context/SmuppyAlertContext';
import { AvatarImage } from './OptimizedImage';
import OptimizedImage from './OptimizedImage';
import { AccountBadge } from './Badge';
import { SPACING } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import {
  getConversations,
  searchProfiles,
  sharePostToConversation,
  Conversation,
  Profile,
} from '../services/database';
import { resolveDisplayName } from '../types/profile';

interface SharePostModalProps {
  visible: boolean;
  post: {
    id: string;
    media: string | null;
    caption?: string;
    user: {
      name: string;
      avatar: string | null;
    };
  } | null;
  onClose: () => void;
}

export default function SharePostModal({ visible, post, onClose }: SharePostModalProps) {
  const { showError, showSuccess } = useSmuppyAlert();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getConversations();
      if (data) {
        setConversations(data);
      } else {
        setConversations([]);
      }
    } catch (err) {
      if (__DEV__) console.warn('[SharePostModal] Error loading conversations:', err);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load recent conversations
  useEffect(() => {
    if (visible) {
      loadConversations();
    }
  }, [visible, loadConversations]);

  // Search users
  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timer = setTimeout(async () => {
        const { data } = await searchProfiles(searchQuery, 20);
        if (data) {
          setSearchResults(data);
        }
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Share to a user from conversation
  const handleShareToConversation = async (conv: Conversation) => {
    if (!post || !conv.other_user) return;

    setSending(conv.id);
    const { error } = await sharePostToConversation(post.id, conv.other_user.id);

    if (error) {
      showError('Error', 'Failed to share post');
    } else {
      showSuccess('Sent!', `Post shared with ${resolveDisplayName(conv.other_user)}`);
      onClose();
    }
    setSending(null);
  };

  // Share to a user from search
  const handleShareToUser = async (user: Profile) => {
    if (!post) return;

    setSending(user.id);
    const { error } = await sharePostToConversation(post.id, user.id);

    if (error) {
      showError('Error', 'Failed to share post');
    } else {
      showSuccess('Sent!', `Post shared with ${resolveDisplayName(user)}`);
      onClose();
    }
    setSending(null);
  };

  // Render conversation item
  const renderConversation = ({ item }: { item: Conversation }) => {
    const otherUser = item.other_user;
    if (!otherUser) return null;

    return (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleShareToConversation(item)}
        disabled={sending === item.id}
      >
        <AvatarImage source={otherUser.avatar_url} size={50} />
        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
            <Text style={styles.userName}>{resolveDisplayName(otherUser)}</Text>
            <AccountBadge
              size={14}
              isVerified={otherUser.is_verified}
              accountType={otherUser.account_type}
            />
          </View>
        </View>
        {sending === item.id ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <TouchableOpacity
            style={styles.sendButton}
            onPress={() => handleShareToConversation(item)}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  // Render search result
  const renderSearchResult = ({ item }: { item: Profile }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleShareToUser(item)}
      disabled={sending === item.id}
    >
      <AvatarImage source={item.avatar_url} size={50} />
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName}>{resolveDisplayName(item)}</Text>
          <AccountBadge
            size={14}
            isVerified={item.is_verified}
            accountType={item.account_type}
          />
        </View>
      </View>
      {sending === item.id ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => handleShareToUser(item)}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={28} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Share</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Post Preview */}
        {post && (
          <View style={styles.postPreview}>
            <OptimizedImage source={post.media} style={styles.postImage} />
            <View style={styles.postInfo}>
              <AvatarImage source={post.user.avatar} size={32} />
              <View style={styles.postText}>
                <Text style={styles.postAuthor}>{post.user.name}</Text>
                {post.caption && (
                  <Text style={styles.postCaption} numberOfLines={2}>
                    {post.caption}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.gray} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            placeholderTextColor={colors.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.gray} />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : searchQuery.length >= 2 ? (
          <FlashList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={() => (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            )}
          />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Recent Conversations</Text>
            <FlashList
              data={conversations}
              renderItem={renderConversation}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={() => (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No recent conversations</Text>
                  <Text style={styles.emptySubtext}>Search for a user to share with</Text>
                </View>
              )}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  postPreview: {
    flexDirection: 'row',
    padding: SPACING.md,
    backgroundColor: colors.backgroundSecondary,
    margin: SPACING.md,
    borderRadius: 12,
  },
  postImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  postInfo: {
    flex: 1,
    flexDirection: 'row',
    marginLeft: SPACING.sm,
  },
  postText: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  postAuthor: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  postCaption: {
    fontSize: 12,
    color: colors.gray,
    marginTop: 2,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F5F5F5',
    borderRadius: 12,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.sm,
    fontSize: 16,
    color: colors.dark,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  userInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.dark,
    marginRight: 4,
  },
  userUsername: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 2,
  },
  sendButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.gray,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.grayLight,
    marginTop: 4,
  },
});
