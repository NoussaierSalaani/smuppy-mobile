import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { awsAPI } from '../../services/aws-api';
import { storage, STORAGE_KEYS } from '../../utils/secureStorage';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface FindFriendsScreenProps {
  navigation: {
    goBack: () => void;
  };
}

export default function FindFriendsScreen({ navigation }: FindFriendsScreenProps) {
  const { colors, isDark } = useTheme();
  const { showError, showAlert } = useSmuppyAlert();
  const [loading, setLoading] = useState(false);
  const [friendsFound, setFriendsFound] = useState<number | null>(null);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleClose = () => {
    storage.set(STORAGE_KEYS.FIND_FRIENDS_SHOWN, 'true');
    navigation.goBack();
  };

  const handleFindFriends = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      const { status } = await Contacts.requestPermissionsAsync();

      if (status !== 'granted') {
        showAlert({
          title: 'Permission Required',
          message: 'To find your friends on Smuppy, we need access to your contacts. You can enable this later in Settings.',
          type: 'warning',
          buttons: [{ text: 'OK', onPress: handleClose }],
        });
        setLoading(false);
        return;
      }

      const { data: contactsData } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.FirstName,
        ],
      });

      if (!contactsData || contactsData.length === 0) {
        showError('No Contacts', 'We couldn\'t find any contacts on your device.');
        setLoading(false);
        handleClose();
        return;
      }

      const formattedContacts = contactsData
        .filter(c => c.emails?.length || c.phoneNumbers?.length)
        .map(contact => ({
          name: contact.firstName || contact.name,
          emails: contact.emails?.map(e => e.email).filter(Boolean) as string[],
          phones: contact.phoneNumbers?.map(p => p.number).filter(Boolean) as string[],
        }));

      const result = await awsAPI.storeContacts(formattedContacts);

      if (result.success) {
        setFriendsFound(result.friendsOnApp || 0);
        await storage.set(STORAGE_KEYS.FIND_FRIENDS_SHOWN, 'true');

        setTimeout(() => {
          navigation.goBack();
        }, 2500);
      } else {
        throw new Error('Failed to sync contacts');
      }
    } catch (error) {
      if (__DEV__) console.error('[FindFriends] Error:', error);
      showAlert({
        title: 'Error',
        message: 'Something went wrong. You can try again later from Settings.',
        type: 'error',
        buttons: [{ text: 'Continue', onPress: handleClose }],
      });
    } finally {
      setLoading(false);
    }
  }, [loading, navigation]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with close button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleClose} style={styles.closeBtn} disabled={loading}>
          <Ionicons name="close" size={28} color={colors.dark} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="people" size={60} color={colors.primary} />
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title}>Find Your Friends</Text>
        <Text style={styles.subtitle}>
          See who's already on Smuppy and connect with them instantly!
        </Text>

        {/* Result message */}
        {friendsFound !== null && (
          <View style={styles.resultContainer}>
            <Ionicons
              name={friendsFound > 0 ? "checkmark-circle" : "information-circle"}
              size={48}
              color={friendsFound > 0 ? colors.success : colors.primary}
            />
            <Text style={styles.resultText}>
              {friendsFound > 0
                ? `${friendsFound} friend${friendsFound > 1 ? 's' : ''} found on Smuppy!`
                : "Contacts saved! We'll notify you when friends join."}
            </Text>
          </View>
        )}

        {/* Features list */}
        {friendsFound === null && !loading && (
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <Ionicons name="shield-checkmark" size={24} color={colors.success} />
              <Text style={styles.featureText}>Your contacts are hashed for privacy</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="notifications" size={24} color={colors.primary} />
              <Text style={styles.featureText}>Get notified when friends join</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="lock-closed" size={24} color={colors.dark} />
              <Text style={styles.featureText}>We never spam your contacts</Text>
            </View>
          </View>
        )}

        {/* Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Syncing contacts...</Text>
          </View>
        )}

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Buttons */}
        {friendsFound === null && (
          <View style={styles.btnContainer}>
            <Button
              variant="primary"
              size="lg"
              icon="people"
              iconPosition="left"
              disabled={loading}
              onPress={handleFindFriends}
            >
              Find My Friends
            </Button>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  closeBtn: { padding: SPACING.xs },
  content: { flex: 1, paddingHorizontal: SPACING.xl },

  iconContainer: { alignItems: 'center', marginBottom: SPACING.xl },
  iconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: `${colors.primary}15`, justifyContent: 'center', alignItems: 'center' },

  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: colors.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 16, color: colors.darkGray, textAlign: 'center', lineHeight: 24, marginBottom: SPACING.xl },

  featuresList: { marginTop: SPACING.lg },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg, paddingHorizontal: SPACING.md },
  featureText: { fontSize: 15, color: colors.dark, marginLeft: SPACING.md, flex: 1 },

  loadingContainer: { alignItems: 'center', marginTop: SPACING.xl },
  loadingText: { fontSize: 16, color: colors.darkGray, marginTop: SPACING.md },

  resultContainer: { alignItems: 'center', marginTop: SPACING.xl, padding: SPACING.xl, backgroundColor: colors.backgroundFocus, borderRadius: SIZES.radiusLg },
  resultText: { fontSize: 18, fontWeight: '600', color: colors.dark, textAlign: 'center', marginTop: SPACING.md },

  spacer: { flex: 1 },

  btnContainer: { marginBottom: SPACING.lg },
  skipBtn: { alignItems: 'center', paddingVertical: SPACING.lg },
  skipText: { fontSize: 16, color: colors.darkGray, textDecorationLine: 'underline' },
});
