// src/screens/sessions/SessionEndedScreen.tsx
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import OptimizedImage from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

export default function SessionEndedScreen(): React.JSX.Element {
  const navigation = useNavigation<{ reset: (state: { index: number; routes: { name: string }[] }) => void; replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const route = useRoute();
  const { colors, isDark } = useTheme();

  const routeParams = (route.params || {}) as { duration?: number; creator?: { name: string; avatar: string | null } };
  const duration = routeParams.duration ?? 0;
  const creator = routeParams.creator ?? { name: 'Apte Fitness', avatar: null as string | null };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

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

  const handleRebook = () => {
    navigation.replace('BookSession', { creator });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      <View style={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.iconGradient}
          >
            <Ionicons name="checkmark" size={48} color={colors.white} />
          </LinearGradient>
        </View>

        {/* Title */}
        <Text style={styles.title}>Session Completed</Text>
        <Text style={styles.subtitle}>Great session with {creator.name}!</Text>

        {/* Creator Card */}
        <View style={styles.creatorCard}>
          <OptimizedImage
            source={creator.avatar}
            style={styles.creatorAvatar as StyleProp<ImageStyle>}
            contentFit="cover"
            priority="high"
          />
          <View style={styles.creatorInfo}>
            <Text style={styles.creatorName}>{creator.name}</Text>
            <Text style={styles.sessionType}>1:1 Private Session</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Ionicons name="time-outline" size={24} color={colors.primary} />
            <Text style={styles.statValue}>{formatDuration(duration)}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="videocam-outline" size={24} color={colors.primary} />
            <Text style={styles.statValue}>HD</Text>
            <Text style={styles.statLabel}>Quality</Text>
          </View>
        </View>

        {/* Rate Session */}
        <View style={styles.rateContainer}>
          <Text style={styles.rateTitle}>How was your session?</Text>
          <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} style={styles.starButton}>
                <Ionicons name="star-outline" size={32} color={colors.gold} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity style={styles.rebookButton} onPress={handleRebook}>
          <Ionicons name="calendar-outline" size={20} color={colors.primary} />
          <Text style={styles.rebookButtonText}>Book Again</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDone} activeOpacity={0.9}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.doneButton}
          >
            <Text style={styles.doneButtonText}>Done</Text>
            <Ionicons name="arrow-forward" size={20} color={colors.white} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
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
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.grayLight,
    marginBottom: 32,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginBottom: 24,
  },
  creatorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.primary,
    marginRight: 12,
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.dark,
  },
  sessionType: {
    fontSize: 13,
    color: colors.grayLight,
    marginTop: 2,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
    width: '100%',
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.primary + '10',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.grayLight,
  },
  rateContainer: {
    alignItems: 'center',
    width: '100%',
  },
  rateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  starButton: {
    padding: 4,
  },
  bottomButtons: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 12,
  },
  rebookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.primary,
    gap: 8,
  },
  rebookButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
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
    color: colors.white,
  },
});
