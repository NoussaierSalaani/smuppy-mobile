import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  KeyboardAvoidingView, Platform, Keyboard, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, TYPOGRAPHY, SIZES, SPACING, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
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

export default function CreatorInfoScreen({ navigation, route }) {
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const [ageError, setAgeError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

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
      displayName: displayName.trim(),
      gender,
      dateOfBirth: date.toISOString(),
    });
  }, [isFormValid, navigate, params, displayName, gender, date]);


  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        {/* Header with Progress Bar - Pro Creator flow step 1/6 */}
        <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={1} totalSteps={6} />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Creator Profile</Text>
            <Text style={styles.subtitle}>Tell us about yourself</Text>
          </View>

          {/* Display Name */}
          <Text style={styles.label}>Display Name <Text style={styles.required}>*</Text></Text>
          <LinearGradient
            colors={(hasDisplayName || focusedField === 'displayName') ? GRADIENTS.button : ['#CED3D5', '#CED3D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.inputGradientBorder}
          >
            <View style={[styles.inputInner, hasDisplayName && styles.inputInnerValid]}>
              <Ionicons name="person-outline" size={20} color={(hasDisplayName || focusedField === 'displayName') ? COLORS.primary : COLORS.grayMuted} />
              <TextInput
                style={styles.input}
                placeholder="Your brand or display name"
                placeholderTextColor={COLORS.grayMuted}
                value={displayName}
                onChangeText={setDisplayName}
                onFocus={() => setFocusedField('displayName')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="words"
              />
            </View>
          </LinearGradient>

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
                    onPress={() => { Keyboard.dismiss(); setGender(g.id); }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.genderIcon, { backgroundColor: g.color }]}>
                      <Ionicons name={g.icon as any} size={24} color={COLORS.white} />
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
                    <Ionicons name={g.icon as any} size={24} color={g.color} />
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
              <DateTimePicker value={date} mode="date" display="spinner" onChange={onDateChange} maximumDate={new Date()} minimumDate={new Date(1920, 0, 1)} />
            </View>
          </View>
        </Modal>
      )}

      {/* Android Date Picker */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} maximumDate={new Date()} minimumDate={new Date(1920, 0, 1)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingBottom: SPACING.sm },
  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center' },
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: SPACING.sm },
  required: { color: COLORS.error },
  inputBox: { flexDirection: 'row', alignItems: 'center', minHeight: SIZES.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, marginBottom: SPACING.md, backgroundColor: COLORS.white },
  inputGradientBorder: { borderRadius: SIZES.radiusInput, padding: 2, marginBottom: SPACING.md },
  inputInner: { flexDirection: 'row', alignItems: 'center', minHeight: SIZES.inputHeight - 4, borderRadius: SIZES.radiusInput - 2, paddingHorizontal: SPACING.base - 2, backgroundColor: COLORS.white },
  inputInnerValid: { backgroundColor: '#E8FAF7' },
  inputError: { borderColor: COLORS.error, borderWidth: 2, backgroundColor: '#FEE' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.sm },
  dobText: { ...TYPOGRAPHY.body, color: COLORS.dark, marginLeft: SPACING.md },
  placeholder: { color: COLORS.grayMuted },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: -SPACING.xs, marginBottom: SPACING.md, gap: 6 },
  errorText: { fontSize: 13, color: COLORS.error },
  genderRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.lg, gap: SPACING.sm },
  genderBox: { width: 100, height: 100, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusLg, justifyContent: 'center', alignItems: 'center' },
  genderGradientBorder: { width: 100, height: 100, borderRadius: SIZES.radiusLg, padding: 2 },
  genderBoxInner: { flex: 1, borderRadius: SIZES.radiusLg - 2, backgroundColor: '#E8FAF7', justifyContent: 'center', alignItems: 'center' },
  genderIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xs },
  genderText: { ...TYPOGRAPHY.caption, color: COLORS.dark },
  spacer: { flex: 1, minHeight: SPACING.sm },
  fixedFooter: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.md, backgroundColor: COLORS.white },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  pickerBox: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  pickerCancel: { ...TYPOGRAPHY.body, color: COLORS.dark },
  pickerDone: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
});
