/**
 * Session Detail Screen
 * Shows detailed information about a session (Fan perspective)
 */

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OptimizedImage from '../../components/OptimizedImage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Calendar from 'expo-calendar';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { awsAPI } from '../../services/aws-api';
import { formatLongDateFrench, formatTime } from '../../utils/dateFormatters';

interface Session {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorUsername: string;
  creatorAvatar: string;
  creatorVerified: boolean;
  scheduledAt: Date;
  duration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  sessionType: 'single' | 'pack';
  packName?: string;
  price: number;
  canJoin: boolean;
}

type RouteParams = {
  SessionDetail: { session: Session };
};

const SessionDetailScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const route = useRoute<RouteProp<RouteParams, 'SessionDetail'>>();
  const { session } = route.params;
  const { showError, showSuccess, showAlert } = useSmuppyAlert();
  const { colors, gradients, isDark } = useTheme();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const getStatusColor = (status: Session['status']): string => {
    switch (status) {
      case 'confirmed': return colors.primary;
      case 'pending': return '#FFA500';
      case 'completed': return colors.gray;
      case 'cancelled': return '#FF4444';
      default: return colors.gray;
    }
  };

  const getStatusLabel = (status: Session['status']): string => {
    switch (status) {
      case 'confirmed': return 'Confirmée';
      case 'pending': return 'En attente de confirmation';
      case 'completed': return 'Terminée';
      case 'cancelled': return 'Annulée';
      default: return status;
    }
  };

  const handleAddToCalendar = async () => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        showError('Permission refusée', "L'accès au calendrier est nécessaire.");
        return;
      }

      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const defaultCalendar = calendars.find(
        (cal: Calendar.Calendar) => cal.allowsModifications && cal.source.name === 'Default'
      ) || calendars.find((cal: Calendar.Calendar) => cal.allowsModifications);

      if (!defaultCalendar) {
        showError('Erreur', 'Aucun calendrier disponible.');
        return;
      }

      const endDate = new Date(session.scheduledAt);
      endDate.setMinutes(endDate.getMinutes() + session.duration);

      await Calendar.createEventAsync(defaultCalendar.id, {
        title: `Session avec ${session.creatorName}`,
        startDate: session.scheduledAt,
        endDate,
        notes: `Session de ${session.duration} minutes avec @${session.creatorUsername}`,
        alarms: [
          { relativeOffset: -30 }, // 30 min before
          { relativeOffset: -1440 }, // 1 day before
        ],
      });

      showSuccess('Ajouté', 'La session a été ajoutée à votre calendrier.');
    } catch (error) {
      if (__DEV__) console.warn('Calendar error:', error);
      showError('Erreur', "Impossible d'ajouter au calendrier.");
    }
  };

  const handleCancelSession = async () => {
    setCancelling(true);
    try {
      await awsAPI.declineSession(session.id, 'Cancelled by user');
      setShowCancelModal(false);
      showAlert({
        title: 'Session annulée',
        message: 'Votre session a été annulée avec succès.',
        type: 'success',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
    } catch (_error) {
      showError('Erreur', "Impossible d'annuler la session.");
    } finally {
      setCancelling(false);
    }
  };

  const handleJoinSession = () => {
    navigation.navigate('WaitingRoom', {
      creatorId: session.creatorId,
      creatorName: session.creatorName,
      creatorAvatar: session.creatorAvatar,
      sessionId: session.id,
    });
  };

  const handleMessageCreator = () => {
    navigation.navigate('Chat', { userId: session.creatorId });
  };

  const handleViewCreatorProfile = () => {
    navigation.navigate('UserProfile', { userId: session.creatorId });
  };

  const canCancel = session.status === 'pending' || session.status === 'confirmed';
  const isUpcoming = session.scheduledAt > new Date();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={isDark ? colors.white : colors.dark} />
        </TouchableOpacity>
        <Text style={styles.title}>Détails de la session</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Creator Card */}
        <TouchableOpacity style={styles.creatorCard} onPress={handleViewCreatorProfile}>
          <OptimizedImage
            source={session.creatorAvatar}
            style={styles.creatorAvatar as StyleProp<ImageStyle>}
            contentFit="cover"
            priority="high"
          />
          <View style={styles.creatorInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.creatorName}>{session.creatorName}</Text>
              {session.creatorVerified && (
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              )}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.gray} />
        </TouchableOpacity>

        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: getStatusColor(session.status) + '20' }]}>
          <Ionicons
            name={
              session.status === 'confirmed' ? 'checkmark-circle' :
              session.status === 'pending' ? 'time' :
              session.status === 'completed' ? 'checkbox' : 'close-circle'
            }
            size={24}
            color={getStatusColor(session.status)}
          />
          <Text style={[styles.statusText, { color: getStatusColor(session.status) }]}>
            {getStatusLabel(session.status)}
          </Text>
        </View>

        {/* Session Info */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Informations</Text>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="calendar-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{formatLongDateFrench(session.scheduledAt)}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="time-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Heure</Text>
              <Text style={styles.infoValue}>{formatTime(session.scheduledAt)}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="hourglass-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Durée</Text>
              <Text style={styles.infoValue}>{session.duration} minutes</Text>
            </View>
          </View>

          {session.sessionType === 'pack' && session.packName && (
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="cube-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Pack</Text>
                <Text style={styles.infoValue}>{session.packName}</Text>
              </View>
            </View>
          )}

          {session.price > 0 && (
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Ionicons name="card-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Prix payé</Text>
                <Text style={styles.infoValue}>{session.price.toFixed(2)} €</Text>
              </View>
            </View>
          )}
        </View>

        {/* Actions */}
        {isUpcoming && session.status !== 'cancelled' && (
          <View style={styles.actionsSection}>
            <TouchableOpacity style={styles.actionRow} onPress={handleAddToCalendar}>
              <View style={styles.actionIcon}>
                <Ionicons name="calendar" size={22} color={colors.white} />
              </View>
              <Text style={styles.actionText}>Ajouter au calendrier</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.gray} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionRow} onPress={handleMessageCreator}>
              <View style={styles.actionIcon}>
                <Ionicons name="chatbubble" size={22} color={colors.white} />
              </View>
              <Text style={styles.actionText}>Envoyer un message</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.gray} />
            </TouchableOpacity>

            {canCancel && (
              <TouchableOpacity
                style={[styles.actionRow, styles.cancelAction]}
                onPress={() => setShowCancelModal(true)}
              >
                <View style={[styles.actionIcon, styles.cancelIcon]}>
                  <Ionicons name="close-circle" size={22} color="#FF4444" />
                </View>
                <Text style={[styles.actionText, styles.cancelText]}>Annuler la session</Text>
                <Ionicons name="chevron-forward" size={20} color="#FF4444" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Completed Session Actions */}
        {session.status === 'completed' && (
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={styles.rebookButton}
              onPress={() => navigation.navigate('BookSession', { creatorId: session.creatorId })}
            >
              <Ionicons name="refresh" size={20} color={colors.white} />
              <Text style={styles.rebookButtonText}>Réserver à nouveau</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Join Button - Fixed at bottom */}
      {session.canJoin && session.status === 'confirmed' && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity style={styles.joinButton} onPress={handleJoinSession}>
            <LinearGradient
              colors={gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.joinGradient}
            >
              <Ionicons name="videocam" size={24} color={colors.white} />
              <Text style={styles.joinText}>Rejoindre la session</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* Cancel Modal */}
      <Modal
        visible={showCancelModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Ionicons name="warning" size={48} color="#FFA500" />
            <Text style={styles.modalTitle}>Annuler la session ?</Text>
            <Text style={styles.modalText}>
              Êtes-vous sûr de vouloir annuler cette session avec {session.creatorName} ?
            </Text>
            {session.price > 0 && (
              <Text style={styles.modalNote}>
                Le remboursement sera effectué sous 5-7 jours ouvrés.
              </Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalButtonCancel}
                onPress={() => setShowCancelModal(false)}
              >
                <Text style={styles.modalButtonCancelText}>Non, garder</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalButtonConfirm}
                onPress={handleCancelSession}
                disabled={cancelling}
              >
                <Text style={styles.modalButtonConfirmText}>
                  {cancelling ? 'Annulation...' : 'Oui, annuler'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  creatorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 14,
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
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  username: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 2,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.gray,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  actionsSection: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.background,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.white,
  },
  cancelAction: {
    borderBottomWidth: 0,
  },
  cancelIcon: {
    backgroundColor: '#FF444420',
  },
  cancelText: {
    color: '#FF4444',
  },
  rebookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    margin: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  rebookButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.backgroundSecondary,
  },
  joinButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  joinGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  joinText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
    marginTop: 16,
    marginBottom: 8,
  },
  modalText: {
    fontSize: 15,
    color: colors.grayLight,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalNote: {
    fontSize: 13,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  modalButtonCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  modalButtonCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
  modalButtonConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#FF4444',
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
});

export default SessionDetailScreen;
