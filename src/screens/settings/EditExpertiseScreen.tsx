import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALL_EXPERTISE } from '../../config/expertise';
import { ALL_BUSINESS_CATEGORIES } from '../../config/businessCategories';
import { useUpdateProfile, useCurrentProfile } from '../../hooks/queries';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { SelectChip } from '../../components/settings/SelectChip';
import { createSelectListStyles } from '../../components/settings/selectListStyles';

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

  const sharedStyles = useMemo(() => createSelectListStyles(colors, isDark), [colors, isDark]);
  const localStyles = useMemo(() => createLocalStyles(colors, isDark), [colors, isDark]);

  const totalSelected = selected.length + (selectedCategory ? 1 : 0);

  return (
    <View style={[sharedStyles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={sharedStyles.header}>
        <TouchableOpacity style={sharedStyles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={sharedStyles.headerTitle}>
          {showBizCategories ? 'Category & Expertise' : 'Edit Expertise'}
        </Text>
        <TouchableOpacity
          style={[sharedStyles.saveButton, (!hasChanges || isSaving) && sharedStyles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={[sharedStyles.saveButtonText, (!hasChanges || isSaving) && sharedStyles.saveButtonTextDisabled]}>
              Save
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Info banner */}
      <View style={localStyles.infoBanner}>
        <Ionicons name="information-circle" size={20} color={colors.cyan} />
        <Text style={localStyles.infoBannerText}>
          {showBizCategories
            ? 'Select your business category and areas of expertise to personalize your Vibes feed and help clients find you.'
            : 'Select your areas of expertise to personalize your Vibes feed and help others find you.'}
        </Text>
      </View>

      {/* Selected count */}
      <View style={sharedStyles.countContainer}>
        <Text style={sharedStyles.countText}>
          {totalSelected} area{totalSelected !== 1 ? 's' : ''} selected
        </Text>
        <Text style={sharedStyles.hintText}>
          Tap to add or remove {showBizCategories ? 'categories & expertise' : 'expertise areas'}
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView style={sharedStyles.scrollView} contentContainerStyle={sharedStyles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Business Categories section (first, single-select) */}
        {showBizCategories && (
          <View style={sharedStyles.section}>
            <View style={sharedStyles.sectionHeader}>
              <View style={[sharedStyles.sectionIcon, { backgroundColor: 'rgba(30, 144, 255, 0.15)' }]}>
                <Ionicons name="storefront-outline" size={18} color="#1E90FF" />
              </View>
              <Text style={sharedStyles.sectionTitle}>
                Business Category
                {selectedCategory && (
                  <Text style={sharedStyles.sectionCount}> (1)</Text>
                )}
              </Text>
            </View>
            <View style={sharedStyles.itemsGrid}>
              {BUSINESS_CATEGORY_ITEMS.map((item) => (
                <SelectChip
                  key={item.name}
                  label={item.label}
                  icon={item.icon}
                  iconColor={item.color}
                  selected={selectedCategory === item.name}
                  onPress={() => toggleCategory(item.name)}
                  colors={colors}
                  isDark={isDark}
                />
              ))}
            </View>
          </View>
        )}

        {/* Expertise sections */}
        {ALL_EXPERTISE.map((section) => {
          const selectedInCategory = section.items.filter(item => selected.includes(item.name)).length;

          return (
            <View key={section.category} style={sharedStyles.section}>
              {/* Category header with count */}
              <View style={sharedStyles.sectionHeader}>
                <View style={[sharedStyles.sectionIcon, { backgroundColor: `${section.color}15` }]}>
                  <Ionicons name={section.icon as keyof typeof Ionicons.glyphMap} size={18} color={section.color} />
                </View>
                <Text style={sharedStyles.sectionTitle}>
                  {section.category}
                  {selectedInCategory > 0 && (
                    <Text style={sharedStyles.sectionCount}> ({selectedInCategory})</Text>
                  )}
                </Text>
              </View>

              {/* Items grid */}
              <View style={sharedStyles.itemsGrid}>
                {section.items.map((item) => (
                  <SelectChip
                    key={item.name}
                    label={item.name}
                    icon={item.icon}
                    iconColor={item.color}
                    selected={selected.includes(item.name)}
                    onPress={() => toggle(item.name)}
                    colors={colors}
                    isDark={isDark}
                  />
                ))}
              </View>
            </View>
          );
        })}

        {/* Bottom spacer */}
        <View style={sharedStyles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

/** Styles specific to EditExpertiseScreen (info banner). */
const createLocalStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
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
  });
