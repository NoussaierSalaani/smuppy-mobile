import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const { width } = Dimensions.get('window');

// Centres d'intérêt avec icônes et couleurs naturelles
const INTERESTS_PAGES = [
  {
    title: 'Sports',
    items: [
      { name: 'Football', icon: 'football', color: '#8B4513' },
      { name: 'Basketball', icon: 'basketball', color: '#FF6B35' },
      { name: 'Tennis', icon: 'tennisball', color: '#C5E063' },
      { name: 'Swimming', icon: 'water', color: '#0099CC' },
      { name: 'Running', icon: 'walk', color: '#FF5722' },
      { name: 'Cycling', icon: 'bicycle', color: '#E63946' },
      { name: 'Boxing', icon: 'fitness', color: '#DC143C' },
      { name: 'Golf', icon: 'golf', color: '#228B22' },
      { name: 'Rugby', icon: 'american-football', color: '#8B0000' },
      { name: 'Volleyball', icon: 'globe-outline', color: '#FFD700' },
      { name: 'Baseball', icon: 'baseball', color: '#CD5C5C' },
      { name: 'Hockey', icon: 'snow', color: '#4169E1' },
      { name: 'Handball', icon: 'hand-left', color: '#FF6B35' },
      { name: 'Badminton', icon: 'tennisball-outline', color: '#4CAF50' },
      { name: 'Squash', icon: 'tennisball', color: '#607D8B' },
      { name: 'Table Tennis', icon: 'ellipse', color: '#FF9800' },
    ]
  },
  {
    title: 'Fitness',
    items: [
      { name: 'Gym', icon: 'barbell', color: '#1E90FF' },
      { name: 'CrossFit', icon: 'fitness', color: '#FF4500' },
      { name: 'Weightlifting', icon: 'barbell-outline', color: '#2F4F4F' },
      { name: 'Cardio', icon: 'heart', color: '#FF1493' },
      { name: 'HIIT', icon: 'flash', color: '#FF6347' },
      { name: 'Calisthenics', icon: 'body', color: '#20B2AA' },
      { name: 'Stretching', icon: 'body-outline', color: '#9370DB' },
      { name: 'Aerobics', icon: 'musical-notes', color: '#FF69B4' },
      { name: 'Spinning', icon: 'bicycle', color: '#00CED1' },
      { name: 'TRX', icon: 'fitness-outline', color: '#DAA520' },
      { name: 'Bootcamp', icon: 'people', color: '#8B008B' },
      { name: 'Zumba', icon: 'musical-note', color: '#FF1493' },
      { name: 'Functional', icon: 'barbell', color: '#607D8B' },
      { name: 'Powerlifting', icon: 'barbell-outline', color: '#8B0000' },
      { name: 'Bodybuilding', icon: 'body', color: '#FF5722' },
      { name: 'Circuit', icon: 'sync', color: '#4CAF50' },
    ]
  },
  {
    title: 'Wellness',
    items: [
      { name: 'Yoga', icon: 'body', color: '#9B59B6' },
      { name: 'Meditation', icon: 'leaf', color: '#27AE60' },
      { name: 'Pilates', icon: 'fitness', color: '#E91E63' },
      { name: 'Nutrition', icon: 'nutrition', color: '#FF9800' },
      { name: 'Sleep', icon: 'moon', color: '#3F51B5' },
      { name: 'Spa', icon: 'sparkles', color: '#00BCD4' },
      { name: 'Massage', icon: 'hand-left', color: '#795548' },
      { name: 'Mindfulness', icon: 'happy', color: '#FFD700' },
      { name: 'Breathing', icon: 'cloudy', color: '#81D4FA' },
      { name: 'Detox', icon: 'leaf', color: '#66BB6A' },
      { name: 'Reiki', icon: 'hand-right', color: '#7B68EE' },
      { name: 'Therapy', icon: 'heart', color: '#EC407A' },
      { name: 'Aromatherapy', icon: 'flower', color: '#E91E63' },
      { name: 'Acupuncture', icon: 'flash-outline', color: '#9C27B0' },
      { name: 'Sauna', icon: 'thermometer', color: '#FF5722' },
      { name: 'Recovery', icon: 'bandage', color: '#4CAF50' },
    ]
  },
  {
    title: 'Martial Arts',
    items: [
      { name: 'Karate', icon: 'hand-right', color: '#FF0000' },
      { name: 'Judo', icon: 'body', color: '#0000CD' },
      { name: 'Taekwondo', icon: 'flash', color: '#000080' },
      { name: 'MMA', icon: 'fitness', color: '#8B0000' },
      { name: 'Kung Fu', icon: 'body-outline', color: '#FFD700' },
      { name: 'Kickboxing', icon: 'fitness-outline', color: '#DC143C' },
      { name: 'Jiu-Jitsu', icon: 'body', color: '#2E8B57' },
      { name: 'Muay Thai', icon: 'flash-outline', color: '#FF4500' },
      { name: 'Aikido', icon: 'sync', color: '#4682B4' },
      { name: 'Capoeira', icon: 'musical-notes', color: '#32CD32' },
      { name: 'Krav Maga', icon: 'shield', color: '#696969' },
      { name: 'Wrestling', icon: 'people', color: '#8B4513' },
      { name: 'Wing Chun', icon: 'hand-left', color: '#FF9800' },
      { name: 'Sambo', icon: 'body', color: '#D32F2F' },
      { name: 'Hapkido', icon: 'sync-outline', color: '#3F51B5' },
      { name: 'Tai Chi', icon: 'infinite', color: '#4CAF50' },
    ]
  },
  {
    title: 'Outdoor',
    items: [
      { name: 'Hiking', icon: 'trail-sign', color: '#8D6E63' },
      { name: 'Camping', icon: 'bonfire', color: '#FF5722' },
      { name: 'Climbing', icon: 'trending-up', color: '#607D8B' },
      { name: 'Surfing', icon: 'boat', color: '#03A9F4' },
      { name: 'Skiing', icon: 'snow', color: '#90CAF9' },
      { name: 'Kayaking', icon: 'boat-outline', color: '#FF8A65' },
      { name: 'Fishing', icon: 'fish', color: '#0277BD' },
      { name: 'Skateboard', icon: 'walk', color: '#78909C' },
      { name: 'Snowboard', icon: 'snow-outline', color: '#4DD0E1' },
      { name: 'Diving', icon: 'water', color: '#006064' },
      { name: 'Paragliding', icon: 'airplane', color: '#FF7043' },
      { name: 'MTB', icon: 'bicycle', color: '#5D4037' },
      { name: 'Trail Running', icon: 'walk', color: '#8BC34A' },
      { name: 'Paddle', icon: 'boat', color: '#00BCD4' },
      { name: 'Kitesurfing', icon: 'airplane-outline', color: '#FF5722' },
      { name: 'Wakeboard', icon: 'water', color: '#3F51B5' },
    ]
  },
  {
    title: 'Dance',
    items: [
      { name: 'Salsa', icon: 'musical-notes', color: '#E91E63' },
      { name: 'Hip Hop', icon: 'headset', color: '#9C27B0' },
      { name: 'Ballet', icon: 'body', color: '#F48FB1' },
      { name: 'Bachata', icon: 'heart', color: '#FF5252' },
      { name: 'Tango', icon: 'people', color: '#D32F2F' },
      { name: 'Breakdance', icon: 'flash', color: '#FF9800' },
      { name: 'Jazz', icon: 'musical-note', color: '#FFC107' },
      { name: 'Swing', icon: 'musical-notes', color: '#4CAF50' },
      { name: 'Belly Dance', icon: 'sparkles', color: '#FFD54F' },
      { name: 'Pole Dance', icon: 'fitness', color: '#BA68C8' },
      { name: 'Flamenco', icon: 'flame', color: '#FF5722' },
      { name: 'Kizomba', icon: 'heart-outline', color: '#E91E63' },
      { name: 'Contemporary', icon: 'body-outline', color: '#00BCD4' },
      { name: 'K-Pop', icon: 'star', color: '#9C27B0' },
      { name: 'Ballroom', icon: 'people', color: '#FFD700' },
      { name: 'Latin', icon: 'musical-notes', color: '#FF5722' },
    ]
  },
];

export default function InterestsScreen({ navigation, route }) {
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

  const handleContinue = useCallback(() => {
    navigate('Guidelines', { ...params, interests: selected });
  }, [navigate, params, selected]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Header with Progress Bar - Personal flow step 2/4 */}
        <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={2} totalSteps={4} />

        {/* Title */}
        <View style={styles.titleBox}>
          <Text style={styles.title}>What are you into?</Text>
          <Text style={styles.subtitle}>Swipe to explore different categories</Text>
        </View>

        {/* Counter */}
        {selected.length > 0 && (
          <View style={styles.counterBox}>
            <Text style={styles.counterText}>{selected.length} selected</Text>
          </View>
        )}

        {/* Horizontal Swipe Pages */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.pagesScroll}
        >
          {INTERESTS_PAGES.map((page, pageIndex) => (
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
                        <Ionicons name={item.icon as any} size={18} color={item.color} />
                        <Text style={styles.tagText}>{item.name}</Text>
                      </TouchableOpacity>
                    </LinearGradient>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dots}>
          {INTERESTS_PAGES.map((_, index) => (
            <View key={index} style={[styles.dot, currentPage === index && styles.dotActive]} />
          ))}
        </View>

        {/* Button */}
        <View style={styles.btnBox}>
          <Button
            variant="primary"
            size="lg"
            icon="arrow-forward"
            iconPosition="right"
            disabled={selected.length === 0 || disabled}
            onPress={handleContinue}
          >
            Next
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  inner: { flex: 1 },

  // Title
  titleBox: { alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.md },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.xs },
  subtitle: { fontSize: 14, color: COLORS.grayMuted, textAlign: 'center' },

  // Counter
  counterBox: { alignSelf: 'center', paddingHorizontal: SPACING.base, paddingVertical: SPACING.xs, backgroundColor: '#E8FBF7', borderRadius: 20, marginBottom: SPACING.sm },
  counterText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  // Pages
  pagesScroll: { flex: 1 },
  page: { width, paddingHorizontal: SPACING.lg },
  pageTitle: { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginBottom: SPACING.md, textAlign: 'center' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: SPACING.md },

  // Tags - always use LinearGradient wrapper for consistent rendering
  tagGradient: {
    borderRadius: 22,
    padding: 2,
  },
  tagInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    gap: 8,
  },
  tagInnerSelected: {
    backgroundColor: '#E8FAF7',
  },
  tagText: { fontSize: 13, fontWeight: '500', color: COLORS.dark },

  // Dots
  dots: { flexDirection: 'row', justifyContent: 'center', paddingVertical: SPACING.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.grayLight, marginHorizontal: 4 },
  dotActive: { backgroundColor: COLORS.primary, width: 24 },

  // Bottom
  btnBox: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
});
