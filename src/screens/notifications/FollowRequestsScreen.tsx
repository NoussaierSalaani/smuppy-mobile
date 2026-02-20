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
import { createListScreenStyles } from '../../components/shared-list-styles';

type FollowRequestsScreenProps = Readonly<{
  navigation: { goBack: () => void; navigate: (screen: string, params?: Record<string, unknown>) => void };
}>;


const FollowRequestsScreen = ({ navigation }: FollowRequestsScreenProps) => {
  const { colors, isDark } = useTheme();
  const baseStyles = useMemo(() => createListScreenStyles(colors, isDark), [colors, isDark]);
  const localStyles = useMemo(() => createLocalStyles(colors), [colors]);
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
      <View style={localStyles.requestItem}>
        <TouchableOpacity
          style={baseStyles.userInfo}
          onPress={() => {
            if (!isValidUUID(user.id)) {
              if (__DEV__) console.warn('[FollowRequestsScreen] Invalid userId:', user.id);
              return;
            }
            navigation.navigate('UserProfile', { userId: user.id });
          }}
        >
          <AvatarImage source={user.avatar_url} size={50} style={baseStyles.avatar} />
          <View style={baseStyles.userDetails}>
            <View style={localStyles.nameRow}>
              <Text style={baseStyles.userName}>{resolveDisplayName(user)}</Text>
              <AccountBadge
                size={14}
                style={{ marginLeft: 4 }}
                isVerified={user.is_verified}
                accountType={user.account_type}
              />
            </View>
          </View>
        </TouchableOpacity>

        <View style={localStyles.actions}>
          <TouchableOpacity
            style={[localStyles.acceptBtn, isProcessing && localStyles.btnDisabled]}
            onPress={() => handleAccept(item)}
            disabled={!!isProcessing}
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={localStyles.acceptBtnText}>Accept</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[localStyles.declineBtn, isProcessing && localStyles.btnDisabled]}
            onPress={() => handleDecline(item)}
            disabled={!!isProcessing}
          >
            {isDecline ? (
              <ActivityIndicator size="small" color={colors.gray} />
            ) : (
              <Text style={localStyles.declineBtnText}>Decline</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [processingIds, handleAccept, handleDecline, navigation, colors.gray, colors.white, localStyles, baseStyles]);

  const renderEmptyState = useCallback(() => (
    <View style={baseStyles.emptyState}>
      <View style={baseStyles.emptyIconContainer}>
        <Ionicons name="person-add-outline" size={48} color={colors.grayMuted} />
      </View>
      <Text style={baseStyles.emptyTitle}>No Follow Requests</Text>
      <Text style={baseStyles.emptySubtitle}>
        When someone requests to follow you, you'll see it here.
      </Text>
    </View>
  ), [baseStyles, colors]);

  return (
    <View style={[baseStyles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={baseStyles.header}>
        <TouchableOpacity style={baseStyles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={baseStyles.headerTitle}>Follow Requests</Text>
        <View style={baseStyles.headerSpacer} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={baseStyles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={localStyles.listContent}
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

/**
 * Styles specific to FollowRequestsScreen (request items, accept/decline buttons).
 * Shared header/empty/user-row styles come from createListScreenStyles.
 */
const createLocalStyles = (colors: ThemeColors) => StyleSheet.create({
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
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
});

export default FollowRequestsScreen;
