import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, Platform, Keyboard, Modal, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { TYPOGRAPHY, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatDDMMYYYY } from '../../utils/dateFormatters';

const MIN_AGE = 16;
const GENDERS = [
  { id: 'male', icon: 'male' as const, label: 'Male', color: '#007AFF' },
  { id: 'female', icon: 'female' as const, label: 'Female', color: '#FF2D92' },
  { id: 'other', icon: 'male-female' as const, label: 'Other', color: '#1C1C1E' },
];

const getAge = (birthDate: Date) => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

interface CreatorInfoScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}

export default function CreatorInfoScreen({ navigation, route }: CreatorInfoScreenProps) {
  const { colors, isDark } = useTheme();
  const { showError } = useSmuppyAlert();
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const [ageError, setAgeError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError('Permission needed', 'Please allow access to your photos to add a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfileImage(result.assets[0].uri);
    }
  }, []);

  const hasDisplayName = displayName.trim().length > 0;
  const isAgeValid = useMemo(() => getAge(date) >= MIN_AGE, [date]);
  const isFormValid = hasDisplayName && hasSelectedDate && isAgeValid && gender !== '';

  const validateAge = useCallback((d: Date) => {
    setAgeError(getAge(d) < MIN_AGE ? 'You must be at least 16 years old' : '');
  }, []);

  const onDateChange = useCallback((_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) {
      setDate(selected);
      setHasSelectedDate(true);
      validateAge(selected);
    }
  }, [validateAge]);

  const handleNext = useCallback(() => {
    if (!isFormValid) return;
    navigate('CreatorOptionalInfo', {
      ...params,
      profileImage,
      displayName: displayName.trim(),
      gender,
      dateOfBirth: date.toISOString(),
    });
  }, [isFormValid, navigate, params, profileImage, displayName, gender, date]);


  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        {/* Header with Progress Bar - Pro Creator flow step 1/4 */}
        <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={1} totalSteps={4} />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Creator Profile</Text>
            <Text style={styles.subtitle}>Tell us about yourself</Text>
          </View>

          {/* Profile Photo */}
          <View style={styles.photoSection}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
              <LinearGradient
                colors={profileImage ? GRADIENTS.button : GRADIENTS.buttonDisabled}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.photoGradient}
              >
                <View style={[styles.photoContainer, profileImage && styles.photoContainerFilled]}>
                  {profileImage ? (
                    <Image source={{ uri: profileImage }} style={styles.profileImage} />
                  ) : (
                    <Ionicons name="camera" size={32} color={colors.grayMuted} />
                  )}
                </View>
              </LinearGradient>
              <View style={styles.photoBadge}>
                <Ionicons name={profileImage ? "checkmark" : "add"} size={14} color={colors.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.photoLabel}>{profileImage ? 'Tap to change' : 'Add a photo'}</Text>
          </View>

          {/* Display Name */}
          <Text style={styles.label}>Display Name <Text style={styles.required}>*</Text></Text>
          <LinearGradient
            colors={(hasDisplayName || focusedField === 'displayName') ? GRADIENTS.button : GRADIENTS.buttonDisabled}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, hasDisplayName && styles.inputInnerValid]}>
              <Ionicons name="person-outline" size={18} color={(hasDisplayName || focusedField === 'displayName') ? colors.primary : colors.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="Your brand or display name"
                placeholderTextColor={colors.grayMuted}
                value={displayName}
                onChangeText={setDisplayName}
                onFocus={() => setFocusedField('displayName')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="words"
              />
            </View>
          </LinearGradient>

          {/* Dynamic Greeting */}
          {hasDisplayName && (
            <Text style={styles.greeting}>Nice to meet you, <Text style={styles.greetingName}>{displayName.trim()}</Text>! 👋</Text>
          )}

          {/* Gender Selection */}
          <Text style={styles.label}>Gender <Text style={styles.required}>*</Text></Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => (
              gender === g.id ? (
                <LinearGradient
                  key={g.id}
                  colors={GRADIENTS.button}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.genderGradientBorder}
                >
                  <TouchableOpacity
                    style={styles.genderBoxInner}
                    onPress={() => { Keyboard.dismiss(); setGender(g.id); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.genderIcon, { backgroundColor: g.color }]}>
                      <Ionicons name={g.icon} size={22} color={colors.white} />
                    </View>
                    <Text style={[styles.genderText, { color: g.color }]}>{g.label}</Text>
                  </TouchableOpacity>
                </LinearGradient>
              ) : (
                <TouchableOpacity
                  key={g.id}
                  style={styles.genderBox}
                  onPress={() => { Keyboard.dismiss(); setGender(g.id); }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.genderIcon, { backgroundColor: `${g.color}15` }]}>
                    <Ionicons name={g.icon} size={22} color={g.color} />
                  </View>
                  <Text style={styles.genderText}>{g.label}</Text>
                </TouchableOpacity>
              )
            ))}
          </View>

          {/* Date of Birth */}
          <Text style={styles.label}>Date of Birth <Text style={styles.required}>*</Text></Text>
          {ageError ? (
            <TouchableOpacity
              style={[styles.inputBox, styles.inputError]}
              onPress={() => { Keyboard.dismiss(); setShowPicker(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={18} color={colors.error} />
              <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>
                {hasSelectedDate ? formatDDMMYYYY(date) : 'DD/MM/YYYY'}
              </Text>
            </TouchableOpacity>
          ) : (
            <LinearGradient
              colors={hasSelectedDate ? GRADIENTS.button : GRADIENTS.buttonDisabled}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.inputGradientBorder}
            >
              <TouchableOpacity
                style={[styles.inputInner, hasSelectedDate && styles.inputInnerValid]}
                onPress={() => { Keyboard.dismiss(); setShowPicker(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={18} color={hasSelectedDate ? colors.primary : colors.grayMuted} />
                <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>
                  {hasSelectedDate ? formatDDMMYYYY(date) : 'DD/MM/YYYY'}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          )}
          {!!ageError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{ageError}</Text>
            </View>
          )}

        </View>

        {/* Fixed Footer */}
        <View style={styles.fixedFooter}>
          <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" disabled={!isFormValid || disabled} onPress={handleNext}>
            Next
          </Button>
        </View>
      </KeyboardAvoidingView>

      {/* iOS Date Picker Modal */}
      {Platform.OS === 'ios' && (
        <Modal visible={showPicker} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={styles.flex} onPress={() => setShowPicker(false)} activeOpacity={1} />
            <View style={styles.pickerBox}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowPicker(false)}>
                  <Text style={styles.pickerCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setHasSelectedDate(true); setShowPicker(false); validateAge(date); }}>
                  <Text style={styles.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker value={date} mode="date" display="spinner" onChange={onDateChange} maximumDate={new Date()} minimumDate={new Date(1920, 0, 1)} locale="en" />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Date Picker */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} maximumDate={new Date()} minimumDate={new Date(1920, 0, 1)} locale="en" />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING.sm },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: colors.dark, textAlign: 'center', marginBottom: 2 },
  subtitle: { fontSize: 13, color: colors.grayMuted, textAlign: 'center' },
  // Profile Photo
  photoSection: { alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.lg },
  photoGradient: { width: 110, height: 110, borderRadius: 55, padding: 3 },
  photoContainer: { flex: 1, borderRadius: 52, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoContainerFilled: { backgroundColor: colors.backgroundValid },
  profileImage: { width: '100%', height: '100%', borderRadius: 52 },
  photoBadge: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: colors.background },
  photoLabel: { fontSize: 12, color: colors.grayMuted, marginTop: 4 },
  label: { ...TYPOGRAPHY.label, color: colors.dark, marginBottom: 4, fontSize: 12 },
  required: { color: colors.error },
  inputBox: { flexDirection: 'row', alignItems: 'center', height: 48, borderWidth: 2, borderColor: colors.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm, backgroundColor: colors.background },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.sm },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.sm, backgroundColor: colors.background },
  inputInnerValid: { backgroundColor: colors.backgroundValid },
  inputError: { borderColor: colors.error, borderWidth: 2, backgroundColor: isDark ? 'rgba(255, 68, 68, 0.1)' : '#FEE' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.xs, fontSize: 14, color: colors.dark },
  greeting: { fontSize: 14, fontWeight: '500', color: colors.primary, textAlign: 'center', marginBottom: SPACING.sm },
  greetingName: { fontWeight: '700', color: colors.dark },
  dobText: { ...TYPOGRAPHY.body, color: colors.dark, marginLeft: SPACING.sm, fontSize: 14 },
  placeholder: { color: colors.grayMuted },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: -2, marginBottom: SPACING.sm, gap: 4 },
  errorText: { fontSize: 12, color: colors.error },
  genderRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.sm, gap: SPACING.sm },
  genderBox: { width: 80, height: 80, backgroundColor: colors.background, borderWidth: 2, borderColor: colors.grayLight, borderRadius: SIZES.radiusMd, justifyContent: 'center', alignItems: 'center' },
  genderGradientBorder: { width: 80, height: 80, borderRadius: SIZES.radiusMd, padding: 2 },
  genderBoxInner: { flex: 1, borderRadius: SIZES.radiusMd - 2, backgroundColor: colors.backgroundValid, justifyContent: 'center', alignItems: 'center' },
  genderIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  genderText: { ...TYPOGRAPHY.caption, color: colors.dark, fontSize: 11 },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, backgroundColor: colors.background },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.3)' },
  pickerBox: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.base, borderBottomWidth: 1, borderBottomColor: colors.grayLight },
  pickerCancel: { ...TYPOGRAPHY.body, color: colors.dark },
  pickerDone: { ...TYPOGRAPHY.body, color: colors.primary, fontWeight: '600' },
});
