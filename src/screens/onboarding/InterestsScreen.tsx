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

const INTERESTS_DATA = [
  {
    category: 'Sports',
    icon: 'football',
    items: [
      { name: 'Football', icon: 'football', color: '#8B4513' },
      { name: 'Basketball', icon: 'basketball', color: '#FF6B35' },
      { name: 'Tennis', icon: 'tennisball', color: '#C5E063' },
      { name: 'Swimming', icon: 'water', color: '#0099CC' },
      { name: 'Running', icon: 'walk', color: '#FF5722' },
      { name: 'Cycling', icon: 'bicycle', color: '#E63946' },
      { name: 'Boxing', icon: 'fitness', color: '#DC143C' },
      { name: 'Golf', icon: 'golf', color: '#228B22' },
    ]
  },
  {
    category: 'Fitness',
    icon: 'barbell',
    items: [
      { name: 'Gym', icon: 'barbell', color: '#1E90FF' },
      { name: 'CrossFit', icon: 'fitness', color: '#FF4500' },
      { name: 'Weightlifting', icon: 'barbell-outline', color: '#2F4F4F' },
      { name: 'Cardio', icon: 'heart', color: '#FF1493' },
      { name: 'HIIT', icon: 'flash', color: '#FF6347' },
      { name: 'Calisthenics', icon: 'body', color: '#20B2AA' },
    ]
  },
  {
    category: 'Wellness',
    icon: 'leaf',
    items: [
      { name: 'Yoga', icon: 'body', color: '#9B59B6' },
      { name: 'Meditation', icon: 'leaf', color: '#27AE60' },
      { name: 'Pilates', icon: 'fitness', color: '#E91E63' },
      { name: 'Nutrition', icon: 'nutrition', color: '#FF9800' },
      { name: 'Spa', icon: 'sparkles', color: '#00BCD4' },
      { name: 'Recovery', icon: 'bandage', color: '#4CAF50' },
    ]
  },
  {
    category: 'Martial Arts',
    icon: 'flash',
    items: [
      { name: 'MMA', icon: 'fitness', color: '#D32F2F' },
      { name: 'Judo', icon: 'body', color: '#1976D2' },
      { name: 'Karate', icon: 'hand-right', color: '#F57C00' },
      { name: 'Taekwondo', icon: 'flash', color: '#7B1FA2' },
      { name: 'BJJ', icon: 'body-outline', color: '#388E3C' },
      { name: 'Kickboxing', icon: 'fitness-outline', color: '#E64A19' },
    ]
  },
  {
    category: 'Outdoor',
    icon: 'trail-sign',
    items: [
      { name: 'Hiking', icon: 'trail-sign', color: '#5D4037' },
      { name: 'Climbing', icon: 'trending-up', color: '#795548' },
      { name: 'Surfing', icon: 'water', color: '#0288D1' },
      { name: 'Skiing', icon: 'snow', color: '#42A5F5' },
      { name: 'Kayaking', icon: 'boat', color: '#00897B' },
      { name: 'Camping', icon: 'bonfire', color: '#FF7043' },
    ]
  },
];

export default function InterestsScreen({ navigation, route }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    INTERESTS_DATA.map(cat => cat.category)
  );

  const params = route?.params || {};
  const { name } = params;
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

  const handleContinue = useCallback(() => {
    navigate('FindFriends', { ...params, interests: selected });
  }, [navigate, params, selected]);

  const handleSkip = useCallback(() => {
    navigate('FindFriends', { ...params, interests: [] });
  }, [navigate, params]);

  return (
    <SafeAreaView style={styles.container}>
      <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={2} totalSteps={5} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>Select your interests to personalize your feed</Text>
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
        {INTERESTS_DATA.map((section) => {
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
          onPress={handleContinue}
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
