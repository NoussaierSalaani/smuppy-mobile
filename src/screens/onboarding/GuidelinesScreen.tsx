import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TYPOGRAPHY, SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyLogoFull } from '../../components/SmuppyLogo';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { createProfile } from '../../services/database';
import { uploadProfileImage } from '../../services/imageUpload';
import { useUserStore } from '../../stores/userStore';
import * as backend from '../../services/backend';
import { useAuthCallbacks } from '../../context/AuthCallbackContext';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface GuidelinesScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: { accountType?: string } & Record<string, unknown> };
}

export default function GuidelinesScreen({ navigation, route }: GuidelinesScreenProps) {
  const { colors, isDark } = useTheme();
  const params = useMemo(() => route?.params || {}, [route?.params]);
  const { accountType } = params;
  const { onProfileCreated: _onProfileCreated } = useAuthCallbacks();
  const { showError } = useSmuppyAlert();
  const { goBack, disabled } = usePreventDoubleNavigation(navigation);
  const [isCreating, setIsCreating] = useState(false);
  const setZustandUser = useUserStore((state) => state.setUser);

  const { currentStep, totalSteps } = useMemo(() => {
    if (accountType === 'pro_creator') return { currentStep: 4, totalSteps: 4 };
    // personal (3/3) and pro_business (3/3)
    return { currentStep: 3, totalSteps: 3 };
  }, [accountType]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleAccept = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const currentUser = await backend.getCurrentUser();
      if (!currentUser) {
        showError('Error', 'Not authenticated. Please try again.');
        setIsCreating(false);
        return;
      }

      // Build profile data from accumulated route params
      const {
        name, gender, dateOfBirth, interests, profileImage,
        displayName, bio, website, socialLinks, expertise,
        businessCategory, businessCategoryCustom, locationsMode,
        businessName, businessAddress,
      } = params as Record<string, unknown>;
      const businessLatitude = (params as Record<string, unknown>).businessLatitude;
      const businessLongitude = (params as Record<string, unknown>).businessLongitude;

      const baseUsername = currentUser.email?.split('@')[0]?.toLowerCase().replaceAll(/[^a-z0-9]/g, '') || 'user';
      const generatedUsername = `${baseUsername}_${Math.floor(Math.random() * 1000000)}`; // NOSONAR
      const profileData: Record<string, unknown> = {
        full_name: name || displayName || generatedUsername,
        username: generatedUsername,
        account_type: (accountType && ['personal', 'pro_creator', 'pro_business'].includes(accountType)) ? accountType : 'personal',
      };

      if (gender) profileData.gender = gender;
      if (dateOfBirth) profileData.date_of_birth = dateOfBirth;
      if (displayName) profileData.display_name = displayName;
      if (bio) profileData.bio = bio;
      if (website) profileData.website = website;
      if (socialLinks && typeof socialLinks === 'object' && Object.keys(socialLinks).length > 0) profileData.social_links = socialLinks;
      if (interests && Array.isArray(interests) && interests.length > 0) profileData.interests = interests;
      if (expertise && Array.isArray(expertise) && expertise.length > 0) profileData.expertise = expertise;
      if (businessName) profileData.business_name = businessName;
      if (businessCategory) profileData.business_category = businessCategory === 'other' ? businessCategoryCustom : businessCategory;
      if (businessAddress) profileData.business_address = businessAddress;
      const lat = typeof businessLatitude === 'number' && Number.isFinite(businessLatitude) && Math.abs(businessLatitude) <= 90 ? businessLatitude : undefined;
      const lon = typeof businessLongitude === 'number' && Number.isFinite(businessLongitude) && Math.abs(businessLongitude) <= 180 ? businessLongitude : undefined;
      if (lat != null) profileData.business_latitude = lat;
      if (lon != null) profileData.business_longitude = lon;
      if (locationsMode) profileData.locations_mode = locationsMode;

      // Create profile with retries (idempotent: PATCH /profiles/me is an upsert,
      // so retries are safe even if a previous request succeeded but response was lost)
      let profileCreated = false;
      let retryCount = 0;
      const maxRetries = 3;

      while (!profileCreated && retryCount < maxRetries) {
        try {
          const { error: profileError } = await createProfile(profileData);
          if (profileError) {
            if (__DEV__) console.warn('[Guidelines] Profile creation error:', profileError);
            retryCount++;
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
          } else {
            profileCreated = true;
          }
        } catch (retryErr: unknown) {
          if (__DEV__) console.warn('[Guidelines] Profile creation exception:', retryErr);
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }

      // If all retries failed, verify if profile was actually created
      // (handles edge case: request succeeded but response was lost)
      if (!profileCreated) {
        try {
          const { error: verifyError } = await createProfile(profileData);
          if (!verifyError) {
            profileCreated = true;
          }
        } catch {
          // Profile truly not created
        }
      }

      if (!profileCreated) {
        showError('Error', 'Failed to create profile. Please try again.');
        setIsCreating(false);
        return;
      }

      // Mark onboarding as completed
      await createProfile({ onboarding_completed: true });

      // Update Zustand store
      const userData = {
        id: currentUser.id,
        fullName: (name || displayName || generatedUsername) as string,
        displayName: (displayName || name || generatedUsername) as string,
        email: currentUser.email || '',
        dateOfBirth: (dateOfBirth || '') as string,
        gender: (gender || '') as string,
        avatar: null as string | null,
        bio: (bio || '') as string,
        username: generatedUsername,
        accountType: (accountType || 'personal') as 'personal' | 'pro_creator' | 'pro_business',
        interests: (Array.isArray(interests) ? interests : []) as string[],
        expertise: (Array.isArray(expertise) ? expertise : []) as string[],
        website: (website || '') as string,
        socialLinks: (socialLinks || {}) as Record<string, string>,
        businessName: (businessName || '') as string,
        businessCategory: (businessCategory === 'other' ? (businessCategoryCustom || '') : (businessCategory || '')) as string,
        businessAddress: (businessAddress || '') as string,
        businessLatitude: businessLatitude as number | undefined ?? undefined,
        businessLongitude: businessLongitude as number | undefined ?? undefined,
        businessPhone: '',
        locationsMode: (locationsMode || '') as string,
      };
      setZustandUser(userData);

      // Upload profile image if present
      if (profileImage && currentUser.id) {
        try {
          const { url, error: uploadError } = await uploadProfileImage(profileImage as string, currentUser.id);
          if (url && !uploadError) {
            await createProfile({ avatar_url: url });
            setZustandUser({ ...userData, avatar: url });
          }
        } catch {
          // Don't block for image upload failure
        }
      }

      // Navigate to Success (onProfileCreated comes from context)
      navigation.reset({
        index: 0,
        routes: [{ name: 'Success' }],
      });
    } catch {
      showError('Error', 'An unexpected error occurred. Please try again.');
      setIsCreating(false);
    }
  }, [isCreating, params, accountType, navigation, setZustandUser, showError]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Progress Bar */}
      <OnboardingHeader onBack={goBack} disabled={disabled || isCreating} currentStep={currentStep} totalSteps={totalSteps} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Logo */}
        <View style={styles.logoContainer}>
          <SmuppyLogoFull iconSize={40} textWidth={110} iconVariant={isDark ? 'white' : 'dark'} textVariant={isDark ? 'white' : 'dark'} />
        </View>

        {/* Title */}
        <Text style={styles.title}>Smuppy Community Guidelines</Text>
        <Text style={styles.subtitle}>A Positive and Professional Space</Text>

        {/* Intro */}
        <Text style={styles.intro}>
          At <Text style={styles.introBold}>Smuppy</Text>, we are committed to fostering a <Text style={styles.introBold}>supportive, dynamic, and enriching</Text> community where users can <Text style={styles.introBold}>share positive, constructive, and inspiring content</Text>. Our mission is to promote an <Text style={styles.introBold}>active, balanced, and uplifting lifestyle</Text> through content that encourages wellness, education, creativity, and intellectual growth.
        </Text>
        <Text style={styles.intro}>
          These community guidelines define the principles that ensure a <Text style={styles.introBold}>safe, professional, and engaging environment</Text> for all users, including individuals and professionals.
        </Text>

        {/* Section 1 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Core Principles of the Smuppy Community</Text>
          <Text style={styles.text}>
            Smuppy is a platform where <Text style={styles.textBold}>only positive and constructive content</Text> is encouraged. All users commit to sharing content that highlights:
          </Text>
          <Text style={styles.listItem}>✅ Sports and well-being – Fitness, nutrition, relaxation, life balance...</Text>
          <Text style={styles.listItem}>✅ Culture and education – Artistic, historical, heritage, educational discoveries, learning...</Text>
          <Text style={styles.listItem}>✅ Entertainment and leisure – Enriching activities, sports challenges, creative content...</Text>
          <Text style={styles.listItem}>✅ Sports science and health innovation – Sharing knowledge on performance, recovery, and wellness technology.</Text>
          <Text style={styles.listItem}>✅ Intellectual growth and motivation – Inspiring content, positive mindset, and personal development...</Text>
          <Text style={styles.textBold}>We strictly prohibit any content that promotes negativity, incites hatred, and/or creates anxiety.</Text>
        </View>

        {/* Section 2 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Content Guidelines for Professionals</Text>
          <Text style={styles.text}>Smuppy welcomes professional users, including fitness coaches, wellness brands, educators, and other industry experts. Professionals can share and promote their services, products, commercial content, as long as they align with Smuppy's core values.</Text>
          <Text style={styles.subTitle}>🔹 Allowed professional content:</Text>
          <Text style={styles.listItem}>✅ Promotion of services, products, or events related to Sports, Health, fitness, wellness, education, culture, science, and/or personal growth.</Text>
          <Text style={styles.listItem}>✅ Collaborations with brands, sponsorships, or ambassador programs in the authorized domains.</Text>
          <Text style={styles.listItem}>✅ Educational and informative content that enhances the Smuppy community's knowledge and experience, providing real value to users.</Text>
          <Text style={styles.subTitle}>🔹 Prohibited professional content:</Text>
          <Text style={styles.listItem}>🚫 Aggressive or deceptive advertising like "This program guarantees weight loss in 7 days"</Text>
          <Text style={styles.listItem}>🚫 Unverified or misleading information on health, fitness, nutrition...</Text>
          <Text style={styles.listItem}>🚫 Promotion of speculative financial products, gambling, cryptocurrency trading, or any content unrelated to wellness, sports, culture, or education.</Text>
          <Text style={styles.textUnderline}>All professional content must remain informative, ethical, and aligned with Smuppy's mission.</Text>
        </View>

        {/* Section 3 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Prohibited Content on Smuppy</Text>
          <Text style={styles.text}>To ensure a positive and inclusive experience, the following types of content are strictly prohibited:</Text>
          <Text style={styles.listItem}>🚫 Violence and hate – No hateful comments/speech, incitement to violence, or harassment.</Text>
          <Text style={styles.listItem}>🚫 Politics and conflicts – No political news, international conflicts, or partisan debates.</Text>
          <Text style={styles.listItem}>🚫 Anxiety-inducing content – No alarming information, fake news, or conspiracy theories.</Text>
          <Text style={styles.listItem}>🚫 Discrimination, intolerance and prejudice – No racism, sexism, homophobia, intolerance or exclusionary content.</Text>
          <Text style={styles.listItem}>🚫 Misinformation and pseudoscience – Sharing unproven medical, sports, or scientific advice is prohibited.</Text>
          <Text style={styles.listItem}>🚫 Illegal content – Defamation, fraud, child exploitation, identity theft, hacking.</Text>
          <Text style={styles.textBold}>Smuppy is a positive digital safe space, dedicated to physical, mental, and cultural well-being.</Text>
        </View>

        {/* Section 4 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. User Commitments</Text>
          <Text style={styles.text}>By using Smuppy, every community member commits to:</Text>
          <Text style={styles.listItem}>🌟 Sharing inspiring, educational, and constructive content.</Text>
          <Text style={styles.listItem}>🌟 Respecting the values of inclusivity and mutual support.</Text>
          <Text style={styles.listItem}>🌟 Encouraging an active and balanced lifestyle.</Text>
          <Text style={styles.listItem}>🌟 Promoting positivity and motivation.</Text>
          <Text style={styles.textBold}>Every post, comment, or message must contribute to a healthy and respectful environment.</Text>
        </View>

        {/* Section 5 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. Moderation and Reporting</Text>
          <Text style={styles.listItem}>👮 Active Monitoring – Our moderation team ensures compliance with the guidelines and may remove any non-compliant content.</Text>
          <Text style={styles.listItem}>⚠️ Reporting – Users can report inappropriate content through the integrated reporting tools.</Text>
          <Text style={styles.listItem}>🚨 Sanctions – Repeated violations of the guidelines may result in:</Text>
          <Text style={styles.bulletItem}>• A warning.</Text>
          <Text style={styles.bulletItem}>• A temporary suspension of the account.</Text>
          <Text style={styles.bulletItem}>• A permanent ban from the platform.</Text>
          <Text style={styles.text}>Any sanctioned user has 7 days to contest a decision by emailing support@smuppy.com. Smuppy commits to reviewing each request within 5 business days.</Text>
          <Text style={styles.text}>Professional accounts found to repeatedly violate content guidelines may also be demonetized or restricted from promoting their services on Smuppy.</Text>
        </View>

        {/* Section 6 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Protection of Minors</Text>
          <Text style={styles.text}>Smuppy is reserved for users 16 years and older. Any attempt to register a minor with false information will result in immediate account deletion. Parents or legal guardians may request the removal of a minor's data by sending a request to support@smuppy.com.</Text>
        </View>

        {/* Section 7 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. Updates and Evolution of the Guidelines</Text>
          <Text style={styles.text}>Smuppy reserves the right to update these guidelines to ensure a continuously healthier, professional, and positive environment. Any changes will be communicated to users.</Text>
        </View>

        {/* Conclusion */}
        <View style={styles.conclusionBox}>
          <Text style={styles.conclusionTitle}>CONCLUSION</Text>
          <Text style={styles.conclusionText}>Smuppy is a space for motivation, well-being, and positive exchanges. Whether you are an individual user or a professional, you contribute to building an inspiring, uplifting, and valuable community.</Text>
          <Text style={styles.conclusionHighlight}>By joining Smuppy, you become an ambassador for well-being, culture, and positivity.</Text>
        </View>

        {/* Accept Button */}
        <View style={styles.btnContainer}>
          {isCreating ? (
            <View style={styles.creatingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.creatingText, { color: colors.primary }]}>Creating your profile...</Text>
            </View>
          ) : (
            <Button variant="primary" size="lg" icon="checkmark" iconPosition="right" disabled={disabled || isCreating} onPress={handleAccept}>
              Accept
            </Button>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING['3xl'] },
  logoContainer: { alignItems: 'center', marginBottom: SPACING.lg },
  title: { fontSize: 32, fontWeight: '900', color: colors.dark, textAlign: 'left', marginBottom: SPACING.xs, lineHeight: 38 },
  subtitle: { fontSize: 16, fontWeight: '400', color: colors.dark, textAlign: 'left', marginBottom: SPACING.xl },
  intro: { fontSize: 15, fontWeight: '400', color: colors.dark, lineHeight: 24, marginBottom: SPACING.lg },
  introBold: { fontWeight: '700', color: colors.dark },
  section: { marginBottom: SPACING.xl },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.dark, marginBottom: SPACING.sm },
  text: { fontSize: 15, fontWeight: '400', color: colors.dark, lineHeight: 24, marginBottom: SPACING.sm },
  textBold: { fontSize: 15, fontWeight: '700', color: colors.dark, lineHeight: 24, marginTop: SPACING.sm },
  textUnderline: { fontSize: 14, color: colors.dark, fontWeight: '500', textDecorationLine: 'underline', lineHeight: 22, marginTop: SPACING.sm },
  subTitle: { fontSize: 15, fontWeight: '700', color: colors.dark, marginTop: SPACING.md, marginBottom: SPACING.xs },
  listItem: { fontSize: 15, fontWeight: '400', color: colors.dark, lineHeight: 24, marginLeft: SPACING.xs, marginBottom: 4 },
  bulletItem: { fontSize: 15, fontWeight: '400', color: colors.dark, lineHeight: 22, marginLeft: SPACING.xl, marginBottom: 2 },
  conclusionBox: { backgroundColor: colors.backgroundFocus, borderRadius: SIZES.radiusLg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: colors.primary },
  conclusionTitle: { ...TYPOGRAPHY.subtitle, color: colors.primary, textAlign: 'center', marginBottom: SPACING.sm, textDecorationLine: 'underline' },
  conclusionText: { ...TYPOGRAPHY.bodySmall, color: colors.dark, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.sm },
  conclusionHighlight: { ...TYPOGRAPHY.body, color: colors.primary, fontWeight: '700', textAlign: 'center' },
  btnContainer: { marginTop: SPACING.md, marginBottom: SPACING.xl },
  creatingBox: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: SPACING.md },
  creatingText: { fontSize: 14, fontWeight: '500' },
});
