import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING, TYPOGRAPHY } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const BUSINESS_CATEGORIES = [
  { id: 'gym', icon: 'barbell-outline', label: 'Gym', color: '#1E90FF' },
  { id: 'yoga_studio', icon: 'body-outline', label: 'Yoga Studio', color: '#9B59B6' },
  { id: 'crossfit', icon: 'fitness-outline', label: 'CrossFit Box', color: '#FF4500' },
  { id: 'pool', icon: 'water-outline', label: 'Pool / Aquatics', color: '#0099CC' },
  { id: 'martial_arts', icon: 'flash-outline', label: 'Martial Arts', color: '#FF5722' },
  { id: 'dance_studio', icon: 'musical-notes-outline', label: 'Dance Studio', color: '#E91E63' },
  { id: 'wellness_spa', icon: 'leaf-outline', label: 'Wellness / Spa', color: '#27AE60' },
  { id: 'sports_club', icon: 'trophy-outline', label: 'Sports Club', color: '#FFD700' },
  { id: 'other', icon: 'ellipsis-horizontal-circle-outline', label: 'Other', color: '#607D8B' },
];

const LOCATIONS_MODES = [
  { id: 'single', label: 'Single Location', desc: 'One physical location' },
  { id: 'multiple', label: 'Multiple Locations', desc: 'Chain or franchise' },
];

export default function BusinessCategoryScreen({ navigation, route }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [locationsMode, setLocationsMode] = useState<string | null>(null);

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const isFormValid = selectedCategory !== null && locationsMode !== null && (selectedCategory !== 'other' || customCategory.trim().length > 0);

  const handleNext = useCallback(() => {
    if (!isFormValid) return;
    navigate('BusinessInfo', {
      ...params,
      businessCategory: selectedCategory,
      businessCategoryCustom: selectedCategory === 'other' ? customCategory.trim() : null,
      locationsMode,
    });
  }, [isFormValid, navigate, params, selectedCategory, customCategory, locationsMode]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={disabled}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.titleBox}>
          <Text style={styles.title}>Business Type</Text>
          <Text style={styles.subtitle}>What kind of business do you have?</Text>
        </View>

        {/* Categories Grid */}
        <View style={styles.grid}>
          {BUSINESS_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryCard,
                  isSelected && styles.categoryCardSelected,
                ]}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.categoryIcon, { backgroundColor: `${cat.color}15` }]}>
                  <Ionicons name={cat.icon as any} size={26} color={cat.color} />
                </View>
                <Text style={styles.categoryLabel}>
                  {cat.label}
                </Text>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={10} color={COLORS.white} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Custom Category Input */}
        {selectedCategory === 'other' && (
          <View style={styles.customInputBox}>
            <View style={[styles.inputBox, customCategory.length > 0 && styles.inputValid]}>
              <TextInput
                style={styles.input}
                placeholder="Specify your business type..."
                placeholderTextColor={COLORS.grayMuted}
                value={customCategory}
                onChangeText={setCustomCategory}
                autoCapitalize="words"
              />
            </View>
          </View>
        )}

        {/* Locations Mode */}
        <View style={styles.locationSection}>
          <Text style={styles.sectionTitle}>Number of Locations</Text>
          <View style={styles.locationRow}>
            {LOCATIONS_MODES.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                style={[styles.locationCard, locationsMode === mode.id && styles.locationCardActive]}
                onPress={() => setLocationsMode(mode.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.radio, locationsMode === mode.id && styles.radioActive]}>
                  {locationsMode === mode.id && <View style={styles.radioInner} />}
                </View>
                <View style={styles.locationTextBox}>
                  <Text style={styles.locationLabel}>{mode.label}</Text>
                  <Text style={styles.locationDesc}>{mode.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Button */}
        <View style={styles.bottomSection}>
          <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" disabled={!isFormValid || disabled} onPress={handleNext}>
            Next
          </Button>
        </View>

        {/* Logo Footer */}
        <View style={styles.footer}>
          <SmuppyText width={120} variant="dark" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  inner: { flex: 1, paddingHorizontal: SPACING.xl },

  // Header
  header: { paddingTop: SPACING.base, marginBottom: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.dark, justifyContent: 'center', alignItems: 'center' },

  // Title
  titleBox: { alignItems: 'center', marginBottom: SPACING.lg },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 26, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.xs },
  subtitle: { fontSize: 14, color: COLORS.dark, textAlign: 'center' },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  categoryCard: {
    width: '31%',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
    borderRadius: SIZES.radiusLg,
    alignItems: 'center',
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.white,
  },
  categoryCardSelected: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  categoryIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xs },
  categoryLabel: { fontSize: 11, fontWeight: '600', color: COLORS.dark, textAlign: 'center' },
  checkBadge: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary },

  // Custom Input
  customInputBox: { marginBottom: SPACING.md },
  inputBox: { flexDirection: 'row', alignItems: 'center', height: 48, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, backgroundColor: COLORS.white },
  inputValid: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: '#E8FAF7' },
  input: { flex: 1, ...TYPOGRAPHY.body, fontSize: 14 },

  // Locations
  locationSection: { marginTop: SPACING.xs },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: SPACING.sm },
  locationRow: { gap: SPACING.xs },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.base,
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
    borderRadius: SIZES.radiusLg,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.xs,
  },
  locationCardActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm },
  radioActive: { borderColor: COLORS.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  locationTextBox: { flex: 1 },
  locationLabel: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  locationDesc: { fontSize: 11, color: COLORS.grayMuted, marginTop: 1 },

  // Spacer
  spacer: { flex: 1 },

  // Bottom
  bottomSection: { paddingBottom: SPACING.sm },
  footer: { alignItems: 'center', paddingBottom: SPACING.md },
});
