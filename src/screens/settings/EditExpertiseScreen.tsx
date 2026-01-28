import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, GRADIENTS } from '../../config/theme';
import { useUpdateProfile, useCurrentProfile } from '../../hooks';
import { useUserStore } from '../../stores';

// Complete expertise areas - includes all fitness domains
const ALL_EXPERTISE = [
  {
    category: 'Fitness & Training',
    icon: 'barbell',
    color: '#1E90FF',
    items: [
      { name: 'General Fitness', icon: 'fitness', color: '#1E90FF' },
      { name: 'Strength Training', icon: 'barbell', color: '#2F4F4F' },
      { name: 'Weight Loss', icon: 'trending-down', color: '#FF6347' },
      { name: 'Muscle Building', icon: 'body', color: '#20B2AA' },
      { name: 'CrossFit', icon: 'fitness', color: '#FF4500' },
      { name: 'HIIT', icon: 'flash', color: '#FF6347' },
      { name: 'Cardio', icon: 'heart', color: '#FF1493' },
      { name: 'Calisthenics', icon: 'body', color: '#20B2AA' },
      { name: 'Functional Training', icon: 'fitness-outline', color: '#00BCD4' },
      { name: 'Boot Camp', icon: 'people', color: '#FF5722' },
    ]
  },
  {
    category: 'Mind & Body',
    icon: 'leaf',
    color: '#27AE60',
    items: [
      { name: 'Yoga', icon: 'body', color: '#9B59B6' },
      { name: 'Pilates', icon: 'fitness-outline', color: '#E91E63' },
      { name: 'Meditation', icon: 'leaf', color: '#27AE60' },
      { name: 'Mindfulness', icon: 'flower', color: '#E91E63' },
      { name: 'Breathwork', icon: 'cloudy', color: '#00ACC1' },
      { name: 'Stretching', icon: 'resize', color: '#8BC34A' },
      { name: 'Tai Chi', icon: 'body-outline', color: '#607D8B' },
      { name: 'Qigong', icon: 'leaf-outline', color: '#4CAF50' },
    ]
  },
  {
    category: 'Nutrition & Diet',
    icon: 'nutrition',
    color: '#FF9800',
    items: [
      { name: 'Nutrition', icon: 'nutrition', color: '#FF9800' },
      { name: 'Meal Planning', icon: 'restaurant', color: '#4CAF50' },
      { name: 'Weight Management', icon: 'scale', color: '#9C27B0' },
      { name: 'Sports Nutrition', icon: 'flash', color: '#F44336' },
      { name: 'Vegan/Plant-Based', icon: 'leaf', color: '#8BC34A' },
      { name: 'Keto/Low Carb', icon: 'nutrition-outline', color: '#FF5722' },
      { name: 'Supplements', icon: 'flask', color: '#673AB7' },
      { name: 'Intermittent Fasting', icon: 'time', color: '#009688' },
    ]
  },
  {
    category: 'Team Sports',
    icon: 'football',
    color: '#FF6B35',
    items: [
      { name: 'Football', icon: 'football', color: '#8B4513' },
      { name: 'Basketball', icon: 'basketball', color: '#FF6B35' },
      { name: 'Volleyball', icon: 'basketball-outline', color: '#FFC107' },
      { name: 'Soccer', icon: 'football-outline', color: '#4CAF50' },
      { name: 'Rugby', icon: 'american-football', color: '#795548' },
      { name: 'Hockey', icon: 'disc', color: '#2196F3' },
      { name: 'Baseball', icon: 'baseball', color: '#F44336' },
      { name: 'Handball', icon: 'hand-left', color: '#FF9800' },
    ]
  },
  {
    category: 'Racket Sports',
    icon: 'tennisball',
    color: '#C5E063',
    items: [
      { name: 'Tennis', icon: 'tennisball', color: '#C5E063' },
      { name: 'Padel', icon: 'tennisball-outline', color: '#00BCD4' },
      { name: 'Badminton', icon: 'disc-outline', color: '#9C27B0' },
      { name: 'Squash', icon: 'tennisball-outline', color: '#FF5722' },
      { name: 'Table Tennis', icon: 'disc', color: '#E91E63' },
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
      { name: 'BJJ', icon: 'body-outline', color: '#388E3C' },
      { name: 'Kickboxing', icon: 'fitness-outline', color: '#E64A19' },
      { name: 'Muay Thai', icon: 'flash-outline', color: '#FF5722' },
      { name: 'Wrestling', icon: 'body', color: '#795548' },
      { name: 'Taekwondo', icon: 'walk', color: '#2196F3' },
      { name: 'Krav Maga', icon: 'shield', color: '#607D8B' },
    ]
  },
  {
    category: 'Water Sports',
    icon: 'water',
    color: '#0099CC',
    items: [
      { name: 'Swimming', icon: 'water', color: '#0099CC' },
      { name: 'Surfing', icon: 'water-outline', color: '#0288D1' },
      { name: 'Diving', icon: 'arrow-down', color: '#00ACC1' },
      { name: 'Water Polo', icon: 'water', color: '#03A9F4' },
      { name: 'Kayaking', icon: 'boat', color: '#4CAF50' },
      { name: 'Rowing', icon: 'boat-outline', color: '#795548' },
      { name: 'Stand Up Paddle', icon: 'water', color: '#00BCD4' },
      { name: 'Kitesurfing', icon: 'cloudy', color: '#FF5722' },
    ]
  },
  {
    category: 'Endurance Sports',
    icon: 'walk',
    color: '#FF5722',
    items: [
      { name: 'Running', icon: 'walk', color: '#FF5722' },
      { name: 'Cycling', icon: 'bicycle', color: '#E63946' },
      { name: 'Triathlon', icon: 'trophy', color: '#FFC107' },
      { name: 'Marathon', icon: 'medal', color: '#FF9800' },
      { name: 'Trail Running', icon: 'trail-sign', color: '#4CAF50' },
      { name: 'Ultra Running', icon: 'walk-outline', color: '#795548' },
    ]
  },
  {
    category: 'Dance & Movement',
    icon: 'musical-notes',
    color: '#E91E63',
    items: [
      { name: 'Dance Fitness', icon: 'musical-notes', color: '#E91E63' },
      { name: 'Zumba', icon: 'musical-note', color: '#FF4081' },
      { name: 'Hip Hop', icon: 'headset', color: '#9C27B0' },
      { name: 'Ballet', icon: 'body-outline', color: '#F48FB1' },
      { name: 'Latin Dance', icon: 'musical-notes-outline', color: '#FF5722' },
      { name: 'Pole Fitness', icon: 'body', color: '#673AB7' },
      { name: 'Aerobics', icon: 'fitness', color: '#00BCD4' },
    ]
  },
  {
    category: 'Recovery & Wellness',
    icon: 'medkit',
    color: '#3498DB',
    items: [
      { name: 'Physiotherapy', icon: 'bandage', color: '#3498DB' },
      { name: 'Sports Massage', icon: 'hand-left', color: '#8BC34A' },
      { name: 'Injury Prevention', icon: 'shield-checkmark', color: '#FF9800' },
      { name: 'Mobility', icon: 'resize', color: '#9C27B0' },
      { name: 'Mental Coaching', icon: 'happy', color: '#607D8B' },
      { name: 'Sleep Optimization', icon: 'moon', color: '#3F51B5' },
      { name: 'Recovery Training', icon: 'refresh', color: '#00ACC1' },
      { name: 'Foam Rolling', icon: 'ellipse', color: '#795548' },
    ]
  },
  {
    category: 'Outdoor & Adventure',
    icon: 'trail-sign',
    color: '#5D4037',
    items: [
      { name: 'Hiking', icon: 'trail-sign', color: '#5D4037' },
      { name: 'Climbing', icon: 'trending-up', color: '#795548' },
      { name: 'Mountain Biking', icon: 'bicycle', color: '#795548' },
      { name: 'Skiing', icon: 'snow', color: '#42A5F5' },
      { name: 'Snowboarding', icon: 'snow-outline', color: '#00BCD4' },
      { name: 'Skateboarding', icon: 'flash', color: '#FF5722' },
      { name: 'Golf', icon: 'golf', color: '#228B22' },
      { name: 'Archery', icon: 'locate', color: '#F44336' },
    ]
  },
  {
    category: 'Specialty Training',
    icon: 'star',
    color: '#9C27B0',
    items: [
      { name: 'Personal Training', icon: 'person', color: '#1E90FF' },
      { name: 'Group Training', icon: 'people', color: '#4CAF50' },
      { name: 'Online Coaching', icon: 'videocam', color: '#FF9800' },
      { name: 'Youth Training', icon: 'happy', color: '#FF5722' },
      { name: 'Senior Fitness', icon: 'heart', color: '#E91E63' },
      { name: 'Pre/Postnatal', icon: 'body', color: '#9C27B0' },
      { name: 'Adaptive Fitness', icon: 'accessibility', color: '#00BCD4' },
      { name: 'Corporate Wellness', icon: 'business', color: '#607D8B' },
    ]
  },
];

interface EditExpertiseScreenProps {
  navigation: { goBack: () => void };
  route: { params?: { currentExpertise?: string[] } };
}

export default function EditExpertiseScreen({ navigation, route }: EditExpertiseScreenProps) {
  const insets = useSafeAreaInsets();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const { data: profileData, refetch } = useCurrentProfile();
  const user = useUserStore((state) => state.user);
  const updateLocalProfile = useUserStore((state) => state.updateProfile);

  // Load expertise from route params, profile data, or user context
  const initialExpertise = route?.params?.currentExpertise
    || profileData?.expertise
    || user?.expertise
    || [];

  const [selected, setSelected] = useState<string[]>(initialExpertise);
  const [isSaving, setIsSaving] = useState(false);

  // Sync with profile data when it loads
  useEffect(() => {
    const expertise = profileData?.expertise || user?.expertise || [];
    if (expertise.length > 0 && selected.length === 0) {
      setSelected(expertise);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileData, user?.expertise]);

  const hasChanges = useMemo(() => {
    const currentExpertise = profileData?.expertise || user?.expertise || [];
    if (selected.length !== currentExpertise.length) return true;
    return !selected.every(item => currentExpertise.includes(item));
  }, [selected, profileData?.expertise, user?.expertise]);

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
      await updateDbProfile({ expertise: selected });

      // Update local store
      updateLocalProfile({ expertise: selected });

      // Refresh profile data
      await refetch();

      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Error', `Failed to save expertise: ${error?.message || error}`);
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
        <Text style={styles.headerTitle}>Edit Expertise</Text>
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

      {/* Info banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={20} color="#0891B2" />
        <Text style={styles.infoBannerText}>
          Select your areas of expertise to personalize your Vibes feed and help others find you.
        </Text>
      </View>

      {/* Selected count */}
      <View style={styles.countContainer}>
        <Text style={styles.countText}>
          {selected.length} area{selected.length !== 1 ? 's' : ''} selected
        </Text>
        <Text style={styles.hintText}>
          Tap to add or remove expertise areas
        </Text>
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {ALL_EXPERTISE.map((section) => {
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

  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFEFF',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#0891B2',
    lineHeight: 18,
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
