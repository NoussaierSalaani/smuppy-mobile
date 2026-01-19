import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { COLORS, TYPOGRAPHY, SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { supabase } from '../../config/supabase';
import { ENV } from '../../config/env';

export default function FindFriendsScreen({ navigation, route }) {
  const params = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  const [loading, setLoading] = useState(false);
  const [friendsFound, setFriendsFound] = useState<number | null>(null);

  const handleSkip = () => navigate('Guidelines', params);

  const handleFindFriends = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      // Request permission
      const { status } = await Contacts.requestPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'To find your friends on Smuppy, we need access to your contacts. You can enable this later in Settings.',
          [{ text: 'OK', onPress: () => navigate('Guidelines', params) }]
        );
        setLoading(false);
        return;
      }

      // Get contacts
      const { data: contactsData } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.FirstName,
        ],
      });

      if (!contactsData || contactsData.length === 0) {
        Alert.alert('No Contacts', 'We couldn\'t find any contacts on your device.');
        setLoading(false);
        navigate('Guidelines', params);
        return;
      }

      // Format contacts for the API
      const formattedContacts = contactsData
        .filter(c => c.emails?.length || c.phoneNumbers?.length)
        .map(contact => ({
          name: contact.firstName || contact.name,
          emails: contact.emails?.map(e => e.email).filter(Boolean),
          phones: contact.phoneNumbers?.map(p => p.number).filter(Boolean),
        }));

      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Send to Edge Function
      const response = await fetch(`${ENV.SUPABASE_URL}/functions/v1/store-contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': ENV.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ contacts: formattedContacts }),
      });

      const result = await response.json();

      if (result.success) {
        setFriendsFound(result.friendsOnApp || 0);

        // Show result for 2 seconds then navigate
        setTimeout(() => {
          navigate('Guidelines', params);
        }, 2500);
      } else {
        throw new Error(result.error || 'Failed to sync contacts');
      }

    } catch (error) {
      console.error('[FindFriends] Error:', error);
      Alert.alert(
        'Error',
        'Something went wrong. You can try again later from Settings.',
        [{ text: 'Continue', onPress: () => navigate('Guidelines', params) }]
      );
    } finally {
      setLoading(false);
    }
  }, [navigate, params]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Progress Bar - Pro Creator flow step 4/6 */}
      <OnboardingHeader onBack={goBack} disabled={disabled || loading} currentStep={4} totalSteps={6} />

      <View style={styles.content}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons name="people" size={60} color={COLORS.primary} />
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
              color={friendsFound > 0 ? COLORS.success : COLORS.primary}
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
              <Ionicons name="shield-checkmark" size={24} color={COLORS.success} />
              <Text style={styles.featureText}>Your contacts are hashed for privacy</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="notifications" size={24} color={COLORS.primary} />
              <Text style={styles.featureText}>Get notified when friends join</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="lock-closed" size={24} color={COLORS.dark} />
              <Text style={styles.featureText}>We never spam your contacts</Text>
            </View>
          </View>
        )}

        {/* Loading */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
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
              disabled={disabled || loading}
              onPress={handleFindFriends}
            >
              Find My Friends
            </Button>

            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkip}
              disabled={disabled || loading}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <SmuppyText width={120} variant="dark" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  content: { flex: 1, paddingHorizontal: SPACING.xl },

  iconContainer: { alignItems: 'center', marginBottom: SPACING.xl },
  iconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: `${COLORS.primary}15`, justifyContent: 'center', alignItems: 'center' },

  title: { fontFamily: 'WorkSans-Bold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 16, color: COLORS.darkGray, textAlign: 'center', lineHeight: 24, marginBottom: SPACING.xl },

  featuresList: { marginTop: SPACING.lg },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg, paddingHorizontal: SPACING.md },
  featureText: { fontSize: 15, color: COLORS.dark, marginLeft: SPACING.md, flex: 1 },

  loadingContainer: { alignItems: 'center', marginTop: SPACING.xl },
  loadingText: { fontSize: 16, color: COLORS.darkGray, marginTop: SPACING.md },

  resultContainer: { alignItems: 'center', marginTop: SPACING.xl, padding: SPACING.xl, backgroundColor: COLORS.backgroundFocus, borderRadius: SIZES.radiusLg },
  resultText: { fontSize: 18, fontWeight: '600', color: COLORS.dark, textAlign: 'center', marginTop: SPACING.md },

  spacer: { flex: 1 },

  btnContainer: { marginBottom: SPACING.lg },
  skipBtn: { alignItems: 'center', paddingVertical: SPACING.lg },
  skipText: { fontSize: 16, color: COLORS.darkGray, textDecorationLine: 'underline' },

  footer: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.md },
});
