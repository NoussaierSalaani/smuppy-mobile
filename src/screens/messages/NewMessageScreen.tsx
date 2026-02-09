import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { SPACING } from '../../config/theme';
import { resolveDisplayName } from '../../types/profile';
import {
  searchProfiles,
  getOrCreateConversation,
  Profile,
} from '../../services/database';
import { useTranslation } from 'react-i18next';
import { isValidUUID } from '../../utils/formatters';

interface NewMessageScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
  };
}

export default function NewMessageScreen({ navigation }: NewMessageScreenProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [navigating, setNavigating] = useState<string | null>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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
    // SECURITY: Validate UUID before using
    if (!isValidUUID(user.id)) {
      if (__DEV__) console.warn('[NewMessageScreen] Invalid userId:', user.id);
      showError(t('common:error'), t('messages:messages:newMessage:invalidUser'));
      return;
    }

    setNavigating(user.id);

    // Get or create conversation
    const { data: conversationId, error } = await getOrCreateConversation(user.id);

    if (error || !conversationId) {
      setNavigating(null);
      if (__DEV__) console.warn('[NewMessageScreen] Failed to create conversation:', error);
      showError(t('common:error'), t('messages:messages:newMessage:unableToStart'));
      return;
    }

    // Navigate to chat
    navigation.replace('Chat', {
      conversationId,
      otherUser: user,
    });
  }, [navigation, showError, t]);

  // Render user item
  const renderUser = useCallback(({ item }: { item: Profile }) => (
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
      </View>
      {navigating === item.id ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name="chatbubble-outline" size={22} color={colors.gray} />
      )}
    </TouchableOpacity>
  ), [styles, handleSelectUser, navigating, colors]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
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
            placeholderTextColor={colors.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            maxLength={100}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : searchQuery.length < 2 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search" size={50} color={colors.grayLight} />
          <Text style={styles.emptyTitle}>Search for someone</Text>
          <Text style={styles.emptySubtitle}>
            Type at least 2 characters to search
          </Text>
        </View>
      ) : searchResults.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="person-outline" size={50} color={colors.grayLight} />
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

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    borderBottomColor: colors.grayBorder,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  searchContainer: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.dark,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.dark,
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
    color: colors.dark,
    marginRight: 4,
  },
  userUsername: {
    fontSize: 14,
    color: colors.gray,
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
    color: colors.dark,
    marginTop: SPACING.lg,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
