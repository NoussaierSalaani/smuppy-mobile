import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '../../context/UserContext';
import { useCurrentProfile, useUpdateProfile } from '../../hooks';
import { uploadProfileImage } from '../../services/imageUpload';
import DatePickerModal from '../../components/DatePickerModal';
import GenderPickerModal from '../../components/GenderPickerModal';

const EditProfilScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, updateProfile: updateLocalProfile } = useUser();
  const { data: profileData, refetch } = useCurrentProfile();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarChanged, setAvatarChanged] = useState(false);

  // Merge profile data from DB and local context
  const mergedProfile = {
    ...user,
    fullName: profileData?.full_name || user.fullName,
    avatar: profileData?.avatar_url || user.avatar,
    bio: profileData?.bio || user.bio || '',
    dateOfBirth: profileData?.date_of_birth || user.dateOfBirth,
    gender: profileData?.gender || user.gender,
    interests: profileData?.interests || user.interests || [],
  };

  // Form state - initialisé avec les données fusionnées
  const [avatar, setAvatar] = useState(mergedProfile.avatar || '');
  const [firstName, setFirstName] = useState(mergedProfile.firstName || mergedProfile.fullName?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(mergedProfile.lastName || mergedProfile.fullName?.split(' ').slice(1).join(' ') || '');
  const [bio, setBio] = useState(mergedProfile.bio || '');
  const [dateOfBirth, setDateOfBirth] = useState(mergedProfile.dateOfBirth || '');
  const [gender, setGender] = useState(mergedProfile.gender || '');

  // Modals
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  // Sync with profile data when it changes
  useEffect(() => {
    const merged = {
      avatar: profileData?.avatar_url || user.avatar || '',
      fullName: profileData?.full_name || user.fullName || '',
      bio: profileData?.bio || user.bio || '',
      dateOfBirth: profileData?.date_of_birth || user.dateOfBirth || '',
      gender: profileData?.gender || user.gender || '',
    };
    setAvatar(merged.avatar);
    setFirstName(user.firstName || merged.fullName?.split(' ')[0] || '');
    setLastName(user.lastName || merged.fullName?.split(' ').slice(1).join(' ') || '');
    setBio(merged.bio);
    setDateOfBirth(merged.dateOfBirth);
    setGender(merged.gender);
  }, [user, profileData]);

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
      setAvatarChanged(true);
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
      setAvatarChanged(true);
      setHasChanges(true);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const fullName = `${firstName} ${lastName}`.trim();

      // Handle avatar upload if changed
      let avatarUrl = avatar;
      if (avatarChanged && avatar && !avatar.startsWith('http')) {
        const { url, error: uploadError } = await uploadProfileImage(avatar, profileData?.id || user.id || '');
        if (uploadError) {
          Alert.alert('Error', 'Failed to upload photo. Please try again.');
          return;
        }
        if (url) avatarUrl = url;
      }

      // Save to Supabase
      await updateDbProfile({
        full_name: fullName,
        avatar_url: avatarUrl,
        bio: bio,
        date_of_birth: dateOfBirth,
        gender: gender,
      });

      // Also update local context
      await updateLocalProfile({
        avatar: avatarUrl,
        firstName,
        lastName,
        fullName,
        bio,
        dateOfBirth,
        gender,
      });

      // Refresh data
      await refetch();

      setHasChanges(false);
      setAvatarChanged(false);
      navigation.goBack();
    } catch (error) {
      console.error('Save profile error:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Format date for display (various formats → DD/MM/YYYY)
  const formatDateForDisplay = (dateString: string | Date | null | undefined): string => {
    if (!dateString) return '';

    // If it's a Date object
    if (dateString instanceof Date) {
      const day = String(dateString.getDate()).padStart(2, '0');
      const month = String(dateString.getMonth() + 1).padStart(2, '0');
      const year = dateString.getFullYear();
      return `${day}/${month}/${year}`;
    }

    // Convert to string if needed
    const str = String(dateString);

    // YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      const [year, month, day] = str.split('-');
      return `${day}/${month}/${year}`;
    }

    // ISO timestamp (YYYY-MM-DDTHH:mm:ss...)
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      const datePart = str.split('T')[0];
      const [year, month, day] = datePart.split('-');
      return `${day}/${month}/${year}`;
    }

    // Already in DD/MM/YYYY format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
      return str;
    }

    return '';
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
            <AvatarImage source={avatar} size={100} style={styles.avatar} />
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

          {/* Bio */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Bio</Text>
            <TextInput
              style={[styles.input, styles.bioInput]}
              value={bio}
              onChangeText={(text) => updateField(setBio, text)}
              placeholder="Tell us about yourself..."
              placeholderTextColor="#C7C7CC"
              multiline
              maxLength={150}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{bio.length}/150</Text>
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
    backgroundColor: '#0EBF8A',
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
    backgroundColor: '#0EBF8A',
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
  bioInput: {
    minHeight: 80,
    paddingTop: 14,
  },
  charCount: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: 4,
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