/**
 * UserManagementListScreen
 * Shared component for blocked/muted user list screens.
 * Handles: header, loading, FlatList, empty state, action buttons with confirmation.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarImage } from './OptimizedImage';
import { useSmuppyAlert } from '../context/SmuppyAlertContext';
import { resolveDisplayName } from '../types/profile';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import { createListScreenStyles } from './shared-list-styles';

interface UserProfile {
  id: string;
  avatar_url?: string | null;
  full_name?: string;
  display_name?: string;
  name?: string;
  username?: string;
}

interface UserManagementListScreenProps {
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
  title: string;
  emptyIcon: string;
  emptyTitle: string;
  emptySubtitle: string;
  actionLabel: string;
  actionColor: string;
  getUsers: () => unknown[];
  refreshUsers: () => Promise<void>;
  performAction: (userId: string) => Promise<{ error: string | null }>;
  getUserId: (user: unknown) => string;
  getUserProfile: (user: unknown) => UserProfile | undefined;
  confirmTitle: string;
  confirmMessage: (name: string) => string;
  errorMessage: string;
  isLoading: boolean;
}

const UserManagementListScreen = ({
  navigation,
  title,
  emptyIcon,
  emptyTitle,
  emptySubtitle,
  actionLabel,
  actionColor,
  getUsers,
  refreshUsers,
  performAction,
  getUserId,
  getUserProfile,
  confirmTitle,
  confirmMessage,
  errorMessage,
  isLoading,
}: UserManagementListScreenProps) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showConfirm, showError } = useSmuppyAlert();

  const [users, setUsers] = useState<unknown[]>([]);
  const [actionInProgress, setActionInProgress] = useState<Record<string, boolean>>({});

  const baseStyles = useMemo(() => createListScreenStyles(colors, isDark), [colors, isDark]);
  const localStyles = useMemo(() => createLocalStyles(actionColor, colors), [actionColor, colors]);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUsers = async () => {
    await refreshUsers();
    setUsers(getUsers());
  };

  const handleAction = useCallback(
    async (userId: string, userName: string) => {
      showConfirm(confirmTitle, confirmMessage(userName), async () => {
        setActionInProgress((prev) => ({ ...prev, [userId]: true }));
        try {
          const { error } = await performAction(userId);
          if (!error) {
            setUsers((prev) => prev.filter((u) => getUserId(u) !== userId));
          } else {
            showError('Error', errorMessage);
          }
        } finally {
          setActionInProgress((prev) => ({ ...prev, [userId]: false }));
        }
      });
    },
    [performAction, showConfirm, showError, confirmTitle, confirmMessage, errorMessage, getUserId],
  );

  const renderUser = useCallback(
    ({ item }: { item: unknown }) => {
      const profile = getUserProfile(item);
      if (!profile) return null;

      const userId = getUserId(item);
      const isActioning = actionInProgress[userId];

      return (
        <View style={localStyles.userItem}>
          <TouchableOpacity
            style={baseStyles.userInfo}
            onPress={() => navigation.navigate('UserProfile', { userId: profile.id })}
          >
            <AvatarImage source={profile.avatar_url} size={50} style={baseStyles.avatar} />
            <View style={baseStyles.userDetails}>
              <Text style={baseStyles.userName}>{resolveDisplayName(profile)}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[localStyles.actionBtn, isActioning && localStyles.actionBtnDisabled]}
            onPress={() =>
              handleAction(userId, resolveDisplayName(profile, 'this user'))
            }
            disabled={isActioning}
          >
            {isActioning ? (
              <ActivityIndicator size="small" color={actionColor} />
            ) : (
              <Text style={localStyles.actionBtnText}>{actionLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [
      actionInProgress,
      handleAction,
      navigation,
      baseStyles,
      localStyles,
      actionColor,
      actionLabel,
      getUserId,
      getUserProfile,
    ],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={baseStyles.emptyState}>
        <View style={baseStyles.emptyIconContainer}>
          <Ionicons name={emptyIcon as keyof typeof Ionicons.glyphMap} size={48} color={colors.gray} />
        </View>
        <Text style={baseStyles.emptyTitle}>{emptyTitle}</Text>
        <Text style={baseStyles.emptySubtitle}>{emptySubtitle}</Text>
      </View>
    ),
    [baseStyles, colors, emptyIcon, emptyTitle, emptySubtitle],
  );

  return (
    <View style={[baseStyles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={baseStyles.header}>
        <TouchableOpacity style={baseStyles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={baseStyles.headerTitle}>{title}</Text>
        <View style={baseStyles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={baseStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryGreen} />
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => (item as { id: string }).id}
          contentContainerStyle={localStyles.listContent}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          windowSize={5}
        />
      )}
    </View>
  );
};

/**
 * Styles specific to UserManagementListScreen (action buttons, list item layout).
 * Shared header/empty/user-row styles come from createListScreenStyles.
 */
const createLocalStyles = (actionColor: string, colors: ThemeColors) =>
  StyleSheet.create({
    listContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    userItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.grayBorder,
    },
    actionBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1.5,
      borderColor: actionColor,
      minWidth: 80,
      alignItems: 'center',
    },
    actionBtnDisabled: {
      opacity: 0.6,
    },
    actionBtnText: {
      fontSize: 14,
      fontFamily: 'Poppins-SemiBold',
      color: actionColor,
    },
  });

export default UserManagementListScreen;
