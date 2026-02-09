import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GRADIENTS } from '../../config/theme';
import { ALL_BUSINESS_CATEGORIES } from '../../config/businessCategories';
import { useUpdateProfile, useCurrentProfile } from '../../hooks';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface EditBusinessCategoryScreenProps {
  navigation: { goBack: () => void };
  route: { params?: { currentCategory?: string } };
}

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
    || profileData?.business_category
    || user?.businessCategory
    || '';

  const [selected, setSelected] = useState<string>(initialCategory);
  const [isSaving, setIsSaving] = useState(false);

  const hasChanges = useMemo(() => {
    const current = profileData?.business_category || profileData?.business_category || user?.businessCategory || '';
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

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const renderItem = useCallback((item: { id: string; icon: string; label: string; color: string }) => {
    const isSelected = selected === item.id;
    if (isSelected) {
      return (
        <TouchableOpacity
          key={item.id}
          onPress={() => setSelected(item.id)}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={GRADIENTS.button}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.chipGradientBorder}
          >
            <View style={styles.chipSelectedInner}>
              <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={18} color={item.color} />
              <Text style={styles.chipText}>{item.label}</Text>
              <Ionicons name="checkmark-circle" size={16} color={colors.primaryGreen} style={styles.chipCheckIcon} />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.chip}
        onPress={() => setSelected(item.id)}
        activeOpacity={0.7}
      >
        <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={18} color={item.color} />
        <Text style={styles.chipText}>{item.label}</Text>
      </TouchableOpacity>
    );
  }, [selected, styles, colors.primaryGreen]);

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
          {ALL_BUSINESS_CATEGORIES.map(renderItem)}
        </View>
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

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

  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 12 },

  chip: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: isDark ? colors.backgroundSecondary : colors.white,
    borderWidth: 1.5,
    borderColor: colors.grayBorder,
    borderRadius: 20,
    gap: 8,
  },
  chipGradientBorder: {
    height: 40,
    borderRadius: 20,
    padding: 1.5,
  },
  chipSelectedInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12.5,
    borderRadius: 18.5,
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : '#E6FAF8',
    gap: 8,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.dark,
  },
  chipCheckIcon: { marginLeft: 2 },
  bottomSpacer: { height: 40 },
});
