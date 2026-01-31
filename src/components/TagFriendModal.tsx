import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSmuppyAlert } from '../context/SmuppyAlertContext';
import { AvatarImage } from './OptimizedImage';
import * as Haptics from 'expo-haptics';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import {
  getFollowing,
  getFollowers,
  getCurrentProfile,
  Profile,
} from '../services/database';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Friend {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  isMutual?: boolean;
}

interface TagFriendModalProps {
  visible: boolean;
  onClose: () => void;
  onTagFriend: (friend: Friend) => void;
  peakId: string;
  existingTags?: string[]; // IDs of already tagged friends
}

// Transform Profile to Friend
const profileToFriend = (profile: Profile, isMutual: boolean): Friend => ({
  id: profile.id,
  name: profile.full_name || profile.username || 'User',
  username: profile.username || 'user',
  avatar: profile.avatar_url || null,
  isMutual,
});

const TagFriendModal: React.FC<TagFriendModalProps> = ({
  visible,
  onClose,
  onTagFriend,
  peakId: _peakId,
  existingTags = [],
}) => {
  const { showError } = useSmuppyAlert();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [searchQuery, setSearchQuery] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);

  // Load friends on mount
  useEffect(() => {
    if (visible) {
      loadFriends();
    }
  }, [visible]);

  const loadFriends = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: currentProfile } = await getCurrentProfile();
      if (!currentProfile) {
        console.error('[TagFriendModal] No current profile');
        setLoading(false);
        return;
      }

      // Load people I'm following and people who follow me in parallel
      const [followingResult, followersResult] = await Promise.all([
        getFollowing(currentProfile.id, 0, 100),
        getFollowers(currentProfile.id, 0, 100),
      ]);

      // Create set of follower IDs for mutual check
      const followerIds = new Set(
        followersResult.data?.map((p) => p.id) || []
      );

      // Transform to Friend objects
      const transformedFriends: Friend[] = (followingResult.data || []).map((profile) =>
        profileToFriend(profile, followerIds.has(profile.id))
      );

      setFriends(transformedFriends);
    } catch (error) {
      console.error('[TagFriendModal] Error loading friends:', error);
      showError('Error', 'Failed to load friends. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter friends based on search
  const filteredFriends = friends.filter(friend => {
    const query = searchQuery.toLowerCase();
    return (
      friend.name.toLowerCase().includes(query) ||
      friend.username.toLowerCase().includes(query)
    );
  });

  // Sort: mutual friends first, then alphabetically
  const sortedFriends = [...filteredFriends].sort((a, b) => {
    if (a.isMutual && !b.isMutual) return -1;
    if (!a.isMutual && b.isMutual) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleSelectFriend = (friend: Friend) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedFriend(friend);
  };

  const handleConfirmTag = () => {
    if (selectedFriend) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onTagFriend(selectedFriend);
      setSelectedFriend(null);
      setSearchQuery('');
      onClose();
    }
  };

  const handleClose = () => {
    setSelectedFriend(null);
    setSearchQuery('');
    onClose();
  };

  const isAlreadyTagged = (friendId: string) => existingTags.includes(friendId);

  const renderFriendItem = ({ item }: { item: Friend }) => {
    const isSelected = selectedFriend?.id === item.id;
    const isTagged = isAlreadyTagged(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.friendItem,
          isSelected && styles.friendItemSelected,
          isTagged && styles.friendItemTagged,
        ]}
        onPress={() => !isTagged && handleSelectFriend(item)}
        disabled={isTagged}
        activeOpacity={0.7}
      >
        <View style={styles.friendAvatarContainer}>
          <AvatarImage source={item.avatar} size={48} style={styles.friendAvatar} />
          {item.isMutual && (
            <View style={styles.mutualBadge}>
              <Ionicons name="people" size={10} color={colors.white} />
            </View>
          )}
        </View>

        <View style={styles.friendInfo}>
          <Text style={styles.friendName}>{item.name}</Text>
          <Text style={styles.friendUsername}>@{item.username}</Text>
        </View>

        {isTagged ? (
          <View style={styles.taggedBadge}>
            <Ionicons name="checkmark" size={16} color={colors.primary} />
            <Text style={styles.taggedText}>Tagged</Text>
          </View>
        ) : isSelected ? (
          <View style={styles.selectedIndicator}>
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={styles.selectedGradient}
            >
              <Ionicons name="checkmark" size={20} color={colors.dark} />
            </LinearGradient>
          </View>
        ) : (
          <View style={styles.selectCircle} />
        )}
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="people-outline" size={48} color={colors.gray} />
      <Text style={styles.emptyTitle}>No friends found</Text>
      <Text style={styles.emptyDesc}>
        {searchQuery ? `No results for "${searchQuery}"` : 'Become a fan of people to tag them!'}
      </Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} onPress={handleClose} activeOpacity={1} />

        <View style={[styles.container, { paddingBottom: insets.bottom + 20 }]}>
          {/* Header Accent */}
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerAccent}
          />

          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.white} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.title}>Tag a Friend</Text>
              <Text style={styles.subtitle}>Challenge them to respond!</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Privacy Note */}
          <View style={styles.privacyNote}>
            <Ionicons name="lock-closed" size={14} color={colors.primary} />
            <Text style={styles.privacyText}>
              Only you, them & mutual friends will see the tag
            </Text>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.gray} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search friends..."
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

          {/* Friends List */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <FlatList
              data={sortedFriends}
              renderItem={renderFriendItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={renderEmptyState}
              keyboardShouldPersistTaps="handled"
            />
          )}

          {/* Confirm Button */}
          {selectedFriend && (
            <View style={styles.confirmContainer}>
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleConfirmTag}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.confirmGradient}
                >
                  <Ionicons name="pricetag" size={20} color={colors.dark} />
                  <Text style={styles.confirmText}>
                    Tag {selectedFriend.name.split(' ')[0]}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    backgroundColor: isDark ? colors.darkGray : colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.8,
    overflow: 'hidden',
  },
  headerAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
  },
  subtitle: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.1)' : 'rgba(14, 191, 138, 0.08)',
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
  },
  privacyText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.gray100,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.dark,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
  },
  friendItemSelected: {
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.1)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  friendItemTagged: {
    opacity: 0.5,
  },
  friendAvatarContainer: {
    position: 'relative',
  },
  friendAvatar: {
    borderRadius: 24,
  },
  mutualBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: isDark ? colors.darkGray : colors.background,
  },
  friendInfo: {
    flex: 1,
    marginLeft: 12,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  friendUsername: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  selectCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
  },
  selectedIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
  },
  selectedGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  taggedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.2)' : 'rgba(14, 191, 138, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  taggedText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
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
    marginTop: 4,
    textAlign: 'center',
  },
  confirmContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: isDark ? colors.darkGray : colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  confirmButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  confirmText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.dark,
  },
});

export default TagFriendModal;
