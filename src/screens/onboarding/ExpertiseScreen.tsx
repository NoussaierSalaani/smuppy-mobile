import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const { width } = Dimensions.get('window');

// Expertise pages based on project context
const EXPERTISE_PAGES = [
  {
    title: 'Training & Coaching',
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
    title: 'Sports & Performance',
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
    title: 'Wellness & Health',
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
    title: 'Specialized',
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
  const [currentPage, setCurrentPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const toggle = useCallback((itemName: string) => {
    setSelected(prev =>
      prev.includes(itemName) ? prev.filter(i => i !== itemName) : [...prev, itemName]
    );
  }, []);

  const handleScroll = useCallback((e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentPage(page);
  }, []);

  const handleNext = useCallback(() => {
    navigate('FindFriends', { ...params, expertise: selected });
  }, [navigate, params, selected]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header - Fixed */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={disabled}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Title - Fixed */}
      <View style={styles.titleBox}>
        <Text style={styles.title}>Your Expertise</Text>
        <Text style={styles.subtitle}>Swipe to explore categories</Text>
      </View>

      {/* Counter - Fixed */}
      {selected.length > 0 && (
        <View style={styles.counterBox}>
          <Text style={styles.counterText}>{selected.length} selected</Text>
        </View>
      )}

      {/* Pages - Scrollable horizontally, fixed height */}
      <View style={styles.pagesContainer}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {EXPERTISE_PAGES.map((page, pageIndex) => (
            <View key={pageIndex} style={styles.page}>
              <Text style={styles.pageTitle}>{page.title}</Text>
              <View style={styles.tagsWrap}>
                {page.items.map((item) => {
                  const isSelected = selected.includes(item.name);
                  return (
                    <LinearGradient
                      key={item.name}
                      colors={isSelected ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.tagGradient}
                    >
                      <TouchableOpacity
                        style={[styles.tagInner, isSelected && styles.tagInnerSelected]}
                        onPress={() => toggle(item.name)}
                      >
                        <Ionicons name={item.icon as any} size={16} color={item.color} />
                        <Text style={styles.tagText}>{item.name}</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Dots - Fixed */}
      <View style={styles.dots}>
        {EXPERTISE_PAGES.map((_, index) => (
          <View key={index} style={[styles.dot, currentPage === index && styles.dotActive]} />
        ))}
      </View>

      {/* Button - Fixed */}
      <View style={styles.btnBox}>
        <Button
          variant="primary"
          size="lg"
          icon="arrow-forward"
          iconPosition="right"
          disabled={selected.length === 0 || disabled}
          onPress={handleNext}
        >
          Next
        </Button>
      </View>

      {/* Logo Footer - Fixed */}
      <View style={styles.footer}>
        <SmuppyText width={120} variant="dark" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },

  // Header - Fixed
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, marginBottom: SPACING.md },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.dark, justifyContent: 'center', alignItems: 'center' },

  // Title - Fixed
  titleBox: { alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.sm },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.xs },
  subtitle: { fontSize: 14, color: COLORS.grayMuted, textAlign: 'center' },

  // Counter - Fixed
  counterBox: { alignSelf: 'center', paddingHorizontal: SPACING.base, paddingVertical: SPACING.xs, backgroundColor: '#E8FBF7', borderRadius: 20, marginBottom: SPACING.sm },
  counterText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // Pages container - Takes remaining space
  pagesContainer: { flex: 1 },
  page: { width, paddingHorizontal: SPACING.xl },
  pageTitle: { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginBottom: SPACING.md, textAlign: 'center' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.sm },

  // Tags - always use LinearGradient wrapper for consistent rendering
  tagGradient: {
    borderRadius: 18,
    padding: 2,
  },
  tagInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    gap: 6,
  },
  tagInnerSelected: {
    backgroundColor: '#E8FAF7',
  },
  tagText: { fontSize: 12, fontWeight: '500', color: COLORS.dark },

  // Dots - Fixed
  dots: { flexDirection: 'row', justifyContent: 'center', paddingVertical: SPACING.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.grayLight, marginHorizontal: 4 },
  dotActive: { backgroundColor: COLORS.primary, width: 20 },

  // Bottom - Fixed
  btnBox: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  footer: { alignItems: 'center', paddingBottom: SPACING.md },
});
