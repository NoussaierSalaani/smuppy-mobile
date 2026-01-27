/**
 * CreateEventScreen
 * Create sports/fitness events with route planning
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
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DARK_COLORS as COLORS, GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores';

const { width: SCREEN_WIDTH, height: _SCREEN_HEIGHT } = Dimensions.get('window');

interface EventCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}

const CATEGORIES: EventCategory[] = [
  { id: '1', name: 'Running', slug: 'running', icon: 'walk', color: '#FF6B6B' },
  { id: '2', name: 'Hiking', slug: 'hiking', icon: 'trail-sign', color: '#4ECDC4' },
  { id: '3', name: 'Cycling', slug: 'cycling', icon: 'bicycle', color: '#45B7D1' },
  { id: '4', name: 'Soccer', slug: 'soccer', icon: 'football', color: '#96CEB4' },
  { id: '5', name: 'Basketball', slug: 'basketball', icon: 'basketball', color: '#FFEAA7' },
  { id: '6', name: 'Tennis', slug: 'tennis', icon: 'tennisball', color: '#DDA0DD' },
  { id: '7', name: 'Padel', slug: 'padel', icon: 'tennisball', color: '#98D8C8' },
  { id: '8', name: 'Yoga', slug: 'yoga', icon: 'body', color: '#F7DC6F' },
  { id: '9', name: 'CrossFit', slug: 'crossfit', icon: 'barbell', color: '#E74C3C' },
  { id: '10', name: 'Swimming', slug: 'swimming', icon: 'water', color: '#3498DB' },
  { id: '11', name: 'Martial Arts', slug: 'martial-arts', icon: 'hand-left', color: '#9B59B6' },
  { id: '12', name: 'Other', slug: 'other', icon: 'ellipsis-horizontal', color: '#95A5A6' },
];

const ROUTE_CATEGORIES = ['running', 'hiking', 'cycling'];

const CreateEventScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { currency, formatAmount: _formatAmount } = useCurrency();
  const user = useUserStore((state) => state.user);
  const isProCreator = user?.accountType === 'pro_creator';

  // Account limits state
  const [canCreate, setCanCreate] = useState(true);
  const [eventsThisMonth, setEventsThisMonth] = useState(0);
  const [checkingLimits, setCheckingLimits] = useState(true);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<EventCategory | null>(null);
  const [locationName, setLocationName] = useState('');
  const [address, _setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [startDate, setStartDate] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [_showTimePicker, _setShowTimePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'start' | 'end'>('start');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [price, setPrice] = useState('');
  const [isPublic, _setIsPublic] = useState(true);
  const [isFansOnly, _setIsFansOnly] = useState(false);

  // Route state (for running, hiking, cycling)
  const [hasRoute, setHasRoute] = useState(false);
  const [routePoints, setRoutePoints] = useState<{ latitude: number; longitude: number }[]>([]);
  const [routeDistance, setRouteDistance] = useState(0);
  const [routeDifficulty, setRouteDifficulty] = useState<'easy' | 'moderate' | 'hard' | 'expert'>('moderate');

  // UI state
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const mapRef = useRef<MapView>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Check creation limits on mount (personal accounts: 1 event/month)
  useEffect(() => {
    const checkLimits = async () => {
      if (isProCreator) {
        // Pro creators have unlimited events
        setCheckingLimits(false);
        setCanCreate(true);
        return;
      }

      try {
        const response = await awsAPI.checkCreationLimits();
        setCanCreate(response.canCreateEvent);
        setEventsThisMonth(response.eventsThisMonth || 0);
      } catch (error) {
        console.error('Error checking limits:', error);
        // Allow creation on error to not block users
        setCanCreate(true);
      } finally {
        setCheckingLimits(false);
      }
    };

    checkLimits();
  }, [isProCreator]);

  useEffect(() => {
    getUserLocation();
  }, []);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });

      if (!coordinates) {
        setCoordinates({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    } catch (error) {
      console.log('Location error:', error);
    }
  };

  const handleMapPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;

    if (hasRoute && selectedCategory && ROUTE_CATEGORIES.includes(selectedCategory.slug)) {
      // Add point to route
      const newPoints = [...routePoints, { latitude, longitude }];
      setRoutePoints(newPoints);
      calculateRouteDistance(newPoints);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      // Set event location
      setCoordinates({ lat: latitude, lng: longitude });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const calculateRouteDistance = (points: { latitude: number; longitude: number }[]) => {
    if (points.length < 2) {
      setRouteDistance(0);
      return;
    }

    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      distance += getDistanceFromLatLonInKm(
        points[i - 1].latitude,
        points[i - 1].longitude,
        points[i].latitude,
        points[i].longitude
      );
    }
    setRouteDistance(distance);
  };

  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const deg2rad = (deg: number) => deg * (Math.PI / 180);

  const handleUndoRoutePoint = () => {
    if (routePoints.length > 0) {
      const newPoints = routePoints.slice(0, -1);
      setRoutePoints(newPoints);
      calculateRouteDistance(newPoints);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleClearRoute = () => {
    setRoutePoints([]);
    setRouteDistance(0);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const handleNextStep = () => {
    if (step === 1 && !selectedCategory) {
      Alert.alert('Error', 'Please select a category');
      return;
    }
    if (step === 2 && !title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    if (step === 3 && !coordinates) {
      Alert.alert('Error', 'Please select a location on the map');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(step + 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(step - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      navigation.goBack();
    }
  };

  const handleCreate = async () => {
    if (!selectedCategory || !title || !coordinates) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const eventData = {
        title: title.trim(),
        description: description.trim() || undefined,
        categorySlug: selectedCategory.slug,
        locationName: locationName.trim() || 'Event Location',
        address: address.trim() || undefined,
        latitude: coordinates.lat,
        longitude: coordinates.lng,
        startsAt: startDate.toISOString(),
        endsAt: endDate?.toISOString(),
        maxParticipants: maxParticipants ? parseInt(maxParticipants) : undefined,
        isFree,
        price: !isFree && price ? parseFloat(price) : undefined,
        currency: currency.code,
        isPublic,
        isFansOnly: isPublic ? isFansOnly : false,
        hasRoute: hasRoute && routePoints.length > 1,
        routeDistanceKm: hasRoute ? routeDistance : undefined,
        routeDifficulty: hasRoute ? routeDifficulty : undefined,
        routeWaypoints: hasRoute
          ? routePoints.map((p, i) => ({ lat: p.latitude, lng: p.longitude }))
          : undefined,
      };

      const response = await awsAPI.createEvent(eventData);

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const eventId = response.event.id;
        const shareUrl = `https://smuppy.app/events/${eventId}`;

        const shareEvent = async (audience: 'fans' | 'public') => {
          try {
            const audienceText = audience === 'fans' ? '🔒 Exclusive for my fans!' : '🌍 Open to everyone!';
            const shareMessage = `Join me at "${title}"!\n\n📅 ${startDate.toLocaleDateString()}\n📍 ${locationName || 'Location on map'}\n${isFree ? '🆓 Free event!' : `💰 ${currency.symbol}${price}`}\n\n${audienceText}\n\n${shareUrl}`;

            await Share.share({
              message: shareMessage,
              title: `Join: ${title}`,
              url: shareUrl,
            });
          } catch {
            // User cancelled or error
          }
          navigation.replace('EventDetail', { eventId });
        };

        Alert.alert(
          '🎉 Event Created!',
          'Your event is now live. How would you like to share it?',
          [
            {
              text: 'View Event',
              style: 'cancel',
              onPress: () => navigation.replace('EventDetail', { eventId }),
            },
            {
              text: '🔒 Share with Fans',
              onPress: () => shareEvent('fans'),
            },
            {
              text: '🌍 Share Publicly',
              onPress: () => shareEvent('public'),
            },
          ]
        );
      } else {
        throw new Error(response.message || 'Failed to create event');
      }
    } catch (error: any) {
      console.error('Create event error:', error);
      Alert.alert('Error', error.message || 'Failed to create event');
    } finally {
      setIsLoading(false);
    }
  };

  const renderCategoryPicker = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What type of activity?</Text>
      <Text style={styles.stepSubtitle}>Choose a category for your event</Text>

      <View style={styles.categoriesGrid}>
        {CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[
              styles.categoryCard,
              selectedCategory?.id === category.id && styles.categoryCardSelected,
              { borderColor: selectedCategory?.id === category.id ? category.color : COLORS.border },
            ]}
            onPress={() => {
              setSelectedCategory(category);
              setHasRoute(ROUTE_CATEGORIES.includes(category.slug));
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <View style={[styles.categoryIcon, { backgroundColor: category.color + '20' }]}>
              <Ionicons name={category.icon as any} size={24} color={category.color} />
            </View>
            <Text style={styles.categoryName}>{category.name}</Text>
            {selectedCategory?.id === category.id && (
              <View style={[styles.categoryCheck, { backgroundColor: category.color }]}>
                <Ionicons name="checkmark" size={12} color="#FFF" />
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderDetailsForm = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Event Details</Text>
      <Text style={styles.stepSubtitle}>Tell people about your event</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="e.g., Morning Run at Central Park"
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
        <Text style={styles.label}>Date & Time *</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => {
            setDatePickerMode('start');
            setShowDatePicker(true);
          }}
        >
          <Ionicons name="calendar" size={20} color={COLORS.primary} />
          <Text style={styles.dateButtonText}>
            {startDate.toLocaleDateString()} at {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            style={[
              styles.toggleButton,
              !isFree && styles.toggleButtonActive,
            ]}
            onPress={() => {
              if (isProCreator) {
                setIsFree(false);
              } else {
                // Show upgrade popup for non-pro creators
                Alert.alert(
                  '💎 Monetize Your Events',
                  'Unlock paid events and start earning from your community!\n\nPro Creator benefits:\n• Create unlimited paid events\n• Receive tips from fans\n• 80% revenue share\n• Priority support',
                  [
                    { text: 'Maybe Later', style: 'cancel' },
                    {
                      text: 'Upgrade to Pro',
                      onPress: () => navigation.navigate('UpgradeToPro'),
                    },
                  ]
                );
              }
            }}
          >
            <Text style={[styles.toggleButtonText, !isFree && styles.toggleButtonTextActive]}>
              💰 Monetize
            </Text>
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
  );

  const renderLocationPicker = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Location</Text>
      <Text style={styles.stepSubtitle}>
        {hasRoute ? 'Tap on the map to draw your route' : 'Tap on the map to set the meeting point'}
      </Text>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={{
            latitude: userLocation?.lat || 48.8566,
            longitude: userLocation?.lng || 2.3522,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          onPress={handleMapPress}
          customMapStyle={darkMapStyle}
        >
          {coordinates && !hasRoute && (
            <Marker
              coordinate={{ latitude: coordinates.lat, longitude: coordinates.lng }}
              pinColor={selectedCategory?.color || COLORS.primary}
            />
          )}

          {hasRoute && routePoints.length > 0 && (
            <>
              <Polyline
                coordinates={routePoints}
                strokeColor={selectedCategory?.color || COLORS.primary}
                strokeWidth={4}
              />
              {routePoints.map((point, index) => (
                <Marker
                  key={index}
                  coordinate={point}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View
                    style={[
                      styles.routeMarker,
                      {
                        backgroundColor:
                          index === 0
                            ? '#4CAF50'
                            : index === routePoints.length - 1
                            ? '#F44336'
                            : selectedCategory?.color || COLORS.primary,
                      },
                    ]}
                  >
                    <Text style={styles.routeMarkerText}>
                      {index === 0 ? 'S' : index === routePoints.length - 1 ? 'E' : index}
                    </Text>
                  </View>
                </Marker>
              ))}
            </>
          )}
        </MapView>

        {hasRoute && (
          <View style={styles.routeControls}>
            <BlurView intensity={80} tint="dark" style={styles.routeControlsBlur}>
              <View style={styles.routeInfo}>
                <Ionicons name="navigate" size={18} color={COLORS.primary} />
                <Text style={styles.routeInfoText}>{routeDistance.toFixed(2)} km</Text>
              </View>
              <TouchableOpacity style={styles.routeButton} onPress={handleUndoRoutePoint}>
                <Ionicons name="arrow-undo" size={18} color={COLORS.white} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.routeButton} onPress={handleClearRoute}>
                <Ionicons name="trash" size={18} color={COLORS.error} />
              </TouchableOpacity>
            </BlurView>
          </View>
        )}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Location Name</Text>
        <TextInput
          style={styles.input}
          value={locationName}
          onChangeText={setLocationName}
          placeholder="e.g., Central Park"
          placeholderTextColor={COLORS.gray}
        />
      </View>

      {hasRoute && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Difficulty</Text>
          <View style={styles.difficultyRow}>
            {(['easy', 'moderate', 'hard', 'expert'] as const).map((level) => (
              <TouchableOpacity
                key={level}
                style={[
                  styles.difficultyButton,
                  routeDifficulty === level && styles.difficultyButtonActive,
                ]}
                onPress={() => setRouteDifficulty(level)}
              >
                <Text
                  style={[
                    styles.difficultyButtonText,
                    routeDifficulty === level && styles.difficultyButtonTextActive,
                  ]}
                >
                  {level.charAt(0).toUpperCase() + level.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );

  const renderReview = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Review</Text>
      <Text style={styles.stepSubtitle}>Everything look good?</Text>

      <View style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <View style={[styles.categoryIcon, { backgroundColor: selectedCategory?.color + '20' }]}>
            <Ionicons name={selectedCategory?.icon as any} size={24} color={selectedCategory?.color} />
          </View>
          <View style={styles.reviewHeaderText}>
            <Text style={styles.reviewTitle}>{title}</Text>
            <Text style={styles.reviewCategory}>{selectedCategory?.name}</Text>
          </View>
        </View>

        <View style={styles.reviewRow}>
          <Ionicons name="calendar" size={18} color={COLORS.gray} />
          <Text style={styles.reviewRowText}>
            {startDate.toLocaleDateString()} at{' '}
            {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={styles.reviewRow}>
          <Ionicons name="location" size={18} color={COLORS.gray} />
          <Text style={styles.reviewRowText}>{locationName || 'Location set on map'}</Text>
        </View>

        {hasRoute && routeDistance > 0 && (
          <View style={styles.reviewRow}>
            <Ionicons name="navigate" size={18} color={COLORS.gray} />
            <Text style={styles.reviewRowText}>
              {routeDistance.toFixed(2)} km • {routeDifficulty}
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
            {isFree ? 'Free event' : `${currency.symbol}${price}`}
          </Text>
        </View>
      </View>
    </View>
  );

  // Loading state while checking limits
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

  // Limit reached screen for personal accounts
  if (!canCreate && !isProCreator) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Event</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.limitReachedContainer}>
          <View style={styles.limitReachedIcon}>
            <Ionicons name="calendar-outline" size={48} color={COLORS.primary} />
            <View style={styles.limitBadge}>
              <Ionicons name="lock-closed" size={16} color={COLORS.white} />
            </View>
          </View>

          <Text style={styles.limitReachedTitle}>Monthly Limit Reached</Text>
          <Text style={styles.limitReachedSubtitle}>
            You've already created {eventsThisMonth} event this month.{'\n'}
            Personal accounts can create 1 free event per month.
          </Text>

          <View style={styles.upgradeCard}>
            <LinearGradient
              colors={GRADIENTS.primary}
              style={styles.upgradeCardGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="star" size={24} color={COLORS.white} />
              <View style={styles.upgradeCardText}>
                <Text style={styles.upgradeCardTitle}>Upgrade to Pro Creator</Text>
                <Text style={styles.upgradeCardSubtitle}>Unlimited events + monetization</Text>
              </View>
              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={() => navigation.navigate('UpgradeToPro')}
              >
                <Text style={styles.upgradeButtonText}>Upgrade</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>

          <View style={styles.featuresList}>
            <Text style={styles.featuresTitle}>Pro Creator Benefits:</Text>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
              <Text style={styles.featureText}>Unlimited events</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
              <Text style={styles.featureText}>Create paid events</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
              <Text style={styles.featureText}>Receive tips from fans</Text>
            </View>
            <View style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
              <Text style={styles.featureText}>Go Live with viewers</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.goBackButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.goBackButtonText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handlePrevStep}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Event</Text>
        <View style={styles.stepIndicator}>
          <Text style={styles.stepIndicatorText}>{step}/4</Text>
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${(step / 4) * 100}%` }]} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.content}
      >
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {step === 1 && renderCategoryPicker()}
          {step === 2 && renderDetailsForm()}
          {step === 3 && renderLocationPicker()}
          {step === 4 && renderReview()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={step === 4 ? handleCreate : handleNextStep}
          disabled={isLoading}
        >
          <LinearGradient
            colors={GRADIENTS.primary}
            style={styles.actionButtonGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {isLoading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Text style={styles.actionButtonText}>
                  {step === 4 ? 'Create Event' : 'Continue'}
                </Text>
                <Ionicons
                  name={step === 4 ? 'checkmark' : 'arrow-forward'}
                  size={20}
                  color={COLORS.white}
                />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={datePickerMode === 'start' ? startDate : endDate || startDate}
          mode="datetime"
          display="spinner"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) {
              if (datePickerMode === 'start') {
                setStartDate(date);
              } else {
                setEndDate(date);
              }
            }
          }}
          minimumDate={new Date()}
        />
      )}
    </SafeAreaView>
  );
};

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e0e0e' }] },
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },

  // Loading & Limit Reached Styles
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
  limitReachedContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitReachedIcon: {
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
  limitReachedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 12,
  },
  limitReachedSubtitle: {
    fontSize: 15,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  upgradeCard: {
    width: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  upgradeCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  upgradeCardText: {
    flex: 1,
  },
  upgradeCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
  },
  upgradeCardSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  upgradeButton: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  featuresList: {
    width: '100%',
    backgroundColor: COLORS.darkGray,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  goBackButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  goBackButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.gray,
  },

  // Pro Badge
  proBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  proBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.dark,
  },

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
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  stepContainer: {
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
  categoriesGrid: {
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
  mapContainer: {
    height: 300,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  map: {
    flex: 1,
  },
  routeControls: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  routeControlsBlur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  routeInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeInfoText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  routeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.darkGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  routeMarkerText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.darkGray,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  difficultyButtonActive: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  difficultyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray,
  },
  difficultyButtonTextActive: {
    color: COLORS.primary,
  },
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
  actionButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  actionButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default CreateEventScreen;
