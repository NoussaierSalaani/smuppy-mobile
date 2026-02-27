import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StatusBar,
  KeyboardAvoidingView,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { AvatarImage } from '../../components/OptimizedImage';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useUserStore } from '../../stores/userStore';
import { useCurrentProfile, useUpdateProfile } from '../../hooks/queries';
import { uploadProfileImage } from '../../services/imageUpload';
import { awsAuth } from '../../services/aws-auth';
import DatePickerModal from '../../components/DatePickerModal';
import GenderPickerModal from '../../components/GenderPickerModal';
import SmuppyActionSheet from '../../components/SmuppyActionSheet';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { searchNominatim, isValidCoordinate, NominatimSearchResult } from '../../config/api';
import * as Location from 'expo-location';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatDateForDisplay } from '../../utils/dateFormatters';
import { filterContent } from '../../utils/contentFilters';
import { KEYBOARD_BEHAVIOR } from '../../config/platform';
import { ACCOUNT_TYPE } from '../../config/accountTypes';

type EditProfileScreenProps = Readonly<{
  navigation: { goBack: () => void; navigate: (screen: string, params?: Record<string, unknown>) => void };
}>;

const EditProfileScreen = ({ navigation }: EditProfileScreenProps) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const user = useUserStore((state) => state.user);
  const updateLocalProfile = useUserStore((state) => state.updateProfile);
  const { data: profileData, refetch } = useCurrentProfile();
  const { mutateAsync: updateDbProfile } = useUpdateProfile();
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [showImageSheet, setShowImageSheet] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const { showError: errorAlert, showWarning: warningAlert } = useSmuppyAlert();
  const alert = { error: errorAlert, warning: warningAlert };

  // Load user email from auth
  useEffect(() => {
    const loadEmail = async () => {
      const authUser = await awsAuth.getCurrentUser();
      if (authUser?.email) {
        setUserEmail(authUser.email);
      }
    };
    loadEmail().catch(err => { if (__DEV__) console.warn('[EditProfileScreen] Load error:', err); });
  }, []);

  // Merge profile data from DB and local context
  const mergedProfile = {
    ...user,
    fullName: profileData?.full_name || user?.fullName,
    avatar: profileData?.avatar_url || user?.avatar,
    bio: profileData?.bio || user?.bio || '',
    dateOfBirth: profileData?.date_of_birth || user?.dateOfBirth,
    gender: profileData?.gender || user?.gender,
    interests: profileData?.interests || user?.interests || [],
  };

  // Form state - initialized with merged data
  const [avatar, setAvatar] = useState(mergedProfile.avatar || '');
  const [firstName, setFirstName] = useState(mergedProfile.firstName || mergedProfile.fullName?.split(' ')[0] || '');
  const [lastName, setLastName] = useState(mergedProfile.lastName || mergedProfile.fullName?.split(' ').slice(1).join(' ') || '');
  const [bio, setBio] = useState(mergedProfile.bio || '');
  const [dateOfBirth, setDateOfBirth] = useState(mergedProfile.dateOfBirth || '');
  const [gender, setGender] = useState(mergedProfile.gender || '');

  // Business address (pro_business only)
  const isBusiness = user?.accountType === ACCOUNT_TYPE.PRO_BUSINESS;
  const [businessAddress, setBusinessAddress] = useState(user?.businessAddress || '');
  const [businessLatitude, setBusinessLatitude] = useState<number | undefined>(user?.businessLatitude);
  const [businessLongitude, setBusinessLongitude] = useState<number | undefined>(user?.businessLongitude);
  const [addressSuggestions, setAddressSuggestions] = useState<NominatimSearchResult[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const addressSearchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup address search timeout on unmount
  useEffect(() => {
    return () => {
      if (addressSearchTimeout.current) clearTimeout(addressSearchTimeout.current);
    };
  }, []);

  // Modals
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenderPicker, setShowGenderPicker] = useState(false);

  // Sync with profile data when it changes
  useEffect(() => {
    const merged = {
      avatar: profileData?.avatar_url || user?.avatar || '',
      fullName: profileData?.full_name || user?.fullName || '',
      bio: profileData?.bio || user?.bio || '',
      dateOfBirth: profileData?.date_of_birth || user?.dateOfBirth || '',
      gender: profileData?.gender || user?.gender || '',
    };
    setAvatar(merged.avatar);
    setFirstName(user?.firstName || merged.fullName?.split(' ')[0] || '');
    setLastName(user?.lastName || merged.fullName?.split(' ').slice(1).join(' ') || '');
    setBio(merged.bio);
    setDateOfBirth(merged.dateOfBirth);
    setGender(merged.gender);
  }, [user, profileData]);

  const updateField = (setter: (value: string) => void, value: string) => {
    setter(value);
    setHasChanges(true);
  };

  // Business address handlers
  const handleBusinessAddressChange = (text: string) => {
    setBusinessAddress(text);
    setBusinessLatitude(undefined);
    setBusinessLongitude(undefined);
    setHasChanges(true);
    if (addressSearchTimeout.current) clearTimeout(addressSearchTimeout.current);
    if (text.length < 3) { setAddressSuggestions([]); return; }
    addressSearchTimeout.current = setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const results = await searchNominatim(text, { limit: 4 });
        setAddressSuggestions(results);
      } catch { setAddressSuggestions([]); }
      finally { setIsLoadingSuggestions(false); }
    }, 300);
  };

  const selectBusinessAddress = (suggestion: NominatimSearchResult) => {
    const parsedLat = Number.parseFloat(suggestion.lat);
    const parsedLng = Number.parseFloat(suggestion.lon);

    // Validate parsed coordinates before setting state
    if (!isValidCoordinate(parsedLat, parsedLng)) {
      if (__DEV__) console.warn('[EditProfileScreen] Invalid coordinates from Nominatim:', { lat: suggestion.lat, lon: suggestion.lon });
      alert.error('Invalid Location', 'The selected location has invalid coordinates. Please try another address.');
      return;
    }

    setBusinessAddress(suggestion.display_name);
    setBusinessLatitude(parsedLat);
    setBusinessLongitude(parsedLng);
    setAddressSuggestions([]);
    setHasChanges(true);
    Keyboard.dismiss();
  };

  const detectBusinessLocation = async () => {
    setIsLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        alert.warning('Location Permission', 'Location access is required to detect your business address.');
        setIsLoadingLocation(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [reverseResult] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      if (reverseResult) {
        const parts = [reverseResult.streetNumber, reverseResult.street, reverseResult.city, reverseResult.postalCode, reverseResult.country].filter(Boolean);
        setBusinessAddress(parts.join(', '));
        setBusinessLatitude(location.coords.latitude);
        setBusinessLongitude(location.coords.longitude);
        setAddressSuggestions([]);
        setHasChanges(true);
      }
    } catch (error) {
      if (__DEV__) console.warn('Location error:', error);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const showImagePicker = () => {
    setShowImageSheet(true);
  };

  const getImageSheetOptions = () => {
    const options: Array<{ label: string; icon: string; onPress: () => Promise<void>; destructive?: boolean }> = [
      {
        label: 'Take Photo',
        icon: 'camera-outline',
        onPress: launchCamera,
      },
      {
        label: 'Choose from Library',
        icon: 'images-outline',
        onPress: launchLibrary,
      },
    ];

    // Add remove option if avatar exists (http URL or local file URI)
    if (avatar && (avatar.startsWith('http') || avatar.startsWith('file://') || avatar.startsWith('ph://'))) {
      options.push({
        label: 'Remove Photo',
        icon: 'trash-outline',
        onPress: async () => {
          updateField(setAvatar, '');
          setAvatarChanged(true);
        },
        destructive: true,
      });
    }

    return options;
  };

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert.warning('Permission needed', 'Camera access is required to take photos.');
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
      alert.warning('Permission needed', 'Photo library access is required to choose photos.');
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

    // Client-side content filtering for bio and name
    const fullName = `${firstName} ${lastName}`.trim();
    if (bio) {
      const bioFilter = filterContent(bio, { context: 'bio' });
      if (!bioFilter.clean && ['critical', 'high'].includes(bioFilter.severity)) {
        alert.error('Content Policy', bioFilter.reason || 'Your bio contains inappropriate content.');
        return;
      }
    }
    if (fullName) {
      const nameFilter = filterContent(fullName, { context: 'bio' });
      if (!nameFilter.clean && nameFilter.severity === 'critical') {
        alert.error('Content Policy', 'Your name contains content that violates our guidelines.');
        return;
      }
    }

    setIsSaving(true);
    try {
      // Handle avatar upload if changed
      let avatarUrl = avatar;
      if (avatarChanged && avatar && !avatar.startsWith('http')) {
        const { url, error: uploadError } = await uploadProfileImage(avatar, profileData?.id || user?.id || '');
        if (uploadError) {
          alert.error('Upload Failed', 'Failed to upload photo. Please try again.');
          setIsSaving(false);
          return;
        }
        if (url) avatarUrl = url;
      }

      // Save to AWS
      const profileUpdates: Record<string, unknown> = {
        full_name: fullName,
        avatar_url: avatarUrl,
        bio: bio,
        date_of_birth: dateOfBirth,
        gender: gender,
      };
      if (isBusiness) {
        profileUpdates.business_address = businessAddress;
        if (businessLatitude != null) profileUpdates.business_latitude = businessLatitude;
        if (businessLongitude != null) profileUpdates.business_longitude = businessLongitude;
      }
      await updateDbProfile(profileUpdates);

      // Also update local store
      updateLocalProfile({
        avatar: avatarUrl,
        firstName,
        lastName,
        fullName,
        bio,
        dateOfBirth,
        gender,
        ...(isBusiness ? {
          businessAddress,
          businessLatitude,
          businessLongitude,
        } : {}),
      });

      // Refresh data
      await refetch();

      setHasChanges(false);
      setAvatarChanged(false);
      navigation.goBack();
    } catch (error) {
      if (__DEV__) console.warn('Save profile error:', error);
      alert.error('Save Failed', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Extracted handlers
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleFirstNameChange = useCallback((text: string) => updateField(setFirstName, text), []);
  const handleLastNameChange = useCallback((text: string) => updateField(setLastName, text), []);
  const handleBioChange = useCallback((text: string) => updateField(setBio, text), []);
  const handleShowDatePicker = useCallback(() => setShowDatePicker(true), []);
  const handleShowGenderPicker = useCallback(() => setShowGenderPicker(true), []);
  const handleCloseDatePicker = useCallback(() => setShowDatePicker(false), []);
  const handleConfirmDate = useCallback((date: string) => updateField(setDateOfBirth, date), []);
  const handleCloseGenderPicker = useCallback(() => setShowGenderPicker(false), []);
  const handleSelectGender = useCallback((selected: string) => updateField(setGender, selected), []);
  const handleCloseImageSheet = useCallback(() => setShowImageSheet(false), []);

  // Create styles with theme
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const containerStyle = useMemo(() => [styles.container, { paddingTop: insets.top }], [insets.top, styles.container]);

  return (
    <KeyboardAvoidingView
      style={containerStyle}
      behavior={KEYBOARD_BEHAVIOR}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Ionicons name="arrow-back" size={24} color="#0A0A0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
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
          {/* Email (Read-only) */}
          {!!userEmail && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.readOnlyInput}>
                <Ionicons name="mail-outline" size={18} color="#8E8E93" style={styles.emailIcon} />
                <Text style={styles.readOnlyText}>{userEmail}</Text>
                <Ionicons name="lock-closed" size={14} color="#C7C7CC" />
              </View>
            </View>
          )}

          {/* First Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={handleFirstNameChange}
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
              onChangeText={handleLastNameChange}
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
              onChangeText={handleBioChange}
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
              onPress={handleShowDatePicker}
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
              onPress={handleShowGenderPicker}
            >
              <Text style={[styles.selectInputText, !gender && styles.selectInputPlaceholder]}>
                {gender || 'Select gender'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Business Address Section (pro_business only) */}
        {isBusiness && (
          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Business Address</Text>
              <View style={styles.addressRow}>
                <TouchableOpacity onPress={detectBusinessLocation} disabled={isLoadingLocation} style={styles.locationButton}>
                  {isLoadingLocation ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="locate" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
                <TextInput
                  style={[styles.input, styles.flexOne]}
                  value={businessAddress}
                  onChangeText={handleBusinessAddressChange}
                  placeholder="Start typing or use location..."
                  placeholderTextColor="#C7C7CC"
                />
                {isLoadingSuggestions && <ActivityIndicator size="small" color={colors.primary} />}
              </View>
              {addressSuggestions.length > 0 && (
                <View style={styles.suggestionsContainer}>
                  {addressSuggestions.map((s) => (
                    <TouchableOpacity
                      key={s.place_id.toString()}
                      style={styles.suggestionItem}
                      onPress={() => selectBusinessAddress(s)}
                    >
                      <Ionicons name="location" size={16} color={colors.primary} />
                      <Text style={styles.suggestionText} numberOfLines={2}>{s.display_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Spacer for bottom */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        onClose={handleCloseDatePicker}
        onConfirm={handleConfirmDate}
        initialDate={dateOfBirth}
      />

      {/* Gender Picker Modal */}
      <GenderPickerModal
        visible={showGenderPicker}
        onClose={handleCloseGenderPicker}
        onSelect={handleSelectGender}
        selectedGender={gender}
      />

      {/* Image Picker Action Sheet */}
      <SmuppyActionSheet
        visible={showImageSheet}
        onClose={handleCloseImageSheet}
        title="Profile Photo"
        subtitle="Choose how to update your photo"
        options={getImageSheetOptions()}
      />
    </KeyboardAvoidingView>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.dark,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  saveButtonDisabled: {
    backgroundColor: colors.backgroundSecondary,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  saveButtonTextDisabled: {
    color: colors.gray,
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
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 14,
  },
  updateButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
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
    color: colors.gray,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.dark,
  },
  bioInput: {
    minHeight: 80,
    paddingTop: 14,
  },
  charCount: {
    fontSize: 12,
    color: colors.gray,
    textAlign: 'right',
    marginTop: 4,
  },
  selectInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: {
    fontSize: 16,
    color: colors.dark,
  },
  selectInputPlaceholder: {
    color: colors.gray,
  },
  readOnlyInput: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  readOnlyText: {
    flex: 1,
    fontSize: 16,
    color: colors.gray,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    paddingRight: 12,
  },
  locationButton: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  suggestionsContainer: {
    backgroundColor: colors.background,
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    color: colors.dark,
    marginLeft: 8,
  },
  emailIcon: { marginRight: 10 },
  flexOne: { flex: 1 },
  bottomSpacer: { height: 40 },
});

export default EditProfileScreen;