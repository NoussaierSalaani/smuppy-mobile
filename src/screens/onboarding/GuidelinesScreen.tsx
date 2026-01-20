import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY, SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyLogoFull } from '../../components/SmuppyLogo';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

export default function GuidelinesScreen({ navigation, route }) {
  const params = route?.params || {};
  const { accountType } = params;
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

  // Determine step based on account type
  // All account types now have 4 steps, Guidelines is step 3
  const { currentStep, totalSteps } = useMemo(() => {
    return { currentStep: 3, totalSteps: 4 };
  }, [accountType]);

  const handleAccept = () => navigate('VerifyCode', params);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Progress Bar */}
      <OnboardingHeader onBack={goBack} disabled={disabled} currentStep={currentStep} totalSteps={totalSteps} />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Logo */}
        <View style={styles.logoContainer}>
          <SmuppyLogoFull iconSize={40} textWidth={110} iconVariant="dark" textVariant="dark" />
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
          <Text style={styles.listItem}>✅ Science and innovation – Sharing scientific and technological knowledge.</Text>
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
          <Text style={styles.listItem}>✅ Educational and informative content that enhances the Smuppy community's knowledge and experience. And provides real values to users.</Text>
          <Text style={styles.subTitle}>🔹 Prohibited professional content:</Text>
          <Text style={styles.listItem}>🚫 Aggressive or deceptive advertising like "This program guarantees weight loss in 7 days"</Text>
          <Text style={styles.listItem}>🚫 Unverified or misleading information on health, fitness, nutrition...</Text>
          <Text style={styles.listItem}>🚫 Promotion of products or services outside the authorized fields (politics, finance, crypto, etc.).</Text>
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
          <Text style={styles.listItem}>🚫 Misinformation and pseudoscience – Prohibited from sharing unproven medical, sports, or scientific advice.</Text>
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
          <Text style={styles.text}>Any sanctioned user has 7 days to contest a decision by emailing [contact support]. Smuppy commits to reviewing each request within 10 business days.</Text>
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
          <Text style={styles.conclusionHighlight}>By joining Smuppy, you become an ambassador for well-being, culture, and positivity! 🌟</Text>
        </View>

        {/* Accept Button - dans le scroll, juste après la conclusion */}
        <View style={styles.btnContainer}>
          <Button variant="primary" size="lg" icon="checkmark" iconPosition="right" disabled={disabled} onPress={handleAccept}>
            Accept
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING['3xl'] },
  logoContainer: { alignItems: 'center', marginBottom: SPACING.lg },
  title: { fontSize: 32, fontWeight: '900', color: '#111214', textAlign: 'left', marginBottom: SPACING.xs, lineHeight: 38 },
  subtitle: { fontSize: 16, fontWeight: '400', color: '#111214', textAlign: 'left', marginBottom: SPACING.xl },
  intro: { fontSize: 15, fontWeight: '400', color: '#111214', lineHeight: 24, marginBottom: SPACING.lg },
  introBold: { fontWeight: '700', color: '#111214' },
  section: { marginBottom: SPACING.xl },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#111214', marginBottom: SPACING.sm },
  text: { fontSize: 15, fontWeight: '400', color: '#111214', lineHeight: 24, marginBottom: SPACING.sm },
  textBold: { fontSize: 15, fontWeight: '700', color: '#111214', lineHeight: 24, marginTop: SPACING.sm },
  textUnderline: { fontSize: 14, color: COLORS.dark, fontWeight: '500', textDecorationLine: 'underline', lineHeight: 22, marginTop: SPACING.sm },
  subTitle: { fontSize: 15, fontWeight: '700', color: '#111214', marginTop: SPACING.md, marginBottom: SPACING.xs },
  listItem: { fontSize: 15, fontWeight: '400', color: '#111214', lineHeight: 24, marginLeft: SPACING.xs, marginBottom: 4 },
  bulletItem: { fontSize: 15, fontWeight: '400', color: '#111214', lineHeight: 22, marginLeft: SPACING.xl, marginBottom: 2 },
  conclusionBox: { backgroundColor: COLORS.backgroundFocus, borderRadius: SIZES.radiusLg, padding: SPACING.lg, marginBottom: SPACING.lg, borderWidth: 1, borderColor: COLORS.primary },
  conclusionTitle: { ...TYPOGRAPHY.subtitle, color: COLORS.primary, textAlign: 'center', marginBottom: SPACING.sm, textDecorationLine: 'underline' },
  conclusionText: { ...TYPOGRAPHY.bodySmall, color: COLORS.dark, textAlign: 'center', lineHeight: 22, marginBottom: SPACING.sm },
  conclusionHighlight: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '700', textAlign: 'center' },
  btnContainer: { marginTop: SPACING.md, marginBottom: SPACING.xl },
});