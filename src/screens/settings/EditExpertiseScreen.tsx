import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GRADIENTS } from '../../config/theme';
import { ALL_EXPERTISE } from '../../config/expertise';
import { ALL_BUSINESS_CATEGORIES } from '../../config/businessCategories';
import { useUpdateProfile, useCurrentProfile } from '../../hooks/queries';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface EditExpertiseScreenProps {
  navigation: { goBack: () => void };
  route: { params?: { currentExpertise?: string[]; includeBusinessCategories?: boolean } };
}

// Convert business categories to chip-compatible items
const BUSINESS_CATEGORY_ITEMS = ALL_BUSINESS_CATEGORIES.map(cat => ({
  name: cat.id,
  label: cat.label,
  icon: cat.icon,
  color: cat.color,
}));

export default function EditExpertiseScreen({ navigation, route }: EditExpertiseScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const { data: profileData, refetch } = useCurrentProfile();
  const user = useUserStore((state) => state.user);
  const updateLocalProfile = useUserStore((state) => state.updateProfile);

  const includeBusinessCategories = route?.params?.includeBusinessCategories === true;
  const isBusiness = user?.accountType === 'pro_business';
  const showBizCategories = includeBusinessCategories || isBusiness;

  // Load expertise from route params, profile data, or user context
  const initialExpertise = route?.params?.currentExpertise
    || profileData?.expertise
    || user?.expertise
    || [];

  const [selected, setSelected] = useState<string[]>(initialExpertise);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    profileData?.business_category || user?.businessCategory || null
  );
  const [isSaving, setIsSaving] = useState(false);

  // Sync with profile data when it loads
  useEffect(() => {
    const expertise = profileData?.expertise || user?.expertise || [];
    if (expertise.length > 0 && selected.length === 0) {
      setSelected(expertise);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData, user?.expertise]);

  useEffect(() => {
    if (showBizCategories) {
      const category = profileData?.business_category || user?.businessCategory || null;
      if (category && !selectedCategory) {
        setSelectedCategory(category);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData?.business_category, user?.businessCategory, showBizCategories]);

  const hasChanges = useMemo(() => {
    const currentExpertise = profileData?.expertise || user?.expertise || [];
    const expertiseChanged = selected.length !== currentExpertise.length
      || !selected.every(item => currentExpertise.includes(item));

    if (showBizCategories) {
      const currentCategory = profileData?.business_category || user?.businessCategory || null;
      const categoryChanged = selectedCategory !== currentCategory;
      return expertiseChanged || categoryChanged;
    }

    return expertiseChanged;
  }, [selected, selectedCategory, profileData?.expertise, profileData?.business_category, user?.expertise, user?.businessCategory, showBizCategories]);

  const toggle = useCallback((itemName: string) => {
    setSelected(prev =>
      prev.includes(itemName) ? prev.filter(i => i !== itemName) : [...prev, itemName]
    );
  }, []);

  const toggleCategory = useCallback((categoryId: string) => {
    setSelectedCategory(prev => prev === categoryId ? null : categoryId);
  }, []);

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const updates: Record<string, unknown> = { expertise: selected };
      if (showBizCategories && selectedCategory !== undefined) {
        updates.business_category = selectedCategory;
      }

      await updateDbProfile(updates);

      const localUpdates: Record<string, unknown> = { expertise: selected };
      if (showBizCategories && selectedCategory !== undefined) {
        localUpdates.businessCategory = selectedCategory;
      }
      updateLocalProfile(localUpdates);

      await refetch();
      navigation.goBack();
    } catch (_error: unknown) {
      showError('Error', 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const renderChip = useCallback((item: { name: string; icon: string; color: string }, isSelected: boolean, onPress: () => void) => {
    if (isSelected) {
      return (
        <TouchableOpacity
          key={item.name}
          onPress={onPress}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={GRADIENTS.button}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chipGradientBorder}
          >
            <View style={styles.chipSelectedInner}>
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={16} color={item.color} />
              <Text style={styles.chipText}>{item.name}</Text>
              <Ionicons name="close" size={14} color={colors.gray} style={styles.chipCloseIcon} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        key={item.name}
        style={styles.chip}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={16} color={item.color} />
        <Text style={styles.chipText}>{item.name}</Text>
      </TouchableOpacity>
    );
  }, [styles, colors]);

  const totalSelected = selected.length + (selectedCategory ? 1 : 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {showBizCategories ? 'Category & Expertise' : 'Edit Expertise'}
        </Text>
        <TouchableOpacity
          style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={[styles.saveButtonText, (!hasChanges || isSaving) && styles.saveButtonTextDisabled]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color={colors.cyan} />
        <Text style={styles.infoBannerText}>
          {showBizCategories
            ? 'Select your business category and areas of expertise to personalize your Vibes feed and help clients find you.'
            : 'Select your areas of expertise to personalize your Vibes feed and help others find you.'}
        </Text>
      </View>

      {/* Selected count */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>
          {totalSelected} area{totalSelected !== 1 ? 's' : ''} selected
        </Text>
        <Text style={styles.hintText}>
          Tap to add or remove {showBizCategories ? 'categories & expertise' : 'expertise areas'}
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Business Categories section (first, single-select) */}
        {showBizCategories && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: 'rgba(30, 144, 255, 0.15)' }]}>
                <Ionicons name="storefront-outline" size={18} color="#1E90FF" />
              </View>
              <Text style={styles.sectionTitle}>
                Business Category
                {selectedCategory && (
                  <Text style={styles.sectionCount}> (1)</Text>
                )}
              </Text>
            </View>
            <View style={styles.itemsGrid}>
              {BUSINESS_CATEGORY_ITEMS.map((item) =>
                renderChip(
                  { name: item.label, icon: item.icon, color: item.color },
                  selectedCategory === item.name,
                  () => toggleCategory(item.name),
                )
              )}
            </View>
          </View>
        )}

        {/* Expertise sections */}
        {ALL_EXPERTISE.map((section) => {
          const selectedInCategory = section.items.filter(item => selected.includes(item.name)).length;

          return (
            <View key={section.category} style={styles.section}>
              {/* Category header with count */}
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

              {/* Items grid */}
              <View style={styles.itemsGrid}>
                {section.items.map((item) => renderChip(item, selected.includes(item.name), () => toggle(item.name)))}
              </View>
            </View>
          );
        })}

        {/* Bottom spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  saveButton: {
    backgroundColor: colors.primaryGreen,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: isDark ? colors.darkGray : colors.grayLight,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  saveButtonTextDisabled: {
    color: colors.grayMuted,
  },

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: isDark ? 'rgba(8, 145, 178, 0.15)' : '#ECFEFF',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: colors.cyan,
    lineHeight: 18,
  },

  // Count
  countContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  countText: {
    fontSize: 14,
    color: colors.grayMuted,
  },
  hintText: {
    fontSize: 12,
    color: isDark ? colors.gray : '#8E8E93',
    marginTop: 4,
  },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

  // Section
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  sectionIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.dark },
  sectionCount: { fontSize: 14, fontWeight: '600', color: colors.primaryGreen },

  // Items grid
  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 12 },

  // Chips
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.grayBorder,
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
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : '#E6FAF8',
    gap: 6,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.dark,
  },
  chipCloseIcon: { marginLeft: 2 },
  bottomSpacer: { height: 40 },
});
