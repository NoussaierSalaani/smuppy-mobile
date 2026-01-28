/**
 * CreateGroupScreen
 * Create group activities with optional route planning.
 * 4-step wizard: Category → Details → Location/Route → Review
 *
 * Pro Business (non-premium): location locked to business address.
 * All others: free to choose any location.
 */

import React, { useState, useRef, useEffect } from 'react';
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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores';
import RouteMapPicker from '../../components/RouteMapPicker';
import type { RouteResult } from '../../services/mapbox-directions';
import type { RouteProfile } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const normalize = (size: number) => Math.round(size * (SCREEN_WIDTH / 390));

// ============================================
// CATEGORIES (same as XplorerFeed filters mapped to activities)
// ============================================

interface GroupCategory {
  id: string;
  name: string;
  slug: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isRouteActivity: boolean;
  subcategories: string[];
}

const CATEGORIES: GroupCategory[] = [
  { id: '1', name: 'Running', slug: 'running', icon: 'walk', color: '#FF6B6B', isRouteActivity: true, subcategories: ['5K', '10K', 'Half Marathon', 'Marathon', 'Trail Run', 'Jog'] },
  { id: '2', name: 'Hiking', slug: 'hiking', icon: 'trail-sign', color: '#4ECDC4', isRouteActivity: true, subcategories: ['Day Hike', 'Trail', 'Mountain', 'Nature Walk'] },
  { id: '3', name: 'Cycling', slug: 'cycling', icon: 'bicycle', color: '#45B7D1', isRouteActivity: true, subcategories: ['Road', 'Mountain Bike', 'Gravel', 'Leisure'] },
  { id: '4', name: 'Gym', slug: 'gym', icon: 'barbell', color: '#1E90FF', isRouteActivity: false, subcategories: ['Workout', 'CrossFit', 'HIIT', 'Bootcamp', 'Pilates'] },
  { id: '5', name: 'Yoga', slug: 'yoga', icon: 'body', color: '#9B59B6', isRouteActivity: false, subcategories: ['Vinyasa', 'Hatha', 'Power Yoga', 'Meditation'] },
  { id: '6', name: 'Sports', slug: 'sports', icon: 'trophy', color: '#FFD700', isRouteActivity: false, subcategories: ['Soccer', 'Basketball', 'Tennis', 'Padel', 'Volleyball', 'Badminton'] },
  { id: '7', name: 'Swimming', slug: 'swimming', icon: 'water', color: '#3498DB', isRouteActivity: false, subcategories: ['Pool', 'Open Water', 'Aqua Fitness'] },
  { id: '8', name: 'Other', slug: 'other', icon: 'ellipsis-horizontal', color: '#95A5A6', isRouteActivity: false, subcategories: ['Dance', 'Martial Arts', 'Climbing', 'Skating'] },
];

// ============================================
// COMPONENT
// ============================================

const CreateGroupScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const user = useUserStore((state) => state.user);
  const isProCreator = user?.accountType === 'pro_creator' || user?.accountType === 'pro_business';

  // Locked location for pro business non-premium
  const lockedLocation = route?.params?.lockedLocation || null;

  // Account limits
  const [canCreate, setCanCreate] = useState(true);
  const [checkingLimits, setCheckingLimits] = useState(true);

  // Form state
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<GroupCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [customSubcategory, setCustomSubcategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('');
  const [isPublic, _setIsPublic] = useState(true);

  // Location/Route state
  const [locationName, setLocationName] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [routeData, setRouteData] = useState<(RouteResult & { start: any; end: any; waypoints: any[]; profile: RouteProfile }) | null>(null);

  // UI
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // ============================================
  // LIMITS CHECK
  // ============================================

  useEffect(() => {
    const checkLimits = async () => {
      if (isProCreator) {
        setCheckingLimits(false);
        setCanCreate(true);
        return;
      }
      try {
        const response = await awsAPI.checkCreationLimits();
        setCanCreate(response.canCreateGroup !== false);
      } catch {
        setCanCreate(true);
      } finally {
        setCheckingLimits(false);
      }
    };
    checkLimits();
  }, [isProCreator]);

  // ============================================
  // NAVIGATION
  // ============================================

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(s => Math.min(s + 1, 4));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const goBack = () => {
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  // ============================================
  // SUBMIT
  // ============================================

  const handleSubmit = async () => {
    if (!selectedCategory || !title.trim() || !coordinates) {
      Alert.alert('Missing info', 'Please fill in all required fields.');
      return;
    }

    setIsLoading(true);
    try {
      const subcategory = selectedSubcategory || customSubcategory.trim();
      const response = await awsAPI.createGroup({
        name: title.trim(),
        description: description.trim(),
        category: selectedCategory.slug as any,
        subcategory,
        sport_type: selectedCategory.slug,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        address: locationName,
        starts_at: startDate.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        max_participants: maxParticipants ? parseInt(maxParticipants) : undefined,
        is_free: isFree,
        price: !isFree && price ? parseFloat(price) : undefined,
        currency: 'CAD',
        is_public: isPublic,
        is_fans_only: false,
        is_route: !!routeData,
        route_start: routeData?.start,
        route_end: routeData?.end,
        route_waypoints: routeData?.waypoints,
        route_geojson: routeData?.geojson as any,
        route_profile: routeData?.profile,
        route_distance_km: routeData?.distanceKm,
        route_duration_min: routeData?.durationMin,
        route_elevation_gain: routeData?.elevationGain,
        difficulty: routeData?.difficulty,
      });

      if (response.success) {
        // If custom subcategory, suggest it
        if (customSubcategory.trim() && selectedCategory) {
          awsAPI.suggestSubcategory({
            parent_category: selectedCategory.slug,
            name: customSubcategory.trim(),
          }).catch(() => {}); // Fire and forget
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Group Created!', 'Your group activity is now visible on the map.', [
          { text: 'View', onPress: () => navigation.replace('GroupDetail', { groupId: response.group?.id }) },
          { text: 'Done', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', response.message || 'Failed to create group');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // RENDER HELPERS
  // ============================================

  const isRouteActivity = selectedCategory?.isRouteActivity || false;
  const subcategory = selectedSubcategory || customSubcategory;

  const canProceedStep1 = !!selectedCategory;
  const canProceedStep2 = title.trim().length > 0;
  const canProceedStep3 = !!coordinates || !!routeData;

  // ============================================
  // LOADING / LIMIT
  // ============================================

  if (checkingLimits) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!canCreate) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.limitContainer}>
          <Ionicons name="lock-closed" size={normalize(48)} color={COLORS.gray300} />
          <Text style={styles.limitTitle}>Monthly Limit Reached</Text>
          <Text style={styles.limitText}>
            Personal accounts can create 1 group per month. Upgrade to Pro for unlimited groups.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('UpgradeToPro')}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.upgradeButton}>
              <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={normalize(24)} color={COLORS.dark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Group</Text>
          <Text style={styles.stepIndicator}>{step}/4</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressBar}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]}
          />
        </View>

        <ScrollView ref={scrollRef} style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* STEP 1: Category */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>What type of activity?</Text>
              <Text style={styles.stepSubtitle}>Choose a category for your group</Text>

              <View style={styles.categoryGrid}>
                {CATEGORIES.map(cat => {
                  const isSelected = selectedCategory?.id === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.categoryCard, isSelected && { borderColor: cat.color, borderWidth: 2 }]}
                      activeOpacity={0.8}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSelectedCategory(cat);
                        setSelectedSubcategory('');
                      }}
                    >
                      <Ionicons name={cat.icon} size={normalize(28)} color={isSelected ? cat.color : COLORS.gray} />
                      <Text style={[styles.categoryName, isSelected && { color: cat.color, fontWeight: '600' }]}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Subcategory selection */}
              {selectedCategory && (
                <View style={styles.subcategorySection}>
                  <Text style={styles.subcategoryTitle}>Subcategory (optional)</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subcategoryScroll}>
                    {selectedCategory.subcategories.map(sub => (
                      <TouchableOpacity
                        key={sub}
                        onPress={() => {
                          setSelectedSubcategory(selectedSubcategory === sub ? '' : sub);
                          setCustomSubcategory('');
                        }}
                        activeOpacity={0.8}
                      >
                        {selectedSubcategory === sub ? (
                          <LinearGradient colors={GRADIENTS.primary} style={styles.subcategoryChip}>
                            <Text style={[styles.subcategoryChipText, { color: COLORS.white }]}>{sub}</Text>
                          </LinearGradient>
                        ) : (
                          <View style={styles.subcategoryChipInactive}>
                            <Text style={styles.subcategoryChipText}>{sub}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TextInput
                    style={styles.customSubInput}
                    placeholder="Or type a custom subcategory..."
                    placeholderTextColor={COLORS.gray400}
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
              <Text style={styles.stepTitle}>Group details</Text>

              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Morning 5K Run"
                placeholderTextColor={COLORS.gray400}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Tell people what to expect..."
                placeholderTextColor={COLORS.gray400}
                value={description}
                onChangeText={setDescription}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Date & Time</Text>
              <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={normalize(18)} color={COLORS.primary} />
                <Text style={styles.dateButtonText}>
                  {startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={startDate}
                  mode="datetime"
                  minimumDate={new Date(Date.now() + 60 * 60 * 1000)}
                  onChange={(_, date) => {
                    setShowDatePicker(Platform.OS === 'ios');
                    if (date) setStartDate(date);
                  }}
                />
              )}

              <Text style={styles.fieldLabel}>Max Participants</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Unlimited"
                placeholderTextColor={COLORS.gray400}
                value={maxParticipants}
                onChangeText={setMaxParticipants}
                keyboardType="number-pad"
              />

              {/* Pricing (pro only) */}
              <View style={styles.toggleRow}>
                <Text style={styles.fieldLabel}>Free Activity</Text>
                <TouchableOpacity
                  style={[styles.toggle, isFree && styles.toggleActive]}
                  onPress={() => setIsFree(!isFree)}
                >
                  <View style={[styles.toggleThumb, isFree && styles.toggleThumbActive]} />
                </TouchableOpacity>
              </View>
              {!isFree && isProCreator && (
                <TextInput
                  style={styles.textInput}
                  placeholder="Price (CAD)"
                  placeholderTextColor={COLORS.gray400}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              )}
            </View>
          )}

          {/* STEP 3: Location / Route */}
          {step === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>
                {isRouteActivity ? 'Plan the route' : 'Set the location'}
              </Text>
              <Text style={styles.stepSubtitle}>
                {isRouteActivity
                  ? 'Set start and end points for an optimized route'
                  : 'Tap on the map to set the meeting point'}
              </Text>

              <RouteMapPicker
                mode={isRouteActivity ? 'route' : 'location'}
                activityType={selectedCategory?.slug}
                lockedLocation={lockedLocation}
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

          {/* STEP 4: Review */}
          {step === 4 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Review your group</Text>

              <View style={styles.reviewCard}>
                <View style={styles.reviewRow}>
                  <Ionicons name={selectedCategory?.icon || 'people'} size={normalize(22)} color={selectedCategory?.color || COLORS.primary} />
                  <View style={styles.reviewRowContent}>
                    <Text style={styles.reviewLabel}>Category</Text>
                    <Text style={styles.reviewValue}>
                      {selectedCategory?.name}{subcategory ? ` · ${subcategory}` : ''}
                    </Text>
                  </View>
                </View>

                <View style={styles.reviewDivider} />

                <View style={styles.reviewRow}>
                  <Ionicons name="text" size={normalize(22)} color={COLORS.primary} />
                  <View style={styles.reviewRowContent}>
                    <Text style={styles.reviewLabel}>Title</Text>
                    <Text style={styles.reviewValue}>{title}</Text>
                  </View>
                </View>

                <View style={styles.reviewDivider} />

                <View style={styles.reviewRow}>
                  <Ionicons name="calendar" size={normalize(22)} color={COLORS.primary} />
                  <View style={styles.reviewRowContent}>
                    <Text style={styles.reviewLabel}>Date</Text>
                    <Text style={styles.reviewValue}>
                      {startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </View>

                <View style={styles.reviewDivider} />

                <View style={styles.reviewRow}>
                  <Ionicons name="location" size={normalize(22)} color={COLORS.primary} />
                  <View style={styles.reviewRowContent}>
                    <Text style={styles.reviewLabel}>Location</Text>
                    <Text style={styles.reviewValue}>{locationName || 'Map location'}</Text>
                  </View>
                </View>

                {routeData && (
                  <>
                    <View style={styles.reviewDivider} />
                    <View style={styles.reviewRow}>
                      <Ionicons name="map" size={normalize(22)} color={COLORS.primary} />
                      <View style={styles.reviewRowContent}>
                        <Text style={styles.reviewLabel}>Route</Text>
                        <Text style={styles.reviewValue}>
                          {routeData.distanceKm} km · {routeData.durationMin} min · {routeData.difficulty}
                        </Text>
                      </View>
                    </View>
                  </>
                )}

                <View style={styles.reviewDivider} />

                <View style={styles.reviewRow}>
                  <Ionicons name="people" size={normalize(22)} color={COLORS.primary} />
                  <View style={styles.reviewRowContent}>
                    <Text style={styles.reviewLabel}>Participants</Text>
                    <Text style={styles.reviewValue}>
                      {maxParticipants ? `Max ${maxParticipants}` : 'Unlimited'} · {isFree ? 'Free' : `$${price}`}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom button */}
        <View style={styles.bottomBar}>
          {step < 4 ? (
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3)
              }
              onPress={goNext}
            >
              <LinearGradient
                colors={
                  (step === 1 && !canProceedStep1) ||
                  (step === 2 && !canProceedStep2) ||
                  (step === 3 && !canProceedStep3)
                    ? [COLORS.gray300, COLORS.gray300]
                    : GRADIENTS.primary
                }
                style={styles.nextButton}
              >
                <Text style={styles.nextButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={normalize(18)} color={COLORS.white} />
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity activeOpacity={0.85} onPress={handleSubmit} disabled={isLoading}>
              <LinearGradient colors={GRADIENTS.primary} style={styles.nextButton}>
                {isLoading ? (
                  <ActivityIndicator color={COLORS.white} />
                ) : (
                  <>
                    <Text style={styles.nextButtonText}>Create Group</Text>
                    <Ionicons name="checkmark" size={normalize(18)} color={COLORS.white} />
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

export default CreateGroupScreen;

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerButton: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: normalize(18),
    fontWeight: '700',
    color: COLORS.dark,
    marginLeft: 12,
  },
  stepIndicator: {
    fontSize: normalize(14),
    fontWeight: '600',
    color: COLORS.gray,
  },

  // Progress
  progressBar: {
    height: 3,
    backgroundColor: COLORS.gray100,
    marginHorizontal: 16,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  // Content
  scrollContent: { flex: 1 },
  stepContent: { padding: 20 },
  stepTitle: {
    fontSize: normalize(22),
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 4,
  },
  stepSubtitle: {
    fontSize: normalize(14),
    color: COLORS.gray,
    marginBottom: 20,
  },

  // Categories
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: (SCREEN_WIDTH - 40 - 24) / 3,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: normalize(14),
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
    gap: 6,
  },
  categoryName: {
    fontSize: normalize(12),
    color: COLORS.dark,
    fontWeight: '500',
  },

  // Subcategory
  subcategorySection: { marginTop: 20 },
  subcategoryTitle: {
    fontSize: normalize(14),
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 10,
  },
  subcategoryScroll: { marginBottom: 10 },
  subcategoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: normalize(20),
    marginRight: 8,
  },
  subcategoryChipInactive: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: normalize(20),
    marginRight: 8,
    backgroundColor: COLORS.gray100,
  },
  subcategoryChipText: {
    fontSize: normalize(13),
    fontWeight: '500',
    color: COLORS.dark,
  },
  customSubInput: {
    backgroundColor: COLORS.gray50,
    borderRadius: normalize(12),
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: normalize(14),
    color: COLORS.dark,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
  },

  // Fields
  fieldLabel: {
    fontSize: normalize(14),
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    backgroundColor: COLORS.gray50,
    borderRadius: normalize(12),
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: normalize(14),
    color: COLORS.dark,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: normalize(12),
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
    gap: 10,
  },
  dateButtonText: {
    fontSize: normalize(14),
    color: COLORS.dark,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.gray200,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleActive: { backgroundColor: COLORS.primary },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.white,
  },
  toggleThumbActive: { alignSelf: 'flex-end' },

  // Review card
  reviewCard: {
    backgroundColor: COLORS.gray50,
    borderRadius: normalize(16),
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.grayBorder,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  reviewRowContent: { flex: 1 },
  reviewLabel: {
    fontSize: normalize(12),
    color: COLORS.gray,
    marginBottom: 2,
  },
  reviewValue: {
    fontSize: normalize(14),
    fontWeight: '500',
    color: COLORS.dark,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: COLORS.grayBorder,
    marginVertical: 4,
  },

  // Bottom
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.grayBorder,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: normalize(14),
    gap: 8,
  },
  nextButtonText: {
    fontSize: normalize(16),
    fontWeight: '600',
    color: COLORS.white,
  },

  // Limit
  limitContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  limitTitle: {
    fontSize: normalize(20),
    fontWeight: '700',
    color: COLORS.dark,
    marginTop: 16,
    marginBottom: 8,
  },
  limitText: {
    fontSize: normalize(14),
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: normalize(20),
    marginBottom: 24,
  },
  upgradeButton: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: normalize(14),
  },
  upgradeButtonText: {
    fontSize: normalize(16),
    fontWeight: '600',
    color: COLORS.white,
  },
  backLink: { marginTop: 16 },
  backLinkText: {
    fontSize: normalize(14),
    color: COLORS.primary,
    fontWeight: '500',
  },
});
