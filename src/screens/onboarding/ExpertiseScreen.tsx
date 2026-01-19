import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

// Note: LayoutAnimation removed to prevent position jumping on selection

const EXPERTISE_DATA = [
  {
    category: 'Training & Coaching',
    icon: 'barbell',
    items: [
      { name: 'Weight Loss', icon: 'scale-outline', color: '#FF6B6B' },
      { name: 'Muscle Building', icon: 'barbell-outline', color: '#4ECDC4' },
      { name: 'Strength Training', icon: 'fitness-outline', color: '#34495E' },
      { name: 'Cardio Training', icon: 'heart-outline', color: '#E74C3C' },
      { name: 'HIIT', icon: 'flash-outline', color: '#E67E22' },
      { name: 'CrossFit', icon: 'flame-outline', color: '#FF5722' },
      { name: 'Functional Training', icon: 'sync-outline', color: '#00ACC1' },
      { name: 'Body Transformation', icon: 'trending-up-outline', color: '#FF4081' },
    ]
  },
  {
    category: 'Sports & Performance',
    icon: 'trophy',
    items: [
      { name: 'Sports Performance', icon: 'trophy-outline', color: '#F39C12' },
      { name: 'Running', icon: 'walk-outline', color: '#2196F3' },
      { name: 'Swimming', icon: 'water-outline', color: '#00BCD4' },
      { name: 'Cycling', icon: 'bicycle-outline', color: '#795548' },
      { name: 'Boxing', icon: 'fitness-outline', color: '#D32F2F' },
      { name: 'Martial Arts', icon: 'hand-right-outline', color: '#FF9800' },
      { name: 'Dance', icon: 'musical-notes-outline', color: '#9C27B0' },
      { name: 'Athletics', icon: 'ribbon-outline', color: '#3F51B5' },
    ]
  },
  {
    category: 'Wellness & Health',
    icon: 'leaf',
    items: [
      { name: 'Flexibility', icon: 'body-outline', color: '#9B59B6' },
      { name: 'Rehabilitation', icon: 'medkit-outline', color: '#3498DB' },
      { name: 'Nutrition', icon: 'nutrition-outline', color: '#27AE60' },
      { name: 'Yoga', icon: 'leaf-outline', color: '#1ABC9C' },
      { name: 'Pilates', icon: 'body-outline', color: '#E91E63' },
      { name: 'Meditation', icon: 'happy-outline', color: '#607D8B' },
      { name: 'Stretching', icon: 'resize-outline', color: '#8BC34A' },
      { name: 'Recovery', icon: 'bandage-outline', color: '#00BCD4' },
    ]
  },
  {
    category: 'Specialized',
    icon: 'star',
    items: [
      { name: 'Senior Fitness', icon: 'people-outline', color: '#5C6BC0' },
      { name: 'Pre/Post Natal', icon: 'heart-circle-outline', color: '#EC407A' },
      { name: 'Kids Fitness', icon: 'happy-outline', color: '#FF9800' },
      { name: 'Group Training', icon: 'people-outline', color: '#4CAF50' },
      { name: 'Online Coaching', icon: 'videocam-outline', color: '#2196F3' },
      { name: 'Sports Nutrition', icon: 'restaurant-outline', color: '#FF5722' },
      { name: 'Mental Coaching', icon: 'bulb-outline', color: '#9C27B0' },
      { name: 'Lifestyle', icon: 'sunny-outline', color: '#FFC107' },
    ]
  },
];

export default function ExpertiseScreen({ navigation, route }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    EXPERTISE_DATA.map(cat => cat.category)
  );

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const toggle = useCallback((itemName: string) => {
    setSelected(prev =>
      prev.includes(itemName) ? prev.filter(i => i !== itemName) : [...prev, itemName]
    );
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  }, []);

  const handleNext = useCallback(() => {
    navigate('FindFriends', { ...params, expertise: selected });
  }, [navigate, params, selected]);

  const handleSkip = useCallback(() => {
    navigate('FindFriends', { ...params, expertise: [] });
  }, [navigate, params]);

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={3} totalSteps={6} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Your Expertise</Text>
        <Text style={styles.subtitle}>What do you specialize in?</Text>
      </View>

      {/* Selected counter */}
      {selected.length > 0 && (
        <View style={styles.counterContainer}>
          <LinearGradient colors={GRADIENTS.button} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.counterGradient}>
            <Text style={styles.counterText}>{selected.length} selected</Text>
          </LinearGradient>
        </View>
      )}

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {EXPERTISE_DATA.map((section) => {
          const isExpanded = expandedCategories.includes(section.category);
          const selectedInCategory = section.items.filter(item => selected.includes(item.name)).length;

          return (
            <View key={section.category} style={styles.section}>
              {/* Category header */}
              <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleCategory(section.category)} activeOpacity={0.7}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIcon, { backgroundColor: `${section.items[0]?.color}15` }]}>
                    <Ionicons name={section.icon as any} size={18} color={section.items[0]?.color} />
                  </View>
                  <Text style={styles.sectionTitle}>{section.category}</Text>
                  {selectedInCategory > 0 && (
                    <View style={styles.sectionBadge}>
                      <Text style={styles.sectionBadgeText}>{selectedInCategory}</Text>
                    </View>
                  )}
                </View>
                <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.grayMuted} />
              </TouchableOpacity>

              {/* Items */}
              {isExpanded && (
                <View style={styles.itemsGrid}>
                  {section.items.map((item) => {
                    const isSelected = selected.includes(item.name);
                    if (isSelected) {
                      return (
                        <LinearGradient
                          key={item.name}
                          colors={GRADIENTS.button}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.chipGradientBorder}
                        >
                          <TouchableOpacity
                            style={styles.chipSelectedInner}
                            onPress={() => toggle(item.name)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name={item.icon as any} size={16} color={item.color} />
                            <Text style={styles.chipText}>{item.name}</Text>
                            <View style={styles.chipCheck}>
                              <Ionicons name="checkmark" size={10} color={COLORS.white} />
                            </View>
                          </TouchableOpacity>
                        </LinearGradient>
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
                  })}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          variant="primary"
          size="lg"
          icon="arrow-forward"
          iconPosition="right"
          disabled={selected.length === 0 || disabled}
          onPress={handleNext}
        >
          Continue
        </Button>
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} disabled={disabled}>
          <Text style={styles.skipText}>Complete later in Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },

  // Header
  header: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.md },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: COLORS.dark, marginBottom: 4 },
  subtitle: { fontSize: 14, color: COLORS.grayMuted },

  // Counter
  counterContainer: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm },
  counterGradient: { alignSelf: 'flex-start', paddingHorizontal: SPACING.base, paddingVertical: 6, borderRadius: 20 },
  counterText: { fontSize: 13, fontWeight: '600', color: COLORS.white },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },

  // Section
  section: { marginBottom: SPACING.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  sectionIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  sectionBadge: { backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  sectionBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.white },

  // Items grid
  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingTop: SPACING.md },

  // Chips
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 25,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
    gap: 6,
    shadowOpacity: 0,
    elevation: 0,
  },
  chipGradientBorder: {
    borderRadius: 25,
    padding: 1.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  chipSelectedInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12.5,
    paddingVertical: 8.5,
    borderRadius: 23.5,
    backgroundColor: '#E8FAF7',
    gap: 6,
    shadowOpacity: 0,
    elevation: 0,
  },
  chipText: { fontSize: 13, fontWeight: '500', color: COLORS.dark },
  chipCheck: { width: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginLeft: 2 },

  // Footer
  footer: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.grayLight },
  skipBtn: { alignItems: 'center', paddingVertical: SPACING.md },
  skipText: { fontSize: 14, color: COLORS.grayMuted },
});
