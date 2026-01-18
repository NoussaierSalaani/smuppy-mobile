import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, ScrollView, KeyboardAvoidingView, Modal, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, TYPOGRAPHY, SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
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
  const [gender, setGender] = useState('');
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const [ageError, setAgeError] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  // Get email and password from SignupScreen
  const { email, password } = route?.params || {};
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
    navigation.navigate('AccountType', {
      email,
      password,
      name: name.trim(),
      gender,
      dateOfBirth: date.toISOString()
    });
    setLoading(false);
  }, [navigation, email, password, name, gender, date, isFormValid, loading]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

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
          <View style={[styles.inputBox, nameFocused && styles.inputFocused, hasName && styles.inputValid]}>
            <Ionicons name="person-outline" size={20} color={hasName || nameFocused ? COLORS.primary : COLORS.grayMuted} />
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={COLORS.grayMuted}
              value={name}
              onChangeText={setName}
              returnKeyType="done"
              autoCapitalize="words"
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
          </View>

          {/* Gender Selection */}
          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={[styles.genderBox, gender === g.id && { borderColor: g.color, borderWidth: 2 }]}
                onPress={() => selectGender(g.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.genderIcon, { backgroundColor: `${g.color}15` }, gender === g.id && { backgroundColor: g.color }]}>
                  <Ionicons name={g.icon as any} size={28} color={gender === g.id ? COLORS.white : g.color} />
                </View>
                <Text style={[styles.genderText, gender === g.id && { color: g.color }]}>{g.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date of Birth */}
          <Text style={styles.label}>Date of birth <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity
            style={[styles.inputBox, ageError ? styles.inputError : hasSelectedDate && styles.inputValid]}
            onPress={() => { Keyboard.dismiss(); setShowPicker(true); }}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={20} color={ageError ? COLORS.error : hasSelectedDate ? COLORS.primary : COLORS.grayMuted} />
            <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>
              {hasSelectedDate ? formatDate(date) : 'DD/MM/YYYY'}
            </Text>
          </TouchableOpacity>

          {!!ageError && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={16} color={COLORS.error} />
              <Text style={styles.errorText}>{ageError}</Text>
            </View>
          )}

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

          {/* Next Button */}
          <View style={styles.btnContainer}>
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, paddingBottom: SPACING['3xl'] },
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl },
  disabled: { opacity: 0.6 },
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center' },
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: SPACING.sm },
  required: { color: COLORS.error },
  inputBox: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, marginBottom: SPACING.lg, backgroundColor: COLORS.white },
  inputFocused: { borderColor: COLORS.primary, borderWidth: 2 },
  inputValid: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: '#E8FAF7' },
  inputError: { borderColor: COLORS.error, borderWidth: 2, backgroundColor: '#FEE' },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.md },
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: -SPACING.sm, marginBottom: SPACING.lg, gap: 6 },
  errorText: { fontSize: 13, color: COLORS.error },
  genderRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.xl, gap: SPACING.md },
  genderBox: { width: 100, height: 100, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusLg, justifyContent: 'center', alignItems: 'center' },
  genderIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xs },
  genderText: { ...TYPOGRAPHY.caption, color: COLORS.dark },
  dobText: { ...TYPOGRAPHY.body, color: COLORS.dark, marginLeft: SPACING.md },
  placeholder: { color: COLORS.grayMuted },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  pickerBox: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  pickerCancel: { ...TYPOGRAPHY.body, color: COLORS.dark },
  pickerDone: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  btnContainer: { marginTop: SPACING.xl },
});
