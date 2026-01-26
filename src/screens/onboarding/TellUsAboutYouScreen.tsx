import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, KeyboardAvoidingView, Modal, Keyboard, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, TYPOGRAPHY, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const MIN_AGE = 16;
const GENDERS = [
  { id: 'male', icon: 'male' as const, label: 'Male', color: '#007AFF' },
  { id: 'female', icon: 'female' as const, label: 'Female', color: '#FF2D92' },
  { id: 'other', icon: 'male-female' as const, label: 'Other', color: '#1C1C1E' },
];

const formatDate = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

const getAge = (birthDate: Date) => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

export default function TellUsAboutYouScreen({ navigation, route }: any) {
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const [ageError, setAgeError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Extract all params including auth-related ones for VerifyCodeScreen
  const { email, password, accountType, rememberMe, accountCreated } = route?.params || {};
  const { goBack, disabled } = usePreventDoubleNavigation(navigation);

  const pickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos to add a profile picture.');
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

  const hasName = name.trim().length > 0;
  const isAgeValid = useMemo(() => getAge(date) >= MIN_AGE, [date]);
  const isFormValid = hasName && hasSelectedDate && isAgeValid && gender !== '';

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

  const selectGender = useCallback((g: string) => {
    Keyboard.dismiss();
    setGender(g);
  }, []);

  const handleNext = useCallback(() => {
    if (!isFormValid || loading) return;
    setLoading(true);
    navigation.navigate('Interests', {
      email,
      password,
      accountType,
      rememberMe,
      accountCreated,
      name: name.trim(),
      gender,
      dateOfBirth: date.toISOString(),
      profileImage,
    });
    setLoading(false);
  }, [navigation, email, password, accountType, rememberMe, accountCreated, name, gender, date, profileImage, isFormValid, loading]);


  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        {/* Header with Progress Bar - Personal flow step 1/4 */}
        <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={1} totalSteps={4} />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Tell us about you</Text>
            <Text style={styles.subtitle}>Help us personalize your experience</Text>
          </View>

          {/* Profile Photo */}
          <View style={styles.photoSection}>
            <TouchableOpacity onPress={pickImage} activeOpacity={0.8}>
              <LinearGradient
                colors={profileImage ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.photoGradient}
              >
                <View style={[styles.photoContainer, profileImage && styles.photoContainerFilled]}>
                  {profileImage ? (
                    <Image source={{ uri: profileImage }} style={styles.profileImage} />
                  ) : (
                    <Ionicons name="camera" size={32} color={COLORS.grayMuted} />
                  )}
                </View>
              </LinearGradient>
              <View style={styles.photoBadge}>
                <Ionicons name={profileImage ? "checkmark" : "add"} size={14} color={COLORS.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.photoLabel}>{profileImage ? 'Tap to change' : 'Add a photo'}</Text>
          </View>

          {/* Name Input */}
          <Text style={styles.label}>Full name <Text style={styles.required}>*</Text></Text>
          <LinearGradient
            colors={(hasName || focusedField === 'name') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, hasName && styles.inputInnerValid]}>
              <Ionicons name="person-outline" size={18} color={(hasName || focusedField === 'name') ? COLORS.primary : COLORS.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor={COLORS.grayMuted}
                value={name}
                onChangeText={setName}
                returnKeyType="done"
                autoCapitalize="words"
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </LinearGradient>

          {/* Dynamic Greeting */}
          {hasName && (
            <Text style={styles.greeting}>Nice to meet you, <Text style={styles.greetingName}>{name.trim()}</Text>! 👋</Text>
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
                    onPress={() => selectGender(g.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.genderIcon, { backgroundColor: g.color }]}>
                      <Ionicons name={g.icon} size={22} color={COLORS.white} />
                    </View>
                    <Text style={[styles.genderText, { color: g.color }]}>{g.label}</Text>
                  </TouchableOpacity>
                </LinearGradient>
              ) : (
                <TouchableOpacity
                  key={g.id}
                  style={styles.genderBox}
                  onPress={() => selectGender(g.id)}
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
          <Text style={styles.label}>Date of birth <Text style={styles.required}>*</Text></Text>
          {ageError ? (
            <TouchableOpacity
              style={[styles.inputBox, styles.inputError]}
              onPress={() => { Keyboard.dismiss(); setShowPicker(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={18} color={COLORS.error} />
              <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>
                {hasSelectedDate ? formatDate(date) : 'DD/MM/YYYY'}
              </Text>
            </TouchableOpacity>
          ) : (
            <LinearGradient
              colors={hasSelectedDate ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.inputGradientBorder}
            >
              <TouchableOpacity
                style={[styles.inputInner, hasSelectedDate && styles.inputInnerValid]}
                onPress={() => { Keyboard.dismiss(); setShowPicker(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={18} color={hasSelectedDate ? COLORS.primary : COLORS.grayMuted} />
                <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>
                  {hasSelectedDate ? formatDate(date) : 'DD/MM/YYYY'}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          )}

          {!!ageError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={COLORS.error} />
              <Text style={styles.errorText}>{ageError}</Text>
            </View>
          )}

          {/* Info note */}
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.grayMuted} />
            <Text style={styles.infoText}>You can add bio and more details later in Settings</Text>
          </View>
        </View>

        {/* Fixed Footer */}
        <View style={styles.fixedFooter}>
          <Button
            variant="primary"
            size="lg"
            icon="arrow-forward"
            iconPosition="right"
            disabled={!isFormValid || loading}
            onPress={handleNext}
          >
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
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                onChange={onDateChange}
                maximumDate={new Date()}
                minimumDate={new Date(1920, 0, 1)}
              />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Date Picker */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={onDateChange}
          maximumDate={new Date()}
          minimumDate={new Date(1920, 0, 1)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: SPACING.xl },
  header: { alignItems: 'center', marginBottom: SPACING.sm },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 26, color: COLORS.dark, textAlign: 'center', marginBottom: 2 },
  subtitle: { fontSize: 13, color: '#676C75', textAlign: 'center' },
  // Profile Photo
  photoSection: { alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.lg },
  photoGradient: { width: 110, height: 110, borderRadius: 55, padding: 3 },
  photoContainer: { flex: 1, borderRadius: 52, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  photoContainerFilled: { backgroundColor: '#E8FAF7' },
  profileImage: { width: '100%', height: '100%', borderRadius: 52 },
  photoBadge: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: COLORS.white },
  photoLabel: { fontSize: 12, color: COLORS.grayMuted, marginTop: 4 },
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: 4, fontSize: 12 },
  required: { color: COLORS.error },
  inputBox: { flexDirection: 'row', alignItems: 'center', height: 48, borderWidth: 2, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm, backgroundColor: COLORS.white },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.sm },
  greeting: { fontSize: 14, fontWeight: '500', color: COLORS.primary, textAlign: 'center', marginBottom: SPACING.sm },
  greetingName: { fontWeight: '700', color: COLORS.dark },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.sm, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: '#E8FAF7' },
  inputError: { borderColor: COLORS.error, backgroundColor: '#FEE' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.xs, fontSize: 14 },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: -2, marginBottom: SPACING.xs, gap: 4 },
  errorText: { fontSize: 12, color: COLORS.error },
  genderRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.sm, gap: SPACING.sm },
  genderBox: { width: 80, height: 80, backgroundColor: COLORS.white, borderWidth: 2, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusMd, justifyContent: 'center', alignItems: 'center' },
  genderGradientBorder: { width: 80, height: 80, borderRadius: SIZES.radiusMd, padding: 2 },
  genderBoxInner: { flex: 1, borderRadius: SIZES.radiusMd - 2, backgroundColor: '#E8FAF7', justifyContent: 'center', alignItems: 'center' },
  genderIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  genderText: { ...TYPOGRAPHY.caption, color: COLORS.dark, fontSize: 11 },
  dobText: { ...TYPOGRAPHY.body, color: COLORS.dark, marginLeft: SPACING.sm, fontSize: 14 },
  placeholder: { color: COLORS.grayMuted },
  infoNote: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, padding: SPACING.base, marginTop: SPACING.md, gap: SPACING.sm },
  infoText: { flex: 1, fontSize: 13, color: COLORS.grayMuted, lineHeight: 18 },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, backgroundColor: COLORS.white },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  pickerBox: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  pickerCancel: { ...TYPOGRAPHY.body, color: COLORS.dark },
  pickerDone: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
});
