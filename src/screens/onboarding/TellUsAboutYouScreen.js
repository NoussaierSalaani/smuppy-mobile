import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, TextInput, 
  Platform, ScrollView, KeyboardAvoidingView, Modal, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, TYPOGRAPHY, SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

const GENDERS = [
  { id: 'male', icon: 'male', label: 'Male', color: '#007AFF' },
  { id: 'female', icon: 'female', label: 'Female', color: '#FF2D92' },
  { id: 'other', icon: 'male-female', label: 'Other', color: '#1C1C1E' },
];

export default function TellUsAboutYouScreen({ navigation }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [date, setDate] = useState(new Date(2000, 0, 1));
  const [showPicker, setShowPicker] = useState(false);
  const [hasSelectedDate, setHasSelectedDate] = useState(false);
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const formatDate = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;

  const onDateChange = (_, selectedDate) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selectedDate) { setDate(selectedDate); setHasSelectedDate(true); }
  };

  const selectGender = (g) => { Keyboard.dismiss(); setGender(g); };
  const openPicker = () => { Keyboard.dismiss(); setShowPicker(true); };
  const closePicker = () => setShowPicker(false);
  const confirmDate = () => { setHasSelectedDate(true); setShowPicker(false); };
  const handleNext = () => navigate('AccountType', { name, gender, dateOfBirth: date.toISOString() });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          
          {/* Back */}
          <TouchableOpacity style={[styles.backBtn, disabled && styles.disabled]} onPress={goBack} disabled={disabled}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>What is your name?</Text>
            <Text style={styles.subtitle}>Share your full name to help us get to know you better in our community.</Text>
          </View>

          {/* Name */}
          <View style={styles.inputBox}>
            <Ionicons name="person-outline" size={20} color={COLORS.grayMuted} />
            <TextInput style={styles.input} placeholder="Eveline" placeholderTextColor={COLORS.grayMuted} value={name} onChangeText={setName} returnKeyType="done" autoCapitalize="words" />
          </View>

          {/* Greeting */}
          {name.length > 0 && (
            <View style={styles.greeting}>
              <Text style={styles.greetingText}>Nice to see you <Text style={styles.greetingName}>{name}</Text>! 👋</Text>
            </View>
          )}

          {/* Gender */}
          <Text style={styles.sectionLabel}>What's your gender?</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((g) => {
              const active = gender === g.id;
              return (
                <TouchableOpacity 
                  key={g.id}
                  style={[styles.genderBox, active && { borderColor: g.color, borderWidth: 2, transform: [{ scale: 1.05 }], shadowOpacity: 0.2, elevation: 8 }]} 
                  onPress={() => selectGender(g.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.genderIcon, { backgroundColor: g.color + '15' }, active && { backgroundColor: g.color }]}>
                    <Ionicons name={g.icon} size={28} color={active ? COLORS.white : g.color} />
                  </View>
                  <Text style={[styles.genderText, active && { color: g.color, fontWeight: '600' }]}>{g.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* DOB */}
          <Text style={styles.label}>Date of birth</Text>
          <TouchableOpacity style={styles.inputBox} onPress={openPicker} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.grayMuted} />
            <Text style={[styles.dobText, !hasSelectedDate && styles.placeholder]}>{hasSelectedDate ? formatDate(date) : 'DD/MM/YYYY'}</Text>
          </TouchableOpacity>

          {/* iOS Picker */}
          {Platform.OS === 'ios' && (
            <Modal visible={showPicker} transparent animationType="slide">
              <View style={styles.modalOverlay}>
                <TouchableOpacity style={styles.flex} onPress={closePicker} activeOpacity={1} />
                <View style={styles.pickerBox}>
                  <View style={styles.pickerHeader}>
                    <TouchableOpacity onPress={closePicker}><Text style={styles.pickerCancel}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity onPress={confirmDate}><Text style={styles.pickerDone}>Done</Text></TouchableOpacity>
                  </View>
                  <DateTimePicker value={date} mode="date" display="spinner" onChange={onDateChange} maximumDate={new Date()} minimumDate={new Date(1920, 0, 1)} textColor={COLORS.dark} style={styles.picker} />
                </View>
              </View>
            </Modal>
          )}

          {/* Android Picker */}
          {Platform.OS === 'android' && showPicker && (
            <DateTimePicker value={date} mode="date" display="default" onChange={onDateChange} maximumDate={new Date()} minimumDate={new Date(1920, 0, 1)} />
          )}

          {/* Next */}
          <View style={styles.btnContainer}>
            <Button variant="primary" size="lg" icon="arrow-forward" iconPosition="right" disabled={!name.length || disabled} onPress={handleNext}>Next</Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer - FIXE */}
      <View style={styles.footer} pointerEvents="none">
        <SmuppyText width={140} variant="dark" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: SPACING.xl, paddingTop: SPACING.base, paddingBottom: SPACING['3xl'] },
  disabled: { opacity: 0.6 },

  // Back
  backBtn: { width: 44, height: 44, backgroundColor: COLORS.dark, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: SPACING.xl },

  // Header
  header: { alignItems: 'center', marginBottom: SPACING['3xl'] },
  title: { ...TYPOGRAPHY.title2, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { ...TYPOGRAPHY.bodySmall, color: COLORS.dark, textAlign: 'center', lineHeight: 22 },

  // Input
  inputBox: { flexDirection: 'row', alignItems: 'center', height: SIZES.inputHeight, borderWidth: 1.5, borderColor: COLORS.grayLight, borderRadius: SIZES.radiusInput, paddingHorizontal: SPACING.base, marginBottom: SPACING.lg, backgroundColor: COLORS.white },
  input: { flex: 1, ...TYPOGRAPHY.body, marginLeft: SPACING.md },

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

  // DOB
  dobText: { ...TYPOGRAPHY.body, color: COLORS.dark, marginLeft: SPACING.md },
  placeholder: { color: COLORS.grayMuted },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerBox: { backgroundColor: COLORS.white, borderTopLeftRadius: SIZES.radiusXl, borderTopRightRadius: SIZES.radiusXl, paddingBottom: SPACING['3xl'], shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 10 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.base, borderBottomWidth: 1, borderBottomColor: COLORS.grayLight },
  pickerCancel: { ...TYPOGRAPHY.body, color: COLORS.dark },
  pickerDone: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  picker: { height: 200, width: '100%' },

  // Button
  btnContainer: { marginTop: SPACING.xl, marginBottom: SPACING.xl },

  // Footer - FIXE
  footer: { position: 'absolute', bottom: SPACING['3xl'], left: 0, right: 0, alignItems: 'center' },
});