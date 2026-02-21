import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Keyboard, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { SIZES, SPACING, TYPOGRAPHY, GRADIENTS } from '../../config/theme';
import { searchNominatim, isValidCoordinate, NominatimSearchResult } from '../../config/api';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { KEYBOARD_BEHAVIOR } from '../../config/platform';

type BusinessInfoScreenProps = Readonly<{
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}>;

export default function BusinessInfoScreen({ navigation, route }: BusinessInfoScreenProps) {
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<NominatimSearchResult[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [businessLatitude, setBusinessLatitude] = useState<number | undefined>();
  const [businessLongitude, setBusinessLongitude] = useState<number | undefined>();

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const params = useMemo(() => route?.params || {}, [route?.params]);
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, []);

  const hasBusinessName = businessName.trim().length > 0;
  const isFormValid = hasBusinessName && address.trim().length > 0;

  // Nominatim (OpenStreetMap) autocomplete - FREE
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 3) return setAddressSuggestions([]);
    setIsLoadingSuggestions(true);
    try {
      const results = await searchNominatim(query, { limit: 4 });
      setAddressSuggestions(results);
    } catch (error) {
      if (__DEV__) console.warn('[BusinessInfoScreen] Address search failed:', error);
      setAddressSuggestions([]);
      Alert.alert('Search failed', 'Could not search for addresses. Please type your address manually.');
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  const handleAddressChange = useCallback((text: string) => {
    setAddress(text);
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    searchTimeout.current = setTimeout(() => searchPlaces(text), 300);
  }, [searchPlaces]);

  const selectAddress = useCallback((suggestion: NominatimSearchResult) => {
    const parsedLat = Number.parseFloat(suggestion.lat);
    const parsedLng = Number.parseFloat(suggestion.lon);

    // Validate parsed coordinates before setting state
    if (!isValidCoordinate(parsedLat, parsedLng)) {
      if (__DEV__) console.warn('[BusinessInfoScreen] Invalid coordinates from Nominatim:', { lat: suggestion.lat, lon: suggestion.lon });
      Alert.alert('Invalid Location', 'The selected location has invalid coordinates. Please try another address.');
      return;
    }

    setAddress(suggestion.display_name);
    setBusinessLatitude(parsedLat);
    setBusinessLongitude(parsedLng);
    setAddressSuggestions([]);
    Keyboard.dismiss();
  }, []);

  const detectCurrentLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showError('Permission needed', 'Please allow location access to detect your business location.');
        setIsLoadingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [reverseResult] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      if (reverseResult) {
        const parts = [reverseResult.streetNumber, reverseResult.street, reverseResult.city, reverseResult.postalCode, reverseResult.country].filter(Boolean);
        setAddress(parts.join(', '));
        setBusinessLatitude(location.coords.latitude);
        setBusinessLongitude(location.coords.longitude);
        setAddressSuggestions([]);
      }
    } catch (error) {
      if (__DEV__) console.warn('Location error:', error);
    } finally {
      setIsLoadingLocation(false);
    }
  }, [showError]);

  const handleNext = useCallback(() => {
    if (!isFormValid) return;
    // Simplified: only passing essential data
    // Logo, phone, website, social links can be added later in Settings
    navigate('Guidelines', {
      ...params,
      businessName: businessName.trim(),
      businessAddress: address.trim(),
      businessLatitude,
      businessLongitude,
    });
  }, [isFormValid, navigate, params, businessName, address, businessLatitude, businessLongitude]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={KEYBOARD_BEHAVIOR} style={styles.flex}>
        {/* Header with Progress Bar - Pro Business flow step 2/4 */}
        <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={2} totalSteps={3} />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Business Details</Text>
            <Text style={styles.subtitle}>Tell us about your business</Text>
          </View>

          {/* Business Name */}
          <Text style={styles.label}>Business Name <Text style={styles.required}>*</Text></Text>
          <LinearGradient
            colors={(businessName.length > 0 || focusedField === 'businessName') ? GRADIENTS.button : GRADIENTS.buttonDisabled}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, businessName.length > 0 && styles.inputInnerValid]}>
              <Ionicons name="business-outline" size={18} color={(businessName.length > 0 || focusedField === 'businessName') ? colors.primary : colors.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="Your business name"
                placeholderTextColor={colors.grayMuted}
                value={businessName}
                onChangeText={setBusinessName}
                onFocus={() => setFocusedField('businessName')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="words"
              />
            </View>
          </LinearGradient>

          {/* Dynamic Welcome Greeting */}
          {hasBusinessName && (
            <Text style={styles.greeting}>Welcome to Smuppy, <Text style={styles.greetingName}>{businessName.trim()}</Text>!</Text>
          )}

          {/* Address */}
          <Text style={styles.label}>Address <Text style={styles.required}>*</Text></Text>
          <LinearGradient
            colors={(address.length > 0 || focusedField === 'address') ? GRADIENTS.button : GRADIENTS.buttonDisabled}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, address.length > 0 && styles.inputInnerValid]}>
              <TouchableOpacity onPress={detectCurrentLocation} disabled={isLoadingLocation} style={styles.locationBtn}>
                {isLoadingLocation ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="locate" size={18} color={(address.length > 0 || focusedField === 'address') ? colors.primary : colors.grayMuted} />
                )}
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Start typing or use location..."
                placeholderTextColor={colors.grayMuted}
                value={address}
                onChangeText={handleAddressChange}
                onFocus={() => setFocusedField('address')}
                onBlur={() => setFocusedField(null)}
              />
              {isLoadingSuggestions && <ActivityIndicator size="small" color={colors.primary} />}
            </View>
          </LinearGradient>

          {/* Address Suggestions */}
          {addressSuggestions.length > 0 && focusedField === 'address' && (
            <View style={styles.suggestions}>
              {addressSuggestions.map((s, i) => (
                <TouchableOpacity
                  key={s.place_id.toString()}
                  style={[styles.suggestionItem, i === addressSuggestions.length - 1 && styles.suggestionLast]}
                  onPress={() => selectAddress(s)}
                >
                  <Ionicons name="location" size={16} color={colors.primary} />
                  <Text style={styles.suggestionText} numberOfLines={2}>{s.display_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Info note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={16} color={colors.grayMuted} />
            <Text style={styles.infoText}>You can add logo, phone, website and social links later in Settings</Text>
          </View>
        </View>

        {/* Fixed Footer */}
        <View style={styles.fixedFooter}>
          <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" disabled={!isFormValid || disabled} onPress={handleNext}>
            Next
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING.sm },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: colors.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.grayMuted, textAlign: 'center' },
  greeting: { fontSize: 14, fontWeight: '500', color: colors.primary, textAlign: 'center', marginBottom: SPACING.sm },
  greetingName: { fontWeight: '700', color: colors.dark },
  label: { ...TYPOGRAPHY.label, color: colors.dark, marginBottom: 4, fontSize: 12 },
  required: { color: colors.error },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.sm },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.sm, backgroundColor: colors.backgroundSecondary },
  inputInnerValid: { backgroundColor: colors.backgroundValid },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.xs, fontSize: 14, color: colors.dark },
  locationBtn: { padding: 2 },
  suggestions: { backgroundColor: colors.backgroundSecondary, borderRadius: 12, marginTop: -SPACING.sm, marginBottom: SPACING.md, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: SPACING.base, borderBottomWidth: 1, borderBottomColor: colors.grayLight },
  suggestionLast: { borderBottomWidth: 0 },
  suggestionText: { flex: 1, fontSize: 14, color: colors.dark, marginLeft: SPACING.sm },
  infoNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? colors.backgroundSecondary : '#F8F9FA', borderRadius: 10, padding: SPACING.base, marginTop: SPACING.md, gap: SPACING.sm },
  infoText: { flex: 1, fontSize: 13, color: colors.grayMuted, lineHeight: 18 },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg, paddingTop: SPACING.sm, backgroundColor: colors.background },
});
