import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ALL_INTERESTS } from '../../config/interests';
import { useUpdateProfile, useCurrentProfile } from '../../hooks/queries';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme } from '../../hooks/useTheme';
import { SelectChip } from '../../components/settings/SelectChip';
import { createSelectListStyles } from '../../components/settings/selectListStyles';

type EditInterestsScreenProps = Readonly<{
  navigation: { goBack: () => void };
  route: { params?: { currentInterests?: string[] } };
}>;

export default function EditInterestsScreen({ navigation, route }: EditInterestsScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const { data: profileData, refetch } = useCurrentProfile();
  const user = useUserStore((state) => state.user);
  const updateLocalProfile = useUserStore((state) => state.updateProfile);

  // Load interests from route params, profile data, or user context
  const initialInterests = route?.params?.currentInterests
    || profileData?.interests
    || user?.interests
    || [];

  const [selected, setSelected] = useState<string[]>(initialInterests);
  const [isSaving, setIsSaving] = useState(false);

  // Sync with profile data when it loads
  useEffect(() => {
    const interests = profileData?.interests || user?.interests || [];
    if (interests.length > 0 && selected.length === 0) {
      setSelected(interests);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData, user?.interests]);

  const hasChanges = useMemo(() => {
    const currentInterests = profileData?.interests || user?.interests || [];
    if (selected.length !== currentInterests.length) return true;
    return !selected.every(item => currentInterests.includes(item));
  }, [selected, profileData?.interests, user?.interests]);

  const toggle = useCallback((itemName: string) => {
    setSelected(prev =>
      prev.includes(itemName) ? prev.filter(i => i !== itemName) : [...prev, itemName]
    );
  }, []);

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      // Save to AWS
      await updateDbProfile({ interests: selected });

      // Update local store
      updateLocalProfile({ interests: selected });

      // Refresh profile data
      await refetch();

      navigation.goBack();
    } catch (_error: unknown) {
      showError('Error', 'Failed to save interests. Please try again.');
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
        <Text style={styles.headerTitle}>Edit Interests</Text>
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

      {/* Selected count */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>
          {selected.length} interest{selected.length !== 1 ? 's' : ''} selected
        </Text>
        <Text style={styles.hintText}>
          Tap to add or remove interests
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {ALL_INTERESTS.map((section) => {
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
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}
