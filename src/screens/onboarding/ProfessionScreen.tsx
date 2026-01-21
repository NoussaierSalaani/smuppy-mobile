import React, { useState, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Keyboard, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const { width } = Dimensions.get('window');

// Type for profession items
type IoniconName = ComponentProps<typeof Ionicons>['name'];
interface ProfessionItem {
  id: string;
  name: string;
  icon: IoniconName;
  color: string;
  isCustom?: boolean;
}

interface ProfessionPage {
  title: string;
  items: ProfessionItem[];
}

// Professions par catégorie (swipeable)
const PROFESSION_PAGES: ProfessionPage[] = [
  {
    title: 'Training',
    items: [
      { id: '1', name: 'Personal Trainer', icon: 'fitness' as const, color: '#E63946' },
      { id: '2', name: 'Sport Coach', icon: 'trophy' as const, color: '#FFD700' },
      { id: '3', name: 'Boxing Coach', icon: 'fitness' as const, color: '#DC143C' },
      { id: '4', name: 'Swimming Coach', icon: 'water' as const, color: '#03A9F4' },
      { id: '5', name: 'CrossFit Coach', icon: 'barbell' as const, color: '#FF4500' },
      { id: '6', name: 'Running Coach', icon: 'walk' as const, color: '#FF5722' },
      { id: '7', name: 'Tennis Coach', icon: 'tennisball' as const, color: '#C5E063' },
      { id: '8', name: 'Golf Instructor', icon: 'golf' as const, color: '#228B22' },
    ]
  },
  {
    title: 'Health',
    items: [
      { id: '9', name: 'Physiotherapist', icon: 'medical' as const, color: '#00B4D8' },
      { id: '10', name: 'Nutritionist', icon: 'nutrition' as const, color: '#FF9800' },
      { id: '11', name: 'Dietitian', icon: 'leaf' as const, color: '#4CAF50' },
      { id: '12', name: 'Sports Doctor', icon: 'medkit' as const, color: '#F44336' },
      { id: '13', name: 'Chiropractor', icon: 'body-outline' as const, color: '#607D8B' },
      { id: '14', name: 'Osteopath', icon: 'fitness-outline' as const, color: '#795548' },
      { id: '15', name: 'Rehab Specialist', icon: 'medical' as const, color: '#009688' },
      { id: '16', name: 'Mental Coach', icon: 'happy' as const, color: '#3F51B5' },
    ]
  },
  {
    title: 'Wellness',
    items: [
      { id: '17', name: 'Yoga Teacher', icon: 'body' as const, color: '#9B59B6' },
      { id: '18', name: 'Pilates Instructor', icon: 'body' as const, color: '#E91E63' },
      { id: '19', name: 'Massage Therapist', icon: 'hand-left' as const, color: '#795548' },
      { id: '20', name: 'Life Coach', icon: 'happy' as const, color: '#00BCD4' },
      { id: '21', name: 'Wellness Consultant', icon: 'sparkles' as const, color: '#FF6B35' },
      { id: '22', name: 'Meditation Guide', icon: 'leaf' as const, color: '#27AE60' },
      { id: '23', name: 'Spa Manager', icon: 'water' as const, color: '#00BCD4' },
      { id: '24', name: 'Breathwork Coach', icon: 'cloudy' as const, color: '#81D4FA' },
    ]
  },
  {
    title: 'Dance & Arts',
    items: [
      { id: '25', name: 'Dance Teacher', icon: 'musical-notes' as const, color: '#9C27B0' },
      { id: '26', name: 'Ballet Instructor', icon: 'body' as const, color: '#F48FB1' },
      { id: '27', name: 'Salsa Instructor', icon: 'musical-notes' as const, color: '#E91E63' },
      { id: '28', name: 'Hip Hop Teacher', icon: 'headset' as const, color: '#9C27B0' },
      { id: '29', name: 'Zumba Instructor', icon: 'musical-note' as const, color: '#FF1493' },
      { id: '30', name: 'Martial Arts', icon: 'fitness' as const, color: '#8B0000' },
      { id: '31', name: 'Aerobics Instructor', icon: 'musical-notes' as const, color: '#FF69B4' },
      { id: '32', name: 'Choreographer', icon: 'videocam' as const, color: '#FF5722' },
    ]
  },
  {
    title: 'Business',
    items: [
      { id: '33', name: 'Gym Owner', icon: 'business' as const, color: '#607D8B' },
      { id: '34', name: 'Studio Owner', icon: 'business' as const, color: '#455A64' },
      { id: '35', name: 'Fitness Manager', icon: 'people' as const, color: '#37474F' },
      { id: '36', name: 'Athlete', icon: 'medal' as const, color: '#4CAF50' },
      { id: '37', name: 'Content Creator', icon: 'camera' as const, color: '#424242' },
      { id: '38', name: 'Fitness Influencer', icon: 'star' as const, color: '#FFC107' },
      { id: '39', name: 'Brand Ambassador', icon: 'megaphone' as const, color: '#FF6B35' },
      { id: '40', name: 'Event Organizer', icon: 'calendar' as const, color: '#FF5722' },
    ]
  },
];

// Toutes les professions à plat pour la recherche
const ALL_PROFESSIONS: ProfessionItem[] = PROFESSION_PAGES.flatMap(page => page.items) as ProfessionItem[];

export default function ProfessionScreen({ navigation, route }) {
  const [searchText, setSearchText] = useState('');
  const [selectedProfession, setSelectedProfession] = useState<ProfessionItem | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFocused, setIsFocused] = useState(false);

  const scrollRef = useRef(null);
  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  // Filtrer les professions selon la recherche
  const filteredProfessions = useMemo(() => {
    if (!searchText.trim()) return [];
    const search = searchText.toLowerCase().trim();
    return ALL_PROFESSIONS.filter(p => p.name.toLowerCase().includes(search));
  }, [searchText]);

  const handleSelect = useCallback((profession: ProfessionItem) => {
    setSelectedProfession(profession);
    setSearchText(profession.name);
    Keyboard.dismiss();
  }, []);

  const handleSearchChange = useCallback((text) => {
    setSearchText(text);
    const match = ALL_PROFESSIONS.find(p => p.name.toLowerCase() === text.toLowerCase().trim());
    setSelectedProfession(match || null);
  }, []);

  const handleClear = useCallback(() => {
    setSearchText('');
    setSelectedProfession(null);
  }, []);

  const handleNext = useCallback(() => {
    let profession = selectedProfession;
    
    if (!profession && searchText.trim()) {
      profession = {
        id: `custom_${Date.now()}`,
        name: searchText.trim(),
        icon: 'briefcase' as const,
        color: '#6B7280',
        isCustom: true,
      };
    }

    if (profession) {
      navigate('Guidelines', { ...params, profession });
    }
  }, [selectedProfession, searchText, navigate, params]);

  const handleScroll = useCallback((e) => {
    setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }, []);

  const isFormValid = selectedProfession !== null || searchText.trim().length > 0;

  // Style helper
  const getSearchBoxStyle = () => {
    if (selectedProfession || searchText.length > 0) return [styles.searchBox, styles.searchBoxSelected];
    if (isFocused) return [styles.searchBox, styles.searchBoxFocused];
    return [styles.searchBox];
  };

  const getSearchIconColor = () => {
    if (selectedProfession || searchText.length > 0 || isFocused) return COLORS.primary;
    return COLORS.grayMuted;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Content wrapper - takes all space except button */}
      <View style={styles.contentWrapper}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={disabled}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.titleBox}>
          <Text style={styles.title}>What's your profession?</Text>
          <Text style={styles.subtitle}>Help us personalize your experience</Text>
        </View>

        {/* Search Input */}
        <View style={styles.searchContainer}>
        <View style={getSearchBoxStyle()}>
          <Ionicons 
            name={selectedProfession ? "checkmark-circle" : "search"} 
            size={22} 
            color={getSearchIconColor()} 
          />
          <TextInput
            style={styles.searchInput}
            placeholder="Search or type your profession..."
            placeholderTextColor={COLORS.grayMuted}
            value={searchText}
            onChangeText={handleSearchChange}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={20} color={COLORS.grayMuted} />
            </TouchableOpacity>
          )}
        </View>
        {searchText.trim() && !selectedProfession && (
          <Text style={styles.newHint}>
            <Ionicons name="add-circle" size={14} color={COLORS.primary} /> New profession will be added
          </Text>
        )}
      </View>

      {/* Search Results */}
      {searchText.length > 0 && filteredProfessions.length > 0 && !selectedProfession && (
        <View style={styles.resultsContainer}>
          <Text style={styles.sectionTitle}>Suggestions</Text>
          <View style={styles.tagsWrap}>
            {filteredProfessions.slice(0, 6).map((profession) => (
              <TouchableOpacity key={profession.id} style={styles.tag} onPress={() => handleSelect(profession)}>
                <Ionicons name={profession.icon} size={16} color={profession.color} />
                <Text style={styles.tagText}>{profession.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Popular Professions */}
      {!searchText && !selectedProfession && (
        <View style={styles.popularContainer}>
          <Text style={styles.sectionTitlePop}>Popular professions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.popularScroll}>
            {ALL_PROFESSIONS.slice(0, 6).map((profession) => (
              <TouchableOpacity key={profession.id} style={styles.popularCard} onPress={() => handleSelect(profession)}>
                <View style={[styles.popularIcon, { backgroundColor: profession.color + '15' }]}>
                  <Ionicons name={profession.icon} size={26} color={profession.color} />
                </View>
                <Text style={styles.popularName} numberOfLines={2}>{profession.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* All Professions - Swipeable */}
      {!searchText && !selectedProfession && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>All professions</Text>
            <Text style={styles.sectionSub}>Swipe to see more categories</Text>
          </View>

          <ScrollView 
            ref={scrollRef}
            horizontal 
            pagingEnabled 
            showsHorizontalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            style={styles.pagesScroll}
            contentContainerStyle={styles.pagesContent}
          >
            {PROFESSION_PAGES.map((page, i) => (
              <View key={i} style={styles.page}>
                <Text style={styles.pageTitle}>{page.title}</Text>
                <View style={styles.tagsWrap}>
                  {page.items.map((item) => (
                    <TouchableOpacity key={item.id} style={styles.tag} onPress={() => handleSelect(item)}>
                      <Ionicons name={item.icon} size={16} color={item.color} />
                      <Text style={styles.tagText}>{item.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.dots}>
            {PROFESSION_PAGES.map((_, i) => (
              <View key={i} style={[styles.dot, currentPage === i && styles.dotActive]} />
            ))}
          </View>
        </>
      )}

        {/* Selected Display */}
        {selectedProfession && (
          <View style={styles.selectedContainer}>
            <View style={styles.selectedCard}>
              <View style={[styles.selectedIcon, { backgroundColor: selectedProfession.color + '20' }]}>
                <Ionicons name={selectedProfession.icon} size={32} color={selectedProfession.color} />
              </View>
              <Text style={styles.selectedName}>{selectedProfession.name}</Text>
              <TouchableOpacity onPress={handleClear}>
                <Text style={styles.changeBtn}>Change</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Next Button - Fixed at bottom */}
      <View style={styles.btnBox}>
        <Button 
          variant="primary" 
          size="lg" 
          icon="arrow-forward" 
          iconPosition="right" 
          disabled={!isFormValid || disabled} 
          onPress={handleNext}
        >
          Next
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  contentWrapper: { flex: 1 },

  // Header
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.base },
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  
  // Title
  titleBox: { alignItems: 'center', paddingHorizontal: SPACING.xl, marginTop: SPACING.lg, marginBottom: SPACING.lg },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, color: COLORS.dark, textAlign: 'center' },
  
  // Search - 3 états
  searchContainer: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.md },
  searchBox: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, backgroundColor: COLORS.white },
  searchBoxFocused: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.white },
  searchBoxSelected: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.backgroundValid },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.dark, marginLeft: SPACING.md, marginRight: SPACING.sm },
  newHint: { fontSize: 13, color: COLORS.primary, marginTop: SPACING.sm, marginLeft: SPACING.sm },
  
  // Section
  sectionHeader: { paddingHorizontal: SPACING.xl },
  sectionTitle: { fontFamily: 'WorkSans-Bold', fontSize: 18, color: COLORS.dark, marginBottom: SPACING.xs },
  sectionSub: { fontSize: 13, color: COLORS.dark, marginBottom: SPACING.md },
  
  // Results
  resultsContainer: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.md },
  
  // Popular
  popularContainer: { paddingHorizontal: SPACING.xl, marginBottom: SPACING.md },
  sectionTitlePop: { fontFamily: 'WorkSans-Bold', fontSize: 18, color: COLORS.dark, marginBottom: SPACING.md },
  popularScroll: { paddingRight: SPACING.xl },
  popularCard: { width: 100, alignItems: 'center', paddingVertical: SPACING.base, paddingHorizontal: SPACING.sm, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: 20, marginRight: SPACING.md },
  popularIcon: { width: 50, height: 50, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.sm },
  popularName: { fontSize: 13, color: COLORS.dark, fontWeight: '500', textAlign: 'center' },
  
  // Tags
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  tag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: 20, backgroundColor: COLORS.white, margin: 6 },
  tagText: { fontSize: 13, fontWeight: '500', color: COLORS.dark, marginLeft: 6 },
  
  // Pages Swipe
  pagesScroll: { flex: 1 },
  pagesContent: { flexGrow: 1 },
  page: { width, paddingHorizontal: SPACING.xl },
  pageTitle: { fontSize: 15, fontWeight: '600', color: COLORS.primaryDark, marginBottom: SPACING.md },
  
  // Dots
  dots: { flexDirection: 'row', justifyContent: 'center', paddingVertical: SPACING.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.grayLight, marginHorizontal: 4 },
  dotActive: { backgroundColor: COLORS.primary, width: 24 },
  
  // Selected
  selectedContainer: { flex: 1, paddingHorizontal: SPACING.xl, justifyContent: 'center' },
  selectedCard: { alignItems: 'center', padding: SPACING.xl, backgroundColor: COLORS.backgroundValid, borderRadius: SIZES.radiusXl, borderWidth: 2, borderColor: COLORS.primary },
  selectedIcon: { width: 70, height: 70, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.md },
  selectedName: { fontFamily: 'WorkSans-Bold', fontSize: 18, color: COLORS.dark, marginBottom: SPACING.sm },
  changeBtn: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  
  // Button - FIXE
  btnBox: { paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg, backgroundColor: COLORS.white },
});