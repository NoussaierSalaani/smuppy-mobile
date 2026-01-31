// src/screens/live/GoLiveIntroScreen.tsx
import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { GRADIENTS } from '../../config/theme';
import { useUserStore } from '../../stores';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface FeatureItemProps {
  icon: string;
  text: string;
  colors: ThemeColors;
}

const FeatureItem = ({ icon, text, colors }: FeatureItemProps) => {
  const styles = useMemo(() => createStyles(colors, false), [colors]);
  return (
    <View style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon as any} size={20} color={colors.primary} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
};

export default function GoLiveIntroScreen(): React.JSX.Element {
  const { showAlert } = useSmuppyAlert();
  const navigation = useNavigation<any>();
  const user = useUserStore((state) => state.user);
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Protect route - only pro_creator can access
  useEffect(() => {
    if (user?.accountType !== 'pro_creator') {
      showAlert({
        title: 'Pro Creator Feature',
        message: 'Live streaming is only available for Pro Creator accounts.',
        type: 'warning',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
    }
  }, [user?.accountType, navigation]);

  const handleNext = () => {
    navigation.navigate('GoLive');
  };

  const handleBack = () => {
    navigation.goBack();
  };

  // Don't render if not pro_creator
  if (user?.accountType !== 'pro_creator') {
    return <SafeAreaView style={styles.container} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Go Live</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Hero Card */}
        <LinearGradient
          colors={['rgba(14, 191, 138, 0.1)', 'rgba(1, 182, 197, 0.1)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.heroCard}
        >
          <View style={styles.heroIconContainer}>
            <Ionicons name="videocam" size={24} color={colors.primary} />
          </View>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroTitle}>Start Your Streaming Journey</Text>
            <Text style={styles.heroSubtitle}>
              Streaming is free for professionals and individuals for the first 3 months of use.
            </Text>
          </View>
        </LinearGradient>

        {/* Trial Period */}
        <View style={styles.trialSection}>
          <Text style={styles.trialLabel}>Trial Period</Text>
          <View style={styles.trialRight}>
            <Ionicons name="time-outline" size={16} color={colors.dark} />
            <Text style={styles.trialDays}>67 days left</Text>
          </View>
        </View>
        <View style={styles.progressBar}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: '75%' }]}
          />
        </View>

        {/* Features */}
        <Text style={styles.sectionTitle}>What You Can Do</Text>
        <View style={styles.featuresList}>
          <FeatureItem icon="fitness" text="Stream live workouts" colors={colors} />
          <FeatureItem icon="chatbubbles" text="Interact with followers" colors={colors} />
          <FeatureItem icon="save" text="Save recordings" colors={colors} />
          <FeatureItem icon="stats-chart" text="Track engagement" colors={colors} />
        </View>

        {/* Quick Tips */}
        <View style={styles.tipsCard}>
          <View style={styles.tipsHeader}>
            <Ionicons name="bulb-outline" size={20} color={colors.primary} />
            <Text style={styles.tipsTitle}>Quick Tips</Text>
          </View>
          <Text style={styles.tipText}>Ensure good lighting and stable internet connection</Text>
          <Text style={styles.tipText}>Test your audio before going live</Text>
        </View>
      </View>

      {/* Bottom Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity onPress={handleNext} activeOpacity={0.9}>
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextButton}
          >
            <Text style={styles.nextButtonText}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  heroIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.2)' : 'rgba(14, 191, 138, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  heroTextContainer: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 13,
    color: colors.gray,
    lineHeight: 18,
  },
  trialSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trialLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  trialRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trialDays: {
    fontSize: 13,
    color: colors.gray,
  },
  progressBar: {
    height: 6,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(10, 37, 47, 0.08)',
    borderRadius: 3,
    marginBottom: 32,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 16,
  },
  featuresList: {
    gap: 16,
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 15,
    color: colors.dark,
    fontWeight: '500',
  },
  tipsCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  tipText: {
    fontSize: 13,
    color: colors.gray,
    marginBottom: 4,
    paddingLeft: 28,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
