import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALL_BUSINESS_CATEGORIES } from '../../config/businessCategories';
import { useUpdateProfile, useCurrentProfile } from '../../hooks/queries';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme } from '../../hooks/useTheme';
import { SelectChip } from '../../components/settings/SelectChip';
import { createSelectListStyles } from '../../components/settings/selectListStyles';

type EditBusinessCategoryScreenProps = Readonly<{
  navigation: { goBack: () => void };
  route: { params?: { currentCategory?: string } };
}>;

export default function EditBusinessCategoryScreen({ navigation, route }: EditBusinessCategoryScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const { data: profileData, refetch } = useCurrentProfile();
  const user = useUserStore((state) => state.user);
  const updateLocalProfile = useUserStore((state) => state.updateProfile);

  const initialCategory = route?.params?.currentCategory
    || profileData?.business_category
    || user?.businessCategory
    || '';

  const [selected, setSelected] = useState<string>(initialCategory);
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = useMemo(() => {
    const current = profileData?.business_category || user?.businessCategory || '';
    return selected !== current;
  }, [selected, profileData?.business_category, user?.businessCategory]);

  const handleSave = async () => {
    if (isSaving || !selected) return;

    setIsSaving(true);
    try {
      await updateDbProfile({ business_category: selected });
      updateLocalProfile({ businessCategory: selected });
      await refetch();
      navigation.goBack();
    } catch (_error: unknown) {
      showError('Error', 'Failed to save business category. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const styles = useMemo(() => createSelectListStyles(colors, isDark), [colors, isDark]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Category</Text>
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

      {/* Info */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>
          {selected ? ALL_BUSINESS_CATEGORIES.find(c => c.id === selected)?.label || selected : 'No category selected'}
        </Text>
        <Text style={styles.hintText}>
          Tap to change your business category
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.itemsGrid}>
          {ALL_BUSINESS_CATEGORIES.map((item) => (
            <SelectChip
              key={item.id}
              label={item.label}
              icon={item.icon}
              iconColor={item.color}
              selected={selected === item.id}
              onPress={() => setSelected(item.id)}
              size="md"
              selectedIndicator="checkmark"
              colors={colors}
              isDark={isDark}
            />
          ))}
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}
