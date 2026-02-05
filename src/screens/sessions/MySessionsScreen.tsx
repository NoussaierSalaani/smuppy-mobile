import { AvatarImage } from '../../components/OptimizedImage';

/**
 * My Sessions Screen
 * Shows user's upcoming and past sessions (Fan perspective)
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { SessionListSkeleton } from '../../components/skeleton';
import { awsAPI, Session } from '../../services/aws-api';
import { formatDateRelativeFrench, formatTime } from '../../utils/dateFormatters';

type TabType = 'upcoming' | 'past';

const MySessionsScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upcomingSessions, setUpcomingSessions] = useState<Session[]>([]);
  const [pastSessions, setPastSessions] = useState<Session[]>([]);

  const fetchSessions = useCallback(async () => {
    try {
      const [upcomingRes, pastRes] = await Promise.all([
        awsAPI.listSessions({ status: 'upcoming', role: 'fan' }),
        awsAPI.listSessions({ status: 'past', role: 'fan' }),
      ]);

      if (upcomingRes.success) {
        setUpcomingSessions(upcomingRes.sessions || []);
      }
      if (pastRes.success) {
        setPastSessions(pastRes.sessions || []);
      }
    } catch (error) {
      if (__DEV__) console.warn('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSessions();
    setRefreshing(false);
  }, [fetchSessions]);

  const sessions = activeTab === 'upcoming' ? upcomingSessions : pastSessions;

  const getStatusColor = (status: Session['status']): string => {
    switch (status) {
      case 'confirmed': return colors.primary;
      case 'pending': return '#FFA500';
      case 'completed': return colors.gray;
      case 'cancelled': return '#FF4444';
      case 'in_progress': return colors.primary;
      case 'no_show': return '#FF4444';
      default: return colors.gray;
    }
  };

  const getStatusLabel = (status: Session['status']): string => {
    switch (status) {
      case 'confirmed': return 'Confirmée';
      case 'pending': return 'En attente';
      case 'completed': return 'Terminée';
      case 'cancelled': return 'Annulée';
      case 'in_progress': return 'En cours';
      case 'no_show': return 'Absent';
      default: return status;
    }
  };

  const canJoinSession = (session: Session): boolean => {
    if (session.status !== 'confirmed') return false;
    const scheduledTime = new Date(session.scheduledAt).getTime();
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    return now >= scheduledTime - fiveMinutes && now <= scheduledTime + session.duration * 60 * 1000;
  };

  const handleJoinSession = (session: Session) => {
    navigation.navigate('WaitingRoom', {
      sessionId: session.id,
      creatorId: session.creator.id,
      creatorName: session.creator.name,
      creatorAvatar: session.creator.avatar,
    });
  };

  const handleSessionPress = (session: Session) => {
    navigation.navigate('SessionDetail', { sessionId: session.id });
  };

  const renderSessionCard = ({ item: session }: { item: Session }) => (
    <TouchableOpacity
      style={styles.sessionCard}
      onPress={() => handleSessionPress(session)}
      activeOpacity={0.7}
    >
      <View style={styles.sessionHeader}>
        <AvatarImage source={session.creator.avatar} size={48} style={styles.avatar} />
        <View style={styles.creatorInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.creatorName}>{session.creator.name}</Text>
            {session.creator.verified && (
              <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
            )}
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(session.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(session.status) }]}>
            {getStatusLabel(session.status)}
          </Text>
        </View>
      </View>

      <View style={styles.sessionDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.gray} />
          <Text style={styles.detailText}>{formatDateRelativeFrench(session.scheduledAt)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={18} color={colors.gray} />
          <Text style={styles.detailText}>{formatTime(session.scheduledAt)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="hourglass-outline" size={18} color={colors.gray} />
          <Text style={styles.detailText}>{session.duration} min</Text>
        </View>
      </View>

      {canJoinSession(session) && (
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => handleJoinSession(session)}
        >
          <LinearGradient
            colors={[colors.primary, colors.cyanBlue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.joinGradient}
          >
            <Ionicons name="videocam" size={20} color={colors.white} />
            <Text style={styles.joinText}>Rejoindre maintenant</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {activeTab === 'past' && session.status === 'completed' && (
        <TouchableOpacity
          style={styles.rebookButton}
          onPress={() => navigation.navigate('BookSession', { creatorId: session.creator.id })}
        >
          <Ionicons name="refresh" size={18} color={colors.primary} />
          <Text style={styles.rebookText}>Réserver à nouveau</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name={activeTab === 'upcoming' ? 'calendar-outline' : 'time-outline'}
        size={64}
        color={colors.gray}
      />
      <Text style={styles.emptyTitle}>
        {activeTab === 'upcoming' ? 'Aucune session à venir' : 'Aucune session passée'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {activeTab === 'upcoming'
          ? 'Réservez une session avec votre créateur préféré'
          : 'Vos sessions terminées apparaîtront ici'}
      </Text>
      {activeTab === 'upcoming' && (
        <TouchableOpacity
          style={styles.exploreButton}
          onPress={() => navigation.navigate('Search')}
        >
          <Text style={styles.exploreText}>Explorer les créateurs</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (loading && upcomingSessions.length === 0 && pastSessions.length === 0) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <SessionListSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={isDark ? colors.white : colors.dark} />
        </TouchableOpacity>
        <Text style={styles.title}>Mes Sessions</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.activeTabText]}>
            À venir
          </Text>
          {upcomingSessions.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{upcomingSessions.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.activeTab]}
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.activeTabText]}>
            Historique
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sessions List */}
      <FlatList
        data={sessions}
        renderItem={renderSessionCard}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      />
    </View>
  );
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  placeholder: {
    width: 40,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    gap: 8,
  },
  activeTab: {
    backgroundColor: colors.primary + '20',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray,
  },
  activeTabText: {
    color: colors.primary,
  },
  badge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  sessionCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
  },
  creatorInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  username: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sessionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailText: {
    fontSize: 14,
    color: colors.grayLight,
  },
  joinButton: {
    marginTop: 4,
  },
  joinGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  joinText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  rebookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 4,
  },
  rebookText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  exploreButton: {
    marginTop: 24,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  exploreText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
});

export default MySessionsScreen;
