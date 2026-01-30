/**
 * SessionRecapModal — End-of-session vibe summary
 *
 * Shows: duration, mood trajectory, positive interactions, start/end mood.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SessionRecap } from '../services/vibeGuardian';
import { getMoodDisplay } from '../hooks/useMoodAI';
import { COLORS, SPACING } from '../config/theme';

interface SessionRecapModalProps {
  visible: boolean;
  recap: SessionRecap | null;
  onDismiss: () => void;
}

const TRAJECTORY_CONFIG = {
  improved: { icon: 'trending-up' as const, label: 'Improved', color: '#4CAF50' },
  stable: { icon: 'remove' as const, label: 'Stable', color: '#FF9800' },
  declined: { icon: 'trending-down' as const, label: 'Declined', color: '#FF6B6B' },
};

const SessionRecapModal: React.FC<SessionRecapModalProps> = ({ visible, recap, onDismiss }) => {
  const insets = useSafeAreaInsets();

  if (!recap) return null;

  const startDisplay = getMoodDisplay(recap.startMood);
  const endDisplay = getMoodDisplay(recap.endMood);
  const trajectory = TRAJECTORY_CONFIG[recap.vibeTrajectory];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { paddingBottom: insets.bottom + 20 }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Session Recap</Text>
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={COLORS.gray} />
            </TouchableOpacity>
          </View>

          {/* Duration */}
          <View style={styles.stat}>
            <Ionicons name="time-outline" size={20} color={COLORS.gray} />
            <Text style={styles.statLabel}>Duration</Text>
            <Text style={styles.statValue}>{recap.durationMinutes} min</Text>
          </View>

          {/* Trajectory */}
          <View style={styles.stat}>
            <Ionicons name={trajectory.icon} size={20} color={trajectory.color} />
            <Text style={styles.statLabel}>Vibe trajectory</Text>
            <Text style={[styles.statValue, { color: trajectory.color }]}>{trajectory.label}</Text>
          </View>

          {/* Mood journey */}
          <View style={styles.moodJourney}>
            <View style={styles.moodBubble}>
              <Text style={styles.moodEmoji}>{startDisplay.emoji}</Text>
              <Text style={styles.moodName}>{startDisplay.label}</Text>
              <Text style={styles.moodTime}>Start</Text>
            </View>
            <Ionicons name="arrow-forward" size={20} color={COLORS.grayLight} />
            <View style={styles.moodBubble}>
              <Text style={styles.moodEmoji}>{endDisplay.emoji}</Text>
              <Text style={styles.moodName}>{endDisplay.label}</Text>
              <Text style={styles.moodTime}>End</Text>
            </View>
          </View>

          {/* Positive interactions */}
          <View style={styles.stat}>
            <Ionicons name="heart-outline" size={20} color={COLORS.heartRed} />
            <Text style={styles.statLabel}>Positive interactions</Text>
            <Text style={styles.statValue}>{recap.positiveInteractions}</Text>
          </View>

          {/* Dismiss */}
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss} activeOpacity={0.8}>
            <Text style={styles.dismissText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 22,
    color: COLORS.dark,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayBorder,
  },
  statLabel: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 15,
    color: COLORS.gray,
    marginLeft: SPACING.md,
  },
  statValue: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 15,
    color: COLORS.dark,
  },
  moodJourney: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.lg,
  },
  moodBubble: {
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSecondary,
    borderRadius: 16,
    padding: SPACING.md,
    minWidth: 100,
  },
  moodEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  moodName: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: COLORS.dark,
  },
  moodTime: {
    fontFamily: 'Poppins-Regular',
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
  },
  dismissButton: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: 'center',
  },
  dismissText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: COLORS.white,
  },
});

export default React.memo(SessionRecapModal);
