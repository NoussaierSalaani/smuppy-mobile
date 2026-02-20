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

  const styles = useMemo(() => createStyles(colors, isDark, actionColor), [colors, isDark, actionColor]);

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
        <View style={styles.userItem}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => navigation.navigate('UserProfile', { userId: profile.id })}
          >
            <AvatarImage source={profile.avatar_url} size={50} style={styles.avatar} />
            <View style={styles.userDetails}>
              <Text style={styles.userName}>{resolveDisplayName(profile)}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, isActioning && styles.actionBtnDisabled]}
            onPress={() =>
              handleAction(userId, resolveDisplayName(profile, 'this user'))
            }
            disabled={isActioning}
          >
            {isActioning ? (
              <ActivityIndicator size="small" color={actionColor} />
            ) : (
              <Text style={styles.actionBtnText}>{actionLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [
      actionInProgress,
      handleAction,
      navigation,
      styles,
      actionColor,
      actionLabel,
      getUserId,
      getUserProfile,
    ],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name={emptyIcon as keyof typeof Ionicons.glyphMap} size={48} color={colors.gray} />
        </View>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
      </View>
    ),
    [styles, colors, emptyIcon, emptyTitle, emptySubtitle],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primaryGreen} />
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => (item as { id: string }).id}
          contentContainerStyle={styles.listContent}
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

const createStyles = (colors: ThemeColors, isDark: boolean, actionColor: string) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.grayBorder,
    },
    backButton: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    headerTitle: {
      fontSize: 18,
      fontFamily: 'WorkSans-SemiBold',
      color: colors.dark,
    },
    headerSpacer: {
      width: 40,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
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
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.grayBorder,
    },
    userDetails: {
      marginLeft: 12,
      flex: 1,
    },
    userName: {
      fontSize: 16,
      fontFamily: 'WorkSans-SemiBold',
      color: colors.dark,
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
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
    },
    emptyIconContainer: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: isDark ? colors.backgroundSecondary : colors.grayLight,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    emptyTitle: {
      fontSize: 18,
      fontFamily: 'WorkSans-SemiBold',
      color: colors.dark,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 14,
      fontFamily: 'Poppins-Regular',
      color: colors.gray,
      textAlign: 'center',
      lineHeight: 22,
    },
  });

export default UserManagementListScreen;
