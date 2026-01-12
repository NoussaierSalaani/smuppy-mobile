import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, TextInput, ScrollView, Dimensions, Platform, Keyboard, ActivityIndicator, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isValidPhoneNumber } from 'libphonenumber-js';
import * as Location from 'expo-location';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import { buildPlacesAutocompleteUrl } from '../../config/api';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const { width, height } = Dimensions.get('window');

// Liste des pays avec indicatifs
const COUNTRIES = [
  { code: 'FR', name: 'France', dial: '+33', flag: '🇫🇷' },
  { code: 'US', name: 'United States', dial: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dial: '+44', flag: '🇬🇧' },
  { code: 'DE', name: 'Germany', dial: '+49', flag: '🇩🇪' },
  { code: 'ES', name: 'Spain', dial: '+34', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', dial: '+39', flag: '🇮🇹' },
  { code: 'BE', name: 'Belgium', dial: '+32', flag: '🇧🇪' },
  { code: 'CH', name: 'Switzerland', dial: '+41', flag: '🇨🇭' },
  { code: 'NL', name: 'Netherlands', dial: '+31', flag: '🇳🇱' },
  { code: 'PT', name: 'Portugal', dial: '+351', flag: '🇵🇹' },
  { code: 'CA', name: 'Canada', dial: '+1', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', dial: '+61', flag: '🇦🇺' },
  { code: 'MA', name: 'Morocco', dial: '+212', flag: '🇲🇦' },
  { code: 'DZ', name: 'Algeria', dial: '+213', flag: '🇩🇿' },
  { code: 'TN', name: 'Tunisia', dial: '+216', flag: '🇹🇳' },
  { code: 'EG', name: 'Egypt', dial: '+20', flag: '🇪🇬' },
  { code: 'SA', name: 'Saudi Arabia', dial: '+966', flag: '🇸🇦' },
  { code: 'AE', name: 'UAE', dial: '+971', flag: '🇦🇪' },
  { code: 'QA', name: 'Qatar', dial: '+974', flag: '🇶🇦' },
  { code: 'KW', name: 'Kuwait', dial: '+965', flag: '🇰🇼' },
  { code: 'LB', name: 'Lebanon', dial: '+961', flag: '🇱🇧' },
  { code: 'JO', name: 'Jordan', dial: '+962', flag: '🇯🇴' },
  { code: 'TR', name: 'Turkey', dial: '+90', flag: '🇹🇷' },
  { code: 'IN', name: 'India', dial: '+91', flag: '🇮🇳' },
  { code: 'PK', name: 'Pakistan', dial: '+92', flag: '🇵🇰' },
  { code: 'CN', name: 'China', dial: '+86', flag: '🇨🇳' },
  { code: 'JP', name: 'Japan', dial: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dial: '+82', flag: '🇰🇷' },
  { code: 'SG', name: 'Singapore', dial: '+65', flag: '🇸🇬' },
  { code: 'BR', name: 'Brazil', dial: '+55', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', dial: '+52', flag: '🇲🇽' },
  { code: 'AR', name: 'Argentina', dial: '+54', flag: '🇦🇷' },
  { code: 'ZA', name: 'South Africa', dial: '+27', flag: '🇿🇦' },
  { code: 'NG', name: 'Nigeria', dial: '+234', flag: '🇳🇬' },
  { code: 'KE', name: 'Kenya', dial: '+254', flag: '🇰🇪' },
  { code: 'SE', name: 'Sweden', dial: '+46', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', dial: '+47', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', dial: '+45', flag: '🇩🇰' },
  { code: 'FI', name: 'Finland', dial: '+358', flag: '🇫🇮' },
  { code: 'IE', name: 'Ireland', dial: '+353', flag: '🇮🇪' },
  { code: 'AT', name: 'Austria', dial: '+43', flag: '🇦🇹' },
  { code: 'PL', name: 'Poland', dial: '+48', flag: '🇵🇱' },
  { code: 'GR', name: 'Greece', dial: '+30', flag: '🇬🇷' },
  { code: 'RU', name: 'Russia', dial: '+7', flag: '🇷🇺' },
  { code: 'IL', name: 'Israel', dial: '+972', flag: '🇮🇱' },
  { code: 'NZ', name: 'New Zealand', dial: '+64', flag: '🇳🇿' },
  { code: 'TH', name: 'Thailand', dial: '+66', flag: '🇹🇭' },
  { code: 'MY', name: 'Malaysia', dial: '+60', flag: '🇲🇾' },
  { code: 'PH', name: 'Philippines', dial: '+63', flag: '🇵🇭' },
  { code: 'ID', name: 'Indonesia', dial: '+62', flag: '🇮🇩' },
  { code: 'VN', name: 'Vietnam', dial: '+84', flag: '🇻🇳' },
];

// Centres d'intérêt - maxHeight coupe à 4 lignes
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
    ]
  },
  {
    title: 'Bien-être',
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
    ]
  },
  {
    title: 'Arts Martiaux',
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
    ]
  },
];

export default function AccountTypeScreen({ navigation, route }) {
  // États
  const [selected, setSelected] = useState(null);
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]); // France par défaut
  const [errors, setErrors] = useState({});
  
  // Refs
  const scrollRef = useRef(null);
  const businessScrollRef = useRef(null);
  const phoneInputRef = useRef(null);
  const searchTimeout = useRef(null);

  const { name, gender, dateOfBirth } = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  // Keyboard listener
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setFocusedField(null);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Scroll auto vers le champ sélectionné
  useEffect(() => {
    if (focusedField && keyboardHeight > 0 && businessScrollRef.current) {
      const offsets = { name: 0, address: addressSuggestions.length > 0 ? 160 : 100, phone: 190 };
      businessScrollRef.current.scrollTo({ y: offsets[focusedField] || 0, animated: true });
    } else if (keyboardHeight === 0 && businessScrollRef.current) {
      businessScrollRef.current.scrollTo({ y: 0, animated: true });
    }
  }, [focusedField, keyboardHeight, addressSuggestions.length]);

  // Détection de la localisation actuelle
  const detectCurrentLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrors(prev => ({ ...prev, address: 'Location permission denied' }));
        setIsLoadingLocation(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [reverseResult] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (reverseResult) {
        const parts = [
          reverseResult.streetNumber,
          reverseResult.street,
          reverseResult.city,
          reverseResult.postalCode,
          reverseResult.country,
        ].filter(Boolean);
        setBusinessAddress(parts.join(', '));
        setAddressSuggestions([]);
        if (errors.address) setErrors(prev => ({ ...prev, address: null }));
      }
    } catch (error) {
      console.log('Location error:', error);
    } finally {
      setIsLoadingLocation(false);
    }
  }, [errors.address]);

  // Google Places
  const searchPlaces = useCallback(async (query) => {
    if (query.length < 2) return setAddressSuggestions([]);
    setIsLoadingSuggestions(true);
    try {
      const response = await fetch(buildPlacesAutocompleteUrl(query));
      const data = await response.json();
      setAddressSuggestions(data.predictions?.slice(0, 2) || []);
    } catch {
      setAddressSuggestions([]);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, []);

  const handleAddressChange = useCallback((text) => {
    setBusinessAddress(text);
    if (errors.address) setErrors(prev => ({ ...prev, address: null }));
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchPlaces(text), 300);
  }, [errors.address, searchPlaces]);

  const selectAddress = useCallback((suggestion) => {
    setBusinessAddress(suggestion.description);
    setAddressSuggestions([]);
    phoneInputRef.current?.focus();
  }, []);

  // Phone - numéro local sans indicatif (géré par country picker)
  const handlePhoneChange = useCallback((text) => {
    // Ne garder que les chiffres
    const cleaned = text.replace(/[^\d]/g, '');
    setBusinessPhone(cleaned);
    if (errors.phone) setErrors(prev => ({ ...prev, phone: null }));
  }, [errors.phone]);

  const isPhoneValid = useCallback(() => {
    const fullNumber = selectedCountry.dial + businessPhone.replace(/^0+/, '');
    if (!businessPhone || businessPhone.length < 6) return false;
    try { return isValidPhoneNumber(fullNumber); } catch { return false; }
  }, [businessPhone, selectedCountry]);

  const selectCountry = useCallback((country) => {
    setSelectedCountry(country);
    setShowCountryPicker(false);
  }, []);

  const handleNameChange = useCallback((text) => {
    setBusinessName(text);
    if (errors.name) setErrors(prev => ({ ...prev, name: null }));
  }, [errors.name]);

  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!businessName.trim()) newErrors.name = 'Company name is required';
    if (!businessAddress.trim()) newErrors.address = 'Business address is required';
    if (!businessPhone) newErrors.phone = 'Phone number is required';
    else if (!isPhoneValid()) newErrors.phone = 'Invalid phone number';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [businessName, businessAddress, businessPhone, isPhoneValid]);

  const toggleInterest = useCallback((item) => {
    setSelectedInterests(prev => 
      prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
    );
  }, []);

  const handleNext = useCallback(() => {
    Keyboard.dismiss();
    if (selected === 'personal') {
      navigate('Guidelines', { name, gender, dateOfBirth, accountType: 'personal', interests: selectedInterests });
    } else {
      if (!validateForm()) return;
      const fullPhone = selectedCountry.dial + businessPhone.replace(/^0+/, '');
      navigate('Profession', { name, gender, dateOfBirth, accountType: 'business', businessName, businessAddress, businessPhone: fullPhone });
    }
  }, [selected, navigate, name, gender, dateOfBirth, selectedInterests, validateForm, businessName, businessAddress, businessPhone, selectedCountry]);

  const handleScroll = useCallback((e) => {
    setCurrentPage(Math.round(e.nativeEvent.contentOffset.x / width));
  }, []);

  const isFormValid = useMemo(() => selected && (
    (selected === 'personal' && selectedInterests.length > 0) ||
    (selected === 'business' && businessName.trim() && businessAddress.trim() && isPhoneValid())
  ), [selected, selectedInterests, businessName, businessAddress, isPhoneValid]);

  // Style helpers - 3 états: default, focused, valid/error
  const getInputStyle = useCallback((fieldName, hasValue) => {
    if (errors[fieldName]) return [styles.inputBox, styles.inputError];
    if (hasValue) return [styles.inputBox, styles.inputValid];
    if (focusedField === fieldName) return [styles.inputBox, styles.inputFocused];
    return [styles.inputBox];
  }, [errors, focusedField]);

  const getPhoneInputStyle = useCallback(() => {
    if (errors.phone) return [styles.phoneBox, styles.inputError];
    if (businessPhone.length > 0) return [styles.phoneBox, styles.inputValid];
    if (focusedField === 'phone') return [styles.phoneBox, styles.inputFocused];
    return [styles.phoneBox];
  }, [errors.phone, businessPhone, focusedField]);

  const getIconColor = useCallback((fieldName, hasValue) => {
    if (errors[fieldName]) return COLORS.error;
    if (hasValue || focusedField === fieldName) return COLORS.primary;
    return COLORS.grayMuted;
  }, [errors, focusedField]);

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.inner}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={disabled}>
              <Ionicons name="arrow-back" size={22} color={COLORS.white} />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.titleBox}>
            <Text style={styles.title}>Account used for?</Text>
            <Text style={styles.subtitle}>Please select the purpose of your account</Text>
          </View>

          {/* Cards */}
          <View style={styles.cardsRow}>
            <TouchableOpacity 
              style={[styles.card, selected === 'personal' && styles.cardActivePersonal, selected === 'business' && styles.cardInactive]} 
              onPress={() => setSelected('personal')}
            >
              <Ionicons name="accessibility-outline" size={selected === 'business' ? 32 : 44} color="#2563EB" />
              <Text style={[styles.cardText, selected === 'business' && styles.cardTextInactive]}>Personal</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.card, selected === 'business' && styles.cardActiveBusiness, selected === 'personal' && styles.cardInactive]} 
              onPress={() => setSelected('business')}
            >
              <Ionicons name="briefcase-outline" size={selected === 'personal' ? 32 : 44} color="#B45309" />
              <Text style={[styles.cardText, selected === 'personal' && styles.cardTextInactive]}>Business</Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {selected && (
            <View style={styles.content}>
              {/* Personal */}
              {selected === 'personal' && (
                <>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Interested in?</Text>
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
                    {INTERESTS_PAGES.map((page, i) => (
                      <View key={i} style={styles.interestPage}>
                        <Text style={styles.pageTitle}>{page.title}</Text>
                        <View style={styles.tagsWrap}>
                          {page.items.map((item) => (
                            <TouchableOpacity 
                              key={item.name} 
                              style={[styles.tag, selectedInterests.includes(item.name) && styles.tagActive]} 
                              onPress={() => toggleInterest(item.name)}
                            >
                              <Ionicons name={item.icon} size={16} color={item.color} />
                              <Text style={[styles.tagText, selectedInterests.includes(item.name) && styles.tagTextActive]}>{item.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ))}
                  </ScrollView>

                  <View style={styles.dots}>
                    {INTERESTS_PAGES.map((_, i) => (
                      <View key={i} style={[styles.dot, currentPage === i && styles.dotActive]} />
                    ))}
                  </View>
                </>
              )}

              {/* Business */}
              {selected === 'business' && (
                <View style={styles.businessWrap}>
                  <ScrollView
                    ref={businessScrollRef}
                    style={styles.businessScroll}
                    contentContainerStyle={[styles.businessContent, { paddingBottom: keyboardHeight > 0 ? keyboardHeight + 50 : SPACING.lg }]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    scrollEnabled={keyboardHeight > 0}
                    bounces={false}
                  >
                    <Text style={styles.sectionTitle}>Business details</Text>
                    <Text style={styles.sectionSub}>Provide your contact information</Text>
                    
                    {/* Company Name */}
                    <Text style={styles.label}>Company name</Text>
                    <View style={getInputStyle('name', businessName.trim().length > 0)}>
                      <Ionicons name="business-outline" size={20} color={getIconColor('name', businessName.trim().length > 0)} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your company name"
                        placeholderTextColor={COLORS.grayMuted}
                        value={businessName}
                        onChangeText={handleNameChange}
                        returnKeyType="default"
                        onFocus={() => setFocusedField('name')}
                        onSubmitEditing={Keyboard.dismiss}
                      />
                    </View>
                    {errors.name && (
                      <View style={styles.errorRow}>
                        <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                        <Text style={styles.errorText}>{errors.name}</Text>
                      </View>
                    )}

                    {/* Address */}
                    <Text style={styles.label}>Business address</Text>
                    <View style={getInputStyle('address', businessAddress.trim().length > 0)}>
                      <TouchableOpacity onPress={detectCurrentLocation} disabled={isLoadingLocation} style={styles.locationBtn}>
                        {isLoadingLocation ? (
                          <ActivityIndicator size="small" color={COLORS.primary} />
                        ) : (
                          <Ionicons name="locate" size={20} color={getIconColor('address', businessAddress.trim().length > 0)} />
                        )}
                      </TouchableOpacity>
                      <TextInput
                        style={styles.input}
                        placeholder="Start typing or use location..."
                        placeholderTextColor={COLORS.grayMuted}
                        value={businessAddress}
                        onChangeText={handleAddressChange}
                        returnKeyType="default"
                        onFocus={() => setFocusedField('address')}
                        onSubmitEditing={Keyboard.dismiss}
                      />
                      {isLoadingSuggestions && <ActivityIndicator size="small" color={COLORS.primary} />}
                    </View>
                    {errors.address && (
                      <View style={styles.errorRow}>
                        <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                        <Text style={styles.errorText}>{errors.address}</Text>
                      </View>
                    )}

                    {/* Suggestions */}
                    {addressSuggestions.length > 0 && focusedField === 'address' && (
                      <View style={styles.suggestions}>
                        {addressSuggestions.map((s, i) => (
                          <TouchableOpacity key={s.place_id} style={[styles.suggestionItem, i === addressSuggestions.length - 1 && styles.suggestionLast]} onPress={() => selectAddress(s)}>
                            <Ionicons name="location" size={18} color={COLORS.primary} />
                            <Text style={styles.suggestionText} numberOfLines={1}>{s.description}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Phone */}
                    <Text style={styles.label}>Phone number</Text>
                    <View style={getPhoneInputStyle()}>
                      <TouchableOpacity style={styles.countrySelector} onPress={() => setShowCountryPicker(true)}>
                        <Text style={styles.flag}>{selectedCountry.flag}</Text>
                        <Text style={styles.dialCode}>{selectedCountry.dial}</Text>
                        <Ionicons name="chevron-down" size={16} color={COLORS.grayMuted} />
                      </TouchableOpacity>
                      <View style={styles.phoneDivider} />
                      <TextInput
                        ref={phoneInputRef}
                        style={styles.phoneInput}
                        placeholder="612 345 678"
                        placeholderTextColor={COLORS.grayMuted}
                        value={businessPhone}
                        onChangeText={handlePhoneChange}
                        keyboardType="phone-pad"
                        returnKeyType="default"
                        onFocus={() => setFocusedField('phone')}
                        maxLength={15}
                      />
                    </View>
                    {errors.phone && (
                      <View style={styles.errorRow}>
                        <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                        <Text style={styles.errorText}>{errors.phone}</Text>
                      </View>
                    )}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {/* Footer + Button - TOUJOURS FIXES EN BAS */}
          {keyboardHeight === 0 && (
            <View style={styles.bottomSection}>
              {selected && (
                <View style={styles.btnBox}>
                  <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" disabled={!isFormValid || disabled} onPress={handleNext}>
                    Next
                  </Button>
                </View>
              )}
              <View style={styles.footer}>
                <SmuppyText width={140} variant="dark" />
              </View>
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setShowCountryPicker(false)} activeOpacity={1} />
          <View style={styles.countryPickerBox}>
            <View style={styles.countryPickerHeader}>
              <Text style={styles.countryPickerTitle}>Select Country</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.dark} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.countryItem, selectedCountry.code === item.code && styles.countryItemActive]}
                  onPress={() => selectCountry(item)}
                >
                  <Text style={styles.countryFlag}>{item.flag}</Text>
                  <Text style={styles.countryName}>{item.name}</Text>
                  <Text style={styles.countryDial}>{item.dial}</Text>
                  {selectedCountry.code === item.code && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  inner: { flex: 1 },
  
  // Header
  header: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, marginBottom: SPACING.xl },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.dark, justifyContent: 'center', alignItems: 'center' },
  
  // Title
  titleBox: { alignItems: 'center', paddingHorizontal: SPACING.xl, marginBottom: SPACING.xl },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, color: COLORS.dark, textAlign: 'center' },
  
  // Cards
  cardsRow: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: SPACING.lg, marginBottom: SPACING.md, height: height * 0.20 },
  card: { width: (width - 80) / 2, maxWidth: 150, aspectRatio: 1, borderWidth: 2, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusXl, justifyContent: 'center', alignItems: 'center', marginHorizontal: SPACING.sm, backgroundColor: COLORS.white },
  cardActivePersonal: { borderColor: '#2563EB', borderWidth: 2.5, transform: [{ scale: 1.08 }], shadowColor: '#2563EB', shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  cardActiveBusiness: { borderColor: '#B45309', borderWidth: 2.5, transform: [{ scale: 1.08 }], shadowColor: '#B45309', shadowOpacity: 0.2, shadowRadius: 12, elevation: 6 },
  cardInactive: { opacity: 0.4, transform: [{ scale: 0.9 }] },
  cardText: { fontSize: 15, fontWeight: '600', color: COLORS.dark, marginTop: SPACING.sm },
  cardTextInactive: { color: COLORS.grayMuted },
  
  // Content
  content: { flex: 1 },
  sectionHeader: { paddingHorizontal: SPACING.xl },
  sectionTitle: { fontFamily: 'WorkSans-Bold', fontSize: 18, color: COLORS.dark, marginBottom: SPACING.xs },
  sectionSub: { fontSize: 13, color: COLORS.dark, marginBottom: SPACING.md },
  
  // Interests
  pagesScroll: { flex: 1 },
  pagesContent: { flexGrow: 1 },
  interestPage: { width, paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm },
  pageTitle: { fontSize: 15, fontWeight: '600', color: COLORS.primaryDark, marginBottom: SPACING.lg },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, maxHeight: 220, overflow: 'hidden' },
  tag: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: 20, backgroundColor: COLORS.white, margin: 6 },
  tagActive: { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: COLORS.primary, borderWidth: 2 },
  tagText: { fontSize: 13, fontWeight: '500', color: COLORS.dark, marginLeft: 6 },
  tagTextActive: { color: COLORS.dark, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', paddingVertical: SPACING.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.grayLight, marginHorizontal: 4 },
  dotActive: { backgroundColor: COLORS.primary, width: 24 },
  
  // Business
  businessWrap: { flex: 1 },
  businessScroll: { flex: 1 },
  businessContent: { paddingHorizontal: SPACING.xl },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.dark, marginBottom: SPACING.sm, marginTop: SPACING.sm },
  
  // Input - 3 états: default, focused, valid/error
  inputBox: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, backgroundColor: COLORS.white },
  inputFocused: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.white },
  inputValid: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.backgroundValid },
  inputError: { borderColor: COLORS.error, borderWidth: 2, backgroundColor: COLORS.errorLight },
  input: { flex: 1, fontSize: 16, color: COLORS.dark, marginLeft: SPACING.md },
  
  // Suggestions
  suggestions: { backgroundColor: COLORS.white, borderRadius: 12, marginTop: -8, marginBottom: SPACING.sm, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  suggestionLast: { borderBottomWidth: 0 },
  suggestionText: { flex: 1, fontSize: 14, color: COLORS.dark, marginLeft: SPACING.sm },
  
  // Location Button
  locationBtn: { padding: 4 },

  // Phone
  phoneBox: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, backgroundColor: COLORS.white, overflow: 'hidden' },
  countrySelector: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.sm, height: '100%', backgroundColor: '#F9FAFB', gap: 4 },
  flag: { fontSize: 20 },
  dialCode: { fontSize: 14, fontWeight: '500', color: COLORS.dark },
  phoneDivider: { width: 1, height: '60%', backgroundColor: COLORS.grayLight },
  phoneInput: { flex: 1, fontSize: 16, color: COLORS.dark, paddingHorizontal: SPACING.base },

  // Country Picker Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  countryPickerBox: { backgroundColor: COLORS.white, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, maxHeight: height * 0.6, paddingBottom: SPACING['3xl'] },
  countryPickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  countryPickerTitle: { fontSize: 18, fontWeight: '600', color: COLORS.dark },
  countryItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: SPACING.xl, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  countryItemActive: { backgroundColor: COLORS.backgroundValid },
  countryFlag: { fontSize: 24, marginRight: SPACING.sm },
  countryName: { flex: 1, fontSize: 16, color: COLORS.dark },
  countryDial: { fontSize: 14, color: COLORS.grayMuted, marginRight: SPACING.sm },

  // Error
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs, gap: 6 },
  errorText: { fontSize: 13, fontWeight: '500', color: COLORS.error },

  // Button
  btnBox: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md },

  // Bottom Section - Toujours fixe en bas avec marginTop auto
  bottomSection: { marginTop: 'auto', paddingBottom: SPACING.lg },

  // Footer
  footer: { alignItems: 'center', paddingTop: SPACING.sm },
});