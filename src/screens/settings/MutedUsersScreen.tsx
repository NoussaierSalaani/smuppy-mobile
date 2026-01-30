import React, { useEffect, useState } from 'react';
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
import { AvatarImage } from '../../components/OptimizedImage';
import { useUserSafetyStore } from '../../stores';
import { MutedUser } from '../../services/database';
import { COLORS } from '../../config/theme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { resolveDisplayName } from '../../types/profile';

interface MutedUsersScreenProps {
  navigation: { goBack: () => void; navigate: (screen: string, params?: Record<string, unknown>) => void };
}

const MutedUsersScreen = ({ navigation }: MutedUsersScreenProps) => {
  const insets = useSafeAreaInsets();
  const { showConfirm, showError } = useSmuppyAlert();
  const {
    getMutedUsers,
    unmute,
    refresh,
    isLoading,
  } = useUserSafetyStore();

  const [mutedUsers, setMutedUsers] = useState<MutedUser[]>([]);
  const [unmuting, setUnmuting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadMutedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMutedUsers = async () => {
    await refresh();
    setMutedUsers(getMutedUsers());
  };

  const handleUnmute = async (userId: string, userName: string) => {
    showConfirm(
      'Unmute User',
      `Are you sure you want to unmute ${userName}? Their posts will appear in your feeds again.`,
      async () => {
        setUnmuting(prev => ({ ...prev, [userId]: true }));
        try {
          const { error } = await unmute(userId);
          if (!error) {
            setMutedUsers(prev => prev.filter(u => u.muted_user_id !== userId));
          } else {
            showError('Error', 'Failed to unmute user. Please try again.');
          }
        } finally {
          setUnmuting(prev => ({ ...prev, [userId]: false }));
        }
      }
    );
  };

  const renderMutedUser = ({ item }: { item: MutedUser }) => {
    const user = item.muted_user;
    if (!user) return null;

    const isUnmuting = unmuting[item.muted_user_id];

    return (
      <View style={styles.userItem}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
        >
          <AvatarImage source={user.avatar_url} size={50} style={styles.avatar} />
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{resolveDisplayName(user)}</Text>
            {user.username && <Text style={styles.userHandle}>@{user.username}</Text>}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.unmuteBtn, isUnmuting && styles.unmuteBtnDisabled]}
          onPress={() => handleUnmute(item.muted_user_id, resolveDisplayName(user, 'this user'))}
          disabled={isUnmuting}
        >
          {isUnmuting ? (
            <ActivityIndicator size="small" color={COLORS.primaryGreen} />
          ) : (
            <Text style={styles.unmuteBtnText}>Unmute</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="volume-mute-outline" size={48} color="#9CA3AF" />
      </View>
      <Text style={styles.emptyTitle}>No Muted Users</Text>
      <Text style={styles.emptySubtitle}>
        Users you mute will have their posts hidden from your feeds. You can still visit their profile.
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#0A0A0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Muted Users</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primaryGreen} />
        </View>
      ) : (
        <FlatList
          data={mutedUsers}
          renderItem={renderMutedUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
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
    color: '#0A0A0F',
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
    borderBottomColor: '#F2F2F2',
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
    backgroundColor: '#F2F2F2',
  },
  userDetails: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontFamily: 'WorkSans-SemiBold',
    color: '#0A0A0F',
  },
  userHandle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#9CA3AF',
    marginTop: 2,
  },
  unmuteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primaryGreen,
    minWidth: 80,
    alignItems: 'center',
  },
  unmuteBtnDisabled: {
    opacity: 0.6,
  },
  unmuteBtnText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: COLORS.primaryGreen,
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
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'WorkSans-SemiBold',
    color: '#0A0A0F',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default MutedUsersScreen;
