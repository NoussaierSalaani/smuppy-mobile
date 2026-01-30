import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING, TYPOGRAPHY, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const ALL_CATEGORIES = [
  { id: 'gym', icon: 'barbell-outline', label: 'Gym', color: '#1E90FF' },
  { id: 'yoga_studio', icon: 'body-outline', label: 'Yoga Studio', color: '#9B59B6' },
  { id: 'crossfit', icon: 'fitness-outline', label: 'CrossFit Box', color: '#FF4500' },
  { id: 'pool', icon: 'water-outline', label: 'Pool / Aquatics', color: '#0099CC' },
  { id: 'martial_arts', icon: 'flash-outline', label: 'Martial Arts', color: '#FF5722' },
  { id: 'dance_studio', icon: 'musical-notes-outline', label: 'Dance Studio', color: '#E91E63' },
  { id: 'wellness_spa', icon: 'leaf-outline', label: 'Wellness / Spa', color: '#27AE60' },
  { id: 'sports_club', icon: 'trophy-outline', label: 'Sports Club', color: '#FFD700' },
  // More categories
  { id: 'personal_training', icon: 'person-outline', label: 'Personal Training', color: '#FF6B6B' },
  { id: 'bootcamp', icon: 'people-outline', label: 'Bootcamp', color: '#4CAF50' },
  { id: 'pilates', icon: 'body', label: 'Pilates Studio', color: '#E91E63' },
  { id: 'meditation', icon: 'happy-outline', label: 'Meditation Center', color: '#607D8B' },
  { id: 'tennis', icon: 'tennisball-outline', label: 'Tennis Club', color: '#C5E063' },
  { id: 'climbing', icon: 'trending-up-outline', label: 'Climbing Gym', color: '#795548' },
  { id: 'boxing', icon: 'fitness-outline', label: 'Boxing Gym', color: '#D32F2F' },
  { id: 'running_club', icon: 'walk-outline', label: 'Running Club', color: '#2196F3' },
  { id: 'hiit_studio', icon: 'flash-outline', label: 'HIIT Studio', color: '#E67E22' },
  { id: 'swim_school', icon: 'water', label: 'Swim School', color: '#0277BD' },
  { id: 'nutrition', icon: 'nutrition-outline', label: 'Nutrition Center', color: '#FF9800' },
  { id: 'golf', icon: 'golf-outline', label: 'Golf Club', color: '#228B22' },
  { id: 'cycling', icon: 'bicycle-outline', label: 'Cycling Studio', color: '#795548' },
  { id: 'mma', icon: 'fitness', label: 'MMA Gym', color: '#E64A19' },
];

const INITIAL_COUNT = 8; // 8 + Other = 9 = 3 rows
const EXPAND_BY = 3; // Add 3 at a time to keep complete rows

const LOCATIONS_MODES = [
  { id: 'single', label: 'Single Location', desc: 'One physical location' },
  { id: 'multiple', label: 'Multiple Locations', desc: 'Chain or franchise' },
];

interface BusinessCategoryScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}

export default function BusinessCategoryScreen({ navigation, route }: BusinessCategoryScreenProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState('');
  const [locationsMode, setLocationsMode] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const visibleCategories = ALL_CATEGORIES.slice(0, visibleCount);
  const hasMoreCategories = visibleCount < ALL_CATEGORIES.length;

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
      {/* Header with Progress Bar - Pro Business flow step 1/4 */}
      <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={1} totalSteps={3} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.titleBox}>
          <Text style={styles.title}>Business Type</Text>
          <Text style={styles.subtitle}>What kind of business do you have?</Text>
        </View>

        {/* Categories Grid */}
        <View style={styles.grid}>
          {visibleCategories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            if (isSelected) {
              return (
                <LinearGradient
                  key={cat.id}
                  colors={GRADIENTS.button}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.categoryCardGradient}
                >
                  <TouchableOpacity
                    style={styles.categoryCardInner}
                    onPress={() => setSelectedCategory(cat.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.categoryIcon, { backgroundColor: `${cat.color}15` }]}>
                      <Ionicons name={cat.icon as any} size={26} color={cat.color} />
                    </View>
                    <Text style={styles.categoryLabel}>
                      {cat.label}
                    </Text>
                    <View style={styles.checkBadge}>
                      <Ionicons name="checkmark" size={10} color={COLORS.white} />
                    </View>
                  </TouchableOpacity>
                </LinearGradient>
              );
            }
            return (
              <TouchableOpacity
                key={cat.id}
                style={styles.categoryCard}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.categoryIcon, { backgroundColor: `${cat.color}15` }]}>
                  <Ionicons name={cat.icon as any} size={26} color={cat.color} />
                </View>
                <Text style={styles.categoryLabel}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Other Card */}
          {selectedCategory === 'other' ? (
            <LinearGradient
              colors={GRADIENTS.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.categoryCardGradient}
            >
              <TouchableOpacity
                style={styles.categoryCardInner}
                onPress={() => setSelectedCategory('other')}
                activeOpacity={0.7}
              >
                <View style={[styles.categoryIcon, { backgroundColor: '#607D8B15' }]}>
                  <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color="#607D8B" />
                </View>
                <Text style={styles.categoryLabel}>Other</Text>
                <View style={styles.checkBadge}>
                  <Ionicons name="checkmark" size={10} color={COLORS.white} />
                </View>
              </TouchableOpacity>
            </LinearGradient>
          ) : (
            <TouchableOpacity
              style={styles.categoryCard}
              onPress={() => setSelectedCategory('other')}
              activeOpacity={0.7}
            >
              <View style={[styles.categoryIcon, { backgroundColor: '#607D8B15' }]}>
                <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color="#607D8B" />
              </View>
              <Text style={styles.categoryLabel}>Other</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Explore More Button */}
        {hasMoreCategories && (
          <TouchableOpacity
            style={styles.exploreMoreBtn}
            onPress={() => setVisibleCount(prev => Math.min(prev + EXPAND_BY, ALL_CATEGORIES.length))}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
            <Text style={styles.exploreMoreText}>Explore more ({ALL_CATEGORIES.length - visibleCount} more)</Text>
          </TouchableOpacity>
        )}

        {/* Custom Category Input */}
        {selectedCategory === 'other' && (
          <View style={styles.customInputBox}>
            <LinearGradient
              colors={(customCategory.length > 0 || focusedField === 'customCategory') ? GRADIENTS.button : GRADIENTS.buttonDisabled}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.inputGradientBorder}
            >
              <View style={[styles.inputInner, customCategory.length > 0 && styles.inputInnerValid]}>
                <TextInput
                  style={styles.input}
                  placeholder="Specify your business type..."
                  placeholderTextColor={COLORS.grayMuted}
                  value={customCategory}
                  onChangeText={setCustomCategory}
                  onFocus={() => setFocusedField('customCategory')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="words"
                />
              </View>
            </LinearGradient>
          </View>
        )}

        {/* Locations Mode */}
        <View style={styles.locationSection}>
          <Text style={styles.sectionTitle}>Number of Locations</Text>
          <View style={styles.locationRow}>
            {LOCATIONS_MODES.map((mode) => {
              const isSelected = locationsMode === mode.id;
              if (isSelected) {
                return (
                  <LinearGradient
                    key={mode.id}
                    colors={GRADIENTS.button}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.locationCardGradient}
                  >
                    <TouchableOpacity
                      style={styles.locationCardInner}
                      onPress={() => setLocationsMode(mode.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.radio, styles.radioActive]}>
                        <View style={styles.radioInner} />
                      </View>
                      <View style={styles.locationTextBox}>
                        <Text style={styles.locationLabel}>{mode.label}</Text>
                        <Text style={styles.locationDesc}>{mode.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  </LinearGradient>
                );
              }
              return (
                <TouchableOpacity
                  key={mode.id}
                  style={styles.locationCard}
                  onPress={() => setLocationsMode(mode.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.radio}>
                    {isSelected && <View style={styles.radioInner} />}
                  </View>
                  <View style={styles.locationTextBox}>
                    <Text style={styles.locationLabel}>{mode.label}</Text>
                    <Text style={styles.locationDesc}>{mode.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Button - Fixed at bottom */}
      <View style={styles.bottomSection}>
        <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" disabled={!isFormValid || disabled} onPress={handleNext}>
          Next
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl },

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
  categoryCardGradient: {
    width: '31%',
    borderRadius: SIZES.radiusLg,
    padding: 2,
    marginBottom: SPACING.sm,
  },
  categoryCardInner: {
    flex: 1,
    paddingVertical: SPACING.md - 2,
    paddingHorizontal: SPACING.xs,
    borderRadius: SIZES.radiusLg - 2,
    alignItems: 'center',
    backgroundColor: COLORS.backgroundValid,
  },
  categoryIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xs },
  categoryLabel: { fontSize: 11, fontWeight: '600', color: COLORS.dark, textAlign: 'center' },
  checkBadge: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.primary },

  // Explore more
  exploreMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    borderStyle: 'dashed',
    marginBottom: SPACING.sm,
    gap: 6,
  },
  exploreMoreText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // Custom Input
  customInputBox: { marginBottom: SPACING.md },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2 },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: COLORS.backgroundValid },
  input: { flex: 1, ...TYPOGRAPHY.body, fontSize: 14 },

  // Locations
  locationSection: { marginTop: SPACING.xs },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.dark, marginBottom: SPACING.sm },
  locationRow: { gap: SPACING.xs },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
    borderRadius: SIZES.radiusLg,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.xs,
  },
  locationCardGradient: { borderRadius: SIZES.radiusLg, padding: 2, marginBottom: SPACING.xs },
  locationCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md - 2,
    paddingHorizontal: SPACING.base - 2,
    borderRadius: SIZES.radiusLg - 2,
    backgroundColor: COLORS.backgroundValid,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center', marginRight: SPACING.sm },
  radioActive: { borderColor: COLORS.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  locationTextBox: { flex: 1 },
  locationLabel: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  locationDesc: { fontSize: 11, color: COLORS.grayMuted, marginTop: 1 },

  // Bottom
  bottomSection: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm, paddingTop: SPACING.sm },
});
