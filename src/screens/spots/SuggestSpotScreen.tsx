/**
 * SuggestSpotScreen
 * Wizard to suggest a new spot on the map.
 * 5 steps: Category → Details → Location/Route → Qualities → Review + Initial Rating
 *
 * Available to: Personal verified, Pro Creator, Pro Business Premium
 */

import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import RouteMapPicker from '../../components/RouteMapPicker';
import QualityPicker from '../../components/QualityPicker';
import type { RouteResult } from '../../services/mapbox-directions';
import type { RouteProfile } from '../../types';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const normalize = (size: number) => Math.round(size * (SCREEN_WIDTH / 390));

// ============================================
// SPOT CATEGORIES (aligned with XplorerFeed 8 filters)
// ============================================

interface SpotCategoryDef {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isRouteCapable: boolean;
  subcategories: string[];
}

const SPOT_CATEGORIES: SpotCategoryDef[] = [
  { key: 'coaches', label: 'Coaches', icon: 'person', color: '#0EBF8A', isRouteCapable: false, subcategories: ['Personal Trainers', 'Yoga Teachers', 'Sport Coaches', 'Nutritionists'] },
  { key: 'gyms', label: 'Gyms', icon: 'barbell', color: '#1E90FF', isRouteCapable: false, subcategories: ['Gym', 'CrossFit', 'Boxing', 'Climbing', 'MMA', 'HIIT', 'Pilates', 'Bootcamp'] },
  { key: 'wellness', label: 'Wellness', icon: 'leaf', color: '#9B59B6', isRouteCapable: false, subcategories: ['Yoga Studios', 'Spas', 'Meditation', 'Pools', 'Swim Schools'] },
  { key: 'sports', label: 'Sports', icon: 'trophy', color: '#FFD700', isRouteCapable: false, subcategories: ['Sports Club', 'Tennis', 'Golf', 'Running Club', 'Cycling', 'Dance'] },
  { key: 'food', label: 'Food', icon: 'restaurant', color: '#00B5C1', isRouteCapable: false, subcategories: ['Healthy Food', 'Smoothies', 'Meal Prep', 'Supplements', 'Juice Bars'] },
  { key: 'stores', label: 'Stores', icon: 'bag-handle', color: '#0081BE', isRouteCapable: false, subcategories: ['Sportswear', 'Equipment', 'Accessories', 'Shoes', 'Nutrition'] },
  { key: 'spots', label: 'Spots', icon: 'location', color: '#5D4037', isRouteCapable: true, subcategories: ['Parks', 'Outdoor Gyms', 'Trails', 'Courts', 'Fields', 'Beaches', 'Running Path', 'Cycling Path'] },
];

const ROUTE_SUBCATEGORIES = ['Trails', 'Running Path', 'Cycling Path'];

const SuggestSpotScreen: React.FC<{ navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void; replace: (screen: string, params?: Record<string, unknown>) => void } }> = ({ navigation }) => {
  const { showError, showAlert } = useSmuppyAlert();
  const { colors, isDark } = useTheme();
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 5;

  // Form state
  const [selectedCategory, setSelectedCategory] = useState<SpotCategoryDef | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [customSubcategory, setCustomSubcategory] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [locationName, setLocationName] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [routeData, setRouteData] = useState<(RouteResult & { start: { lat: number; lng: number }; end: { lat: number; lng: number }; waypoints: { lat: number; lng: number }[]; profile: RouteProfile }) | null>(null);
  const [qualities, setQualities] = useState<string[]>([]);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const subcategory = selectedSubcategory || customSubcategory;
  const isRouteSpot = selectedCategory?.isRouteCapable && ROUTE_SUBCATEGORIES.includes(subcategory);

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const goBack = () => {
    if (step === 1) navigation.goBack();
    else {
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const handleSubmit = async () => {
    if (!selectedCategory || !name.trim() || !coordinates) {
      showError('Missing info', 'Please fill in all required fields.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await awsAPI.createSpot({
        name: name.trim(),
        description: description.trim(),
        category: selectedCategory.key,
        subcategory: subcategory,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        address: locationName,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        qualities,
        is_route: !!routeData,
        route_start: routeData?.start,
        route_end: routeData?.end,
        route_waypoints: routeData?.waypoints,
        route_geojson: routeData?.geojson as Record<string, unknown>,
        route_profile: routeData?.profile,
        route_distance_km: routeData?.distanceKm,
        route_duration_min: routeData?.durationMin,
        route_elevation_gain: routeData?.elevationGain,
        difficulty: routeData?.difficulty,
        initial_rating: rating > 0 ? rating : undefined,
        initial_review: review.trim() || undefined,
      });

      // Suggest custom subcategory if new
      if (customSubcategory.trim()) {
        awsAPI.suggestSubcategory({
          parent_category: selectedCategory.key,
          name: customSubcategory.trim(),
        }).catch((err) => { if (__DEV__) console.warn('[SuggestSpotScreen]', err); });
      }

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert({
          title: 'Spot Suggested!',
          message: 'Your spot is now on the map.',
          type: 'success',
          buttons: [
            { text: 'View', onPress: () => navigation.replace('SpotDetail', { spotId: response.spot?.id }) },
            { text: 'Done', onPress: () => navigation.goBack() },
          ],
        });
      } else {
        showError('Error', response.message || 'Failed to suggest spot');
      }
    } catch (error: unknown) {
      showError('Error', (error instanceof Error ? error.message : null) || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const canProceed = [
    !!selectedCategory,                    // step 1
    name.trim().length > 0,                // step 2
    !!coordinates || !!routeData,           // step 3
    true,                                   // step 4 (qualities optional)
    true,                                   // step 5 (review optional)
  ];

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={normalize(24)} color={colors.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Suggest a Spot</Text>
          <Text style={styles.stepIndicator}>{step}/{TOTAL_STEPS}</Text>
        </View>

        <View style={styles.progressBar}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]}
          />
        </View>

        <ScrollView ref={scrollRef} style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* STEP 1: Category */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>What kind of spot?</Text>
              <Text style={styles.stepSubtitle}>Choose a category</Text>

              <View style={styles.categoryGrid}>
                {SPOT_CATEGORIES.map(cat => {
                  const isSelected = selectedCategory?.key === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      style={[styles.categoryCard, isSelected && { borderColor: cat.color, borderWidth: 2 }]}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedCategory(cat);
                        setSelectedSubcategory('');
                      }}
                    >
                      <Ionicons name={cat.icon} size={normalize(28)} color={isSelected ? cat.color : colors.gray} />
                      <Text style={[styles.categoryName, isSelected && { color: cat.color, fontWeight: '600' }]}>{cat.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {selectedCategory && (
                <View style={styles.subcategorySection}>
                  <Text style={styles.subcategoryTitle}>Subcategory</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {selectedCategory.subcategories.map(sub => (
                      <TouchableOpacity
                        key={sub}
                        onPress={() => { setSelectedSubcategory(selectedSubcategory === sub ? '' : sub); setCustomSubcategory(''); }}
                        activeOpacity={0.8}
                      >
                        {selectedSubcategory === sub ? (
                          <LinearGradient colors={GRADIENTS.primary} style={styles.subChip}>
                            <Text style={[styles.subChipText, { color: colors.white }]}>{sub}</Text>
                          </LinearGradient>
                        ) : (
                          <View style={styles.subChipInactive}>
                            <Text style={styles.subChipText}>{sub}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput
                    style={styles.customInput}
                    placeholder="Or suggest a new subcategory..."
                    placeholderTextColor={colors.grayMuted}
                    value={customSubcategory}
                    onChangeText={(t) => { setCustomSubcategory(t); setSelectedSubcategory(''); }}
                  />
                </View>
              )}
            </View>
          )}

          {/* STEP 2: Details */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Spot details</Text>

              <Text style={styles.fieldLabel}>Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Parc Lafontaine Outdoor Gym"
                placeholderTextColor={colors.grayMuted}
                value={name}
                onChangeText={setName}
                maxLength={100}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 100 }]}
                placeholder="Describe this spot..."
                placeholderTextColor={colors.grayMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Tags (comma separated)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. calisthenics, pull-ups, free"
                placeholderTextColor={colors.grayMuted}
                value={tags}
                onChangeText={setTags}
              />
            </View>
          )}

          {/* STEP 3: Location / Route */}
          {step === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>
                {isRouteSpot ? 'Draw the route' : 'Set the location'}
              </Text>
              <Text style={styles.stepSubtitle}>
                {isRouteSpot ? 'Set start and end points for the trail/path' : 'Tap on the map to place the spot'}
              </Text>

              <RouteMapPicker
                mode={isRouteSpot ? 'route' : 'location'}
                activityType={subcategory.toLowerCase().includes('cycling') ? 'cycling' : 'walking'}
                locationName={locationName}
                onLocationNameChange={setLocationName}
                onCoordinateSelect={(coord) => setCoordinates(coord)}
                onRouteCalculated={(result) => {
                  setRouteData(result);
                  setCoordinates(result.start);
                }}
                onRouteClear={() => setRouteData(null)}
              />
            </View>
          )}

          {/* STEP 4: Qualities */}
          {step === 4 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Spot qualities</Text>
              <Text style={styles.stepSubtitle}>What makes this spot great?</Text>

              <QualityPicker
                category={isRouteSpot ? (subcategory.toLowerCase().includes('cycling') ? 'cycling' : 'hiking') : selectedCategory?.key || 'general'}
                selected={qualities}
                onSelectionChange={setQualities}
              />
            </View>
          )}

          {/* STEP 5: Review + Submit */}
          {step === 5 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Your rating</Text>
              <Text style={styles.stepSubtitle}>Rate this spot (optional)</Text>

              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map(star => (
                  <TouchableOpacity key={star} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRating(star); }}>
                    <Ionicons
                      name={star <= rating ? 'star' : 'star-outline'}
                      size={normalize(36)}
                      color={star <= rating ? '#FFD700' : colors.grayBorder}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={[styles.textInput, { minHeight: 80, marginTop: 16 }]}
                placeholder="Share your experience (optional)..."
                placeholderTextColor={colors.grayMuted}
                value={review}
                onChangeText={setReview}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />

              {/* Summary */}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Summary</Text>
                <Text style={styles.summaryItem}>{selectedCategory?.label} · {subcategory || 'No subcategory'}</Text>
                <Text style={styles.summaryItem}>{name}</Text>
                <Text style={styles.summaryItem}>{locationName || 'Map location'}</Text>
                {routeData && <Text style={styles.summaryItem}>Route: {routeData.distanceKm} km · {routeData.difficulty}</Text>}
                {qualities.length > 0 && <Text style={styles.summaryItem}>Qualities: {qualities.join(', ')}</Text>}
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom button */}
        <View style={styles.bottomBar}>
          {step < TOTAL_STEPS ? (
            <TouchableOpacity activeOpacity={0.85} disabled={!canProceed[step - 1]} onPress={goNext}>
              <LinearGradient
                colors={canProceed[step - 1] ? GRADIENTS.primary : [colors.grayBorder, colors.grayBorder]}
                style={styles.nextButton}
              >
                <Text style={styles.nextButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={normalize(18)} color={colors.white} />
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity activeOpacity={0.85} onPress={handleSubmit} disabled={isLoading}>
              <LinearGradient colors={GRADIENTS.primary} style={styles.nextButton}>
                {isLoading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Text style={styles.nextButtonText}>Suggest Spot</Text>
                    <Ionicons name="checkmark" size={normalize(18)} color={colors.white} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SuggestSpotScreen;

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  headerButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: normalize(18), fontWeight: '700', color: colors.dark, marginLeft: 12 },
  stepIndicator: { fontSize: normalize(14), fontWeight: '600', color: colors.gray },

  progressBar: { height: 3, backgroundColor: colors.gray100, marginHorizontal: 16, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  scrollContent: { flex: 1 },
  stepContent: { padding: 20 },
  stepTitle: { fontSize: normalize(22), fontWeight: '700', color: colors.dark, marginBottom: 4 },
  stepSubtitle: { fontSize: normalize(14), color: colors.gray, marginBottom: 20 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryCard: {
    width: (SCREEN_WIDTH - 40 - 24) / 3,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: colors.gray50,
    borderRadius: normalize(14),
    borderWidth: 1,
    borderColor: colors.grayBorder,
    gap: 6,
  },
  categoryName: { fontSize: normalize(12), color: colors.dark, fontWeight: '500' },

  subcategorySection: { marginTop: 20 },
  subcategoryTitle: { fontSize: normalize(14), fontWeight: '600', color: colors.dark, marginBottom: 10 },
  subChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: normalize(20), marginRight: 8 },
  subChipInactive: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: normalize(20), marginRight: 8, backgroundColor: colors.gray100 },
  subChipText: { fontSize: normalize(13), fontWeight: '500', color: colors.dark },
  customInput: {
    backgroundColor: colors.gray50, borderRadius: normalize(12), paddingHorizontal: 14, paddingVertical: 10,
    fontSize: normalize(14), color: colors.dark, borderWidth: 1, borderColor: colors.grayBorder, marginTop: 10,
  },

  fieldLabel: { fontSize: normalize(14), fontWeight: '600', color: colors.dark, marginBottom: 8, marginTop: 16 },
  textInput: {
    backgroundColor: colors.gray50, borderRadius: normalize(12), paddingHorizontal: 14, paddingVertical: 12,
    fontSize: normalize(14), color: colors.dark, borderWidth: 1, borderColor: colors.grayBorder,
  },

  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8 },

  summaryCard: {
    backgroundColor: colors.gray50, borderRadius: normalize(14), padding: 16, marginTop: 20,
    borderWidth: 1, borderColor: colors.grayBorder,
  },
  summaryTitle: { fontSize: normalize(15), fontWeight: '600', color: colors.dark, marginBottom: 8 },
  summaryItem: { fontSize: normalize(13), color: colors.gray, lineHeight: normalize(20) },

  bottomBar: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.grayBorder },
  nextButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: normalize(14), gap: 8,
  },
  nextButtonText: { fontSize: normalize(16), fontWeight: '600', color: colors.white },
});
