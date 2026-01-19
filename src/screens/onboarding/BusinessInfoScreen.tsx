import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { COLORS, SIZES, SPACING, TYPOGRAPHY } from '../../config/theme';
import { buildPlacesAutocompleteUrl } from '../../config/api';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const SOCIAL_NETWORKS = [
  { id: 'instagram', icon: 'logo-instagram', label: 'Instagram', color: '#E4405F' },
  { id: 'tiktok', icon: 'logo-tiktok', label: 'TikTok', color: '#000000' },
  { id: 'youtube', icon: 'logo-youtube', label: 'YouTube', color: '#FF0000' },
  { id: 'twitter', icon: 'logo-twitter', label: 'X / Twitter', color: '#1DA1F2' },
  { id: 'facebook', icon: 'logo-facebook', label: 'Facebook', color: '#1877F2' },
  { id: 'snapchat', icon: 'logo-snapchat', label: 'Snapchat', color: '#FFFC00' },
  { id: 'linkedin', icon: 'logo-linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { id: 'pinterest', icon: 'logo-pinterest', label: 'Pinterest', color: '#E60023' },
];

const MAX_SOCIAL_FIELDS = 8;

export default function BusinessInfoScreen({ navigation, route }) {
  const [businessName, setBusinessName] = useState('');
  const [username, setUsername] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [socialFields, setSocialFields] = useState<{ id: string; value: string }[]>([
    { id: 'instagram', value: '' },
    { id: 'tiktok', value: '' },
    { id: 'youtube', value: '' },
    { id: 'twitter', value: '' },
    { id: 'facebook', value: '' },
    { id: 'snapchat', value: '' },
  ]);

  const searchTimeout = useRef<any>(null);
  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const isFormValid = businessName.trim().length > 0 && username.trim().length >= 3 && address.trim().length > 0;

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
    clearTimeout(searchTimeout.current);
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
    if (available.length > 0 && socialFields.length < MAX_SOCIAL_FIELDS) {
      setSocialFields(prev => [...prev, { id: available[0].id, value: '' }]);
    }
  }, [socialFields]);

  const getNetworkInfo = (id: string) => SOCIAL_NETWORKS.find(n => n.id === id) || SOCIAL_NETWORKS[0];

  const canAddMore = socialFields.length < MAX_SOCIAL_FIELDS;

  // Group social fields into rows of 2
  const socialRows: { id: string; value: string }[][] = [];
  for (let i = 0; i < socialFields.length; i += 2) {
    socialRows.push(socialFields.slice(i, i + 2));
  }

  const handleNext = useCallback(() => {
    if (!isFormValid) return;
    const socialLinks: Record<string, string> = {};
    socialFields.forEach(field => {
      if (field.value.trim()) {
        socialLinks[field.id] = field.value.trim();
      }
    });

    navigate('Guidelines', {
      ...params,
      businessName: businessName.trim(),
      username: username.trim().toLowerCase(),
      website: website.trim(),
      businessPhone: phone.trim(),
      businessAddress: address.trim(),
      socialLinks,
    });
  }, [isFormValid, navigate, params, businessName, username, website, phone, address, socialFields]);

  const getInputStyle = useCallback((field: string, value: string) => {
    if (value.length > 0) return [styles.inputBox, styles.inputValid];
    if (focusedField === field) return [styles.inputBox, styles.inputFocused];
    return [styles.inputBox];
  }, [focusedField]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={goBack} disabled={disabled}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Business Details</Text>
            <Text style={styles.subtitle}>Tell us about your business</Text>
          </View>

          {/* Business Name */}
          <Text style={styles.label}>Business Name <Text style={styles.required}>*</Text></Text>
          <View style={getInputStyle('businessName', businessName)}>
            <Ionicons name="business-outline" size={18} color={businessName.length > 0 || focusedField === 'businessName' ? COLORS.primary : COLORS.grayMuted} />
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

          {/* Username */}
          <Text style={styles.label}>Username <Text style={styles.required}>*</Text></Text>
          <View style={getInputStyle('username', username)}>
            <Text style={styles.atSymbol}>@</Text>
            <TextInput
              style={styles.input}
              placeholder="businessname"
              placeholderTextColor={COLORS.grayMuted}
              value={username}
              onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
              onFocus={() => setFocusedField('username')}
              onBlur={() => setFocusedField(null)}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Address */}
          <Text style={styles.label}>Address <Text style={styles.required}>*</Text></Text>
          <View style={getInputStyle('address', address)}>
            <TouchableOpacity onPress={detectCurrentLocation} disabled={isLoadingLocation} style={styles.locationBtn}>
              {isLoadingLocation ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Ionicons name="locate" size={18} color={address.length > 0 || focusedField === 'address' ? COLORS.primary : COLORS.grayMuted} />
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

          {/* Optional Fields Row */}
          <Text style={styles.sectionTitle}>Optional</Text>
          <View style={styles.optionalRow}>
            <View style={[getInputStyle('website', website), styles.optionalInput]}>
              <Ionicons name="globe-outline" size={18} color={website.length > 0 ? COLORS.primary : COLORS.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="Website"
                placeholderTextColor={COLORS.grayMuted}
                value={website}
                onChangeText={setWebsite}
                onFocus={() => setFocusedField('website')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
            <View style={[getInputStyle('phone', phone), styles.optionalInput]}>
              <Ionicons name="call-outline" size={18} color={phone.length > 0 ? COLORS.primary : COLORS.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="Phone"
                placeholderTextColor={COLORS.grayMuted}
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Social Links */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Social Links</Text>
            {canAddMore && (
              <TouchableOpacity style={styles.addBtn} onPress={addSocialField}>
                <Ionicons name="add-circle" size={24} color={COLORS.primary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Social Fields - 2 per row */}
          {socialRows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.socialRow}>
              {row.map((field, colIndex) => {
                const index = rowIndex * 2 + colIndex;
                const network = getNetworkInfo(field.id);
                return (
                  <View key={field.id} style={[getInputStyle(`social-${index}`, field.value), styles.socialInput]}>
                    <Ionicons
                      name={network.icon as any}
                      size={16}
                      color={field.value.length > 0 ? network.color : COLORS.grayMuted}
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
                );
              })}
            </View>
          ))}

          {/* Spacer */}
          <View style={styles.spacer} />
        </ScrollView>

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
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, paddingBottom: SPACING.sm },
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  disabled: { opacity: 0.6 },
  header: { alignItems: 'center', marginBottom: SPACING.lg },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: COLORS.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#676C75', textAlign: 'center' },
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: SPACING.xs, fontSize: 13 },
  required: { color: COLORS.error },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginTop: SPACING.sm, marginBottom: SPACING.sm },
  addBtn: { padding: 4 },
  inputBox: { flexDirection: 'row', alignItems: 'center', height: 44, borderWidth: 2, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm, backgroundColor: COLORS.white },
  inputFocused: { borderColor: COLORS.primary, backgroundColor: COLORS.white },
  inputValid: { borderColor: COLORS.primary, backgroundColor: '#E8FAF7' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.xs, fontSize: 13 },
  atSymbol: { fontSize: 16, fontWeight: '600', color: COLORS.primary },
  locationBtn: { padding: 2 },
  suggestions: { backgroundColor: COLORS.white, borderRadius: 10, marginTop: -SPACING.xs, marginBottom: SPACING.sm, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  suggestionLast: { borderBottomWidth: 0 },
  suggestionText: { flex: 1, fontSize: 13, color: COLORS.dark, marginLeft: SPACING.xs },
  optionalRow: { flexDirection: 'row', gap: SPACING.sm },
  optionalInput: { flex: 1 },
  socialRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xs },
  socialInput: { flex: 1, marginBottom: 0 },
  spacer: { flex: 1, minHeight: SPACING.sm },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, backgroundColor: COLORS.white },
  logoFooter: { alignItems: 'center', paddingTop: SPACING.sm },
});
