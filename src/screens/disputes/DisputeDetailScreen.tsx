/**
 * Dispute Detail Screen
 *
 * Full dispute details with:
 * - Timeline of events
 * - Evidence gallery
 * - Verification logs (auto-verification results)
 * - Chat history
 * - Actions (submit evidence, accept resolution, appeal)
 */

import React, { useCallback, useEffect, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import OptimizedImage from '../../components/OptimizedImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useUserStore } from '../../stores/userStore';
import { awsAPI } from '../../services/aws-api';
import Button from '../../components/Button';
import { formatShortDateTime, formatRelativeTime } from '../../utils/dateFormatters';

interface Evidence {
  id: string;
  type: 'screenshot' | 'recording' | 'document' | 'text';
  url: string | null;
  filename: string | null;
  description: string;
  textContent: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

interface TimelineEvent {
  eventType: string;
  eventData: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

interface VerificationLog {
  eventType: string;
  metadata: Record<string, unknown>;
  recordedAt: string;
  source: string;
}

interface DisputeDetail {
  id: string;
  disputeNumber: string;
  type: string;
  status: string;
  priority: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
  resolutionReason: string | null;
  evidenceDeadline: string | null;

  // Amounts
  amount: number;
  refundAmount: number | null;
  currency: string;

  // Descriptions
  complainantDescription: string;
  respondentResponse: string | null;

  // Auto verification
  autoVerification: {
    userPresent: boolean;
    creatorPresent: boolean;
    userDuration: number;
    creatorDuration: number;
    expectedDuration: number;
    overlapDuration: number;
    quality: 'good' | 'fair' | 'poor';
    recommendation: 'approve_refund' | 'investigate' | 'reject';
    evidence: {
      userJoined: boolean;
      creatorJoined: boolean;
      userLeftEarly: boolean;
      creatorLeftEarly: boolean;
      connectionIssues: boolean;
    };
  } | null;

  // Session info
  session: {
    scheduledAt: string;
    durationMinutes: number;
    creatorNotes: string | null;
  };

  // Parties
  complainant: {
    id: string;
    username: string;
    avatar: string | null;
  };
  respondent: {
    id: string;
    username: string;
    avatar: string | null;
  };

  // Evidence & logs
  evidence: Evidence[];
  verificationLogs: VerificationLog[];
  timeline: TimelineEvent[];

  // User role
  userRole: 'complainant' | 'respondent' | 'admin';
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  open: { label: 'Ouvert', color: '#F59E0B', icon: 'alert-circle' },
  under_review: { label: 'En cours', color: '#3B82F6', icon: 'time' },
  evidence_requested: { label: 'Preuves requises', color: '#8B5CF6', icon: 'document' },
  resolved: { label: 'Résolu', color: '#10B981', icon: 'checkmark-circle' },
  closed: { label: 'Fermé', color: '#6B7280', icon: 'close-circle' },
};

const DISPUTE_TYPE_LABELS: Record<string, string> = {
  no_show: 'Absence',
  incomplete: 'Session incomplète',
  quality: 'Problème de qualité',
  technical: 'Problème technique',
  other: 'Autre',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '#10B981',
  normal: '#3B82F6',
  high: '#F59E0B',
  urgent: '#EF4444',
};

// Memoized Components
const EvidenceCard = memo(function EvidenceCard({
  evidence,
  colors,
  isMyEvidence,
}: {
  evidence: Evidence;
  colors: ThemeColors;
  isMyEvidence: boolean;
}) {
  const getIcon = () => {
    switch (evidence.type) {
      case 'screenshot':
        return 'image';
      case 'recording':
        return 'videocam';
      case 'document':
        return 'document-text';
      case 'text':
        return 'text';
      default:
        return 'attach';
    }
  };

  return (
    <Animated.View
      entering={FadeInUp}
      style={[
        styles.evidenceCard,
        { backgroundColor: colors.cardBg, borderColor: colors.border },
      ]}
    >
      <View style={styles.evidenceHeader}>
        <View style={styles.evidenceType}>
          <Ionicons name={getIcon() as React.ComponentProps<typeof Ionicons>['name']} size={18} color={colors.primary} />
          <Text style={[styles.evidenceTypeText, { color: colors.dark }]}>
            {evidence.type === 'screenshot'
              ? 'Capture d\'écran'
              : evidence.type === 'recording'
                ? 'Enregistrement'
                : evidence.type === 'document'
                  ? 'Document'
                  : 'Texte'}
          </Text>
        </View>
        <View
          style={[
            styles.evidenceBadge,
            { backgroundColor: isMyEvidence ? `${colors.primary}20` : `${colors.graySecondary}20` },
          ]}
        >
          <Text
            style={[
              styles.evidenceBadgeText,
              { color: isMyEvidence ? colors.primary : colors.graySecondary },
            ]}
          >
            {isMyEvidence ? 'Vous' : 'Adversaire'}
          </Text>
        </View>
      </View>

      {evidence.type === 'text' && evidence.textContent ? (
        <View style={styles.evidenceTextContainer}>
          <Text style={[styles.evidenceText, { color: colors.dark }]}>
            {evidence.textContent}
          </Text>
        </View>
      ) : evidence.url ? (
        <TouchableOpacity
          style={styles.evidencePreview}
          onPress={() => Linking.openURL(evidence.url!)}
        >
          {evidence.type === 'screenshot' ? (
            <OptimizedImage source={evidence.url} style={styles.evidenceImage} />
          ) : (
            <View style={[styles.filePreview, { backgroundColor: `${colors.primary}10` }]}>
              <Ionicons name={getIcon() as React.ComponentProps<typeof Ionicons>['name']} size={32} color={colors.primary} />
              <Text style={[styles.fileName, { color: colors.dark }]} numberOfLines={1}>
                {evidence.filename || 'Fichier'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ) : null}

      <Text style={[styles.evidenceDescription, { color: colors.graySecondary }]}>
        {evidence.description}
      </Text>

      <Text style={[styles.evidenceDate, { color: colors.graySecondary }]}>
        {formatShortDateTime(evidence.uploadedAt)}
      </Text>
    </Animated.View>
  );
});

const TimelineItem = memo(function TimelineItem({
  event,
  colors,
  isLast,
}: {
  event: TimelineEvent;
  colors: ThemeColors;
  isLast: boolean;
}) {
  const getEventIcon = () => {
    switch (event.eventType) {
      case 'dispute_opened':
        return 'flag';
      case 'evidence_submitted':
        return 'document-attach';
      case 'status_changed':
        return 'sync';
      case 'resolved':
        return 'checkmark-circle';
      default:
        return 'ellipse';
    }
  };

  const getEventLabel = () => {
    switch (event.eventType) {
      case 'dispute_opened':
        return 'Litige ouvert';
      case 'evidence_submitted':
        return 'Preuve soumise';
      case 'status_changed':
        return `Statut: ${event.eventData.newStatus || 'mis à jour'}`;
      case 'resolved':
        return 'Litige résolu';
      default:
        return event.eventType;
    }
  };

  return (
    <View style={styles.timelineItem}>
      <View style={styles.timelineLineContainer}>
        <View style={[styles.timelineDot, { backgroundColor: colors.primary }]}>
          <Ionicons name={getEventIcon() as React.ComponentProps<typeof Ionicons>['name']} size={12} color="#fff" />
        </View>
        {!isLast && <View style={[styles.timelineLine, { backgroundColor: colors.border }]} />}
      </View>
      <View style={styles.timelineContent}>
        <Text style={[styles.timelineTitle, { color: colors.dark }]}>{getEventLabel()}</Text>
        <Text style={[styles.timelineDate, { color: colors.graySecondary }]}>
          {formatShortDateTime(event.createdAt)}
        </Text>
      </View>
    </View>
  );
});

const VerificationSection = memo(function VerificationSection({
  verification,
  colors,
}: {
  verification: NonNullable<DisputeDetail['autoVerification']>;
  colors: ThemeColors;
}) {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getRecommendationColor = () => {
    switch (verification.recommendation) {
      case 'approve_refund':
        return '#10B981';
      case 'reject':
        return '#EF4444';
      default:
        return '#F59E0B';
    }
  };

  const getRecommendationLabel = () => {
    switch (verification.recommendation) {
      case 'approve_refund':
        return 'Remboursement recommandé';
      case 'reject':
        return 'Litige non fondé';
      default:
        return 'Investigation requise';
    }
  };

  return (
    <View style={[styles.verificationCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <View style={styles.verificationHeader}>
        <Ionicons name="shield-checkmark" size={20} color={colors.primary} />
        <Text style={[styles.verificationTitle, { color: colors.dark }]}>
          Vérification automatique
        </Text>
      </View>

      <View
        style={[
          styles.recommendationBadge,
          { backgroundColor: `${getRecommendationColor()}20` },
        ]}
      >
        <Ionicons name="analytics" size={16} color={getRecommendationColor()} />
        <Text style={[styles.recommendationText, { color: getRecommendationColor() }]}>
          {getRecommendationLabel()}
        </Text>
      </View>

      <View style={styles.verificationStats}>
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: colors.graySecondary }]}>Durée prévue</Text>
          <Text style={[styles.statValue, { color: colors.dark }]}>
            {formatDuration(verification.expectedDuration)}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: colors.graySecondary }]}>Temps overlap</Text>
          <Text style={[styles.statValue, { color: colors.dark }]}>
            {formatDuration(verification.overlapDuration)}
          </Text>
        </View>
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: colors.graySecondary }]}>
            Créateur présent
          </Text>
          <Ionicons
            name={verification.creatorPresent ? 'checkmark-circle' : 'close-circle'}
            size={18}
            color={verification.creatorPresent ? '#10B981' : '#EF4444'}
          />
        </View>
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: colors.graySecondary }]}>
            Qualité connexion
          </Text>
          <Text
            style={[
              styles.statValue,
              {
                color:
                  verification.quality === 'good'
                    ? '#10B981'
                    : verification.quality === 'fair'
                      ? '#F59E0B'
                      : '#EF4444',
              },
            ]}
          >
            {verification.quality === 'good'
              ? 'Bonne'
              : verification.quality === 'fair'
                ? 'Moyenne'
                : 'Faible'}
          </Text>
        </View>
      </View>
    </View>
  );
});

export default function DisputeDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const user = useUserStore((state) => state.user);
  const { disputeId } = route.params as { disputeId: string };

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setSubmittingEvidence] = useState(false);

  const fetchDispute = useCallback(async () => {
    try {
      const response = await awsAPI.request<{ success: boolean; dispute: DisputeDetail }>(
        `/disputes/${disputeId}`,
        { method: 'GET' }
      );
      if (response?.success) {
        setDispute(response.dispute);
      }
    } catch (_err) {
      Alert.alert('Erreur', 'Impossible de charger les détails du litige');
    } finally {
      setLoading(false);
    }
  }, [disputeId]);

  useEffect(() => {
    fetchDispute();
  }, [fetchDispute]);

  const handleSubmitEvidence = useCallback(
    async (type: 'screenshot' | 'recording' | 'document' | 'text', data: { url?: string; description: string; textContent?: string }) => {
      setSubmittingEvidence(true);
      try {
        await awsAPI.request(`/disputes/${disputeId}/evidence`, {
          method: 'POST',
          body: {
            type,
            url: data.url,
            description: data.description,
            textContent: data.textContent,
          },
        });
        Alert.alert('Succès', 'Preuve soumise avec succès');
        fetchDispute();
      } catch (_err) {
        Alert.alert('Erreur', 'Échec de la soumission de la preuve');
      } finally {
        setSubmittingEvidence(false);
      }
    },
    [disputeId, fetchDispute]
  );

  const handleEvidenceAction = useCallback(() => {
    Alert.alert(
      'Ajouter une preuve',
      'Choisissez le type de preuve',
      [
        {
          text: 'Photo / Capture',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              handleSubmitEvidence('screenshot', {
                url: result.assets[0].uri,
                description: 'Capture d\'écran',
              });
            }
          },
        },
        {
          text: 'Texte',
          onPress: () => {
            Alert.prompt(
              'Témoignage écrit',
              'Décrivez votre preuve',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Soumettre',
                  onPress: (text?: string) => {
                    if (text && text.length > 0) {
                      handleSubmitEvidence('text', {
                        description: 'Témoignage écrit',
                        textContent: text,
                      });
                    }
                  },
                },
              ],
              'plain-text'
            );
          },
        },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  }, [handleSubmitEvidence]);

  const handleAcceptResolution = useCallback(() => {
    Alert.alert(
      'Accepter la résolution',
      'Êtes-vous sûr de vouloir accepter cette résolution ? Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Accepter',
          style: 'default',
          onPress: async () => {
            try {
              await awsAPI.request(`/disputes/${disputeId}/accept`, { method: 'POST' });
              Alert.alert('Résolution acceptée', 'Le litige est maintenant clos.');
              fetchDispute();
            } catch (_err) {
              Alert.alert('Erreur', 'Impossible d\'accepter la résolution');
            }
          },
        },
      ]
    );
  }, [disputeId, fetchDispute]);

  if (loading || !dispute) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const status = STATUS_CONFIG[dispute.status];
  const isOpen = ['open', 'under_review', 'evidence_requested'].includes(dispute.status);
  const canSubmitEvidence = isOpen && dispute.userRole !== 'admin';
  const myEvidence = dispute.evidence.filter((e) => e.uploadedBy === user?.id);
  const theirEvidence = dispute.evidence.filter((e) => e.uploadedBy !== user?.id);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.dark }]}>
            #{dispute.disputeNumber}
          </Text>
          <View style={[styles.headerStatus, { backgroundColor: `${status.color}20` }]}>
            <Ionicons name={status.icon as React.ComponentProps<typeof Ionicons>['name']} size={12} color={status.color} />
            <Text style={[styles.headerStatusText, { color: status.color }]}>
              {status.label}
            </Text>
          </View>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Parties Card */}
        <View style={[styles.partiesCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.party}>
            <OptimizedImage source={{ uri: dispute.complainant.avatar ?? undefined }} style={styles.partyAvatar} />
            <View>
              <Text style={[styles.partyLabel, { color: colors.graySecondary }]}>Plaignant</Text>
              <Text style={[styles.partyName, { color: colors.dark }]}>
                @{dispute.complainant.username}
              </Text>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={20} color={colors.graySecondary} />
          <View style={styles.party}>
            <OptimizedImage source={{ uri: dispute.respondent.avatar ?? undefined }} style={styles.partyAvatar} />
            <View>
              <Text style={[styles.partyLabel, { color: colors.graySecondary }]}>Créateur</Text>
              <Text style={[styles.partyName, { color: colors.dark }]}>
                @{dispute.respondent.username}
              </Text>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={[styles.sectionCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>Description</Text>
          </View>
          <Text style={[styles.descriptionText, { color: colors.dark }]}>
            {dispute.complainantDescription}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.graySecondary }]}>
              Type: {DISPUTE_TYPE_LABELS[dispute.type] || dispute.type}
            </Text>
            <Text style={[styles.metaText, { color: colors.graySecondary }]}>
              Priorité:
              <Text style={{ color: PRIORITY_COLORS[dispute.priority] || colors.graySecondary }}>
                {' '}
                {dispute.priority.toUpperCase()}
              </Text>
            </Text>
          </View>
        </View>

        {/* Amount */}
        <View style={[styles.amountCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { color: colors.graySecondary }]}>
              Montant contesté
            </Text>
            <Text style={[styles.amountValue, { color: colors.dark }]}>
              {dispute.amount.toFixed(2)} {dispute.currency.toUpperCase()}
            </Text>
          </View>
          {dispute.refundAmount !== null && (
            <View style={[styles.amountRow, styles.refundRow]}>
              <Text style={[styles.amountLabel, { color: colors.graySecondary }]}>
                Remboursement
              </Text>
              <Text style={[styles.refundValue, { color: '#10B981' }]}>
                {dispute.refundAmount.toFixed(2)} {dispute.currency.toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Auto Verification */}
        {dispute.autoVerification && (
          <VerificationSection verification={dispute.autoVerification} colors={colors} />
        )}

        {/* Evidence */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: colors.dark }]}>
              Preuves ({dispute.evidence.length})
            </Text>
            {canSubmitEvidence && (
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={handleEvidenceAction}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addButtonText}>Ajouter</Text>
              </TouchableOpacity>
            )}
          </View>

          {myEvidence.length > 0 && (
            <View style={styles.evidenceSection}>
              <Text style={[styles.evidenceSectionTitle, { color: colors.graySecondary }]}>
                Vos preuves
              </Text>
              {myEvidence.map((e) => (
                <EvidenceCard key={e.id} evidence={e} colors={colors} isMyEvidence={true} />
              ))}
            </View>
          )}

          {theirEvidence.length > 0 && (
            <View style={styles.evidenceSection}>
              <Text style={[styles.evidenceSectionTitle, { color: colors.graySecondary }]}>
                Preuves adverses
              </Text>
              {theirEvidence.map((e) => (
                <EvidenceCard key={e.id} evidence={e} colors={colors} isMyEvidence={false} />
              ))}
            </View>
          )}

          {dispute.evidence.length === 0 && (
            <View style={styles.emptyEvidence}>
              <Ionicons name="document-outline" size={40} color={colors.graySecondary} />
              <Text style={[styles.emptyEvidenceText, { color: colors.graySecondary }]}>
                Aucune preuve soumise
              </Text>
            </View>
          )}
        </View>

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Historique</Text>
          <View style={[styles.timelineCard, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            {dispute.timeline.map((event, index) => (
              <TimelineItem
                key={index}
                event={event}
                colors={colors}
                isLast={index === dispute.timeline.length - 1}
              />
            ))}
          </View>
        </View>

        {/* Deadline Warning */}
        {dispute.evidenceDeadline && isOpen && (
          <View style={[styles.deadlineCard, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="time-outline" size={20} color="#D97706" />
            <Text style={styles.deadlineText}>
              Limite de soumission des preuves: {formatRelativeTime(dispute.evidenceDeadline)}
            </Text>
          </View>
        )}

        {/* Resolution */}
        {dispute.resolution && (
          <View style={[styles.resolutionCard, { backgroundColor: `${status.color}10` }]}>
            <Ionicons name="checkmark-circle" size={24} color={status.color} />
            <View style={styles.resolutionContent}>
              <Text style={[styles.resolutionTitle, { color: status.color }]}>
                Litige résolu
              </Text>
              <Text style={[styles.resolutionReason, { color: colors.graySecondary }]}>
                {dispute.resolutionReason}
              </Text>
            </View>
          </View>
        )}

        {/* Spacer for bottom actions */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Actions */}
      {isOpen && dispute.userRole !== 'admin' && (
        <View style={[styles.bottomActions, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Button
            variant="secondary"
            onPress={handleEvidenceAction}
            style={styles.actionButton}
          >
            Soumettre une preuve
          </Button>
          {dispute.resolution && (
            <Button
              onPress={handleAcceptResolution}
              style={styles.actionButton}
            >
              Accepter la résolution
            </Button>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    gap: 4,
  },
  headerStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  partiesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  party: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  partyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  partyLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  partyName: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  metaText: {
    fontSize: 12,
  },
  amountCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refundRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.1)',
  },
  amountLabel: {
    fontSize: 14,
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  refundValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  verificationCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  verificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  verificationTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  recommendationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginBottom: 12,
  },
  recommendationText: {
    fontSize: 13,
    fontWeight: '600',
  },
  verificationStats: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 13,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  evidenceSection: {
    marginBottom: 16,
  },
  evidenceSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  evidenceCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  evidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  evidenceType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  evidenceTypeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  evidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  evidenceBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  evidencePreview: {
    marginBottom: 10,
  },
  evidenceImage: {
    width: '100%',
    height: 180,
    borderRadius: 8,
  },
  filePreview: {
    height: 100,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileName: {
    marginTop: 8,
    fontSize: 13,
  },
  evidenceTextContainer: {
    backgroundColor: 'rgba(150,150,150,0.05)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  evidenceText: {
    fontSize: 13,
    lineHeight: 20,
  },
  evidenceDescription: {
    fontSize: 12,
    marginBottom: 6,
  },
  evidenceDate: {
    fontSize: 11,
  },
  emptyEvidence: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyEvidenceText: {
    marginTop: 8,
    fontSize: 14,
  },
  timelineCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  timelineItem: {
    flexDirection: 'row',
  },
  timelineLineContainer: {
    width: 28,
    alignItems: 'center',
  },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 20,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  timelineDate: {
    fontSize: 12,
    marginTop: 2,
  },
  deadlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 16,
  },
  deadlineText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    fontWeight: '500',
  },
  resolutionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  resolutionContent: {
    flex: 1,
  },
  resolutionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  resolutionReason: {
    fontSize: 13,
    marginTop: 4,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
});
