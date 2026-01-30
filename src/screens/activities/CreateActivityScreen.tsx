/**
 * CreateActivityScreen
 * Unified screen for creating activities (merges Events + Groups).
 * 5-step wizard: Category → Details → Location/Route → Save & Share → Review
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DARK_COLORS as COLORS, GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores';
import RouteMapPicker from '../../components/RouteMapPicker';
import type { RouteResult, Coordinate } from '../../services/mapbox-directions';
import type { RouteProfile } from '../../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TOTAL_STEPS = 5;

// ============================================
// CATEGORIES
// ============================================

interface ActivityCategory {
  id: string;
  name: string;
  slug: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isRouteActivity: boolean;
  subcategories: string[];
}

const CATEGORIES: ActivityCategory[] = [
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

const CreateActivityScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const { currency } = useCurrency();
  const user = useUserStore((state) => state.user);
  const isProCreator = user?.accountType === 'pro_creator' || user?.accountType === 'pro_business';
  const lockedLocation = route?.params?.lockedLocation || null;

  // Limits
  const [canCreate, setCanCreate] = useState(true);
  const [checkingLimits, setCheckingLimits] = useState(true);

  // Form state
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [customSubcategory, setCustomSubcategory] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('');
  const [isPublic, _setIsPublic] = useState(true);

  // Save & Share options (both can be checked)
  const [saveToProfile, setSaveToProfile] = useState(true);
  const [shareOnMap, setShareOnMap] = useState(true);

  // Location/Route
  const [locationName, setLocationName] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [routeData, setRouteData] = useState<(RouteResult & { start: Coordinate; end: Coordinate; waypoints: Coordinate[]; profile: RouteProfile }) | null>(null);

  // UI
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const isRouteActivity = selectedCategory?.isRouteActivity ?? false;
  const subcategory = selectedSubcategory || customSubcategory;

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
        setCanCreate(response.canCreateEvent !== false || response.canCreateGroup !== false);
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

  const goNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(s => Math.min(s + 1, TOTAL_STEPS));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const goBack = useCallback(() => {
    if (step === 1) {
      navigation.goBack();
    } else {
      setStep(s => s - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [step, navigation]);

  // ============================================
  // SUBMIT
  // ============================================

  const handleSubmit = useCallback(async () => {
    if (!selectedCategory || !title.trim() || !coordinates) {
      Alert.alert('Missing info', 'Please fill in all required fields.');
      return;
    }
    if (!saveToProfile && !shareOnMap) {
      Alert.alert('Choose an option', 'Please select Save, Share, or both.');
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const sub = selectedSubcategory || customSubcategory.trim();

      // Create via group endpoint (unified backend)
      const response = await awsAPI.createGroup({
        name: title.trim(),
        description: description.trim(),
        category: selectedCategory.slug as any,
        subcategory: sub,
        sport_type: selectedCategory.slug,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        address: locationName.trim() || 'Activity Location',
        starts_at: startDate.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        max_participants: maxParticipants ? parseInt(maxParticipants) : undefined,
        is_free: isFree,
        price: !isFree && price ? parseFloat(price) : undefined,
        currency: currency.code,
        is_public: isPublic && shareOnMap,
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
        // Fire-and-forget custom subcategory suggestion
        if (customSubcategory.trim() && selectedCategory) {
          awsAPI.suggestSubcategory({
            parent_category: selectedCategory.slug,
            name: customSubcategory.trim(),
          }).catch(() => {});
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const activityId = response.group?.id;

        if (shareOnMap) {
          const shareUrl = `https://smuppy.app/activities/${activityId}`;
          Alert.alert(
            'Activity Created!',
            saveToProfile
              ? 'Saved to your profile and visible on the map.'
              : 'Your activity is now visible on the map.',
            [
              {
                text: 'Share Link',
                onPress: async () => {
                  try {
                    await Share.share({
                      message: `Join me at "${title}"!\n\n${shareUrl}`,
                      title: `Join: ${title}`,
                      url: shareUrl,
                    });
                  } catch { /* cancelled */ }
                  navigation.replace('GroupDetail', { groupId: activityId });
                },
              },
              {
                text: 'View',
                onPress: () => navigation.replace('GroupDetail', { groupId: activityId }),
              },
            ]
          );
        } else {
          Alert.alert('Activity Saved!', 'You can share it on the map later from your profile.', [
            { text: 'Done', onPress: () => navigation.goBack() },
          ]);
        }
      } else {
        Alert.alert('Error', response.message || 'Failed to create activity');
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      Alert.alert('Error', message);
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedCategory, title, coordinates, saveToProfile, shareOnMap,
    selectedSubcategory, customSubcategory, description, locationName,
    startDate, maxParticipants, isFree, price, currency.code, isPublic,
    routeData, navigation,
  ]);

  // ============================================
  // CAN PROCEED
  // ============================================

  const canProceed = useMemo(() => {
    switch (step) {
      case 1: return !!selectedCategory;
      case 2: return title.trim().length > 0;
      case 3: return !!coordinates || !!routeData;
      case 4: return saveToProfile || shareOnMap;
      default: return true;
    }
  }, [step, selectedCategory, title, coordinates, routeData, saveToProfile, shareOnMap]);

  // ============================================
  // STEP 1: Category
  // ============================================

  const renderCategoryStep = useCallback(() => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>What type of activity?</Text>
      <Text style={styles.stepSubtitle}>Choose a category</Text>

      <View style={styles.categoryGrid}>
        {CATEGORIES.map(cat => {
          const isSelected = selectedCategory?.id === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              style={[
                styles.categoryCard,
                isSelected && styles.categoryCardSelected,
                isSelected ? { borderColor: cat.color } : undefined,
              ]}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedCategory(cat);
                setSelectedSubcategory('');
              }}
            >
              <View style={[styles.categoryIcon, { backgroundColor: cat.color + '20' }]}>
                <Ionicons name={cat.icon} size={24} color={cat.color} />
              </View>
              <Text style={styles.categoryName}>{cat.name}</Text>
              {isSelected && (
                <View style={[styles.categoryCheck, { backgroundColor: cat.color }]}>
                  <Ionicons name="checkmark" size={12} color="#FFF" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedCategory && (
        <View style={styles.subcategorySection}>
          <Text style={styles.subcategoryTitle}>Subcategory (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {selectedCategory.subcategories.map(sub => (
              <TouchableOpacity
                key={sub}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedSubcategory(selectedSubcategory === sub ? '' : sub);
                  setCustomSubcategory('');
                }}
              >
                {selectedSubcategory === sub ? (
                  <LinearGradient colors={GRADIENTS.primary} style={styles.subcategoryChip}>
                    <Text style={styles.subcategoryChipTextActive}>{sub}</Text>
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
            placeholderTextColor={COLORS.gray}
            value={customSubcategory}
            onChangeText={(t) => { setCustomSubcategory(t); setSelectedSubcategory(''); }}
          />
        </View>
      )}
    </View>
  ), [selectedCategory, selectedSubcategory, customSubcategory]);

  // ============================================
  // STEP 2: Details
  // ============================================

  const renderDetailsStep = useCallback(() => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Activity Details</Text>
      <Text style={styles.stepSubtitle}>Tell people about your activity</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Morning 5K Run"
          placeholderTextColor={COLORS.gray}
          maxLength={100}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Tell people what to expect..."
          placeholderTextColor={COLORS.gray}
          multiline
          maxLength={500}
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Date & Time</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar" size={20} color={COLORS.primary} />
          <Text style={styles.dateButtonText}>
            {startDate.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Max Participants</Text>
        <TextInput
          style={styles.input}
          value={maxParticipants}
          onChangeText={setMaxParticipants}
          placeholder="Leave empty for unlimited"
          placeholderTextColor={COLORS.gray}
          keyboardType="number-pad"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Pricing</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleButton, isFree && styles.toggleButtonActive]}
            onPress={() => setIsFree(true)}
          >
            <Text style={[styles.toggleButtonText, isFree && styles.toggleButtonTextActive]}>Free</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, !isFree && styles.toggleButtonActive]}
            onPress={() => {
              if (isProCreator) {
                setIsFree(false);
              } else {
                Alert.alert(
                  'Monetize Your Activities',
                  'Upgrade to Pro Creator to create paid activities.',
                  [
                    { text: 'Maybe Later', style: 'cancel' },
                    { text: 'Upgrade to Pro', onPress: () => navigation.navigate('UpgradeToPro') },
                  ]
                );
              }
            }}
          >
            <Text style={[styles.toggleButtonText, !isFree && styles.toggleButtonTextActive]}>Monetize</Text>
            {!isProCreator && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {!isFree && isProCreator && (
          <View style={styles.priceInputContainer}>
            <Text style={styles.currencySymbol}>{currency.symbol}</Text>
            <TextInput
              style={styles.priceInput}
              value={price}
              onChangeText={setPrice}
              placeholder="0.00"
              placeholderTextColor={COLORS.gray}
              keyboardType="decimal-pad"
            />
          </View>
        )}
      </View>
    </View>
  ), [title, description, startDate, maxParticipants, isFree, price, isProCreator, currency.symbol, navigation]);

  // ============================================
  // STEP 3: Location / Route
  // ============================================

  const renderLocationStep = useCallback(() => (
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
  ), [isRouteActivity, selectedCategory?.slug, lockedLocation, locationName]);

  // ============================================
  // STEP 4: Save & Share
  // ============================================

  const renderSaveShareStep = useCallback(() => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Save & Share</Text>
      <Text style={styles.stepSubtitle}>Choose how you want to publish your activity</Text>

      <TouchableOpacity
        style={[styles.optionCard, saveToProfile && styles.optionCardActive]}
        activeOpacity={0.8}
        onPress={() => setSaveToProfile(prev => !prev)}
      >
        <View style={styles.optionIconWrap}>
          <Ionicons name="bookmark" size={24} color={saveToProfile ? COLORS.primary : COLORS.gray} />
        </View>
        <View style={styles.optionContent}>
          <Text style={styles.optionTitle}>Save to Profile</Text>
          <Text style={styles.optionDescription}>
            Store this activity in your profile. You can share it on the map later.
          </Text>
        </View>
        <View style={[styles.checkbox, saveToProfile && styles.checkboxActive]}>
          {saveToProfile && <Ionicons name="checkmark" size={16} color={COLORS.white} />}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.optionCard, shareOnMap && styles.optionCardActive]}
        activeOpacity={0.8}
        onPress={() => setShareOnMap(prev => !prev)}
      >
        <View style={styles.optionIconWrap}>
          <Ionicons name="map" size={24} color={shareOnMap ? COLORS.primary : COLORS.gray} />
        </View>
        <View style={styles.optionContent}>
          <Text style={styles.optionTitle}>Share on Map</Text>
          <Text style={styles.optionDescription}>
            Make this activity visible on the Xplorer map so others can find and join.
          </Text>
        </View>
        <View style={[styles.checkbox, shareOnMap && styles.checkboxActive]}>
          {shareOnMap && <Ionicons name="checkmark" size={16} color={COLORS.white} />}
        </View>
      </TouchableOpacity>
    </View>
  ), [saveToProfile, shareOnMap]);

  // ============================================
  // STEP 5: Review
  // ============================================

  const renderReviewStep = useCallback(() => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Review</Text>
      <Text style={styles.stepSubtitle}>Everything look good?</Text>

      <View style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <View style={[styles.categoryIcon, { backgroundColor: (selectedCategory?.color || COLORS.primary) + '20' }]}>
            <Ionicons name={selectedCategory?.icon || 'people'} size={24} color={selectedCategory?.color || COLORS.primary} />
          </View>
          <View style={styles.reviewHeaderText}>
            <Text style={styles.reviewTitle}>{title}</Text>
            <Text style={styles.reviewCategory}>
              {selectedCategory?.name}{subcategory ? ` · ${subcategory}` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.reviewRow}>
          <Ionicons name="calendar" size={18} color={COLORS.gray} />
          <Text style={styles.reviewRowText}>
            {startDate.toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </View>

        <View style={styles.reviewRow}>
          <Ionicons name="location" size={18} color={COLORS.gray} />
          <Text style={styles.reviewRowText}>{locationName || 'Location set on map'}</Text>
        </View>

        {routeData && (
          <View style={styles.reviewRow}>
            <Ionicons name="map" size={18} color={COLORS.gray} />
            <Text style={styles.reviewRowText}>
              {routeData.distanceKm} km · {routeData.durationMin} min · {routeData.difficulty}
            </Text>
          </View>
        )}

        <View style={styles.reviewRow}>
          <Ionicons name="people" size={18} color={COLORS.gray} />
          <Text style={styles.reviewRowText}>
            {maxParticipants ? `Max ${maxParticipants} participants` : 'Unlimited participants'}
          </Text>
        </View>

        <View style={styles.reviewRow}>
          <Ionicons name="pricetag" size={18} color={COLORS.gray} />
          <Text style={styles.reviewRowText}>
            {isFree ? 'Free activity' : `${currency.symbol}${price}`}
          </Text>
        </View>

        <View style={styles.reviewDivider} />

        <View style={styles.reviewRow}>
          <Ionicons name="bookmark" size={18} color={saveToProfile ? COLORS.primary : COLORS.gray} />
          <Text style={styles.reviewRowText}>
            {saveToProfile ? 'Saved to profile' : 'Not saved to profile'}
          </Text>
        </View>

        <View style={styles.reviewRow}>
          <Ionicons name="map" size={18} color={shareOnMap ? COLORS.primary : COLORS.gray} />
          <Text style={styles.reviewRowText}>
            {shareOnMap ? 'Visible on map' : 'Not shared on map'}
          </Text>
        </View>
      </View>
    </View>
  ), [selectedCategory, title, subcategory, startDate, locationName, routeData, maxParticipants, isFree, price, currency.symbol, saveToProfile, shareOnMap]);

  // ============================================
  // LOADING / LIMIT
  // ============================================

  if (checkingLimits) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Checking account limits...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!canCreate && !isProCreator) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Activity</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.limitContainer}>
          <View style={styles.limitIcon}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.primary} />
            <View style={styles.limitBadge}>
              <Ionicons name="lock-closed" size={16} color={COLORS.white} />
            </View>
          </View>
          <Text style={styles.limitTitle}>Monthly Limit Reached</Text>
          <Text style={styles.limitSubtitle}>
            Personal accounts can create 1 activity per month.{'\n'}
            Upgrade to Pro for unlimited activities.
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('UpgradeToPro')}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.upgradeButton}>
              <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackLink}>
            <Text style={styles.goBackLinkText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Activity</Text>
        <View style={styles.stepIndicator}>
          <Text style={styles.stepIndicatorText}>{step}/{TOTAL_STEPS}</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {step === 1 && renderCategoryStep()}
          {step === 2 && renderDetailsStep()}
          {step === 3 && renderLocationStep()}
          {step === 4 && renderSaveShareStep()}
          {step === 5 && renderReviewStep()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={step === TOTAL_STEPS ? handleSubmit : goNext}
          disabled={isLoading || !canProceed}
        >
          <LinearGradient
            colors={canProceed ? GRADIENTS.primary : [COLORS.gray, COLORS.gray]}
            style={styles.actionButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Text style={styles.actionButtonText}>
                  {step === TOTAL_STEPS ? 'Create Activity' : 'Continue'}
                </Text>
                <Ionicons
                  name={step === TOTAL_STEPS ? 'checkmark' : 'arrow-forward'}
                  size={20}
                  color={COLORS.white}
                />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={startDate}
          mode="datetime"
          display="spinner"
          minimumDate={new Date(Date.now() + 60 * 60 * 1000)}
          onChange={(_, date) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (date) setStartDate(date);
          }}
        />
      )}
    </SafeAreaView>
  );
};

export default CreateActivityScreen;

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  flex: {
    flex: 1,
  },

  // Loading & Limit
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    color: COLORS.gray,
  },
  limitContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  limitBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.dark,
  },
  limitTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  limitSubtitle: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  upgradeButton: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 14,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  goBackLink: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  goBackLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  headerSpacer: {
    width: 40,
  },
  stepIndicator: {
    backgroundColor: COLORS.darkGray,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  stepIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Progress
  progressBar: {
    height: 3,
    backgroundColor: COLORS.darkGray,
    marginHorizontal: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },

  // Content
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  stepContent: {
    gap: 16,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.white,
  },
  stepSubtitle: {
    fontSize: 15,
    color: COLORS.gray,
    marginBottom: 8,
  },

  // Categories
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: (SCREEN_WIDTH - 56) / 3,
    aspectRatio: 1,
    backgroundColor: COLORS.darkGray,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  categoryCardSelected: {
    borderWidth: 2,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
  categoryCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Subcategory
  subcategorySection: {
    marginTop: 8,
    gap: 10,
  },
  subcategoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.lightGray,
  },
  subcategoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  subcategoryChipInactive: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: COLORS.darkGray,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  subcategoryChipTextActive: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.white,
  },
  subcategoryChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.lightGray,
  },
  customSubInput: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Form
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.lightGray,
  },
  input: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.darkGray,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateButtonText: {
    fontSize: 16,
    color: COLORS.white,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: COLORS.darkGray,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  toggleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray,
  },
  toggleButtonTextActive: {
    color: COLORS.primary,
  },
  proBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.dark,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.darkGray,
    borderRadius: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.gray,
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.white,
  },

  // Save & Share (Step 4)
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.darkGray,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: COLORS.border,
    gap: 14,
  },
  optionCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  optionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.dark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: COLORS.gray,
    lineHeight: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  // Review
  reviewCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 20,
    padding: 20,
    gap: 16,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  reviewHeaderText: {
    flex: 1,
  },
  reviewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  reviewCategory: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 2,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewRowText: {
    fontSize: 15,
    color: COLORS.lightGray,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  // Bottom Action
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: COLORS.dark,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
  },
});
