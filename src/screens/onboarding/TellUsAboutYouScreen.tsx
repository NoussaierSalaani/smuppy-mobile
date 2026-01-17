import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform, ScrollView, KeyboardAvoidingView, Modal, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, TYPOGRAPHY, SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { supabase } from '../../config/supabase';

const MIN_AGE = 16;
const GENDERS = [
  { id: 'male', icon: 'male', label: 'Male', color: '#007AFF' },
  { id: 'female', icon: 'female', label: 'Female', color: '#FF2D92' },
  { id: 'other', icon: 'male-female', label: 'Other', color: '#1C1C1E' },
];

const formatDate = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

const getAge = (birthDate) => {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};

const GenderButton = React.memo(({ item, isActive, onSelect }) => (
  <TouchableOpacity 
    style={[styles.genderBox, isActive && { borderColor: item.color, borderWidth: 2, transform: [{ scale: 1.05 }], shadowOpacity: 0.2, elevation: 8 }]} 
    onPress={() => onSelect(item.id)} 
    activeOpacity={0.7}
  >
    <View style={[styles.genderIcon, { backgroundColor: `${item.color}15` }, isActive && { backgroundColor: item.color }]}>
      <Ionicons name={item.icon} size={28} color={isActive ? COLORS.white : item.color} />
    </View>
    <Text style={[styles.genderText, isActive && { color: item.color, fontWeight: '600' }]}>{item.label}</Text>
  </TouchableOpacity>
));

export default function TellUsAboutYouScreen({ navigation }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const [ageError, setAgeError] = useState('');
  const [nameFocused, setNameFocused] = useState(false);
  
  const { navigate, disabled } = usePreventDoubleNavigation(navigation);

  // Cancel onboarding - sign out and go back to Welcome
  // Account is kept for reminder email (user can complete signup later)
  const handleCancel = useCallback(async () => {
    await supabase.auth.signOut();
    // AppNavigator will automatically show Welcome screen when session is null
  }, []);

  const hasName = name.length > 0;
  const isAgeValid = useMemo(() => getAge(date) >= MIN_AGE, [date]);
  const isFormValid = hasName && hasSelectedDate && isAgeValid;

  const validateAge = useCallback((d) => {
    setAgeError(getAge(d) < MIN_AGE ? 'You must be at least 16 years old to create an account' : '');
  }, []);

  const onDateChange = useCallback((_, selected) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) {
      setDate(selected);
      setHasSelectedDate(true);
      validateAge(selected);
    }
  }, [validateAge]);

  const selectGender = useCallback((g) => {
    Keyboard.dismiss();
    setGender(g);
  }, []);

  const openPicker = useCallback(() => {
    Keyboard.dismiss();
    setShowPicker(true);
  }, []);

  const closePicker = useCallback(() => setShowPicker(false), []);

  const confirmDate = useCallback(() => {
    setHasSelectedDate(true);
    setShowPicker(false);
    validateAge(date);
  }, [date, validateAge]);

  const handleNext = useCallback(() => {
    navigate('AccountType', { name, gender, dateOfBirth: date.toISOString() });
  }, [navigate, name, gender, date]);

  // Style helpers - 3 états: default, focused, valid/error
  const getInputStyle = () => {
    if (hasName) return [styles.inputBox, styles.inputBoxValid];
    if (nameFocused) return [styles.inputBox, styles.inputBoxFocused];
    return [styles.inputBox];
  };

  const getDateInputStyle = () => {
    if (ageError) return [styles.inputBox, styles.inputBoxError];
    if (hasSelectedDate) return [styles.inputBox, styles.inputBoxValid];
    return [styles.inputBox];
  };

  const getNameIconColor = () => {
    if (hasName || nameFocused) return COLORS.primary;
    return COLORS.grayMuted;
  };

  const getDateIconColor = () => {
    if (ageError) return COLORS.error;
    if (hasSelectedDate) return COLORS.primary;
    return COLORS.grayMuted;
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {/* Cancel Button - X to cancel onboarding and go back to Welcome */}
          <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={handleCancel} disabled={disabled}>
            <Ionicons name="close" size={24} color={COLORS.white} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>What is your name?</Text>
            <Text style={styles.subtitle}>Share your full name to help us get to know you better in our community.</Text>
          </View>

          {/* Name Input */}
          <View style={getInputStyle()}>
            <Ionicons name="person-outline" size={20} color={getNameIconColor()} />
            <TextInput 
              style={styles.input} 
              placeholder="Eveline" 
              placeholderTextColor={COLORS.grayMuted} 
              value={name} 
              onChangeText={setName} 
              returnKeyType="done" 
              autoCapitalize="words"
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
            />
          </View>

          {/* Greeting */}
          {hasName && (
            <View style={styles.greeting}>
              <Text style={styles.greetingText}>Nice to see you <Text style={styles.greetingName}>{name}</Text>! 👋</Text>
            </View>
          )}

          {/* Gender Selection */}
          <Text style={styles.sectionLabel}>What's your gender?</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => (
              <GenderButton key={g.id} item={g} isActive={gender === g.id} onSelect={selectGender} />
            ))}
          </View>

          {/* Date of Birth */}
          <Text style={styles.label}>Date of birth <Text style={styles.required}>*</Text></Text>
          <TouchableOpacity style={getDateInputStyle()} onPress={openPicker} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={20} color={getDateIconColor()} />
            <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>
              {hasSelectedDate ? formatDate(date) : 'DD/MM/YYYY'}
            </Text>
          </TouchableOpacity>
          
          {/* Age Error */}
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
                <TouchableOpacity style={styles.flex} onPress={closePicker} activeOpacity={1} />
                <View style={styles.pickerBox}>
                  <View style={styles.pickerHeader}>
                    <TouchableOpacity onPress={closePicker}>
                      <Text style={styles.pickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={confirmDate}>
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
                    textColor={COLORS.dark} 
                    style={styles.picker} 
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
              disabled={!isFormValid || disabled} 
              onPress={handleNext}
            >
              Next
            </Button>
          </View>

          {/* Footer - dans le scroll */}
          <View style={styles.footer}>
            <SmuppyText width={140} variant="dark" />
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
  disabled: { opacity: 0.6 },
  
  // Back Button
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl },
  
  // Header - même format que SignupScreen
  header: { alignItems: 'center', marginBottom: 32 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: '#0a252f', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#676C75', textAlign: 'center' },
  
  // Input - 3 états: default, focused, valid/error
  inputBox: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, marginBottom: SPACING.lg, backgroundColor: COLORS.white },
  inputBoxFocused: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.white },
  inputBoxValid: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: COLORS.backgroundValid },
  inputBoxError: { backgroundColor: COLORS.errorLight, borderColor: COLORS.error, borderWidth: 2 },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.md },
  
  // Error
  errorRow: { flexDirection: 'row', alignItems: 'center', marginTop: -SPACING.sm, marginBottom: SPACING.lg, gap: 6 },
  errorText: { fontSize: 13, fontWeight: '500', color: COLORS.error },
  required: { color: COLORS.error, fontWeight: '600' },
  
  // Greeting
  greeting: { alignItems: 'center', marginBottom: SPACING.xl },
  greetingText: { ...TYPOGRAPHY.body, color: COLORS.dark },
  greetingName: { color: COLORS.primary, fontWeight: '600' },
  
  // Labels
  label: { ...TYPOGRAPHY.label, color: COLORS.dark, marginBottom: SPACING.sm },
  sectionLabel: { ...TYPOGRAPHY.subtitle, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.lg },
  
  // Gender
  genderRow: { flexDirection: 'row', justifyContent: 'center', marginBottom: SPACING.xl, gap: SPACING.md },
  genderBox: { width: 100, height: 100, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusLg, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  genderIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xs },
  genderText: { ...TYPOGRAPHY.caption, color: COLORS.dark },
  
  // Date of Birth
  dobText: { ...TYPOGRAPHY.body, color: COLORS.dark, marginLeft: SPACING.md },
  placeholder: { color: COLORS.grayMuted },
  
  // Date Picker Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBox: { backgroundColor: COLORS.white, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, paddingBottom: SPACING['3xl'], shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  pickerCancel: { ...TYPOGRAPHY.body, color: COLORS.dark },
  pickerDone: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  picker: { height: 200, width: '100%' },
  
  // Button
  btnContainer: { marginTop: SPACING.xl, marginBottom: SPACING.xl },
  
  // Footer - dans le scroll avec marginTop auto
  footer: { alignItems: 'center', marginTop: 'auto' },
});