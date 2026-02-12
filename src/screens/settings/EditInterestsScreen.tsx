import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GRADIENTS } from '../../config/theme';
import { ALL_INTERESTS } from '../../config/interests';
import { useUpdateProfile, useCurrentProfile } from '../../hooks/queries';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';

import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface EditInterestsScreenProps {
  navigation: { goBack: () => void };
  route: { params?: { currentInterests?: string[] } };
}

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
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={16} color={item.color} />
              <Text style={styles.chipText}>{item.name}</Text>
              <Ionicons name="close" size={14} color={colors.gray} style={{ marginLeft: 2 }} />
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
        <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={16} color={item.color} />
        <Text style={styles.chipText}>{item.name}</Text>
      </TouchableOpacity>
    );
  }, [toggle, styles, colors.gray]);

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
                {section.items.map((item) => renderChip(item, selected.includes(item.name)))}
              </View>
            </View>
          );
        })}

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
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
    backgroundColor: isDark ? colors.backgroundSecondary : colors.white,
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
});
