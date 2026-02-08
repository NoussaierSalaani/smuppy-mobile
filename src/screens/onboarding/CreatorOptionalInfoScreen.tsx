import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TYPOGRAPHY, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import { SOCIAL_NETWORKS } from '../../config/constants';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { triggerHaptic } from '../../utils/haptics';

interface CreatorOptionalInfoScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}

export default function CreatorOptionalInfoScreen({ navigation, route }: CreatorOptionalInfoScreenProps) {
  const { colors, isDark } = useTheme();
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [websiteError, setWebsiteError] = useState('');
  const [socialFields, setSocialFields] = useState<{ id: string; value: string }[]>([
    { id: 'instagram', value: '' },
  ]);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Sanitize text input per CLAUDE.md security rules
  const sanitizeText = useCallback((text: string): string => {
    return text.replace(/<[^>]*>/g, '').replace(/[\x00-\x1F\x7F]/g, '').trim();
  }, []);

  // Validate URL format
  const isValidUrl = useCallback((url: string): boolean => {
    if (!url) return true; // Empty is valid (optional field)
    const urlPattern = /^https?:\/\/.+/i;
    return urlPattern.test(url);
  }, []);

  const socialScrollRef = useRef<ScrollView>(null);
  const params = useMemo(() => route?.params || {}, [route?.params]);
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleNext = useCallback(() => {
    // Validate website URL
    if (website && !isValidUrl(website)) {
      setWebsiteError('Please enter a valid URL starting with http:// or https://');
      triggerHaptic('error');
      return;
    }

    const socialLinks: Record<string, string> = {};
    socialFields.forEach(field => {
      if (field.value.trim()) {
        socialLinks[field.id] = sanitizeText(field.value);
      }
    });

    triggerHaptic('medium');
    navigate('Expertise', {
      ...params,
      bio: sanitizeText(bio),
      website: sanitizeText(website),
      socialLinks,
    });
  }, [navigate, params, bio, website, socialFields, isValidUrl, sanitizeText]);

  const handleSkip = useCallback(() => {
    triggerHaptic('light');
    navigate('Expertise', {
      ...params,
      bio: '',
      website: '',
      socialLinks: {},
    });
  }, [navigate, params]);

  const updateSocialField = useCallback((index: number, value: string) => {
    const sanitized = sanitizeText(value);
    setSocialFields(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], value: sanitized };
      return updated;
    });
  }, [sanitizeText]);

  const addSocialField = useCallback(() => {
    const usedIds = socialFields.map(f => f.id);
    const available = SOCIAL_NETWORKS.filter(n => !usedIds.includes(n.id));
    if (available.length > 0) {
      setSocialFields(prev => [...prev, { id: available[0].id, value: '' }]);
      triggerHaptic('light');
    }
  }, [socialFields]);

  const removeSocialField = useCallback((index: number) => {
    // Keep at least one social link field
    setSocialFields(prev => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
    triggerHaptic('light');
  }, [])

  const getNetworkInfo = (id: string) => SOCIAL_NETWORKS.find(n => n.id === id) || SOCIAL_NETWORKS[0];

  const hasAnyData = bio.trim() || website.trim() || socialFields.some(f => f.value.trim());

  // Check if can add more fields (available networks not currently shown)
  const usedIds = socialFields.map(f => f.id);
  const canAddMore = SOCIAL_NETWORKS.some(n => !usedIds.includes(n.id));

  // Show scroll indicator when there are more than 3 social fields
  const canScrollSocialLinks = socialFields.length > 3;

  const handleSocialScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number }; contentSize: { height: number }; layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollableHeight = contentSize.height - layoutMeasurement.height;
    if (scrollableHeight > 0) {
      setScrollPosition(contentOffset.y / scrollableHeight);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        {/* Header with Progress Bar - Pro Creator flow step 2/6 */}
        <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={2} totalSteps={4} />

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Skip button */}
          <View style={styles.skipRow}>
            <TouchableOpacity onPress={handleSkip} disabled={disabled}>
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>Add More Details</Text>
            <Text style={styles.subtitle}>Optional info to help people find you</Text>
          </View>

          {/* Bio */}
          <Text style={styles.label}>Bio</Text>
          <LinearGradient
            colors={(bio.length > 0 || focusedField === 'bio') ? GRADIENTS.button : GRADIENTS.buttonDisabled}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.inputGradientBorder, styles.bioGradientBorder]}
          >
            <View style={[styles.bioInner, bio.length > 0 && styles.inputInnerValid]}>
              <TextInput
                style={styles.bioInput}
                placeholder="Tell people about yourself..."
                placeholderTextColor={colors.grayMuted}
                value={bio}
                onChangeText={setBio}
                onFocus={() => setFocusedField('bio')}
                onBlur={() => setFocusedField(null)}
                multiline
                maxLength={150}
              />
            </View>
          </LinearGradient>
          <Text style={styles.charCount}>{bio.length}/150</Text>

          {/* Website */}
          <Text style={styles.label}>Website</Text>
          <LinearGradient
            colors={websiteError ? [colors.error, colors.error] : (website.length > 0 || focusedField === 'website') ? GRADIENTS.button : GRADIENTS.buttonDisabled}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, website.length > 0 && !websiteError && styles.inputInnerValid]}>
              <Ionicons name="globe-outline" size={18} color={websiteError ? colors.error : (website.length > 0 || focusedField === 'website') ? colors.primary : colors.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="https://yourwebsite.com"
                placeholderTextColor={colors.grayMuted}
                value={website}
                onChangeText={(text) => {
                  setWebsite(text);
                  if (websiteError) setWebsiteError('');
                }}
                onFocus={() => setFocusedField('website')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="none"
                keyboardType="url"
              />
            </View>
          </LinearGradient>
          {websiteError ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{websiteError}</Text>
            </View>
          ) : null}

          {/* Social Links */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Social Links</Text>
            <TouchableOpacity style={styles.addBtn} onPress={addSocialField} disabled={!canAddMore}>
              <Ionicons name="add-circle" size={24} color={canAddMore ? colors.primary : colors.grayMuted} />
            </TouchableOpacity>
          </View>

          {/* Social Fields - Scrollable single column with X button and scroll indicator */}
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
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              onScroll={handleSocialScroll}
              scrollEventThrottle={16}
              snapToInterval={60}
              decelerationRate="fast"
            >
              {socialFields.map((field, index) => {
                const network = getNetworkInfo(field.id);
                const hasValue = field.value.length > 0;
                const isFocused = focusedField === `social-${index}`;
                return (
                  <View key={field.id} style={styles.socialFieldRow}>
                    <LinearGradient
                      colors={(hasValue || isFocused) ? GRADIENTS.button : GRADIENTS.buttonDisabled}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.inputGradientBorder, styles.socialInputFlex]}
                    >
                      <View style={[styles.inputInner, hasValue && styles.inputInnerValid]}>
                        <Ionicons
                          name={network.icon as keyof typeof Ionicons.glyphMap}
                          size={18}
                          color={(hasValue || isFocused) ? network.color : colors.grayMuted}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder={network.label}
                          placeholderTextColor={colors.grayMuted}
                          value={field.value}
                          onChangeText={(v) => updateSocialField(index, v)}
                          onFocus={() => setFocusedField(`social-${index}`)}
                          onBlur={() => setFocusedField(null)}
                          autoCapitalize="none"
                        />
                      </View>
                    </LinearGradient>
                    <TouchableOpacity style={styles.removeBtn} onPress={() => removeSocialField(index)}>
                      <Ionicons name="close-circle" size={24} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          </View>

          {/* Spacer */}
          <View style={styles.spacer} />
        </ScrollView>

        {/* Fixed Footer */}
        <View style={styles.fixedFooter}>
          <Button
            variant="primary"
            size="lg"
            icon="arrow-forward"
            iconPosition="right"
            disabled={disabled}
            onPress={handleNext}
          >
            {hasAnyData ? 'Next' : 'Skip for Now'}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg },
  skipRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: SPACING.sm },
  skipText: { fontSize: 15, fontWeight: '600', color: colors.primary },
  header: { alignItems: 'center', marginBottom: SPACING.lg },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: colors.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.grayMuted, textAlign: 'center' },
  label: { ...TYPOGRAPHY.label, color: colors.dark, marginBottom: SPACING.xs, fontSize: 13 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: colors.dark },
  addBtn: { padding: 4 },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.md },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight - 4, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, backgroundColor: colors.background },
  inputInnerValid: { backgroundColor: colors.backgroundValid },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.sm, fontSize: 14, color: colors.dark },
  bioGradientBorder: { height: 110, marginBottom: SPACING.sm },
  bioInner: { flex: 1, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, paddingVertical: SPACING.sm, backgroundColor: colors.background },
  bioInput: { flex: 1, ...TYPOGRAPHY.body, fontSize: 14, textAlignVertical: 'top', width: '100%', color: colors.dark },
  charCount: { fontSize: 11, color: colors.grayMuted, textAlign: 'right', marginTop: -SPACING.xs, marginBottom: SPACING.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: -SPACING.sm, marginBottom: SPACING.md, gap: 4 },
  errorText: { fontSize: 12, color: colors.error },
  // Social links with scroll indicator
  socialContainer: { flexDirection: 'row', minHeight: 180, maxHeight: 240 },
  scrollIndicatorContainer: { width: 6, marginRight: SPACING.xs, justifyContent: 'center' },
  scrollIndicatorTrack: { width: 3, height: '100%', backgroundColor: colors.grayLight, borderRadius: 2, position: 'relative' },
  scrollIndicatorThumb: { position: 'absolute', width: 3, height: '30%', borderRadius: 2 },
  socialScroll: { flex: 1 },
  socialScrollWithIndicator: { marginLeft: 0 },
  socialFieldRow: { flexDirection: 'row', alignItems: 'center', height: 56, marginBottom: SPACING.xs },
  socialInputFlex: { flex: 1, marginBottom: 0 },
  removeBtn: { marginLeft: SPACING.xs, padding: 4 },
  spacer: { flex: 1, minHeight: SPACING.xl },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg, paddingTop: SPACING.sm, backgroundColor: colors.background, borderTopWidth: 1, borderTopColor: colors.grayLight },
});
