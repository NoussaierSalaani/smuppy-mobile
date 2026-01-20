import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, GRADIENTS, SIZES } from '../../config/theme';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

// Comprehensive interest categories for Personal accounts - 16 categories total
const ALL_INTERESTS = [
  // Initial 4 categories
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
  // Explore more +4 categories
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
      { name: 'Kitesurfing', icon: 'flash', color: '#03A9F4' },
      { name: 'Rowing', icon: 'boat-outline', color: '#455A64' },
    ]
  },
  {
    category: 'Team Sports',
    icon: 'people',
    color: '#4CAF50',
    items: [
      { name: 'Rugby', icon: 'american-football', color: '#8D6E63' },
      { name: 'Hockey', icon: 'disc', color: '#607D8B' },
      { name: 'Handball', icon: 'basketball', color: '#FF7043' },
      { name: 'Cricket', icon: 'baseball', color: '#8BC34A' },
      { name: 'Baseball', icon: 'baseball', color: '#D32F2F' },
      { name: 'Softball', icon: 'baseball-outline', color: '#FF9800' },
      { name: 'Lacrosse', icon: 'disc-outline', color: '#9C27B0' },
      { name: 'Futsal', icon: 'football-outline', color: '#4CAF50' },
    ]
  },
  {
    category: 'Racket Sports',
    icon: 'tennisball',
    color: '#C5E063',
    items: [
      { name: 'Badminton', icon: 'tennisball-outline', color: '#4CAF50' },
      { name: 'Squash', icon: 'tennisball', color: '#2196F3' },
      { name: 'Table Tennis', icon: 'disc', color: '#FF5722' },
      { name: 'Padel', icon: 'tennisball', color: '#9C27B0' },
      { name: 'Pickleball', icon: 'tennisball-outline', color: '#00BCD4' },
      { name: 'Racquetball', icon: 'tennisball', color: '#FF9800' },
    ]
  },
  // Explore more +4 categories
  {
    category: 'Dance',
    icon: 'musical-notes',
    color: '#E91E63',
    items: [
      { name: 'Hip Hop', icon: 'musical-notes', color: '#212121' },
      { name: 'Salsa', icon: 'musical-notes-outline', color: '#E91E63' },
      { name: 'Ballet', icon: 'body-outline', color: '#9C27B0' },
      { name: 'Contemporary', icon: 'body', color: '#607D8B' },
      { name: 'Zumba', icon: 'happy', color: '#FF5722' },
      { name: 'Breakdance', icon: 'flash', color: '#F44336' },
      { name: 'Pole Dance', icon: 'barbell-outline', color: '#FF4081' },
      { name: 'Latin Dance', icon: 'musical-notes', color: '#FF9800' },
    ]
  },
  {
    category: 'Mind & Body',
    icon: 'flower',
    color: '#9B59B6',
    items: [
      { name: 'Tai Chi', icon: 'body-outline', color: '#607D8B' },
      { name: 'Qigong', icon: 'leaf-outline', color: '#4CAF50' },
      { name: 'Relaxation', icon: 'flower-outline', color: '#E91E63' },
      { name: 'Stress Relief', icon: 'heart-outline', color: '#F44336' },
      { name: 'Self-Care', icon: 'sunny-outline', color: '#FFC107' },
      { name: 'Holistic Health', icon: 'globe-outline', color: '#00BCD4' },
    ]
  },
  {
    category: 'Extreme Sports',
    icon: 'rocket',
    color: '#FF5722',
    items: [
      { name: 'Skateboarding', icon: 'disc', color: '#795548' },
      { name: 'BMX', icon: 'bicycle', color: '#FF5722' },
      { name: 'Parkour', icon: 'walk', color: '#607D8B' },
      { name: 'Skydiving', icon: 'airplane', color: '#2196F3' },
      { name: 'Bungee Jumping', icon: 'arrow-down', color: '#E91E63' },
      { name: 'Snowboarding', icon: 'snow', color: '#00BCD4' },
      { name: 'Motocross', icon: 'speedometer', color: '#F44336' },
      { name: 'Paragliding', icon: 'airplane-outline', color: '#9C27B0' },
    ]
  },
  {
    category: 'Lifestyle',
    icon: 'sunny',
    color: '#FFC107',
    items: [
      { name: 'Healthy Eating', icon: 'restaurant', color: '#4CAF50' },
      { name: 'Active Living', icon: 'walk', color: '#2196F3' },
      { name: 'Work-Life Balance', icon: 'scale', color: '#607D8B' },
      { name: 'Personal Growth', icon: 'trending-up', color: '#9C27B0' },
      { name: 'Motivation', icon: 'rocket', color: '#FF5722' },
      { name: 'Goal Setting', icon: 'flag', color: '#E91E63' },
    ]
  },
  // Explore more +4 categories
  {
    category: 'Winter Sports',
    icon: 'snow',
    color: '#42A5F5',
    items: [
      { name: 'Alpine Skiing', icon: 'snow', color: '#42A5F5' },
      { name: 'Cross-Country Ski', icon: 'walk', color: '#0288D1' },
      { name: 'Ice Skating', icon: 'snow-outline', color: '#00BCD4' },
      { name: 'Ice Hockey', icon: 'disc', color: '#607D8B' },
      { name: 'Curling', icon: 'disc-outline', color: '#795548' },
      { name: 'Bobsled', icon: 'speedometer', color: '#F44336' },
    ]
  },
  {
    category: 'Athletics',
    icon: 'ribbon',
    color: '#FFD700',
    items: [
      { name: 'Sprinting', icon: 'flash', color: '#F44336' },
      { name: 'Long Distance', icon: 'walk', color: '#4CAF50' },
      { name: 'Hurdles', icon: 'trending-up', color: '#FF9800' },
      { name: 'High Jump', icon: 'arrow-up', color: '#2196F3' },
      { name: 'Long Jump', icon: 'arrow-forward', color: '#9C27B0' },
      { name: 'Pole Vault', icon: 'trending-up', color: '#795548' },
      { name: 'Shot Put', icon: 'disc', color: '#607D8B' },
      { name: 'Javelin', icon: 'arrow-forward-outline', color: '#FF5722' },
    ]
  },
  {
    category: 'Equestrian',
    icon: 'paw',
    color: '#8D6E63',
    items: [
      { name: 'Horse Riding', icon: 'paw', color: '#8D6E63' },
      { name: 'Dressage', icon: 'ribbon', color: '#FFD700' },
      { name: 'Show Jumping', icon: 'trending-up', color: '#4CAF50' },
      { name: 'Polo', icon: 'disc', color: '#1976D2' },
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

const INITIAL_CATEGORIES = 4;
const EXPAND_BY = 4;

export default function InterestsScreen({ navigation, route }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(INITIAL_CATEGORIES);

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const toggle = useCallback((itemName: string) => {
    setSelected(prev =>
      prev.includes(itemName) ? prev.filter(i => i !== itemName) : [...prev, itemName]
    );
  }, []);

  const handleContinue = useCallback(() => {
    navigate('Guidelines', { ...params, interests: selected });
  }, [navigate, params, selected]);

  const handleSkip = useCallback(() => {
    navigate('Guidelines', { ...params, interests: [] });
  }, [navigate, params]);

  const handleExploreMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + EXPAND_BY, ALL_INTERESTS.length));
  }, []);

  const visibleCategories = useMemo(() =>
    ALL_INTERESTS.slice(0, visibleCount),
    [visibleCount]
  );

  const hasMoreCategories = visibleCount < ALL_INTERESTS.length;

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
    <SafeAreaView style={styles.container}>
      <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={2} totalSteps={4} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>What are you into?</Text>
        <Text style={styles.subtitle}>Select your interests to personalize your feed</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {visibleCategories.map((section) => {
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

        {/* Explore More Button - only if more categories available */}
        {hasMoreCategories && (
          <TouchableOpacity
            style={styles.exploreMoreBtn}
            onPress={handleExploreMore}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
            <Text style={styles.exploreMoreText}>
              Explore more ({ALL_INTERESTS.length - visibleCount} more categories)
            </Text>
          </TouchableOpacity>
        )}
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
          <Text style={styles.skipText}>Skip for now</Text>
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

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xl },

  // Section
  section: { marginBottom: SPACING.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight
  },
  sectionIcon: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.dark },
  sectionCount: { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  // Items grid
  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, paddingTop: SPACING.md },

  // Chips - Same dimensions for selected and non-selected
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.grayLight,
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
    backgroundColor: '#E8FAF7',
    gap: 6,
  },
  chipText: { fontSize: 13, fontWeight: '500', color: COLORS.dark },

  // Explore more button
  exploreMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: SIZES.radiusMd,
    borderWidth: 1,
    borderColor: `${COLORS.primary}30`,
    borderStyle: 'dashed',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  exploreMoreText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },

  // Footer
  footer: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.grayLight },
  skipBtn: { alignItems: 'center', paddingVertical: SPACING.md },
  skipText: { fontSize: 14, color: COLORS.grayMuted },
});
