import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { AvatarImage } from '../../components/OptimizedImage';
import { AccountBadge } from '../../components/Badge';
import { COLORS, SPACING } from '../../config/theme';
import { resolveDisplayName } from '../../types/profile';
import {
  searchProfiles,
  getOrCreateConversation,
  Profile,
} from '../../services/database';

interface NewMessageScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export default function NewMessageScreen({ navigation }: NewMessageScreenProps) {
  const { showError } = useSmuppyAlert();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [navigating, setNavigating] = useState<string | null>(null);

  // Search users with debounce
  useEffect(() => {
    if (searchQuery.length >= 2) {
      setLoading(true);
      const timer = setTimeout(async () => {
        const { data } = await searchProfiles(searchQuery, 30);
        if (data) {
          setSearchResults(data);
        }
        setLoading(false);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setSearchResults([]);
      setLoading(false);
    }
  }, [searchQuery]);

  // Navigate to chat with user
  const handleSelectUser = useCallback(async (user: Profile) => {
    setNavigating(user.id);

    // Get or create conversation
    const { data: conversationId, error } = await getOrCreateConversation(user.id);

    if (error || !conversationId) {
      setNavigating(null);
      showError('Unable to start conversation', error || 'Please try again later.');
      return;
    }

    // Navigate to chat
    navigation.replace('Chat', {
      conversationId,
      otherUser: user,
    });
  }, [navigation]);

  // Render user item
  const renderUser = ({ item }: { item: Profile }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleSelectUser(item)}
      disabled={navigating === item.id}
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
        <Text style={styles.userUsername}>@{item.username}</Text>
      </View>
      {navigating === item.id ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : (
        <Ionicons name="chatbubble-outline" size={22} color={COLORS.gray} />
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
        <Text style={styles.headerTitle}>New Message</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.toLabel}>To:</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            placeholderTextColor={COLORS.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : searchQuery.length < 2 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search" size={50} color={COLORS.grayLight} />
          <Text style={styles.emptyTitle}>Search for someone</Text>
          <Text style={styles.emptySubtitle}>
            Type at least 2 characters to search
          </Text>
        </View>
      ) : searchResults.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="person-outline" size={50} color={COLORS.grayLight} />
          <Text style={styles.emptyTitle}>No users found</Text>
          <Text style={styles.emptySubtitle}>
            Try a different search term
          </Text>
        </View>
      ) : (
        <FlashList
          data={searchResults}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
  },
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.dark,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.dark,
    paddingVertical: 8,
  },
  listContent: {
    paddingBottom: 100,
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
    color: COLORS.dark,
    marginRight: 4,
  },
  userUsername: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
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
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
