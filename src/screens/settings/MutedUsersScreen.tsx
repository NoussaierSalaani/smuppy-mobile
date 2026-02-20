import React, { useCallback } from 'react';
import { useUserSafetyStore } from '../../stores/userSafetyStore';
import { MutedUser } from '../../services/database';
import { useTheme } from '../../hooks/useTheme';
import UserManagementListScreen from '../../components/UserManagementListScreen';

interface MutedUsersScreenProps {
  navigation: { goBack: () => void; navigate: (screen: string, params?: Record<string, unknown>) => void };
}

const MutedUsersScreen = ({ navigation }: MutedUsersScreenProps) => {
  const { colors } = useTheme();
  const { getMutedUsers, unmute, refresh, isLoading } = useUserSafetyStore();

  const getUserId = useCallback((user: unknown) => (user as MutedUser).muted_user_id, []);
  const getUserProfile = useCallback((user: unknown) => (user as MutedUser).muted_user, []);

  return (
    <UserManagementListScreen
      navigation={navigation}
      title="Muted Users"
      emptyIcon="volume-mute-outline"
      emptyTitle="No Muted Users"
      emptySubtitle="Users you mute will have their posts hidden from your feeds. You can still visit their profile."
      actionLabel="Unmute"
      actionColor={colors.primaryGreen}
      getUsers={getMutedUsers}
      refreshUsers={refresh}
      performAction={unmute}
      getUserId={getUserId}
      getUserProfile={getUserProfile}
      confirmTitle="Unmute User"
      confirmMessage={(name: string) => `Are you sure you want to unmute ${name}? Their posts will appear in your feeds again.`}
      errorMessage="Failed to unmute user. Please try again."
      isLoading={isLoading}
    />
  );
};

export default MutedUsersScreen;
