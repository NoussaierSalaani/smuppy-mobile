import React, { useCallback } from 'react';
import { useUserSafetyStore } from '../../stores/userSafetyStore';
import { BlockedUser } from '../../services/database';
import { useTheme } from '../../hooks/useTheme';
import UserManagementListScreen from '../../components/UserManagementListScreen';

type BlockedUsersScreenProps = Readonly<{
  navigation: { goBack: () => void; navigate: (screen: string, params?: Record<string, unknown>) => void };
}>;

const BlockedUsersScreen = ({ navigation }: BlockedUsersScreenProps) => {
  const { colors } = useTheme();
  const { getBlockedUsers, unblock, refresh, isLoading } = useUserSafetyStore();

  const getUserId = useCallback((user: unknown) => (user as BlockedUser).blocked_user_id, []);
  const getUserProfile = useCallback((user: unknown) => (user as BlockedUser).blocked_user, []);

  return (
    <UserManagementListScreen
      navigation={navigation}
      title="Blocked Users"
      emptyIcon="ban-outline"
      emptyTitle="No Blocked Users"
      emptySubtitle="Users you block won't be able to see your content or interact with you."
      actionLabel="Unblock"
      actionColor={colors.primaryGreen}
      getUsers={getBlockedUsers}
      refreshUsers={refresh}
      performAction={unblock}
      getUserId={getUserId}
      getUserProfile={getUserProfile}
      confirmTitle="Unblock User"
      confirmMessage={(name: string) => `Are you sure you want to unblock ${name}?`}
      errorMessage="Failed to unblock user. Please try again."
      isLoading={isLoading}
    />
  );
};

export default BlockedUsersScreen;
