import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { COLORS, SIZES, SPACING, TYPOGRAPHY, GRADIENTS } from '../../config/theme';
import { searchNominatim, NominatimSearchResult } from '../../config/api';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

interface BusinessInfoScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}

export default function BusinessInfoScreen({ navigation, route }: BusinessInfoScreenProps) {
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<NominatimSearchResult[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

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
    } catch {
      setAddressSuggestions([]);
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
    setAddress(suggestion.display_name);
    setAddressSuggestions([]);
    Keyboard.dismiss();
  }, []);

  const detectCurrentLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
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
        setAddressSuggestions([]);
      }
    } catch (error) {
      console.error('Location error:', error);
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (!isFormValid) return;
    // Simplified: only passing essential data
    // Logo, phone, website, social links can be added later in Settings
    navigate('Guidelines', {
      ...params,
      businessName: businessName.trim(),
      businessAddress: address.trim(),
    });
  }, [isFormValid, navigate, params, businessName, address]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
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
            colors={(businessName.length > 0 || focusedField === 'businessName') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, businessName.length > 0 && styles.inputInnerValid]}>
              <Ionicons name="business-outline" size={18} color={(businessName.length > 0 || focusedField === 'businessName') ? COLORS.primary : COLORS.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="Your business name"
                placeholderTextColor={COLORS.grayMuted}
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
            colors={(address.length > 0 || focusedField === 'address') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, address.length > 0 && styles.inputInnerValid]}>
              <TouchableOpacity onPress={detectCurrentLocation} disabled={isLoadingLocation} style={styles.locationBtn}>
                {isLoadingLocation ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Ionicons name="locate" size={18} color={(address.length > 0 || focusedField === 'address') ? COLORS.primary : COLORS.grayMuted} />
                )}
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Start typing or use location..."
                placeholderTextColor={COLORS.grayMuted}
                value={address}
                onChangeText={handleAddressChange}
                onFocus={() => setFocusedField('address')}
                onBlur={() => setFocusedField(null)}
              />
              {isLoadingSuggestions && <ActivityIndicator size="small" color={COLORS.primary} />}
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
                  <Ionicons name="location" size={16} color={COLORS.primary} />
                  <Text style={styles.suggestionText} numberOfLines={2}>{s.display_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Info note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.grayMuted} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING.sm },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: COLORS.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center' },
  greeting: { fontSize: 14, fontWeight: '500', color: COLORS.primary, textAlign: 'center', marginBottom: SPACING.sm },
  greetingName: { fontWeight: '700', color: COLORS.dark },
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: 4, fontSize: 12 },
  required: { color: COLORS.error },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.sm },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.sm, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: '#E8FAF7' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.xs, fontSize: 14 },
  locationBtn: { padding: 2 },
  suggestions: { backgroundColor: COLORS.white, borderRadius: 12, marginTop: -SPACING.sm, marginBottom: SPACING.md, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  suggestionLast: { borderBottomWidth: 0 },
  suggestionText: { flex: 1, fontSize: 14, color: COLORS.dark, marginLeft: SPACING.sm },
  infoNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, padding: SPACING.base, marginTop: SPACING.md, gap: SPACING.sm },
  infoText: { flex: 1, fontSize: 13, color: COLORS.grayMuted, lineHeight: 18 },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg, paddingTop: SPACING.sm, backgroundColor: COLORS.white },
});
