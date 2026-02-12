import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarImage } from '../../components/OptimizedImage';
import { AccountBadge } from '../../components/Badge';
import {
  getPendingFollowRequests,
  acceptFollowRequest,
  declineFollowRequest,
  FollowRequest,
} from '../../services/database';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { isValidUUID } from '../../utils/formatters';
import { resolveDisplayName } from '../../types/profile';

interface FollowRequestsScreenProps {
  navigation: { goBack: () => void; navigate: (screen: string, params?: Record<string, unknown>) => void };
}

const FollowRequestsScreen = ({ navigation }: FollowRequestsScreenProps) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingIds, setProcessingIds] = useState<Record<string, 'accepting' | 'declining'>>({});

  const loadRequests = useCallback(async () => {
    const { data, error } = await getPendingFollowRequests();
    if (!error && data) {
      setRequests(data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRequests();
  }, [loadRequests]);

  const handleAccept = useCallback(async (request: FollowRequest) => {
    setProcessingIds(prev => ({ ...prev, [request.id]: 'accepting' }));

    const { error } = await acceptFollowRequest(request.id);

    if (!error) {
      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== request.id));
    }

    setProcessingIds(prev => {
      const newState = { ...prev };
      delete newState[request.id];
      return newState;
    });
  }, []);

  const handleDecline = useCallback(async (request: FollowRequest) => {
    setProcessingIds(prev => ({ ...prev, [request.id]: 'declining' }));

    const { error } = await declineFollowRequest(request.id);

    if (!error) {
      // Remove from list
      setRequests(prev => prev.filter(r => r.id !== request.id));
    }

    setProcessingIds(prev => {
      const newState = { ...prev };
      delete newState[request.id];
      return newState;
    });
  }, []);

  const renderRequest = useCallback(({ item }: { item: FollowRequest }) => {
    const user = item.requester;
    if (!user) return null;

    const isProcessing = processingIds[item.id];
    const isAccepting = isProcessing === 'accepting';
    const isDecline = isProcessing === 'declining';

    return (
      <View style={styles.requestItem}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => {
            if (!isValidUUID(user.id)) {
              if (__DEV__) console.warn('[FollowRequestsScreen] Invalid userId:', user.id);
              return;
            }
            navigation.navigate('UserProfile', { userId: user.id });
          }}
        >
          <AvatarImage source={user.avatar_url} size={50} style={styles.avatar} />
          <View style={styles.userDetails}>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{resolveDisplayName(user)}</Text>
              <AccountBadge
                size={14}
                style={{ marginLeft: 4 }}
                isVerified={user.is_verified}
                accountType={user.account_type}
              />
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.acceptBtn, isProcessing && styles.btnDisabled]}
            onPress={() => handleAccept(item)}
            disabled={!!isProcessing}
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.acceptBtnText}>Accept</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.declineBtn, isProcessing && styles.btnDisabled]}
            onPress={() => handleDecline(item)}
            disabled={!!isProcessing}
          >
            {isDecline ? (
              <ActivityIndicator size="small" color={colors.gray} />
            ) : (
              <Text style={styles.declineBtnText}>Decline</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [processingIds, handleAccept, handleDecline, navigation, colors.gray, colors.white, styles.acceptBtn, styles.acceptBtnText, styles.actions, styles.avatar, styles.btnDisabled, styles.declineBtn, styles.declineBtnText, styles.nameRow, styles.requestItem, styles.userDetails, styles.userInfo, styles.userName]);

  const renderEmptyState = useCallback(() => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="person-add-outline" size={48} color={colors.grayMuted} />
      </View>
      <Text style={styles.emptyTitle}>No Follow Requests</Text>
      <Text style={styles.emptySubtitle}>
        When someone requests to follow you, you'll see it here.
      </Text>
    </View>
  ), [styles, colors]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Follow Requests</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
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
    paddingVertical: 8,
  },
  requestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontFamily: 'WorkSans-SemiBold',
    color: colors.dark,
  },
  userHandle: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: colors.grayMuted,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.primary,
    minWidth: 70,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: colors.white,
  },
  declineBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.backgroundSecondary,
    minWidth: 70,
    alignItems: 'center',
  },
  declineBtnText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: colors.gray,
  },
  btnDisabled: {
    opacity: 0.6,
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
    backgroundColor: colors.backgroundSecondary,
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
    color: colors.grayMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default FollowRequestsScreen;
