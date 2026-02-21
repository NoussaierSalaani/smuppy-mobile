/**
 * Dispute Center Screen
 *
 * Main hub for managing session disputes
 * - Lists all user's disputes (as buyer or creator)
 * - Shows status, priority, and quick actions
 * - Access to create new disputes
 */

import React, { useCallback, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  FadeInUp,
  Layout,
} from 'react-native-reanimated';

import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useUserStore } from '../../stores/userStore';
import { awsAPI } from '../../services/aws-api';
import OptimizedImage from '../../components/OptimizedImage';
import Button from '../../components/Button';
import { formatDateShort, formatDateCompact } from '../../utils/dateFormatters';

interface Dispute {
  id: string;
  disputeNumber: string;
  type: 'no_show' | 'incomplete' | 'quality' | 'technical' | 'other';
  status: 'open' | 'under_review' | 'evidence_requested' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  description: string;
  amount: number;
  refundAmount: number | null;
  currency: string;
  resolution: 'full_refund' | 'partial_refund' | 'no_refund' | null;
  createdAt: string;
  resolvedAt: string | null;
  evidenceDeadline: string | null;
  complainant: {
    username: string;
    avatar: string | null;
  };
  respondent: {
    username: string;
    avatar: string | null;
  };
}

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  no_show: 'Absence',
  incomplete: 'Session incomplète',
  quality: 'Problème de qualité',
  technical: 'Problème technique',
  other: 'Autre',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  open: { label: 'Ouvert', color: '#F59E0B', icon: 'alert-circle' },
  under_review: { label: 'En cours', color: '#3B82F6', icon: 'time' },
  evidence_requested: { label: 'Preuves requises', color: '#8B5CF6', icon: 'document' },
  resolved: { label: 'Résolu', color: '#10B981', icon: 'checkmark-circle' },
  closed: { label: 'Fermé', color: '#6B7280', icon: 'close-circle' },
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#10B981',
  normal: '#3B82F6',
  high: '#F59E0B',
  urgent: '#EF4444',
};

type DisputeCardProps = Readonly<{
  dispute: Dispute;
  onPress: (dispute: Dispute) => void;
  colors: ThemeColors;
  currentUserId: string;
}>;


const DisputeCard = memo(function DisputeCard({
  dispute,
  onPress,
  colors,
}: DisputeCardProps) {
  const status = STATUS_CONFIG[dispute.status];
  const isComplainant = dispute.complainant.username !== dispute.respondent.username;
  const otherParty = isComplainant ? dispute.respondent : dispute.complainant;

  return (
    <Animated.View entering={FadeInUp} layout={Layout.springify()}>
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: colors.cardBg, borderColor: colors.border },
        ]}
        onPress={() => onPress(dispute)}
        activeOpacity={0.8}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.disputeNumberContainer}>
            <Text style={[styles.disputeNumber, { color: colors.dark }]}>
              #{dispute.disputeNumber}
            </Text>
            <View
              style={[
                styles.priorityBadge,
                { backgroundColor: `${PRIORITY_COLORS[dispute.priority]}20` },
              ]}
            >
              <Text
                style={[
                  styles.priorityText,
                  { color: PRIORITY_COLORS[dispute.priority] },
                ]}
              >
                {dispute.priority.toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
            <Ionicons name={status.icon as React.ComponentProps<typeof Ionicons>['name']} size={12} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>

        {/* Other party info */}
        <View style={styles.partyRow}>
          <OptimizedImage
            source={{ uri: otherParty.avatar ?? undefined }}
            style={styles.avatar}
            placeholder="avatar"
          />
          <View style={styles.partyInfo}>
            <Text style={[styles.partyLabel, { color: colors.graySecondary }]}>
              {isComplainant ? 'Avec' : 'De'}
            </Text>
            <Text style={[styles.partyName, { color: colors.dark }]}>
              @{otherParty.username}
            </Text>
          </View>
        </View>

        {/* Dispute type */}
        <View style={styles.typeRow}>
          <Ionicons name="flag" size={14} color={colors.graySecondary} />
          <Text style={[styles.typeText, { color: colors.graySecondary }]}>
            {DISPUTE_TYPE_LABELS[dispute.type]}
          </Text>
        </View>

        {/* Amount */}
        <View style={styles.amountRow}>
          <Text style={[styles.amountLabel, { color: colors.graySecondary }]}>
            Montant contesté:
          </Text>
          <Text style={[styles.amountValue, { color: colors.dark }]}>
            {(dispute.amount / 100).toFixed(2)} {dispute.currency.toUpperCase()}
          </Text>
        </View>

        {/* Resolution */}
        {dispute.resolution && dispute.refundAmount && (
          <View style={[styles.resolutionRow, { backgroundColor: `${status.color}10` }]}>
            <Ionicons name="cash-outline" size={16} color={status.color} />
            <Text style={[styles.resolutionText, { color: status.color }]}>
              Remboursement: {(dispute.refundAmount / 100).toFixed(2)} {dispute.currency.toUpperCase()}
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.cardFooter}>
          <Text style={[styles.dateText, { color: colors.graySecondary }]}>
            {formatDateShort(dispute.createdAt)}
          </Text>
          {dispute.evidenceDeadline && dispute.status !== 'resolved' && (
            <View style={styles.deadlineBadge}>
              <Ionicons name="time-outline" size={12} color="#EF4444" />
              <Text style={styles.deadlineText}>
                Avant {formatDateCompact(dispute.evidenceDeadline)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function DisputeCenterScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const user = useUserStore((state) => state.user);

  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');


  const fetchDisputes = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await awsAPI.request<{ success: boolean; disputes: Dispute[] }>('/disputes', { method: 'GET' });
      if (response?.success) {
        setDisputes(response.disputes || []);
      }
    } catch (_err) {
      // Error handled silently
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDisputes();
    }, [fetchDisputes])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDisputes(false);
  }, [fetchDisputes]);

  const filteredDisputes = disputes.filter((d) => {
    if (filter === 'all') return true;
    if (filter === 'open') return ['open', 'under_review', 'evidence_requested'].includes(d.status);
    if (filter === 'resolved') return ['resolved', 'closed'].includes(d.status);
    return true;
  });

  const handleDisputePress = useCallback(
    (dispute: Dispute) => {
      navigation.navigate('DisputeDetail', { disputeId: dispute.id });
    },
    [navigation]
  );

  const handleCreateDispute = useCallback(() => {
    navigation.navigate('CreateDispute');
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: Dispute }) => (
      <DisputeCard
        dispute={item}
        onPress={handleDisputePress}
        colors={colors}
        currentUserId={user?.id || ''}
      />
    ),
    [colors, handleDisputePress, user?.id]
  );

  const keyExtractor = useCallback((item: Dispute) => item.id, []);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.dark }]}>
          Centre de litiges
        </Text>
        <TouchableOpacity
          style={[styles.newButton, { backgroundColor: colors.primary }]}
          onPress={handleCreateDispute}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newButtonText}>Nouveau</Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterContainer}>
        {(['all', 'open', 'resolved'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterButton,
              filter === f && { backgroundColor: colors.primary },
            ]}
            onPress={() => setFilter(f)}
          >
            <Text
              style={[
                styles.filterText,
                { color: filter === f ? '#fff' : colors.graySecondary },
              ]}
            >
              {({ all: 'Tous', open: 'En cours' } as Record<string, string>)[f] ?? 'Résolus'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Dispute list */}
      {filteredDisputes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-checkmark" size={64} color={colors.graySecondary} />
          <Text style={[styles.emptyTitle, { color: colors.dark }]}>
            Aucun litige
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.graySecondary }]}>
            {filter === 'all'
              ? "Vous n'avez aucun litige en cours"
              : filter === 'open'
                ? "Pas de litiges en cours"
                : "Pas de litiges résolus"}
          </Text>
          {filter === 'all' && (
            <Button
              onPress={handleCreateDispute}
              style={styles.emptyButton}
            >
              Ouvrir un litige
            </Button>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredDisputes}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 4,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(150,150,150,0.1)',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  disputeNumberContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  disputeNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  partyInfo: {
    marginLeft: 12,
  },
  partyLabel: {
    fontSize: 12,
  },
  partyName: {
    fontSize: 14,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 6,
  },
  typeText: {
    fontSize: 13,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 13,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  resolutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  resolutionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
  },
  deadlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deadlineText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  emptyButton: {
    minWidth: 160,
  },
});
