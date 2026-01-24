// src/screens/live/LiveEndedScreen.tsx
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, GRADIENTS } from '../../config/theme';

export default function LiveEndedScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { duration = 0, viewerCount = 0, peakViewers = 0 } = route.params || {};

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  const handleDone = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'Tabs' }],
    });
  };

  const handleShareHighlights = () => {
    // TODO: Implement share highlights functionality
    navigation.reset({
      index: 0,
      routes: [{ name: 'Tabs' }],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={GRADIENTS.primary}
            style={styles.iconGradient}
          >
            <Ionicons name="checkmark" size={48} color="white" />
          </LinearGradient>
        </View>

        {/* Title */}
        <Text style={styles.title}>Live Ended</Text>
        <Text style={styles.subtitle}>Great session! Here's your summary</Text>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={24} color={COLORS.primary} />
            <Text style={styles.statValue}>{formatDuration(duration)}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="people-outline" size={24} color={COLORS.primary} />
            <Text style={styles.statValue}>{viewerCount}</Text>
            <Text style={styles.statLabel}>Total Viewers</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="trending-up-outline" size={24} color={COLORS.primary} />
            <Text style={styles.statValue}>{peakViewers || viewerCount}</Text>
            <Text style={styles.statLabel}>Peak Viewers</Text>
          </View>
        </View>

        {/* Message */}
        <View style={styles.messageCard}>
          <Ionicons name="heart" size={20} color="#FF6B6B" />
          <Text style={styles.messageText}>
            Thank you for going live! Your fans loved it.
          </Text>
        </View>
      </View>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity style={styles.shareButton} onPress={handleShareHighlights}>
          <Ionicons name="share-outline" size={20} color={COLORS.primary} />
          <Text style={styles.shareButtonText}>Share Highlights</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDone} activeOpacity={0.9}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.doneButton}
          >
            <Text style={styles.doneButtonText}>Done</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconContainer: {
    marginBottom: 24,
  },
  iconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(10, 37, 47, 0.6)',
    marginBottom: 32,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(14, 191, 138, 0.08)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(10, 37, 47, 0.5)',
  },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.dark,
    lineHeight: 20,
  },
  bottomButtons: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 12,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.primary,
    gap: 8,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
