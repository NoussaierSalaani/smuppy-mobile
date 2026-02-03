/**
 * InviteToBattleScreen
 * Modal to invite creators to a battle
 */

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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { AvatarImage } from '../../components/OptimizedImage';
import { AccountBadge } from '../../components/Badge';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { awsAPI } from '../../services/aws-api';
import { searchProfiles, getFollowers, Profile } from '../../services/database';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { resolveDisplayName } from '../../types/profile';

interface Creator {
  id: string;
  username: string;
  display_name?: string;
  full_name?: string;
  avatar_url?: string;
  is_verified: boolean;
  account_type: string;
  fans_count?: number;
}

interface RouteParams {
  battleId: string;
}

export default function InviteToBattleScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { colors, isDark } = useTheme();
  const { showAlert } = useSmuppyAlert();
  const user = useUserStore((s) => s.user);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const { battleId } = (route.params || {}) as RouteParams;

  const [searchQuery, setSearchQuery] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Load suggested creators (followers who are creators)
  useEffect(() => {
    loadSuggestedCreators();
  }, []);

  const loadSuggestedCreators = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await getFollowers(user?.id || '');

      if (!error && data) {
        // Filter to only show creators (pro_creator or pro_business)
        const creatorFollowers = data.filter(
          (f: Profile) => f.account_type === 'pro_creator' || f.account_type === 'pro_business'
        ) as Creator[];
        setCreators(creatorFollowers);
      }
    } catch (error) {
      if (__DEV__) console.warn('Load creators error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      loadSuggestedCreators();
      return;
    }

    try {
      setIsSearching(true);
      const { data, error } = await searchProfiles(query, 20);

      if (!error && data) {
        // Filter to only show creators
        const creatorResults = data.filter(
          (p: Profile) => p.account_type === 'pro_creator' || p.account_type === 'pro_business'
        ) as Creator[];
        setCreators(creatorResults);
      }
    } catch (error) {
      if (__DEV__) console.warn('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, handleSearch]);

  const toggleSelection = (creatorId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(creatorId)) {
        next.delete(creatorId);
      } else {
        next.add(creatorId);
      }
      return next;
    });
  };

  const handleSendInvites = async () => {
    if (selectedIds.size === 0) return;

    try {
      setIsSending(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const response = await awsAPI.inviteToBattle(battleId, Array.from(selectedIds));

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert({
          title: 'Invitations Sent!',
          message: `${selectedIds.size} creator${selectedIds.size > 1 ? 's' : ''} invited to battle`,
          type: 'success',
          buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
        });
      } else {
        showAlert({
          title: 'Error',
          message: response.message || 'Failed to send invitations',
          type: 'error',
        });
      }
    } catch (error) {
      if (__DEV__) console.warn('Send invites error:', error);
      showAlert({
        title: 'Error',
        message: 'Failed to send invitations. Please try again.',
        type: 'error',
      });
    } finally {
      setIsSending(false);
    }
  };

  const renderCreator = useCallback(({ item }: { item: Creator }) => {
    const isSelected = selectedIds.has(item.id);
    const isCurrentUser = item.id === user?.id;

    if (isCurrentUser) return null;

    return (
      <TouchableOpacity
        style={[styles.creatorItem, isSelected && styles.creatorItemSelected]}
        onPress={() => toggleSelection(item.id)}
        activeOpacity={0.7}
        disabled={isCurrentUser}
      >
        <AvatarImage source={item.avatar_url} size={50} />

        <View style={styles.creatorInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.creatorName} numberOfLines={1}>
              {resolveDisplayName(item)}
            </Text>
            {item.is_verified && (
              <AccountBadge size={14} isVerified style={styles.badge} />
            )}
          </View>
          {item.fans_count !== undefined && (
            <Text style={styles.fansCount}>
              {item.fans_count.toLocaleString()} fans
            </Text>
          )}
        </View>

        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && (
            <Ionicons name="checkmark" size={16} color={colors.white} />
          )}
        </View>
      </TouchableOpacity>
    );
  }, [selectedIds, user?.id, colors, styles]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invite Creators</Text>
          <View style={styles.closeButton} />
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={colors.gray} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search creators..."
              placeholderTextColor={colors.gray}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={colors.gray} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Selection count */}
        {selectedIds.size > 0 && (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionText}>
              {selectedIds.size} creator{selectedIds.size > 1 ? 's' : ''} selected
            </Text>
            <TouchableOpacity onPress={() => setSelectedIds(new Set())}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Creators List */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlashList
            data={creators}
            renderItem={renderCreator}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={() => (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={colors.gray} />
                <Text style={styles.emptyTitle}>No creators found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? 'Try a different search term'
                    : 'Your followers who are creators will appear here'}
                </Text>
              </View>
            )}
            ListHeaderComponent={
              isSearching ? (
                <View style={styles.searchingIndicator}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.searchingText}>Searching...</Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Send Button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.sendButton,
              selectedIds.size === 0 && styles.sendButtonDisabled,
            ]}
            onPress={handleSendInvites}
            disabled={selectedIds.size === 0 || isSending}
            activeOpacity={0.8}
          >
            {isSending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="paper-plane" size={20} color={colors.white} />
                <Text style={styles.sendButtonText}>
                  Send Invite{selectedIds.size !== 1 ? 's' : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    safeArea: {
      flex: 1,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.gray100,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.dark,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.gray100,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: 16,
      color: colors.dark,
    },
    selectionBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: colors.primary + '15',
    },
    selectionText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.primary,
    },
    clearText: {
      fontSize: 14,
      color: colors.primary,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 100,
    },
    creatorItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.white,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    creatorItemSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '10',
    },
    creatorInfo: {
      flex: 1,
      marginLeft: 12,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    creatorName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.dark,
    },
    badge: {
      marginLeft: 4,
    },
    username: {
      fontSize: 13,
      color: colors.gray,
      marginTop: 2,
    },
    fansCount: {
      fontSize: 12,
      color: colors.gray,
      marginTop: 2,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.gray,
      justifyContent: 'center',
      alignItems: 'center',
    },
    checkboxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    searchingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
    },
    searchingText: {
      marginLeft: 8,
      fontSize: 14,
      color: colors.gray,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.dark,
      marginTop: 16,
    },
    emptySubtitle: {
      fontSize: 14,
      color: colors.gray,
      marginTop: 8,
      textAlign: 'center',
      paddingHorizontal: 40,
    },
    footer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: 16,
      paddingBottom: 32,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.gray100,
    },
    sendButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 25,
      paddingVertical: 16,
      gap: 8,
    },
    sendButtonDisabled: {
      backgroundColor: colors.gray,
    },
    sendButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.white,
    },
  });
