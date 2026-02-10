/**
 * EventManageScreen
 * Creator dashboard to manage their event (edit, participants, cancel)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { AvatarImage } from '../../components/OptimizedImage';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  FlatList,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface EventManageScreenProps {
  route: { params: { eventId: string } };
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void };
}

interface Participant {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  avatar_url?: string;
  joined_at: string;
  payment_status: 'paid' | 'free' | 'refunded';
  amount_paid?: number;
}

interface EventData {
  id: string;
  title: string;
  description?: string;
  location_name: string;
  is_free: boolean;
  price_cents?: number;
  currency: string;
  max_participants?: number;
  participant_count: number;
  total_revenue: number;
  starts_at: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
}

export default function EventManageScreen({ route, navigation }: EventManageScreenProps) {
  const { showError, showSuccess, showDestructiveConfirm } = useSmuppyAlert();
  const { eventId } = route.params;
  const { formatAmount, currency } = useCurrency();
  const user = useUserStore((state) => state.user);
  const isProCreator = user?.accountType === 'pro_creator' || user?.accountType === 'pro_business';
  const { colors, isDark } = useTheme();

  const [event, setEvent] = useState<EventData | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'participants' | 'revenue'>('details');

  // Edit state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editMaxParticipants, setEditMaxParticipants] = useState('');

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    loadEventData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const loadEventData = async () => {
    try {
      const [eventResponse, participantsResponse] = await Promise.all([
        awsAPI.getEventDetail(eventId),
        awsAPI.getEventParticipants(eventId),
      ]);

      if (eventResponse.success && eventResponse.event) {
        const evt = eventResponse.event as unknown as Record<string, unknown>;
        setEvent(evt as unknown as EventData);
        setEditTitle((evt.title as string) || '');
        setEditDescription((evt.description as string) || '');
        const priceCents = (evt.price_cents ?? evt.priceCents) as number | undefined;
        setEditPrice(priceCents ? (priceCents / 100).toString() : '');
        const maxPart = (evt.max_participants ?? evt.maxParticipants) as number | undefined;
        setEditMaxParticipants(maxPart?.toString() || '');
      }

      if (participantsResponse.success) {
        setParticipants((participantsResponse.participants || []) as unknown as Participant[]);
      }
    } catch (error) {
      if (__DEV__) console.warn('Load event data error:', error);
      showError('Error', 'Failed to load event data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!event) return;

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const priceInCents = editPrice ? Math.round(parseFloat(editPrice) * 100) : undefined;

      const response = await awsAPI.updateEvent(eventId, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        price_cents: priceInCents,
        max_participants: editMaxParticipants ? parseInt(editMaxParticipants) : undefined,
      });

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showSuccess('Saved', 'Event updated successfully!');
        setShowEditModal(false);
        loadEventData();
      } else {
        throw new Error(response.message || 'Failed to update event');
      }
    } catch (error: unknown) {
      showError('Error', (error instanceof Error ? error.message : null) || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEvent = () => {
    showDestructiveConfirm(
      'Cancel Event',
      'Are you sure you want to cancel this event?\n\nAll participants will be notified and refunded if applicable.',
      async () => {
        try {
          const response = await awsAPI.cancelEvent(eventId);
          if (response.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showSuccess('Event Cancelled', 'All participants have been notified.');
            navigation.goBack();
          } else {
            throw new Error(response.message);
          }
        } catch (error: unknown) {
          showError('Error', (error instanceof Error ? error.message : null) || 'Failed to cancel event');
        }
      },
      'Yes, Cancel Event'
    );
  };

  const handleRemoveParticipant = (participant: Participant) => {
    showDestructiveConfirm(
      'Remove Participant',
      `Remove ${participant.full_name || participant.username} from this event?${participant.payment_status === 'paid' ? '\n\nThey will be refunded.' : ''}`,
      async () => {
        try {
          const response = await awsAPI.removeEventParticipant(eventId, participant.user_id);
          if (response.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadEventData();
          } else {
            throw new Error(response.message);
          }
        } catch (error: unknown) {
          showError('Error', (error instanceof Error ? error.message : null) || 'Failed to remove participant');
        }
      },
      'Remove'
    );
  };

  const renderParticipantItem = ({ item }: { item: Participant }) => (
    <View style={styles.participantItem}>
      <AvatarImage source={item.avatar_url} size={44} />
      <View style={styles.participantInfo}>
        <Text style={styles.participantName}>{item.full_name || item.username}</Text>
      </View>
      <View style={styles.participantMeta}>
        {item.payment_status === 'paid' && (
          <View style={styles.paidBadge}>
            <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
            <Text style={styles.paidText}>{formatAmount(item.amount_paid || 0)}</Text>
          </View>
        )}
        {item.payment_status === 'free' && (
          <View style={styles.freeBadge}>
            <Text style={styles.freeText}>Free</Text>
          </View>
        )}
        <TouchableOpacity
          style={styles.removeButton}
          onPress={() => handleRemoveParticipant(item)}
        >
          <Ionicons name="close-circle" size={24} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Event not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Event</Text>
          <TouchableOpacity onPress={() => setShowEditModal(true)} style={styles.editButton}>
            <Ionicons name="pencil" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Event Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
          <View style={styles.summaryStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{event.participant_count}</Text>
              <Text style={styles.statLabel}>Participants</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {event.is_free ? 'FREE' : formatAmount(event.price_cents || 0)}
              </Text>
              <Text style={styles.statLabel}>Entry Fee</Text>
            </View>
            {isProCreator && !event.is_free && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                    {formatAmount(event.total_revenue || 0)}
                  </Text>
                  <Text style={styles.statLabel}>Revenue</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabBar}>
          {(['details', 'participants', ...(isProCreator && !event.is_free ? ['revenue'] : [])] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab as typeof activeTab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {activeTab === 'details' && (
            <View style={styles.tabContent}>
              <View style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <Ionicons name="calendar" size={20} color={colors.primary} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>
                      {new Date(event.starts_at).toLocaleDateString(undefined, {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="location" size={20} color={colors.primary} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Location</Text>
                    <Text style={styles.detailValue}>{event.location_name}</Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="people" size={20} color={colors.primary} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Capacity</Text>
                    <Text style={styles.detailValue}>
                      {event.max_participants ? `${event.participant_count} / ${event.max_participants}` : 'Unlimited'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Ionicons name="pricetag" size={20} color={colors.primary} />
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailLabel}>Entry Fee</Text>
                    <Text style={styles.detailValue}>
                      {event.is_free ? 'Free Event' : formatAmount(event.price_cents || 0)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Quick Actions */}
              <View style={styles.quickActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => setShowEditModal(true)}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="pencil" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.actionText}>Edit Event</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('ActivityDetail', { activityId: eventId, activityType: 'event' })}
                >
                  <View style={styles.actionIcon}>
                    <Ionicons name="eye" size={22} color={colors.primary} />
                  </View>
                  <Text style={styles.actionText}>View Public</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.dangerAction]}
                  onPress={handleCancelEvent}
                >
                  <View style={[styles.actionIcon, styles.dangerIcon]}>
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </View>
                  <Text style={[styles.actionText, styles.dangerText]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'participants' && (
            <View style={styles.tabContent}>
              {participants.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color={colors.gray} />
                  <Text style={styles.emptyTitle}>No participants yet</Text>
                  <Text style={styles.emptySubtitle}>Share your event to get people to join!</Text>
                </View>
              ) : (
                <FlatList
                  data={participants}
                  keyExtractor={(item) => item.id}
                  renderItem={renderParticipantItem}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => <View style={styles.participantSeparator} />}
                />
              )}
            </View>
          )}

          {activeTab === 'revenue' && isProCreator && (
            <View style={styles.tabContent}>
              <View style={styles.revenueCard}>
                <Text style={styles.revenueLabel}>Total Revenue</Text>
                <Text style={styles.revenueAmount}>
                  {formatAmount(event.total_revenue || 0)}
                </Text>
                <Text style={styles.revenueSubtext}>
                  From {participants.filter(p => p.payment_status === 'paid').length} paid participants
                </Text>
              </View>

              <View style={styles.revenueBreakdown}>
                <Text style={styles.breakdownTitle}>Breakdown</Text>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Gross Revenue</Text>
                  <Text style={styles.breakdownValue}>{formatAmount(event.total_revenue || 0)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Platform Fee (20%)</Text>
                  <Text style={[styles.breakdownValue, { color: colors.error }]}>
                    -{formatAmount((event.total_revenue || 0) * 0.2)}
                  </Text>
                </View>
                <View style={[styles.breakdownRow, styles.breakdownTotal]}>
                  <Text style={styles.breakdownTotalLabel}>Your Earnings</Text>
                  <Text style={styles.breakdownTotalValue}>
                    {formatAmount((event.total_revenue || 0) * 0.8)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Edit Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <BlurView intensity={80} tint="dark" style={styles.modalBlur}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Event</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Title</Text>
                  <TextInput
                    style={styles.formInput}
                    value={editTitle}
                    onChangeText={setEditTitle}
                    placeholder="Event title"
                    placeholderTextColor={colors.gray}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Description</Text>
                  <TextInput
                    style={[styles.formInput, styles.formTextArea]}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="Describe your event..."
                    placeholderTextColor={colors.gray}
                    multiline
                  />
                </View>

                {isProCreator && (
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>
                      Entry Fee ({currency.symbol})
                      <Text style={styles.formHint}> • Leave empty for free event</Text>
                    </Text>
                    <TextInput
                      style={styles.formInput}
                      value={editPrice}
                      onChangeText={setEditPrice}
                      placeholder="0.00"
                      placeholderTextColor={colors.gray}
                      keyboardType="decimal-pad"
                    />
                    {!event.is_free && participants.length > 0 && (
                      <Text style={styles.formWarning}>
                        ⚠️ Changing the price won't affect existing participants
                      </Text>
                    )}
                  </View>
                )}

                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>
                    Max Participants
                    <Text style={styles.formHint}> • Leave empty for unlimited</Text>
                  </Text>
                  <TextInput
                    style={styles.formInput}
                    value={editMaxParticipants}
                    onChangeText={setEditMaxParticipants}
                    placeholder="Unlimited"
                    placeholderTextColor={colors.gray}
                    keyboardType="number-pad"
                  />
                </View>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveChanges}
                  disabled={isSaving}
                >
                  <LinearGradient colors={GRADIENTS.primary} style={styles.saveGradient}>
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Save Changes</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
  errorText: {
    fontSize: 16,
    color: colors.gray,
  },

  // Header
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
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(14,191,138,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Summary Card
  summaryCard: {
    margin: 16,
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  eventTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: colors.gray,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray,
  },
  tabTextActive: {
    color: '#fff',
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  tabContent: {
    gap: 16,
  },

  // Details Tab
  detailCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailInfo: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.gray,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginTop: 2,
  },

  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(14,191,138,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  dangerAction: {
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  dangerIcon: {
    backgroundColor: 'rgba(255,59,48,0.15)',
  },
  dangerText: {
    color: colors.error,
  },

  // Participants Tab
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  participantAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  participantUsername: {
    fontSize: 13,
    color: colors.gray,
  },
  participantMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(76,175,80,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  paidText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  freeBadge: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  freeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray,
  },
  removeButton: {
    padding: 4,
  },
  participantSeparator: {
    height: 8,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
  },

  // Revenue Tab
  revenueCard: {
    alignItems: 'center',
    backgroundColor: 'rgba(76,175,80,0.1)',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
  },
  revenueLabel: {
    fontSize: 14,
    color: colors.gray,
  },
  revenueAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: '#4CAF50',
    marginVertical: 8,
  },
  revenueSubtext: {
    fontSize: 13,
    color: colors.gray,
  },
  revenueBreakdown: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  breakdownTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 14,
    color: colors.gray,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  breakdownTotal: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  breakdownTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  breakdownTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4CAF50',
  },

  // Edit Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  modalBlur: {
    backgroundColor: 'rgba(20,20,35,0.95)',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  modalScroll: {
    padding: 20,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  formHint: {
    fontWeight: '400',
    color: colors.gray,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  formTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  formWarning: {
    fontSize: 12,
    color: colors.gold,
    marginTop: 8,
  },
  saveButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  saveGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
