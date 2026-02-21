/**
 * PrescriptionsScreen — List of context-aware wellness missions
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useVibePrescriptions } from '../../hooks/useVibePrescriptions';
import { Prescription, PrescriptionCategory } from '../../services/prescriptionEngine';
import { SPACING, HIT_SLOP } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useUserStore } from '../../stores/userStore';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORY_CONFIG: Record<PrescriptionCategory, { icon: IoniconsName; color: string }> = {
  movement: { icon: 'fitness', color: '#FF6B6B' },
  mindfulness: { icon: 'leaf', color: '#4CAF50' },
  social: { icon: 'people', color: '#2196F3' },
  creative: { icon: 'color-palette', color: '#9C27B0' },
  nutrition: { icon: 'nutrition', color: '#FF9800' },
};

type PrescriptionsScreenProps = Readonly<{
  navigation: {
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
  };
}>;


export default function PrescriptionsScreen({ navigation }: PrescriptionsScreenProps) {
  const { colors, isDark } = useTheme();
  const accountType = useUserStore((s) => s.user?.accountType);
  const insets = useSafeAreaInsets();
  const {
    prescriptions,
    setActivePrescription,
    weather,
    isLoading,
    refresh,
  } = useVibePrescriptions();

  const isBusiness = accountType === 'pro_business';

  const handleStart = useCallback(
    (rx: Prescription) => {
      setActivePrescription(rx);
      navigation.navigate('ActivePrescription', { prescriptionId: rx.id });
    },
    [setActivePrescription, navigation],
  );

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleSettings = useCallback(
    () => navigation.navigate('PrescriptionPreferences'),
    [navigation],
  );

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Business accounts don't have access to prescriptions
  useEffect(() => {
    if (isBusiness) navigation.goBack();
  }, [isBusiness, navigation]);

  if (isBusiness) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={HIT_SLOP.medium}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vibe Prescriptions</Text>
        <TouchableOpacity onPress={handleSettings} hitSlop={HIT_SLOP.medium}>
          <Ionicons name="settings-outline" size={24} color={colors.dark} />
        </TouchableOpacity>
      </View>

      {/* Weather badge */}
      {weather && (
        <View style={styles.weatherBadge}>
          <Ionicons name="partly-sunny" size={16} color={colors.gray} />
          <Text style={styles.weatherText}>
            {weather.temp}°C · {weather.description}
          </Text>
          {!weather.isOutdoorFriendly && (
            <View style={styles.indoorBadge}>
              <Text style={styles.indoorText}>Indoor day</Text>
            </View>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Preparing your prescriptions...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.primary} />
          }
        >
          {prescriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color={colors.primary} />
              <Text style={styles.emptyTitle}>All done for today!</Text>
              <Text style={styles.emptySubtitle}>Check back later for new prescriptions</Text>
            </View>
          ) : (
            prescriptions.map((rx) => (
              <PrescriptionCard key={rx.id} prescription={rx} onStart={handleStart} styles={styles} />
            ))
          )}

          <View style={{ height: insets.bottom + 20 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ============================================================================
// PRESCRIPTION CARD
// ============================================================================

type PrescriptionCardProps = Readonly<{
  prescription: Prescription;
  onStart: (rx: Prescription) => void;
  styles: ReturnType<typeof createStyles>;
}>;


const PrescriptionCard: React.FC<PrescriptionCardProps> = React.memo(({ prescription, onStart, styles }) => {
  const config = CATEGORY_CONFIG[prescription.category];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onStart(prescription)}
      activeOpacity={0.8}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.categoryBadge, { backgroundColor: config.color + '20' }]}>
          <Ionicons name={config.icon} size={16} color={config.color} />
          <Text style={[styles.categoryText, { color: config.color }]}>
            {prescription.category}
          </Text>
        </View>
        <Text style={styles.duration}>{prescription.durationMinutes} min</Text>
      </View>

      <Text style={styles.cardTitle}>{prescription.title}</Text>
      <Text style={styles.cardDesc}>{prescription.description}</Text>

      <View style={styles.cardFooter}>
        <View style={styles.difficultyRow}>
          {Array.from({ length: ({ easy: 1, moderate: 2 } as Record<string, number>)[prescription.difficulty] ?? 3 }).map((_, i) => (
            <View key={`difficulty-${i}`} style={[styles.difficultyDot, { backgroundColor: config.color }]} />
          ))}
          <Text style={styles.difficultyText}>{prescription.difficulty}</Text>
        </View>
        <LinearGradient colors={['#00B3C7', '#0EBF8A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.startButton}>
          <Text style={styles.startButtonText}>Start</Text>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
});

// ============================================================================
// STYLES
// ============================================================================

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.dark,
  },
  weatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: 6,
  },
  weatherText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 13,
    color: colors.gray,
  },
  indoorBadge: {
    backgroundColor: '#FFF3E0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  indoorText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 11,
    color: '#FF9800',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: SPACING.sm,
  },
  emptyTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.dark,
  },
  emptySubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
  },
  card: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 4,
  },
  categoryText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  duration: {
    fontFamily: 'Poppins-Medium',
    fontSize: 12,
    color: colors.gray,
  },
  cardTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: colors.dark,
    marginBottom: 4,
  },
  cardDesc: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  difficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  difficultyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  difficultyText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.gray,
    marginLeft: 4,
    textTransform: 'capitalize',
  },
  startButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  startButtonText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 13,
    color: colors.white,
  },
});
