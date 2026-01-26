import React, { useEffect, useState, useCallback } from 'react';
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
import { COLORS } from '../../config/theme';

interface FollowRequestsScreenProps {
  navigation: { goBack: () => void; navigate: (screen: string, params?: Record<string, unknown>) => void };
}

const FollowRequestsScreen = ({ navigation }: FollowRequestsScreenProps) => {
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

  const handleAccept = async (request: FollowRequest) => {
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
  };

  const handleDecline = async (request: FollowRequest) => {
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
  };

  const renderRequest = ({ item }: { item: FollowRequest }) => {
    const user = item.requester;
    if (!user) return null;

    const isProcessing = processingIds[item.id];
    const isAccepting = isProcessing === 'accepting';
    const isDecline = isProcessing === 'declining';

    return (
      <View style={styles.requestItem}>
        <TouchableOpacity
          style={styles.userInfo}
          onPress={() => navigation.navigate('UserProfile', { userId: user.id })}
        >
          <AvatarImage source={user.avatar_url} size={50} style={styles.avatar} />
          <View style={styles.userDetails}>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{user.full_name || user.username}</Text>
              <AccountBadge
                size={14}
                style={{ marginLeft: 4 }}
                isVerified={user.is_verified}
                accountType={user.account_type}
              />
            </View>
            <Text style={styles.userHandle}>@{user.username}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.acceptBtn, isProcessing && styles.btnDisabled]}
            onPress={() => handleAccept(item)}
            disabled={!!isProcessing}
          >
            {isAccepting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
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
              <ActivityIndicator size="small" color="#8E8E93" />
            ) : (
              <Text style={styles.declineBtnText}>Decline</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="person-add-outline" size={48} color="#9CA3AF" />
      </View>
      <Text style={styles.emptyTitle}>No Follow Requests</Text>
      <Text style={styles.emptySubtitle}>
        When someone requests to follow you, you'll see it here.
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
        <Text style={styles.headerTitle}>Follow Requests</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primaryGreen} />
        </View>
      ) : (
        <FlatList
          data={requests}
          renderItem={renderRequest}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={renderEmptyState}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primaryGreen}
            />
          }
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
    backgroundColor: '#F2F2F2',
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
    color: '#0A0A0F',
  },
  userHandle: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: '#9CA3AF',
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
    backgroundColor: COLORS.primaryGreen,
    minWidth: 70,
    alignItems: 'center',
  },
  acceptBtnText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFFFFF',
  },
  declineBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    minWidth: 70,
    alignItems: 'center',
  },
  declineBtnText: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#8E8E93',
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

export default FollowRequestsScreen;
