import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY, SIZES, SPACING, GRADIENTS } from '../../config/theme';
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

export default function CreatorOptionalInfoScreen({ navigation, route }) {
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [socialFields, setSocialFields] = useState<{ id: string; value: string }[]>([
    { id: 'instagram', value: '' },
    { id: 'tiktok', value: '' },
    { id: 'youtube', value: '' },
    { id: 'twitter', value: '' },
    { id: 'facebook', value: '' },
    { id: 'snapchat', value: '' },
  ]);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const handleNext = useCallback(() => {
    const socialLinks: Record<string, string> = {};
    socialFields.forEach(field => {
      if (field.value.trim()) {
        socialLinks[field.id] = field.value.trim();
      }
    });

    navigate('Expertise', {
      ...params,
      bio: bio.trim(),
      website: website.trim(),
      socialLinks,
    });
  }, [navigate, params, bio, website, socialFields]);

  const handleSkip = useCallback(() => {
    navigate('Expertise', {
      ...params,
      bio: '',
      website: '',
      socialLinks: {},
    });
  }, [navigate, params]);

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

  const hasAnyData = bio.trim() || website.trim() || socialFields.some(f => f.value.trim());

  // Check if can add more fields
  const canAddMore = socialFields.length < MAX_SOCIAL_FIELDS;

  // Group social fields into rows of 2
  const socialRows: { id: string; value: string }[][] = [];
  for (let i = 0; i < socialFields.length; i += 2) {
    socialRows.push(socialFields.slice(i, i + 2));
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.headerRow}>
            <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={goBack} disabled={disabled}>
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>
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
            colors={(bio.length > 0 || focusedField === 'bio') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.inputGradientBorder, styles.bioGradientBorder]}
          >
            <View style={[styles.bioInner, bio.length > 0 && styles.inputInnerValid]}>
              <TextInput
                style={styles.bioInput}
                placeholder="Tell people about yourself..."
                placeholderTextColor={COLORS.grayMuted}
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
                const hasValue = field.value.length > 0;

                const isFocused = focusedField === `social-${index}`;
                return (
                  <LinearGradient
                    key={field.id}
                    colors={(hasValue || isFocused) ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.inputGradientBorder, styles.socialInput]}
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
                );
              })}
            </View>
          ))}

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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.lg },
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  skipText: { fontSize: 15, fontWeight: '600', color: COLORS.primary },
  disabled: { opacity: 0.6 },
  header: { alignItems: 'center', marginBottom: SPACING.md },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: COLORS.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#676C75', textAlign: 'center' },
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: SPACING.xs, fontSize: 13 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.sm, marginBottom: SPACING.sm },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.dark },
  addBtn: { padding: 4 },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.sm },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight - 4, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: '#E8FAF7' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.sm, fontSize: 14 },
  bioGradientBorder: { height: 100, marginBottom: SPACING.sm },
  bioInner: { flex: 1, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, paddingVertical: SPACING.sm, backgroundColor: COLORS.white },
  bioInput: { flex: 1, ...TYPOGRAPHY.body, fontSize: 14, textAlignVertical: 'top', width: '100%' },
  charCount: { fontSize: 11, color: COLORS.grayMuted, textAlign: 'right', marginTop: -SPACING.xs, marginBottom: SPACING.sm },
  socialRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.xs },
  socialInput: { flex: 1, marginBottom: 0 },
  spacer: { flex: 1, minHeight: SPACING.sm },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, backgroundColor: COLORS.white },
  logoFooter: { alignItems: 'center', paddingTop: SPACING.sm },
});
