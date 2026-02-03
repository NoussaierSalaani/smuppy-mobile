import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { AccountBadge } from '../../components/Badge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import {
  getPostLikers,
  getCurrentProfile,
  Profile,
} from '../../services/database';

interface LikerUser {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  isVerified: boolean;
  accountType?: 'personal' | 'pro_creator' | 'pro_business';
}

const profileToLiker = (profile: Profile): LikerUser => ({
  id: profile.id,
  name: profile.full_name || profile.username || 'User',
  username: `@${profile.username || 'user'}`,
  avatar: profile.avatar_url || null,
  isVerified: profile.is_verified || false,
  accountType: profile.account_type || 'personal',
});

export default function PostLikersScreen({ navigation, route }: { navigation: any; route: any }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const postId = route?.params?.postId;

  const [likers, setLikers] = useState<LikerUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);

      const { data: currentProfile } = await getCurrentProfile();
      if (currentProfile) {
        setCurrentUserId(currentProfile.id);
      }

      const { data, error } = await getPostLikers(postId);
      if (error) {
        if (__DEV__) console.warn('[PostLikersScreen] Error:', error);
        showError('Error', 'Failed to load likes. Please try again.');
        setLikers([]);
        return;
      }

      setLikers((data || []).map(profileToLiker));
    } catch (error) {
      if (__DEV__) console.warn('[PostLikersScreen] Error loading data:', error);
      showError('Error', 'Failed to load likes. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Create styles with theme (must be before renderUserItem)
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleUserPress = useCallback(
    (userId: string) => {
      if (userId === currentUserId) {
        navigation.navigate('Tabs', { screen: 'Profile' });
      } else {
        navigation.navigate('UserProfile', { userId });
      }
    },
    [navigation, currentUserId]
  );

  const renderUserItem = useCallback(
    ({ item }: { item: LikerUser }) => (
      <TouchableOpacity
        style={styles.userItem}
        onPress={() => handleUserPress(item.id)}
        activeOpacity={0.7}
      >
        <AvatarImage source={item.avatar} size={50} />

        <View style={styles.userInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.userName} numberOfLines={1}>{item.name}</Text>
            <AccountBadge
              size={16}
              style={styles.verifiedBadge}
              isVerified={item.isVerified}
              accountType={item.accountType}
            />
          </View>
          <Text style={styles.userUsername} numberOfLines={1}>{item.username}</Text>
        </View>
      </TouchableOpacity>
    ),
    [handleUserPress, styles]
  );

  const keyExtractor = useCallback((item: LikerUser) => item.id, []);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={60} color={colors.gray} />
      <Text style={styles.emptyTitle}>No likes yet</Text>
      <Text style={styles.emptyDesc}>
        Be the first to like this post
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>

        <Text style={styles.headerText}>Likes</Text>

        <View style={styles.headerSpacer} />
      </View>

      {/* List */}
      <FlashList
        data={likers}
        renderItem={renderUserItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.gray,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  headerSpacer: {
    width: 40,
  },

  // List
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },

  // User Item
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#2C2C2E' : colors.grayBorder,
  },
  userInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    flexShrink: 1,
  },
  userUsername: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 2,
  },
  verifiedBadge: {
    marginLeft: 6,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
    marginTop: 16,
  },
  emptyDesc: {
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
