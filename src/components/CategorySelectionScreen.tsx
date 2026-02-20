/**
 * Shared Category Selection Screen
 * Used by InterestsScreen and ExpertiseScreen — eliminates ~200 lines of duplication.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SPACING, GRADIENTS, SIZES } from '../config/theme';
import type { CategoryConfig } from '../config/category-types';
import Button from './Button';
import OnboardingHeader from './OnboardingHeader';
import { usePreventDoubleNavigation } from '../hooks/usePreventDoubleClick';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

const INITIAL_CATEGORIES = 4;
const EXPAND_BY = 4;

type CategorySelectionScreenProps = Readonly<{
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
  /** All available categories */
  allCategories: CategoryConfig[];
  /** Title displayed at the top */
  title: string;
  /** Subtitle displayed below the title */
  subtitle: string;
  /** Optional info text displayed below subtitle */
  infoText?: string;
  /** Current onboarding step number */
  currentStep: number;
  /** Total onboarding steps */
  totalSteps: number;
  /** Key used to pass selections to the next screen (e.g. 'interests' or 'expertise') */
  paramKey: string;
  /** Next screen name to navigate to */
  nextScreen: string;
  /** Style variant — minor differences between interest and expertise screens */
  variant?: 'interests' | 'expertise';
}>;

export default function CategorySelectionScreen({
  navigation,
  route,
  allCategories,
  title,
  subtitle,
  infoText,
  currentStep,
  totalSteps,
  paramKey,
  nextScreen,
  variant = 'interests',
}: CategorySelectionScreenProps) {
  const { colors, isDark } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_CATEGORIES);

  const params = useMemo(() => route?.params || {}, [route?.params]);
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const toggle = useCallback((itemName: string) => {
    setSelected(prev =>
      prev.includes(itemName) ? prev.filter(i => i !== itemName) : [...prev, itemName]
    );
  }, []);

  const handleContinue = useCallback(() => {
    navigate(nextScreen, { ...params, [paramKey]: selected });
  }, [navigate, nextScreen, params, paramKey, selected]);

  const handleSkip = useCallback(() => {
    navigate(nextScreen, { ...params, [paramKey]: [] });
  }, [navigate, nextScreen, params, paramKey]);

  const handleExploreMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + EXPAND_BY, allCategories.length));
  }, [allCategories.length]);

  const visibleCategories = useMemo(() =>
    allCategories.slice(0, visibleCount),
    [allCategories, visibleCount]
  );

  const hasMoreCategories = visibleCount < allCategories.length;

  const styles = useMemo(() => createStyles(colors, isDark, variant), [colors, isDark, variant]);

  const chipContent = useCallback((icon: string, color: string, name: string) => (
    <>
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={16} color={color} />
      <Text style={styles.chipText}>{name}</Text>
    </>
  ), [styles.chipText]);

  const renderChip = useCallback((item: { name: string; icon: string; color: string }, isSelected: boolean) => {
    const inner = chipContent(item.icon, item.color, item.name);
    if (isSelected) {
      return (
        <TouchableOpacity
          key={item.name}
          onPress={() => toggle(item.name)}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={GRADIENTS.button}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chipGradientBorder}
          >
            <View style={styles.chipSelectedInner}>
              {inner}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        key={item.name}
        style={styles.chip}
        onPress={() => toggle(item.name)}
        activeOpacity={0.7}
      >
        {inner}
      </TouchableOpacity>
    );
  }, [toggle, chipContent, styles.chip, styles.chipGradientBorder, styles.chipSelectedInner]);

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={currentStep} totalSteps={totalSteps} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {infoText && <Text style={styles.infoText}>{infoText}</Text>}
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {visibleCategories.map((section) => {
          const selectedInCategory = section.items.filter(item => selected.includes(item.name)).length;

          return (
            <View key={section.category} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: `${section.color}15` }]}>
                  <Ionicons name={section.icon as keyof typeof Ionicons.glyphMap} size={18} color={section.color} />
                </View>
                <Text style={styles.sectionTitle}>
                  {section.category}
                  {selectedInCategory > 0 && (
                    <Text style={styles.sectionCount}> ({selectedInCategory})</Text>
                  )}
                </Text>
              </View>

              <View style={styles.itemsGrid}>
                {section.items.map((item) => renderChip(item, selected.includes(item.name)))}
              </View>
            </View>
          );
        })}

        {hasMoreCategories && (
          <TouchableOpacity
            style={styles.exploreMoreBtn}
            onPress={handleExploreMore}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.exploreMoreText, { color: colors.primary }]}>
              Explore more ({allCategories.length - visibleCount} more categories)
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          icon="arrow-forward"
          iconPosition="right"
          disabled={selected.length === 0 || disabled}
          onPress={handleContinue}
        >
          Continue
        </Button>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} disabled={disabled}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean, variant: 'interests' | 'expertise') => {
  const isExpertise = variant === 'expertise';
  const borderColor = isExpertise ? colors.grayLight : colors.border;
  const chipBg = isExpertise ? colors.background : colors.cardBg;
  const selectedBg = isExpertise
    ? (isDark ? colors.primaryDark : '#E8FAF7')
    : (isDark ? colors.backgroundFocus : '#E8FAF7');

  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.md },
    title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: colors.dark, marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.grayMuted },
    infoText: { fontSize: 13, color: colors.primary, marginTop: 8, fontWeight: '500' },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },
    section: { marginBottom: SPACING.lg },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: borderColor,
    },
    sectionIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.dark },
    sectionCount: { fontSize: 14, fontWeight: '600', color: colors.primary },
    itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingTop: SPACING.md },
    chip: {
      height: 36,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      backgroundColor: chipBg,
      borderWidth: 1.5,
      borderColor,
      borderRadius: 18,
      gap: 6,
    },
    chipGradientBorder: { height: 36, borderRadius: 18, padding: 1.5 },
    chipSelectedInner: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12.5,
      borderRadius: 16.5,
      backgroundColor: selectedBg,
      gap: 6,
    },
    chipText: { fontSize: 13, fontWeight: '500', color: colors.dark },
    exploreMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      backgroundColor: `${colors.primary}10`,
      borderRadius: SIZES.radiusMd,
      borderWidth: 1,
      borderColor: `${colors.primary}30`,
      borderStyle: 'dashed',
      marginTop: SPACING.md,
      gap: SPACING.sm,
    },
    exploreMoreText: { fontSize: 15, fontWeight: '600' },
    footer: {
      paddingHorizontal: SPACING.xl,
      paddingBottom: SPACING.md,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: borderColor,
    },
    skipBtn: { alignItems: 'center', paddingVertical: SPACING.md },
    skipText: { fontSize: 14, color: colors.grayMuted },
  });
};
