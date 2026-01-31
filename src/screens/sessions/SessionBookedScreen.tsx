// src/screens/sessions/SessionBookedScreen.tsx
import React from 'react';
import { AvatarImage } from '../../components/OptimizedImage';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Calendar from 'expo-calendar';
import { COLORS, GRADIENTS } from '../../config/theme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

export default function SessionBookedScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { showError, showSuccess } = useSmuppyAlert();

  const { creator, date, time, duration } = route.params || {
    creator: { name: 'Apte Fitness', avatar: null },
    date: { date: 15, month: 'Sep' },
    time: '15:00',
    duration: 60,
  };

  const handleDone = () => {
    navigation.popToTop();
  };

  const handleAddToCalendar = async () => {
    try {
      // Request calendar permissions
      const { status } = await Calendar.requestCalendarPermissionsAsync();

      if (status !== 'granted') {
        showError('Permission Required', 'Please allow calendar access to add this event.');
        return;
      }

      // Get default calendar
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const defaultCalendar = calendars.find(
        (cal: Calendar.Calendar) =>
          cal.allowsModifications &&
          (Platform.OS === 'ios'
            ? cal.source.name === 'iCloud' || cal.source.name === 'Default'
            : cal.isPrimary)
      ) || calendars.find((cal: Calendar.Calendar) => cal.allowsModifications);

      if (!defaultCalendar) {
        showError('Error', 'No writable calendar found on this device.');
        return;
      }

      // Create event date/time
      const sessionDate = date.fullDate || new Date();
      const [hours, minutes] = time.split(':').map(Number);
      const startDate = new Date(sessionDate);
      startDate.setHours(hours, minutes, 0, 0);

      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + duration);

      // Create the calendar event
      await Calendar.createEventAsync(defaultCalendar.id, {
        title: `Session with ${creator.name}`,
        notes: `Private 1-to-1 session on Smuppy\n\nDuration: ${duration} minutes`,
        startDate,
        endDate,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        alarms: [
          { relativeOffset: -30 }, // 30 minutes before
          { relativeOffset: -1440 }, // 1 day before
        ],
      });

      showSuccess('Added to Calendar', `Your session with ${creator.name} has been added to your calendar.`);
    } catch (error) {
      console.error('[Calendar] Error adding event:', error);
      showError('Error', 'Failed to add event to calendar. Please try again.');
    }
  };

  const formatDate = () => {
    const d = date.fullDate || new Date();
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.successIconContainer}>
          <LinearGradient
            colors={GRADIENTS.primary}
            style={styles.successIcon}
          >
            <Ionicons name="checkmark" size={48} color="white" />
          </LinearGradient>
        </View>

        {/* Title */}
        <Text style={styles.title}>Session Booked!</Text>
        <Text style={styles.subtitle}>
          Your private session has been successfully scheduled.
        </Text>

        {/* Session Details Card */}
        <View style={styles.detailsCard}>
          <View style={styles.creatorRow}>
            <AvatarImage source={creator.avatar} size={52} />
            <View>
              <Text style={styles.creatorName}>{creator.name}</Text>
              <Text style={styles.sessionType}>1-to-1 Private Session</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate()}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailIconContainer}>
              <Ionicons name="time-outline" size={20} color={COLORS.primary} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Time</Text>
              <Text style={styles.detailValue}>{time} • {duration} minutes</Text>
            </View>
          </View>
        </View>

        {/* Add to Calendar Button */}
        <TouchableOpacity style={styles.calendarButton} onPress={handleAddToCalendar}>
          <Ionicons name="calendar" size={20} color={COLORS.primary} />
          <Text style={styles.calendarButtonText}>Add to Calendar</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity onPress={handleDone} activeOpacity={0.9}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.doneButton}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    paddingTop: 60,
  },
  successIconContainer: {
    marginBottom: 24,
  },
  successIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(10, 37, 47, 0.6)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: 'rgba(10, 37, 47, 0.03)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  creatorAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: 12,
  },
  creatorName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.dark,
  },
  sessionType: {
    fontSize: 13,
    color: 'rgba(10, 37, 47, 0.6)',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(10, 37, 47, 0.08)',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: 'rgba(10, 37, 47, 0.5)',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.dark,
  },
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    gap: 8,
  },
  calendarButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'white',
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
