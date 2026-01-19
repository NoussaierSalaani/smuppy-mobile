import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { COLORS, SIZES, SPACING, TYPOGRAPHY, GRADIENTS } from '../../config/theme';
import { buildPlacesAutocompleteUrl } from '../../config/api';
import { SOCIAL_NETWORKS, COUNTRY_CODES } from '../../config/constants';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

export default function BusinessInfoScreen({ navigation, route }) {
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryCode, setCountryCode] = useState(COUNTRY_CODES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [address, setAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [socialFields, setSocialFields] = useState<{ id: string; value: string }[]>([
    { id: 'instagram', value: '' },
  ]);
  const [scrollPosition, setScrollPosition] = useState(0);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socialScrollRef = useRef<ScrollView>(null);
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

  const isFormValid = businessName.trim().length > 0 && address.trim().length > 0;

  // Google Places autocomplete
  const searchPlaces = useCallback(async (query: string) => {
    if (query.length < 2) return setAddressSuggestions([]);
    setIsLoadingSuggestions(true);
    try {
      const response = await fetch(buildPlacesAutocompleteUrl(query));
      const data = await response.json();
      setAddressSuggestions(data.predictions?.slice(0, 3) || []);
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

  const selectAddress = useCallback((suggestion: any) => {
    setAddress(suggestion.description);
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

  const updateSocialField = useCallback((index: number, value: string) => {
    setSocialFields(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], value };
      return updated;
    });
  }, []);

  const addSocialField = useCallback(() => {
    const usedIds = socialFields.map(f => f.id);
    const available = SOCIAL_NETWORKS.filter(n => !usedIds.includes(n.id));
    if (available.length > 0) {
      setSocialFields(prev => [...prev, { id: available[0].id, value: '' }]);
    }
  }, [socialFields]);

  const removeSocialField = useCallback((index: number) => {
    // Keep at least one social link field
    setSocialFields(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }, []);

  const getNetworkInfo = (id: string) => SOCIAL_NETWORKS.find(n => n.id === id) || SOCIAL_NETWORKS[0];

  // Check if can add more fields (available networks not currently shown)
  const usedIds = socialFields.map(f => f.id);
  const canAddMore = SOCIAL_NETWORKS.some(n => !usedIds.includes(n.id));

  // Show scroll indicator when there are more than 3 social fields
  const canScrollSocialLinks = socialFields.length > 3;

  const handleSocialScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollableHeight = contentSize.height - layoutMeasurement.height;
    if (scrollableHeight > 0) {
      setScrollPosition(contentOffset.y / scrollableHeight);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (!isFormValid) return;
    const socialLinks: Record<string, string> = {};
    socialFields.forEach(field => {
      if (field.value.trim()) {
        socialLinks[field.id] = field.value.trim();
      }
    });

    // Combine country code with phone number if phone is provided
    const fullPhone = phoneNumber.trim() ? `${countryCode.code} ${phoneNumber.trim()}` : '';

    navigate('Guidelines', {
      ...params,
      businessName: businessName.trim(),
      website: website.trim(),
      businessPhone: fullPhone,
      businessAddress: address.trim(),
      socialLinks,
    });
  }, [isFormValid, navigate, params, businessName, website, phoneNumber, countryCode, address, socialFields]);


  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        {/* Header with Progress Bar - Pro Business flow step 2/4 */}
        <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={2} totalSteps={4} />

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
            end={{ x: 1, y: 0 }}
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

          {/* Address */}
          <Text style={styles.label}>Address <Text style={styles.required}>*</Text></Text>
          <LinearGradient
            colors={(address.length > 0 || focusedField === 'address') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
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
                  key={s.place_id}
                  style={[styles.suggestionItem, i === addressSuggestions.length - 1 && styles.suggestionLast]}
                  onPress={() => selectAddress(s)}
                >
                  <Ionicons name="location" size={16} color={COLORS.primary} />
                  <Text style={styles.suggestionText} numberOfLines={1}>{s.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Website */}
          <Text style={styles.label}>Website</Text>
          <LinearGradient
            colors={(website.length > 0 || focusedField === 'website') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, website.length > 0 && styles.inputInnerValid]}>
              <Ionicons name="globe-outline" size={18} color={(website.length > 0 || focusedField === 'website') ? COLORS.primary : COLORS.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="https://yourwebsite.com"
                placeholderTextColor={COLORS.grayMuted}
                value={website}
                onChangeText={setWebsite}
                onFocus={() => setFocusedField('website')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          </LinearGradient>

          {/* Phone Number with Country Code */}
          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.phoneRow}>
            {/* Country Code Picker */}
            <TouchableOpacity
              style={[styles.countryCodeBtn, (phoneNumber.length > 0 || focusedField === 'phone') && styles.countryCodeBtnActive]}
              onPress={() => setShowCountryPicker(!showCountryPicker)}
            >
              <Text style={styles.countryFlag}>{countryCode.flag}</Text>
              <Text style={styles.countryCodeText}>{countryCode.code}</Text>
              <Ionicons name="chevron-down" size={14} color={COLORS.grayMuted} />
            </TouchableOpacity>
            {/* Phone Input */}
            <LinearGradient
              colors={(phoneNumber.length > 0 || focusedField === 'phone') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.inputGradientBorder, styles.phoneInputGradient]}
            >
              <View style={[styles.inputInner, phoneNumber.length > 0 && styles.inputInnerValid]}>
                <TextInput
                  style={[styles.input, { marginLeft: 0 }]}
                  placeholder="123 456 7890"
                  placeholderTextColor={COLORS.grayMuted}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="phone-pad"
                />
              </View>
            </LinearGradient>
          </View>
          {/* Country Code Dropdown */}
          {showCountryPicker && (
            <View style={styles.countryDropdown}>
              <ScrollView style={styles.countryDropdownScroll} nestedScrollEnabled>
                {COUNTRY_CODES.map((cc) => (
                  <TouchableOpacity
                    key={cc.code}
                    style={[styles.countryOption, countryCode.code === cc.code && styles.countryOptionActive]}
                    onPress={() => { setCountryCode(cc); setShowCountryPicker(false); }}
                  >
                    <Text style={styles.countryFlag}>{cc.flag}</Text>
                    <Text style={styles.countryCodeText}>{cc.code}</Text>
                    <Text style={styles.countryName}>{cc.country}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Social Links */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Social Links</Text>
            <TouchableOpacity style={styles.addBtn} onPress={addSocialField} disabled={!canAddMore}>
              <Ionicons name="add-circle" size={24} color={canAddMore ? COLORS.primary : COLORS.grayMuted} />
            </TouchableOpacity>
          </View>

          {/* Social Fields - Only this section scrollable with indicator */}
          <View style={styles.socialContainer}>
            {/* Scroll indicator on left with gradient */}
            {canScrollSocialLinks && (
              <View style={styles.scrollIndicatorContainer}>
                <View style={styles.scrollIndicatorTrack}>
                  <LinearGradient
                    colors={GRADIENTS.button}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.scrollIndicatorThumb, { top: `${scrollPosition * 70}%` }]}
                  />
                </View>
              </View>
            )}
            <ScrollView
              ref={socialScrollRef}
              style={[styles.socialScroll, canScrollSocialLinks && styles.socialScrollWithIndicator]}
              showsVerticalScrollIndicator={false}
              onScroll={handleSocialScroll}
              scrollEventThrottle={16}
            >
              {socialFields.map((field, index) => {
                const network = getNetworkInfo(field.id);
                const hasValue = field.value.length > 0;
                const isFocused = focusedField === `social-${index}`;

                return (
                  <View key={field.id} style={styles.socialFieldRow}>
                    <LinearGradient
                      colors={(hasValue || isFocused) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.inputGradientBorder, styles.socialInputFlex]}
                    >
                      <View style={[styles.inputInner, hasValue && styles.inputInnerValid]}>
                        <Ionicons
                          name={network.icon as any}
                          size={16}
                          color={(hasValue || isFocused) ? network.color : COLORS.grayMuted}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder={network.label}
                          placeholderTextColor={COLORS.grayMuted}
                          value={field.value}
                          onChangeText={(v) => updateSocialField(index, v)}
                          onFocus={() => setFocusedField(`social-${index}`)}
                          onBlur={() => setFocusedField(null)}
                          autoCapitalize="none"
                        />
                      </View>
                    </LinearGradient>
                    <TouchableOpacity style={styles.removeBtn} onPress={() => removeSocialField(index)}>
                      <Ionicons name="close-circle" size={24} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* Fixed Footer */}
        <View style={styles.fixedFooter}>
          <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" disabled={!isFormValid || disabled} onPress={handleNext}>
            Next
          </Button>
          <View style={styles.logoFooter}>
            <SmuppyText width={120} variant="dark" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING.md },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: COLORS.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#676C75', textAlign: 'center' },
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: SPACING.xs, fontSize: 13 },
  required: { color: COLORS.error },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.xs, marginBottom: SPACING.xs },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  addBtn: { padding: 4 },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.sm },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight - 4, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: '#E8FAF7' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.sm, fontSize: 14 },
  locationBtn: { padding: 2 },
  suggestions: { backgroundColor: COLORS.white, borderRadius: 10, marginTop: -SPACING.xs, marginBottom: SPACING.sm, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  suggestionLast: { borderBottomWidth: 0 },
  suggestionText: { flex: 1, fontSize: 13, color: COLORS.dark, marginLeft: SPACING.xs },
  // Phone with country code
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm, gap: SPACING.xs },
  countryCodeBtn: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight, paddingHorizontal: SPACING.sm, borderRadius: SIZES.radiusInput, borderWidth: 2, borderColor: '#CED3D5', backgroundColor: COLORS.white, gap: 4 },
  countryCodeBtnActive: { borderColor: COLORS.primary, backgroundColor: '#E8FAF7' },
  countryFlag: { fontSize: 18 },
  countryCodeText: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  phoneInputGradient: { flex: 1, marginBottom: 0 },
  countryDropdown: { backgroundColor: COLORS.white, borderRadius: SIZES.radiusInput, marginTop: -SPACING.xs, marginBottom: SPACING.sm, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: COLORS.grayLight },
  countryDropdownScroll: { maxHeight: 200 },
  countryOption: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight, gap: SPACING.xs },
  countryOptionActive: { backgroundColor: '#E8FAF7' },
  countryName: { fontSize: 12, color: COLORS.grayMuted },
  // Social links with scroll indicator
  socialContainer: { flex: 1, flexDirection: 'row' },
  scrollIndicatorContainer: { width: 6, marginRight: SPACING.xs, justifyContent: 'center' },
  scrollIndicatorTrack: { width: 3, height: '100%', backgroundColor: COLORS.grayLight, borderRadius: 2, position: 'relative' },
  scrollIndicatorThumb: { position: 'absolute', width: 3, height: '30%', borderRadius: 2 },
  socialScroll: { flex: 1 },
  socialScrollWithIndicator: { marginLeft: 0 },
  socialFieldRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs },
  socialInputFlex: { flex: 1, marginBottom: 0 },
  removeBtn: { marginLeft: SPACING.xs, padding: 4 },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, backgroundColor: COLORS.white },
  logoFooter: { alignItems: 'center', paddingTop: SPACING.sm },
});
