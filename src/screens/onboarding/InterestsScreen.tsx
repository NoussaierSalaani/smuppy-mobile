import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SPACING, GRADIENTS, SIZES } from '../../config/theme';
import { ALL_INTERESTS } from '../../config/interests';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const INITIAL_CATEGORIES = 4;
const EXPAND_BY = 4;

interface InterestsScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}

export default function InterestsScreen({ navigation, route }: InterestsScreenProps) {
  const { colors, isDark } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_CATEGORIES);

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const toggle = useCallback((itemName: string) => {
    setSelected(prev =>
      prev.includes(itemName) ? prev.filter(i => i !== itemName) : [...prev, itemName]
    );
  }, []);

  const handleContinue = useCallback(() => {
    navigate('Guidelines', { ...params, interests: selected });
  }, [navigate, params, selected]);

  const handleSkip = useCallback(() => {
    navigate('Guidelines', { ...params, interests: [] });
  }, [navigate, params]);

  const handleExploreMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + EXPAND_BY, ALL_INTERESTS.length));
  }, []);

  const visibleCategories = useMemo(() =>
    ALL_INTERESTS.slice(0, visibleCount),
    [visibleCount]
  );

  const hasMoreCategories = visibleCount < ALL_INTERESTS.length;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const renderChip = useCallback((item: { name: string; icon: string; color: string }, isSelected: boolean) => {
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
              <Ionicons name={item.icon as any} size={16} color={item.color} />
              <Text style={styles.chipText}>{item.name}</Text>
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
        <Ionicons name={item.icon as any} size={16} color={item.color} />
        <Text style={styles.chipText}>{item.name}</Text>
      </TouchableOpacity>
    );
  }, [toggle]);

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={2} totalSteps={3} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>Select your interests to personalize your feed</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {visibleCategories.map((section) => {
          const selectedInCategory = section.items.filter(item => selected.includes(item.name)).length;

          return (
            <View key={section.category} style={styles.section}>
              {/* Category header with count */}
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionIcon, { backgroundColor: `${section.color}15` }]}>
                  <Ionicons name={section.icon as any} size={18} color={section.color} />
                </View>
                <Text style={styles.sectionTitle}>
                  {section.category}
                  {selectedInCategory > 0 && (
                    <Text style={styles.sectionCount}> ({selectedInCategory})</Text>
                  )}
                </Text>
              </View>

              {/* Items grid */}
              <View style={styles.itemsGrid}>
                {section.items.map((item) => renderChip(item, selected.includes(item.name)))}
              </View>
            </View>
          );
        })}

        {/* Explore More Button - only if more categories available */}
        {hasMoreCategories && (
          <TouchableOpacity
            style={styles.exploreMoreBtn}
            onPress={handleExploreMore}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
            <Text style={[styles.exploreMoreText, { color: colors.primary }]}>
              Explore more ({ALL_INTERESTS.length - visibleCount} more categories)
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

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.md },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: colors.dark, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.grayMuted },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },

  // Section
  section: { marginBottom: SPACING.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  sectionIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.dark },
  sectionCount: { fontSize: 14, fontWeight: '600', color: colors.primary },

  // Items grid
  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingTop: SPACING.md },

  // Chips
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.cardBg,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    gap: 6,
  },
  chipGradientBorder: {
    height: 36,
    borderRadius: 18,
    padding: 1.5,
  },
  chipSelectedInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12.5,
    borderRadius: 16.5,
    backgroundColor: isDark ? colors.backgroundFocus : '#E8FAF7',
    gap: 6,
  },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.dark },

  // Explore more button
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

  // Footer
  footer: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: colors.border },
  skipBtn: { alignItems: 'center', paddingVertical: SPACING.md },
  skipText: { fontSize: 14, color: colors.grayMuted },
});
