import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  StatusBar,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '../../context/UserContext';
import DatePickerModal from '../../components/DatePickerModal';
import GenderPickerModal from '../../components/GenderPickerModal';

const EditProfilScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useUser();
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state - initialisé avec les données du UserContext
  const [avatar, setAvatar] = useState(user.avatar || 'https://i.pravatar.cc/150?img=12');
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [email, setEmail] = useState(user.email || '');
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth || '');
  const [gender, setGender] = useState(user.gender || '');

  // Modals
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  // Sync with UserContext when it changes
  useEffect(() => {
    setAvatar(user.avatar || 'https://i.pravatar.cc/150?img=12');
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setEmail(user.email || '');
    setDateOfBirth(user.dateOfBirth || '');
    setGender(user.gender || '');
  }, [user]);

  const updateField = (setter, value) => {
    setter(value);
    setHasChanges(true);
  };

  const showImagePicker = () => {
    const options = ['Take Photo', 'Choose from Library', 'Cancel'];

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 2,
        },
        (index) => handleImageOption(index)
      );
    } else {
      Alert.alert('Update Photo', '', [
        { text: 'Take Photo', onPress: () => launchCamera() },
        { text: 'Choose from Library', onPress: () => launchLibrary() },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleImageOption = async (index) => {
    if (index === 0) {
      await launchCamera();
    } else if (index === 1) {
      await launchLibrary();
    }
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
      setHasChanges(true);
    }
  };

  const launchLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Photo library access is required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    
    setIsSaving(true);
    try {
      await updateProfile({
        avatar,
        firstName,
        lastName,
        email,
        dateOfBirth,
        gender,
      });
      setHasChanges(false);
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Format date for display (YYYY-MM-DD → DD/MM/YYYY)
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    }
    return dateString;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#0A0A0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit profil</Text>
        <TouchableOpacity 
          style={[styles.saveButton, (!hasChanges || isSaving) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!hasChanges || isSaving}
        >
          <Text style={[styles.saveButtonText, (!hasChanges || isSaving) && styles.saveButtonTextDisabled]}>
            {isSaving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: avatar }} style={styles.avatar} />
            <TouchableOpacity 
              style={styles.updateButton}
              onPress={showImagePicker}
            >
              <Text style={styles.updateButtonText}>Update</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Form Fields */}
        <View style={styles.formContainer}>
          {/* First Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={(text) => updateField(setFirstName, text)}
              placeholder="First name"
              placeholderTextColor="#C7C7CC"
            />
          </View>

          {/* Last Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Last name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={(text) => updateField(setLastName, text)}
              placeholder="Last name"
              placeholderTextColor="#C7C7CC"
            />
          </View>

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(text) => updateField(setEmail, text)}
              placeholder="Email"
              placeholderTextColor="#C7C7CC"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Date of Birth - Opens DatePickerModal */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Date of Birth</Text>
            <TouchableOpacity 
              style={styles.selectInput} 
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={[styles.selectInputText, !dateOfBirth && styles.selectInputPlaceholder]}>
                {dateOfBirth ? formatDateForDisplay(dateOfBirth) : 'Select date'}
              </Text>
              <Ionicons name="calendar-outline" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>

          {/* Gender - Opens GenderPickerModal */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Gender</Text>
            <TouchableOpacity 
              style={styles.selectInput} 
              onPress={() => setShowGenderPicker(true)}
            >
              <Text style={[styles.selectInputText, !gender && styles.selectInputPlaceholder]}>
                {gender || 'Select gender'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Spacer for bottom */}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        onClose={() => setShowDatePicker(false)}
        onConfirm={(date) => updateField(setDateOfBirth, date)}
        initialDate={dateOfBirth}
      />

      {/* Gender Picker Modal */}
      <GenderPickerModal
        visible={showGenderPicker}
        onClose={() => setShowGenderPicker(false)}
        onSelect={(selected) => updateField(setGender, selected)}
        selectedGender={gender}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0A0A0F',
  },
  saveButton: {
    backgroundColor: '#11E3A3',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  saveButtonDisabled: {
    backgroundColor: '#E8E8E8',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  saveButtonTextDisabled: {
    color: '#C7C7CC',
  },
  content: {
    flex: 1,
  },

  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  updateButton: {
    position: 'absolute',
    bottom: 0,
    alignSelf: 'center',
    backgroundColor: '#11E3A3',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  updateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },

  // Form
  formContainer: {
    paddingHorizontal: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0A0A0F',
  },
  selectInput: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: {
    fontSize: 16,
    color: '#0A0A0F',
  },
  selectInputPlaceholder: {
    color: '#C7C7CC',
  },
});

export default EditProfilScreen;