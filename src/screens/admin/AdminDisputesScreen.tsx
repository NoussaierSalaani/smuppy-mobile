/**
 * Admin Disputes Dashboard
 *
 * Admin interface for managing disputes:
 * - List all disputes with filters
 * - Review evidence and auto-verification
 * - Make resolution decisions
 * - Process refunds
 * - View analytics
 */

import React, { useCallback, useEffect, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { awsAPI } from '../../services/aws-api';
import OptimizedImage from '../../components/OptimizedImage';
import Button from '../../components/Button';
import { formatRelativeTime } from '../../utils/dateFormatters';

interface DisputeSummary {
  id: string;
  disputeNumber: string;
  type: string;
  status: string;
  priority: string;
  createdAt: string;
  amount: number;
  currency: string;
  complainant: {
    username: string;
    avatar: string | null;
  };
  respondent: {
    username: string;
    avatar: string | null;
  };
  autoVerification: {
    recommendation: 'approve_refund' | 'investigate' | 'reject';
  } | null;
  evidenceCount: number;
}

interface DisputeStats {
  total: number;
  open: number;
  underReview: number;
  resolved: number;
  avgResolutionTime: number;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous', color: '#6B7280' },
  { value: 'open', label: 'Ouverts', color: '#F59E0B' },
  { value: 'under_review', label: 'En cours', color: '#3B82F6' },
  { value: 'evidence_requested', label: 'Preuves', color: '#8B5CF6' },
  { value: 'resolved', label: 'Résolus', color: '#10B981' },
];



interface DisputeCardProps {
  dispute: DisputeSummary;
  onPress: (dispute: DisputeSummary) => void;
  onLongPress?: (dispute: DisputeSummary) => void;
  colors: ThemeColors;
}

const DisputeCard = memo(function DisputeCard({ dispute, onPress, onLongPress, colors }: DisputeCardProps) {
  const getRecommendationColor = () => {
    if (!dispute.autoVerification) return colors.graySecondary;
    switch (dispute.autoVerification.recommendation) {
      case 'approve_refund':
        return '#10B981';
      case 'reject':
        return '#EF4444';
      default:
        return '#F59E0B';
    }
  };

  const getRecommendationIcon = () => {
    if (!dispute.autoVerification) return 'help-circle';
    switch (dispute.autoVerification.recommendation) {
      case 'approve_refund':
        return 'checkmark-circle';
      case 'reject':
        return 'close-circle';
      default:
        return 'time';
    }
  };

  return (
    <Animated.View entering={FadeInUp}>
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
        onPress={() => onPress(dispute)}
        onLongPress={() => onLongPress?.(dispute)}
        activeOpacity={0.8}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <Text style={[styles.disputeNumber, { color: colors.dark }]}>
            #{dispute.disputeNumber}
          </Text>
          <View style={[styles.priorityBadge, { backgroundColor: `${getRecommendationColor()}20` }]}>
            <Ionicons name={getRecommendationIcon() as React.ComponentProps<typeof Ionicons>['name']} size={12} color={getRecommendationColor()} />
          </View>
        </View>

        {/* Parties */}
        <View style={styles.partiesRow}>
          <View style={styles.party}>
            <OptimizedImage source={{ uri: dispute.complainant.avatar ?? undefined }} style={styles.avatar} />
            <Text style={[styles.partyName, { color: colors.dark }]} numberOfLines={1}>
              @{dispute.complainant.username}
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={16} color={colors.graySecondary} />
          <View style={styles.party}>
            <OptimizedImage source={{ uri: dispute.respondent.avatar ?? undefined }} style={styles.avatar} />
            <Text style={[styles.partyName, { color: colors.dark }]} numberOfLines={1}>
              @{dispute.respondent.username}
            </Text>
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Ionicons name="cash-outline" size={14} color={colors.graySecondary} />
            <Text style={[styles.infoText, { color: colors.graySecondary }]}>
              {dispute.amount.toFixed(2)} {dispute.currency.toUpperCase()}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="document-attach-outline" size={14} color={colors.graySecondary} />
            <Text style={[styles.infoText, { color: colors.graySecondary }]}>
              {dispute.evidenceCount} preuve{dispute.evidenceCount !== 1 ? 's' : ''}
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={14} color={colors.graySecondary} />
            <Text style={[styles.infoText, { color: colors.graySecondary }]}>
              {formatRelativeTime(dispute.createdAt)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

interface ResolutionModalProps {
  visible: boolean;
  dispute: DisputeSummary | null;
  onClose: () => void;
  onResolve: (resolution: string, reason: string, refundAmount: number) => void;
  colors: ThemeColors;
}

const ResolutionModal = memo(function ResolutionModal({
  visible,
  dispute,
  onClose,
  onResolve,
  colors,
}: ResolutionModalProps) {
  const [resolution, setResolution] = useState<'full_refund' | 'partial_refund' | 'no_refund'>('full_refund');
  const [reason, setReason] = useState('');
  const [refundPercent, setRefundPercent] = useState(100);

  const handleSubmit = () => {
    if (!reason.trim()) {
      Alert.alert('Raison requise', 'Veuillez expliquer votre décision');
      return;
    }
    const refundAmount =
      resolution === 'full_refund'
        ? dispute!.amount
        : resolution === 'partial_refund'
          ? (dispute!.amount * refundPercent) / 100
          : 0;
    onResolve(resolution, reason, refundAmount);
  };

  if (!dispute) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.dark }]}>Résoudre le litige</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.dark} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalSubtitle, { color: colors.graySecondary }]}>
              #{dispute.disputeNumber} - {dispute.amount.toFixed(2)} {dispute.currency.toUpperCase()}
            </Text>

            {/* Resolution Type */}
            <Text style={[styles.inputLabel, { color: colors.dark }]}>Décision</Text>
            <View style={styles.resolutionOptions}>
              {[
                { value: 'full_refund', label: 'Remb. total', icon: 'checkmark-circle', color: '#10B981' },
                { value: 'partial_refund', label: 'Remb. partiel', icon: 'remove-circle', color: '#F59E0B' },
                { value: 'no_refund', label: 'Aucun remb.', icon: 'close-circle', color: '#EF4444' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.resolutionOption,
                    {
                      backgroundColor: colors.cardBg,
                      borderColor: resolution === opt.value ? opt.color : colors.border,
                      borderWidth: resolution === opt.value ? 2 : 1,
                    },
                  ]}
                  onPress={() => setResolution(opt.value as typeof resolution)}
                >
                  <Ionicons name={opt.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={opt.color} />
                  <Text style={[styles.resolutionOptionText, { color: colors.dark }]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Partial Refund Slider */}
            {resolution === 'partial_refund' && (
              <View style={styles.partialRefundSection}>
                <Text style={[styles.inputLabel, { color: colors.dark }]}>
                  Pourcentage de remboursement: {refundPercent}%
                </Text>
                <View style={styles.sliderContainer}>
                  {[25, 50, 75, 100].map((pct) => (
                    <TouchableOpacity
                      key={pct}
                      style={[
                        styles.sliderButton,
                        {
                          backgroundColor: refundPercent === pct ? '#F59E0B' : colors.cardBg,
                        },
                      ]}
                      onPress={() => setRefundPercent(pct)}
                    >
                      <Text
                        style={[
                          styles.sliderButtonText,
                          { color: refundPercent === pct ? '#fff' : colors.dark },
                        ]}
                      >
                        {pct}%
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[styles.refundPreview, { color: colors.dark }]}>
                  Remboursement: {((dispute.amount * refundPercent) / 100).toFixed(2)}{' '}
                  {dispute.currency.toUpperCase()}
                </Text>
              </View>
            )}

            {/* Reason */}
            <Text style={[styles.inputLabel, { color: colors.dark }]}>Motif de la décision</Text>
            <TextInput
              style={[
                styles.reasonInput,
                { backgroundColor: colors.cardBg, borderColor: colors.border, color: colors.dark },
              ]}
              multiline
              numberOfLines={4}
              placeholder="Expliquez votre décision..."
              placeholderTextColor={colors.graySecondary}
              value={reason}
              onChangeText={setReason}
              textAlignVertical="top"
            />

            {/* Quick Reasons */}
            <View style={styles.quickReasons}>
              {[
                'Créateur absent - preuves confirmées',
                'Session partielle - remboursement partiel justifié',
                'Pas de preuve de non-livraison',
                'Problème technique côté utilisateur',
                'Session complète - pas de remboursement',
              ].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.quickReason, { backgroundColor: `${colors.primary}10` }]}
                  onPress={() => setReason(r)}
                >
                  <Text style={[styles.quickReasonText, { color: colors.primary }]} numberOfLines={1}>
                    {r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.modalActions}>
            <Button variant="secondary" onPress={onClose} style={styles.modalButton}>
              Annuler
            </Button>
            <Button
              onPress={handleSubmit}
              disabled={!reason.trim()}
              style={styles.modalButton}
            >
              Confirmer la résolution
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
});

export default function AdminDisputesScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();

  const [disputes, setDisputes] = useState<DisputeSummary[]>([]);
  const [stats, setStats] = useState<DisputeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('open');
  const [priorityFilter] = useState('all');
  const [selectedDispute, setSelectedDispute] = useState<DisputeSummary | null>(null);
  const [showResolutionModal, setShowResolutionModal] = useState(false);

  const fetchDisputes = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      const queryString = params.toString();
      const endpoint = queryString ? `/admin/disputes?${queryString}` : '/admin/disputes';

      const response = await awsAPI.request<{
        success: boolean;
        disputes: DisputeSummary[];
        stats: DisputeStats;
      }>(endpoint, { method: 'GET' });

      if (response?.success) {
        setDisputes(response.disputes || []);
        setStats(response.stats || null);
      }
    } catch (_err) {
      Alert.alert('Erreur', 'Impossible de charger les litiges');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, priorityFilter]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDisputes(false);
  }, [fetchDisputes]);

  const handleDisputePress = useCallback(
    (dispute: DisputeSummary) => {
      navigation.navigate('DisputeDetail', { disputeId: dispute.id });
    },
    [navigation]
  );

  const handleOpenResolveModal = useCallback((dispute: DisputeSummary) => {
    setSelectedDispute(dispute);
    setShowResolutionModal(true);
  }, []);

  const handleResolve = useCallback(
    async (resolution: string, reason: string, refundAmount: number) => {
      if (!selectedDispute) return;

      try {
        await awsAPI.request(`/admin/disputes/${selectedDispute.id}/resolve`, {
          method: 'POST',
          body: {
            resolution,
            reason,
            refundAmount,
            processRefund: resolution !== 'no_refund',
          },
        });
        Alert.alert('Succès', 'Litige résolu avec succès');
        setShowResolutionModal(false);
        fetchDisputes(false);
      } catch (_err) {
        Alert.alert('Erreur', 'Échec de la résolution du litige');
      }
    },
    [selectedDispute, fetchDisputes]
  );

  const renderItem = useCallback(
    ({ item }: { item: DisputeSummary }) => (
      <DisputeCard dispute={item} onPress={handleDisputePress} onLongPress={handleOpenResolveModal} colors={colors} />
    ),
    [colors, handleDisputePress, handleOpenResolveModal]
  );

  const keyExtractor = useCallback((item: DisputeSummary) => item.id, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.dark }]}>Admin - Litiges</Text>
        <TouchableOpacity onPress={() => fetchDisputes()}>
          <Ionicons name="refresh" size={22} color={colors.dark} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {stats && (
        <View style={[styles.statsContainer, { borderBottomColor: colors.border }]}>
          <View style={[styles.statCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.open}</Text>
            <Text style={[styles.statLabel, { color: colors.graySecondary }]}>Ouverts</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.statValue, { color: '#3B82F6' }]}>{stats.underReview}</Text>
            <Text style={[styles.statLabel, { color: colors.graySecondary }]}>En cours</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.resolved}</Text>
            <Text style={[styles.statLabel, { color: colors.graySecondary }]}>Résolus</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cardBg }]}>
            <Text style={[styles.statValue, { color: colors.dark }]}>{stats.total}</Text>
            <Text style={[styles.statLabel, { color: colors.graySecondary }]}>Total</Text>
          </View>
        </View>
      )}

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          {STATUS_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.filterChip,
                {
                  backgroundColor: statusFilter === opt.value ? opt.color : colors.cardBg,
                  borderColor: opt.color,
                },
              ]}
              onPress={() => setStatusFilter(opt.value)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: statusFilter === opt.value ? '#fff' : opt.color },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : disputes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="shield-checkmark" size={48} color={colors.graySecondary} />
          <Text style={[styles.emptyText, { color: colors.graySecondary }]}>
            Aucun litige trouvé
          </Text>
        </View>
      ) : (
        <FlatList
          data={disputes}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Resolution Modal */}
      <ResolutionModal
        visible={showResolutionModal}
        dispute={selectedDispute}
        onClose={() => setShowResolutionModal(false)}
        onResolve={handleResolve}
        colors={colors}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  filtersContainer: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.1)',
  },
  filterScroll: {
    paddingHorizontal: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  disputeNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  partiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  party: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  partyName: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 12,
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
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  resolutionOptions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  resolutionOption: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
  },
  resolutionOptionText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  partialRefundSection: {
    marginBottom: 20,
  },
  sliderContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  sliderButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  sliderButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  refundPreview: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  reasonInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 100,
    borderWidth: 1,
    marginBottom: 12,
  },
  quickReasons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickReason: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  quickReasonText: {
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
  },
});
