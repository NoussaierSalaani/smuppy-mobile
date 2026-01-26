import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS } from '../../config/theme';
import { useUpdateProfile, useCurrentProfile } from '../../hooks';
import { useUserStore } from '../../stores';

// Same interests list as onboarding
const ALL_INTERESTS = [
  {
    category: 'Sports',
    icon: 'football',
    color: '#FF6B35',
    items: [
      { name: 'Football', icon: 'football', color: '#8B4513' },
      { name: 'Basketball', icon: 'basketball', color: '#FF6B35' },
      { name: 'Tennis', icon: 'tennisball', color: '#C5E063' },
      { name: 'Swimming', icon: 'water', color: '#0099CC' },
      { name: 'Running', icon: 'walk', color: '#FF5722' },
      { name: 'Cycling', icon: 'bicycle', color: '#E63946' },
      { name: 'Golf', icon: 'golf', color: '#228B22' },
      { name: 'Volleyball', icon: 'basketball-outline', color: '#FFC107' },
    ]
  },
  {
    category: 'Fitness',
    icon: 'barbell',
    color: '#1E90FF',
    items: [
      { name: 'Gym', icon: 'barbell', color: '#1E90FF' },
      { name: 'CrossFit', icon: 'fitness', color: '#FF4500' },
      { name: 'Weightlifting', icon: 'barbell-outline', color: '#2F4F4F' },
      { name: 'Cardio', icon: 'heart', color: '#FF1493' },
      { name: 'HIIT', icon: 'flash', color: '#FF6347' },
      { name: 'Calisthenics', icon: 'body', color: '#20B2AA' },
      { name: 'Pilates', icon: 'fitness-outline', color: '#E91E63' },
      { name: 'Stretching', icon: 'resize', color: '#8BC34A' },
    ]
  },
  {
    category: 'Wellness',
    icon: 'leaf',
    color: '#27AE60',
    items: [
      { name: 'Yoga', icon: 'body', color: '#9B59B6' },
      { name: 'Meditation', icon: 'leaf', color: '#27AE60' },
      { name: 'Nutrition', icon: 'nutrition', color: '#FF9800' },
      { name: 'Spa & Recovery', icon: 'sparkles', color: '#00BCD4' },
      { name: 'Mental Health', icon: 'happy', color: '#607D8B' },
      { name: 'Sleep', icon: 'moon', color: '#3F51B5' },
      { name: 'Mindfulness', icon: 'flower', color: '#E91E63' },
      { name: 'Breathwork', icon: 'cloudy', color: '#00ACC1' },
    ]
  },
  {
    category: 'Outdoor',
    icon: 'trail-sign',
    color: '#5D4037',
    items: [
      { name: 'Hiking', icon: 'trail-sign', color: '#5D4037' },
      { name: 'Climbing', icon: 'trending-up', color: '#795548' },
      { name: 'Surfing', icon: 'water', color: '#0288D1' },
      { name: 'Skiing', icon: 'snow', color: '#42A5F5' },
      { name: 'Camping', icon: 'bonfire', color: '#FF7043' },
      { name: 'Trail Running', icon: 'walk', color: '#4CAF50' },
      { name: 'Mountain Biking', icon: 'bicycle', color: '#795548' },
      { name: 'Kayaking', icon: 'boat', color: '#00897B' },
    ]
  },
  {
    category: 'Combat Sports',
    icon: 'flash',
    color: '#D32F2F',
    items: [
      { name: 'Boxing', icon: 'fitness', color: '#DC143C' },
      { name: 'MMA', icon: 'fitness', color: '#D32F2F' },
      { name: 'Judo', icon: 'body', color: '#1976D2' },
      { name: 'Karate', icon: 'hand-right', color: '#F57C00' },
      { name: 'Taekwondo', icon: 'flash', color: '#7B1FA2' },
      { name: 'BJJ', icon: 'body-outline', color: '#388E3C' },
      { name: 'Kickboxing', icon: 'fitness-outline', color: '#E64A19' },
      { name: 'Muay Thai', icon: 'flash-outline', color: '#FF5722' },
    ]
  },
  {
    category: 'Water Sports',
    icon: 'water',
    color: '#0288D1',
    items: [
      { name: 'Scuba Diving', icon: 'water', color: '#0277BD' },
      { name: 'Snorkeling', icon: 'water-outline', color: '#00ACC1' },
      { name: 'Wakeboarding', icon: 'boat', color: '#0288D1' },
      { name: 'Water Polo', icon: 'water', color: '#1976D2' },
      { name: 'Paddle Board', icon: 'boat', color: '#00BCD4' },
      { name: 'Sailing', icon: 'boat', color: '#0097A7' },
    ]
  },
  {
    category: 'Recovery',
    icon: 'medkit',
    color: '#3498DB',
    items: [
      { name: 'Massage', icon: 'hand-left', color: '#8BC34A' },
      { name: 'Physiotherapy', icon: 'bandage', color: '#3498DB' },
      { name: 'Cryotherapy', icon: 'snow', color: '#00BCD4' },
      { name: 'Foam Rolling', icon: 'resize', color: '#FF9800' },
      { name: 'Sauna', icon: 'flame', color: '#FF5722' },
      { name: 'Ice Baths', icon: 'water', color: '#2196F3' },
    ]
  },
];

interface EditInterestsScreenProps {
  navigation: { goBack: () => void };
  route: { params?: { currentInterests?: string[] } };
}

export default function EditInterestsScreen({ navigation, route }: EditInterestsScreenProps) {
  const insets = useSafeAreaInsets();
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
    } catch (error: any) {
      Alert.alert('Error', `Failed to save interests: ${error?.message || error}`);
    } finally {
      setIsSaving(false);
    }
  };

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
              <Ionicons name="close" size={14} color={COLORS.gray} style={{ marginLeft: 2 }} />
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#0A0A0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Interests</Text>
        <TouchableOpacity
          style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFF" />
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

        {/* Bottom spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },

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
    color: '#0A0A0F',
  },
  saveButton: {
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#E8E8E8',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  saveButtonTextDisabled: {
    color: '#C7C7CC',
  },

  // Count
  countContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  countText: {
    fontSize: 14,
    color: COLORS.grayMuted,
  },
  hintText: {
    fontSize: 12,
    color: '#8E8E93',
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
    borderBottomColor: '#E5E7EB',
  },
  sectionIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0A0A0F' },
  sectionCount: { fontSize: 14, fontWeight: '600', color: '#0EBF8A' },

  // Items grid
  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 12 },

  // Chips
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
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
    backgroundColor: '#E6FAF8',
    gap: 6,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0A0A0F',
  },
});
