/**
 * Create Dispute Screen
 *
 * Allows users to open a dispute for a session
 * - Select eligible session (within 24h window)
 * - Choose dispute type
 * - Provide description
 * - Request refund amount
 */

import React, { useCallback, useEffect, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';


import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { awsAPI } from '../../services/aws-api';
import OptimizedImage from '../../components/OptimizedImage';
import Button from '../../components/Button';
import { formatShortDateTime } from '../../utils/dateFormatters';
import { KEYBOARD_BEHAVIOR } from '../../config/platform';

interface EligibleSession {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  creator: {
    id: string;
    username: string;
    avatar: string | null;
    fullName: string;
  };
  payment: {
    amount: number;
    currency: string;
  };
  hoursSinceSession: number;
}

type DisputeType = 'no_show' | 'incomplete' | 'quality' | 'technical' | 'other';
type RefundRequest = 'full' | 'partial' | 'none';

const DISPUTE_TYPES: { type: DisputeType; label: string; description: string; icon: string }[] = [
  {
    type: 'no_show',
    label: 'Le créateur est absent',
    description: 'Le créateur ne s\'est pas connecté à la session',
    icon: 'person-remove',
  },
  {
    type: 'incomplete',
    label: 'Session incomplète',
    description: 'Le créateur est parti avant la fin prévue',
    icon: 'time-outline',
  },
  {
    type: 'quality',
    label: 'Problème de qualité',
    description: 'La qualité du service ne correspondait pas à la description',
    icon: 'star-half',
  },
  {
    type: 'technical',
    label: 'Problème technique',
    description: 'Des problèmes techniques ont empêché la session',
    icon: 'warning-outline',
  },
  {
    type: 'other',
    label: 'Autre raison',
    description: 'Autre problème non listé ci-dessus',
    icon: 'ellipsis-horizontal',
  },
];

type TypeCardProps = Readonly<{
  item: typeof DISPUTE_TYPES[0];
  selected: boolean;
  onPress: () => void;
  colors: ThemeColors;
}>;


const TypeCard = memo(function TypeCard({ item, selected, onPress, colors }: TypeCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.typeCard,
        {
          backgroundColor: colors.cardBg,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.typeIconContainer,
          { backgroundColor: selected ? `${colors.primary}20` : `${colors.graySecondary}10` },
        ]}
      >
        <Ionicons
          name={item.icon as React.ComponentProps<typeof Ionicons>['name']}
          size={24}
          color={selected ? colors.primary : colors.graySecondary}
        />
      </View>
      <View style={styles.typeInfo}>
        <Text style={[styles.typeLabel, { color: colors.dark }]}>{item.label}</Text>
        <Text style={[styles.typeDescription, { color: colors.graySecondary }]}>
          {item.description}
        </Text>
      </View>
      {selected && (
        <View style={[styles.checkCircle, { backgroundColor: colors.primary }]}>
          <Ionicons name="checkmark" size={16} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
});

type SessionCardProps = Readonly<{
  session: EligibleSession;
  selected: boolean;
  onPress: () => void;
  colors: ThemeColors;
}>;


const SessionCard = memo(function SessionCard({
  session,
  selected,
  onPress,
  colors,
}: SessionCardProps) {
  const hoursLeft = Math.max(0, 24 - session.hoursSinceSession);

  return (
    <TouchableOpacity
      style={[
        styles.sessionCard,
        {
          backgroundColor: colors.cardBg,
          borderColor: selected ? colors.primary : colors.border,
          borderWidth: selected ? 2 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.sessionHeader}>
        <OptimizedImage
          source={{ uri: session.creator.avatar ?? undefined }}
          style={styles.creatorAvatar}
          placeholder="avatar"
        />
        <View style={styles.sessionCreatorInfo}>
          <Text style={[styles.creatorName, { color: colors.dark }]}>
            {session.creator.fullName}
          </Text>
          <Text style={[styles.creatorUsername, { color: colors.graySecondary }]}>
            @{session.creator.username}
          </Text>
        </View>
        {selected && (
          <View style={[styles.checkCircleSmall, { backgroundColor: colors.primary }]}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        )}
      </View>

      <View style={styles.sessionDetails}>
        <View style={styles.sessionDetail}>
          <Ionicons name="calendar-outline" size={14} color={colors.graySecondary} />
          <Text style={[styles.sessionDetailText, { color: colors.graySecondary }]}>
            {formatShortDateTime(session.scheduledAt)}
          </Text>
        </View>
        <View style={styles.sessionDetail}>
          <Ionicons name="time-outline" size={14} color={colors.graySecondary} />
          <Text style={[styles.sessionDetailText, { color: colors.graySecondary }]}>
            {session.durationMinutes} min
          </Text>
        </View>
        <View style={styles.sessionDetail}>
          <Ionicons name="cash-outline" size={14} color={colors.graySecondary} />
          <Text style={[styles.sessionDetailText, { color: colors.graySecondary }]}>
            {(session.payment.amount / 100).toFixed(2)} {session.payment.currency.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={[styles.timeBadge, { backgroundColor: hoursLeft < 6 ? '#FEE2E2' : '#FEF3C7' }]}>
        <Ionicons
          name="time-outline"
          size={12}
          color={hoursLeft < 6 ? '#DC2626' : '#D97706'}
        />
        <Text style={[styles.timeBadgeText, { color: hoursLeft < 6 ? '#DC2626' : '#D97706' }]}>
          {hoursLeft}h pour ouvrir un litige
        </Text>
      </View>
    </TouchableOpacity>
  );
});

export default function CreateDisputeScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();

  const [step, setStep] = useState<'session' | 'details'>('session');
  const [sessions, setSessions] = useState<EligibleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<DisputeType | null>(null);
  const [description, setDescription] = useState('');
  const [refundRequest, setRefundRequest] = useState<RefundRequest>('full');

  // Fetch eligible sessions
  useEffect(() => {
    fetchEligibleSessions();
  }, []);

  const fetchEligibleSessions = async () => {
    setLoading(true);
    try {
      const response = await awsAPI.request<{ success: boolean; sessions: EligibleSession[] }>(
        '/sessions?status=completed&eligible_for_dispute=true',
        { method: 'GET' }
      );
      if (response?.success) {
        setSessions(response.sessions || []);
      }
    } catch (_err) {
      Alert.alert('Erreur', 'Impossible de charger les sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = useCallback(() => {
    if (!selectedSession) {
      Alert.alert('Sélection requise', 'Veuillez sélectionner une session');
      return;
    }
    setStep('details');
  }, [selectedSession]);

  const handleSubmit = useCallback(async () => {
    if (!selectedType) {
      Alert.alert('Type requis', 'Veuillez sélectionner un type de litige');
      return;
    }
    if (description.length < 20) {
      Alert.alert('Description trop courte', 'Veuillez fournir plus de détails (min 20 caractères)');
      return;
    }

    setSubmitting(true);
    try {
      const response = await awsAPI.request<{ success: boolean; dispute: { id: string; disputeNumber: string } }>(
        '/disputes',
        {
          method: 'POST',
          body: {
            sessionId: selectedSession,
            type: selectedType,
            description,
            refundRequested: refundRequest,
          },
        }
      );

      if (response?.success) {
        Alert.alert(
          'Litige créé',
          `Votre litige #${response.dispute.disputeNumber} a été ouvert avec succès.`,
          [
            {
              text: 'Voir le litige',
              onPress: () => navigation.navigate('DisputeDetail', {
                disputeId: response.dispute.id,
              }),
            },
            {
              text: 'Retour',
              style: 'cancel',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (_err) {
      Alert.alert('Erreur', 'Impossible de créer le litige');
    } finally {
      setSubmitting(false);
    }
  }, [selectedSession, selectedType, description, refundRequest, navigation]);

  const renderSessionStep = () => (
    <>
      <Text style={[styles.stepTitle, { color: colors.dark }]}>
        Sélectionnez une session
      </Text>
      <Text style={[styles.stepSubtitle, { color: colors.graySecondary }]}>
        Seules les sessions des dernières 24h sont éligibles
      </Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : sessions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={48} color={colors.graySecondary} />
          <Text style={[styles.emptyText, { color: colors.graySecondary }]}>
            Aucune session éligible pour un litige
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.sessionList}
          contentContainerStyle={styles.sessionListContent}
          showsVerticalScrollIndicator={false}
        >
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              selected={selectedSession === session.id}
              onPress={() => setSelectedSession(session.id)}
              colors={colors}
            />
          ))}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Button
          onPress={handleContinue}
          disabled={!selectedSession || loading}
          loading={submitting}
          style={styles.continueButton}
        >
          Continuer
        </Button>
      </View>
    </>
  );

  const renderDetailsStep = () => (
    <ScrollView
      style={styles.detailsScroll}
      contentContainerStyle={styles.detailsContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: colors.dark }]}>
        Type de litige
      </Text>

      {DISPUTE_TYPES.map((type) => (
        <TypeCard
          key={type.type}
          item={type}
          selected={selectedType === type.type}
          onPress={() => setSelectedType(type.type)}
          colors={colors}
        />
      ))}

      <Text style={[styles.sectionTitle, { color: colors.dark, marginTop: 24 }]}>
        Décrivez le problème
      </Text>

      <TextInput
        style={[
          styles.descriptionInput,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.border,
            color: colors.dark,
          },
        ]}
        multiline
        numberOfLines={6}
        placeholder="Décrivez en détail ce qui s'est passé..."
        placeholderTextColor={colors.graySecondary}
        value={description}
        onChangeText={setDescription}
        textAlignVertical="top"
      />

      <Text style={[styles.charCount, { color: colors.graySecondary }]}>
        {description.length}/2000 caractères (min 20)
      </Text>

      <Text style={[styles.sectionTitle, { color: colors.dark, marginTop: 24 }]}>
        Remboursement demandé
      </Text>

      <View style={styles.refundOptions}>
        {[
          { value: 'full', label: 'Remboursement total', icon: 'cash-outline' },
          { value: 'partial', label: 'Remboursement partiel', icon: 'cash-outline' },
          { value: 'none', label: 'Aucun remboursement', icon: 'close-circle-outline' },
        ].map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.refundOption,
              {
                backgroundColor: colors.cardBg,
                borderColor: refundRequest === option.value ? colors.primary : colors.border,
                borderWidth: refundRequest === option.value ? 2 : 1,
              },
            ]}
            onPress={() => setRefundRequest(option.value as RefundRequest)}
          >
            <Ionicons
              name={option.icon as React.ComponentProps<typeof Ionicons>['name']}
              size={20}
              color={refundRequest === option.value ? colors.primary : colors.graySecondary}
            />
            <Text
              style={[
                styles.refundOptionText,
                { color: refundRequest === option.value ? colors.primary : colors.dark },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <Button
          onPress={handleSubmit}
          disabled={!selectedType || description.length < 20 || submitting}
          loading={submitting}
          style={styles.submitButton}
        >
          Créer le litige
        </Button>
        <Button
          variant="secondary"
          onPress={() => setStep('session')}
          disabled={submitting}
          style={styles.backButton}
        >
          Retour
        </Button>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButtonHeader}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.dark }]}>
          {step === 'session' ? 'Nouveau litige' : 'Détails du litige'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, { backgroundColor: colors.primary }]} />
        <View
          style={[
            styles.stepLine,
            { backgroundColor: step === 'details' ? colors.primary : colors.border },
          ]}
        />
        <View
          style={[
            styles.stepDot,
            { backgroundColor: step === 'details' ? colors.primary : colors.border },
          ]}
        />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        behavior={KEYBOARD_BEHAVIOR}
        style={styles.content}
      >
        {step === 'session' ? renderSessionStep() : renderDetailsStep()}
      </KeyboardAvoidingView>
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
  backButtonHeader: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  placeholder: {
    width: 32,
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepLine: {
    width: 40,
    height: 2,
    marginHorizontal: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
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
    marginTop: 16,
    fontSize: 14,
    textAlign: 'center',
  },
  sessionList: {
    flex: 1,
  },
  sessionListContent: {
    paddingBottom: 100,
  },
  sessionCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  creatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  sessionCreatorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '600',
  },
  creatorUsername: {
    fontSize: 13,
    marginTop: 2,
  },
  checkCircleSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  sessionDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sessionDetailText: {
    fontSize: 13,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  timeBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  footer: {
    paddingVertical: 16,
    marginTop: 'auto',
  },
  continueButton: {
    marginBottom: 12,
  },
  detailsScroll: {
    flex: 1,
  },
  detailsContent: {
    paddingBottom: 120,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  typeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  typeDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  descriptionInput: {
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    lineHeight: 22,
    minHeight: 140,
    borderWidth: 1,
  },
  charCount: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'right',
  },
  refundOptions: {
    gap: 10,
  },
  refundOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  refundOptionText: {
    fontSize: 15,
    fontWeight: '500',
  },
  submitButton: {
    marginBottom: 12,
  },
  backButton: {
    marginBottom: 8,
  },
});
