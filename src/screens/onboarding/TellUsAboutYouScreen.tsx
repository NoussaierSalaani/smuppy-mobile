import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, ScrollView, KeyboardAvoidingView, Modal, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, TYPOGRAPHY, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const MIN_AGE = 16;
const GENDERS = [
  { id: 'male', icon: 'male', label: 'Male', color: '#007AFF' },
  { id: 'female', icon: 'female', label: 'Female', color: '#FF2D92' },
  { id: 'other', icon: 'male-female', label: 'Other', color: '#1C1C1E' },
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
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState('');
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const [ageError, setAgeError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { email, password, accountType } = route?.params || {};
  const { goBack, disabled } = usePreventDoubleNavigation(navigation);

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
      name: name.trim(),
      bio: bio.trim(),
      gender,
      dateOfBirth: date.toISOString(),
    });
    setLoading(false);
  }, [navigation, email, password, accountType, name, bio, gender, date, isFormValid, loading]);


  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={[styles.backBtn, disabled && styles.disabled]}
            onPress={goBack}
            disabled={disabled}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>Tell us about you</Text>
            <Text style={styles.subtitle}>Help us personalize your experience</Text>
          </View>

          {/* Name Input */}
          <Text style={styles.label}>Full name <Text style={styles.required}>*</Text></Text>
          <LinearGradient
            colors={(hasName || focusedField === 'name') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, hasName && styles.inputInnerValid]}>
              <Ionicons name="person-outline" size={20} color={(hasName || focusedField === 'name') ? COLORS.primary : COLORS.grayMuted} />
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

          {/* Bio Input */}
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
                placeholder="Tell us a bit about yourself..."
                placeholderTextColor={COLORS.grayMuted}
                value={bio}
                onChangeText={setBio}
                multiline
                maxLength={100}
                onFocus={() => setFocusedField('bio')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </LinearGradient>
          <Text style={styles.charCount}>{bio.length}/100</Text>

          {/* Gender Selection */}
          <Text style={styles.label}>Gender <Text style={styles.required}>*</Text></Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => (
              gender === g.id ? (
                <LinearGradient
                  key={g.id}
                  colors={GRADIENTS.button}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.genderGradientBorder}
                >
                  <TouchableOpacity
                    style={styles.genderBoxInner}
                    onPress={() => selectGender(g.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.genderIcon, { backgroundColor: g.color }]}>
                      <Ionicons name={g.icon as any} size={28} color={COLORS.white} />
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
                    <Ionicons name={g.icon as any} size={28} color={g.color} />
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
              <Ionicons name="calendar-outline" size={20} color={COLORS.error} />
              <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>
                {hasSelectedDate ? formatDate(date) : 'DD/MM/YYYY'}
              </Text>
            </TouchableOpacity>
          ) : (
            <LinearGradient
              colors={hasSelectedDate ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.inputGradientBorder}
            >
              <TouchableOpacity
                style={[styles.inputInner, hasSelectedDate && styles.inputInnerValid]}
                onPress={() => { Keyboard.dismiss(); setShowPicker(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="calendar-outline" size={20} color={hasSelectedDate ? COLORS.primary : COLORS.grayMuted} />
                <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>
                  {hasSelectedDate ? formatDate(date) : 'DD/MM/YYYY'}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          )}

          {!!ageError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={COLORS.error} />
              <Text style={styles.errorText}>{ageError}</Text>
            </View>
          )}

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
            disabled={!isFormValid || loading}
            onPress={handleNext}
          >
            Next
          </Button>
          <View style={styles.logoFooter}>
            <SmuppyText width={120} variant="dark" />
          </View>
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
  scrollContent: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, paddingBottom: SPACING.sm },
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.lg },
  disabled: { opacity: 0.6 },
  header: { alignItems: 'center', marginBottom: SPACING.lg },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center' },
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: SPACING.xs, fontSize: 13 },
  required: { color: COLORS.error },
  inputBox: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight, borderWidth: 2, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, marginBottom: SPACING.sm, backgroundColor: COLORS.white },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.sm },
  inputInner: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight - 4, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: '#E8FAF7' },
  inputError: { borderColor: COLORS.error, backgroundColor: '#FEE' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.sm, fontSize: 14 },
  bioBox: { height: 60, alignItems: 'flex-start', paddingVertical: SPACING.sm },
  bioGradientBorder: { marginBottom: SPACING.sm },
  bioInner: { flex: 1, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, paddingVertical: SPACING.sm - 2, backgroundColor: COLORS.white },
  bioInput: { flex: 1, ...TYPOGRAPHY.body, fontSize: 14, textAlignVertical: 'top', width: '100%' },
  charCount: { fontSize: 11, color: COLORS.grayMuted, textAlign: 'right', marginTop: -SPACING.xs, marginBottom: SPACING.sm },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: -SPACING.xs, marginBottom: SPACING.sm, gap: 6 },
  errorText: { fontSize: 13, color: COLORS.error },
  genderRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.md, gap: SPACING.sm },
  genderBox: { width: 95, height: 95, backgroundColor: COLORS.white, borderWidth: 2, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusLg, justifyContent: 'center', alignItems: 'center' },
  genderGradientBorder: { width: 95, height: 95, borderRadius: SIZES.radiusLg, padding: 2 },
  genderBoxInner: { flex: 1, borderRadius: SIZES.radiusLg - 2, backgroundColor: '#E8FAF7', justifyContent: 'center', alignItems: 'center' },
  genderIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xs },
  genderText: { ...TYPOGRAPHY.caption, color: COLORS.dark },
  dobText: { ...TYPOGRAPHY.body, color: COLORS.dark, marginLeft: SPACING.md },
  placeholder: { color: COLORS.grayMuted },
  spacer: { flex: 1, minHeight: SPACING.sm },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, backgroundColor: COLORS.white },
  logoFooter: { alignItems: 'center', paddingTop: SPACING.sm },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  pickerBox: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  pickerCancel: { ...TYPOGRAPHY.body, color: COLORS.dark },
  pickerDone: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
});
