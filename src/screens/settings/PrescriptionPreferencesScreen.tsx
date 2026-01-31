/**
 * PrescriptionPreferencesScreen — User settings for Vibe Prescriptions
 */

import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVibePrescriptions } from '../../hooks/useVibePrescriptions';
import { PrescriptionCategory } from '../../services/prescriptionEngine';
import { SPACING } from '../../config/theme';
import { useTheme } from '../../hooks/useTheme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORIES: Array<{ id: PrescriptionCategory; label: string; icon: IoniconsName }> = [
  { id: 'movement', label: 'Movement', icon: 'fitness' },
  { id: 'mindfulness', label: 'Mindfulness', icon: 'leaf' },
  { id: 'social', label: 'Social', icon: 'people' },
  { id: 'creative', label: 'Creative', icon: 'color-palette' },
  { id: 'nutrition', label: 'Nutrition', icon: 'nutrition' },
];

const ACTIVITY_LEVELS = [
  { id: 'low' as const, label: 'Low', desc: 'Gentle activities only' },
  { id: 'medium' as const, label: 'Medium', desc: 'Mix of easy and moderate' },
  { id: 'high' as const, label: 'High', desc: 'Include challenging activities' },
];

const OUTDOOR_OPTIONS = [
  { id: 'always' as const, label: 'Always', desc: 'Include outdoor rain or shine' },
  { id: 'weather_permitting' as const, label: 'Weather permitting', desc: 'Only when conditions are good' },
  { id: 'never' as const, label: 'Never', desc: 'Indoor activities only' },
];

const FREQUENCY_OPTIONS = [
  { id: 'hourly' as const, label: 'Hourly' },
  { id: 'few_times_daily' as const, label: 'A few times a day' },
  { id: 'daily' as const, label: 'Once a day' },
];

interface PrescriptionPreferencesScreenProps {
  navigation: {
    goBack: () => void;
  };
}

export default function PrescriptionPreferencesScreen({ navigation }: PrescriptionPreferencesScreenProps) {
  const insets = useSafeAreaInsets();
  const { preferences, updatePreferences } = useVibePrescriptions();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const toggleCategory = useCallback(
    (cat: PrescriptionCategory) => {
      const current = preferences.enabledCategories;
      const updated = current.includes(cat)
        ? current.filter((c) => c !== cat)
        : [...current, cat];
      // Require at least one category
      if (updated.length > 0) {
        updatePreferences({ enabledCategories: updated });
      }
    },
    [preferences.enabledCategories, updatePreferences],
  );

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Prescription Preferences</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Categories */}
        <Text style={styles.sectionTitle}>Categories</Text>
        {CATEGORIES.map((cat) => {
          const isEnabled = preferences.enabledCategories.includes(cat.id);
          return (
            <View key={cat.id} style={styles.row}>
              <View style={styles.rowLeft}>
                <Ionicons name={cat.icon} size={20} color={isEnabled ? colors.primary : colors.gray} />
                <Text style={styles.rowLabel}>{cat.label}</Text>
              </View>
              <Switch
                value={isEnabled}
                onValueChange={() => toggleCategory(cat.id)}
                trackColor={{ true: colors.primary }}
                thumbColor={colors.white}
              />
            </View>
          );
        })}

        {/* Activity Level */}
        <Text style={styles.sectionTitle}>Activity Level</Text>
        {ACTIVITY_LEVELS.map((level) => {
          const isActive = preferences.activityLevel === level.id;
          return (
            <TouchableOpacity
              key={level.id}
              style={[styles.optionCard, isActive && styles.optionCardActive]}
              onPress={() => updatePreferences({ activityLevel: level.id })}
            >
              <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>{level.label}</Text>
              <Text style={styles.optionDesc}>{level.desc}</Text>
              {isActive && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}

        {/* Outdoor Preference */}
        <Text style={styles.sectionTitle}>Outdoor Activities</Text>
        {OUTDOOR_OPTIONS.map((opt) => {
          const isActive = preferences.outdoorPreference === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.optionCard, isActive && styles.optionCardActive]}
              onPress={() => updatePreferences({ outdoorPreference: opt.id })}
            >
              <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>{opt.label}</Text>
              <Text style={styles.optionDesc}>{opt.desc}</Text>
              {isActive && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}

        {/* Frequency */}
        <Text style={styles.sectionTitle}>Frequency</Text>
        {FREQUENCY_OPTIONS.map((opt) => {
          const isActive = preferences.frequency === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.optionCard, isActive && styles.optionCardActive]}
              onPress={() => updatePreferences({ frequency: opt.id })}
            >
              <Text style={[styles.optionLabel, isActive && styles.optionLabelActive]}>{opt.label}</Text>
              {isActive && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
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
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  headerTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.dark,
  },
  content: {
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: colors.dark,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  rowLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 15,
    color: colors.dark,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.grayBorder,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  optionCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  optionLabel: {
    fontFamily: 'Poppins-Medium',
    fontSize: 15,
    color: colors.dark,
    flex: 1,
  },
  optionLabelActive: {
    color: colors.primary,
  },
  optionDesc: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    color: colors.gray,
  },
});
