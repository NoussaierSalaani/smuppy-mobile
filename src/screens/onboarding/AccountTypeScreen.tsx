import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { SIZES, SPACING, GRADIENTS } from '../../config/theme';
import Button from '../../components/Button';
import OnboardingHeader from '../../components/OnboardingHeader';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

type AccountType = 'personal' | 'pro' | null;
type ProType = 'creator' | 'business' | null;

interface AccountTypeScreenProps {
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}

export default function AccountTypeScreen({ navigation, route: _route }: AccountTypeScreenProps) {
  const { colors, isDark } = useTheme();
  const [selected, setSelected] = useState<AccountType>(null);
  const [proType, setProType] = useState<ProType>(null);
  const proSubAnim = useRef(new Animated.Value(0)).current;

  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleSelectMain = useCallback((type: AccountType) => {
    setSelected(type);
    if (type === 'pro') {
      Animated.spring(proSubAnim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    } else {
      setProType(null);
      Animated.timing(proSubAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [proSubAnim]);

  const handleSelectProType = useCallback((type: ProType) => {
    setProType(type);
  }, []);

  const isFormValid = selected === 'personal' || (selected === 'pro' && proType !== null);

  const handleNext = useCallback(() => {
    if (!isFormValid) return;

    if (selected === 'personal') {
      navigate('TellUsAboutYou', { accountType: 'personal' });
    } else if (proType === 'creator') {
      navigate('CreatorInfo', { accountType: 'pro_creator' });
    } else if (proType === 'business') {
      navigate('BusinessCategory', { accountType: 'pro_business' });
    }
  }, [isFormValid, selected, proType, navigate]);

  const proSubTranslateY = proSubAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Progress Bar - 100% for AccountType */}
      <OnboardingHeader onBack={goBack} disabled={disabled} showProgress={false} />

      <View style={styles.inner}>
        {/* Title */}
        <View style={styles.titleBox}>
          <Text style={styles.title}>What type of account?</Text>
          <Text style={styles.subtitle}>Choose how you'll use Smuppy</Text>
        </View>

        {/* Main Cards - Horizontal Rectangles */}
        <View style={styles.cardsContainer}>
          {/* Personal Card */}
          {selected === 'personal' ? (
            <LinearGradient
              colors={GRADIENTS.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradientBorder}
            >
              <TouchableOpacity
                style={styles.cardInner}
                onPress={() => handleSelectMain('personal')}
                activeOpacity={0.7}
              >
                <View style={[styles.cardIconBox, styles.cardIconBoxActive]}>
                  <Ionicons name="person-outline" size={26} color={colors.dark} />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={styles.cardTitle}>Personal</Text>
                  <Text style={styles.cardDesc}>For sports lovers & fitness enthusiasts</Text>
                </View>
                <View style={[styles.radio, styles.radioActive]}>
                  <View style={styles.radioInner} />
                </View>
              </TouchableOpacity>
            </LinearGradient>
          ) : (
            <TouchableOpacity
              style={[
                styles.card,
                selected === 'pro' && styles.cardInactive,
              ]}
              onPress={() => handleSelectMain('personal')}
              activeOpacity={0.7}
            >
              <View style={styles.cardIconBox}>
                <Ionicons name="person-outline" size={26} color={colors.dark} />
              </View>
              <View style={styles.cardTextBox}>
                <Text style={[styles.cardTitle, selected === 'pro' && styles.cardTextInactive]}>Personal</Text>
                <Text style={[styles.cardDesc, selected === 'pro' && styles.cardTextInactive]}>For sports lovers & fitness enthusiasts</Text>
              </View>
              <View style={styles.radio} />
            </TouchableOpacity>
          )}

          {/* Professional Card */}
          {selected === 'pro' ? (
            <LinearGradient
              colors={GRADIENTS.button}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradientBorder}
            >
              <TouchableOpacity
                style={styles.cardInner}
                onPress={() => handleSelectMain('pro')}
                activeOpacity={0.7}
              >
                <View style={[styles.cardIconBox, styles.cardIconBoxActive]}>
                  <Ionicons name="briefcase-outline" size={26} color={colors.dark} />
                </View>
                <View style={styles.cardTextBox}>
                  <Text style={styles.cardTitle}>Professional</Text>
                  <Text style={styles.cardDesc}>For professionals & businesses</Text>
                </View>
                <View style={[styles.radio, styles.radioActive]}>
                  <View style={styles.radioInner} />
                </View>
              </TouchableOpacity>
            </LinearGradient>
          ) : (
            <TouchableOpacity
              style={[
                styles.card,
                selected === 'personal' && styles.cardInactive,
              ]}
              onPress={() => handleSelectMain('pro')}
              activeOpacity={0.7}
            >
              <View style={styles.cardIconBox}>
                <Ionicons name="briefcase-outline" size={26} color={colors.dark} />
              </View>
              <View style={styles.cardTextBox}>
                <Text style={[styles.cardTitle, selected === 'personal' && styles.cardTextInactive]}>Professional</Text>
                <Text style={[styles.cardDesc, selected === 'personal' && styles.cardTextInactive]}>For professionals & businesses</Text>
              </View>
              <View style={styles.radio} />
            </TouchableOpacity>
          )}
        </View>

        {/* Pro Sub-options - Horizontal Rectangles */}
        {selected === 'pro' && (
          <Animated.View
            style={[
              styles.proSubContainer,
              { opacity: proSubAnim, transform: [{ translateY: proSubTranslateY }] },
            ]}
          >
            <Text style={styles.proSubTitle}>What type of professional?</Text>

            {/* Creator Card */}
            {proType === 'creator' ? (
              <LinearGradient
                colors={GRADIENTS.button}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.proSubGradientBorder}
              >
                <TouchableOpacity
                  style={styles.proSubCardInner}
                  onPress={() => handleSelectProType('creator')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.proSubIconBox, styles.proSubIconBoxActive]}>
                    <Ionicons name="videocam-outline" size={22} color={colors.dark} />
                  </View>
                  <View style={styles.proSubTextBox}>
                    <Text style={styles.proSubText}>Creator</Text>
                    <Text style={styles.proSubDesc}>Coach, Athlete, Influencer...</Text>
                  </View>
                  <View style={[styles.radio, styles.radioActive]}>
                    <View style={styles.radioInner} />
                  </View>
                </TouchableOpacity>
              </LinearGradient>
            ) : (
              <TouchableOpacity
                style={styles.proSubCard}
                onPress={() => handleSelectProType('creator')}
                activeOpacity={0.7}
              >
                <View style={styles.proSubIconBox}>
                  <Ionicons name="videocam-outline" size={22} color={colors.dark} />
                </View>
                <View style={styles.proSubTextBox}>
                  <Text style={styles.proSubText}>Creator</Text>
                  <Text style={styles.proSubDesc}>Coach, Athlete, Influencer...</Text>
                </View>
                <View style={styles.radio} />
              </TouchableOpacity>
            )}

            {/* Business Card */}
            {proType === 'business' ? (
              <LinearGradient
                colors={GRADIENTS.button}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.proSubGradientBorder}
              >
                <TouchableOpacity
                  style={styles.proSubCardInner}
                  onPress={() => handleSelectProType('business')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.proSubIconBox, styles.proSubIconBoxActive]}>
                    <Ionicons name="storefront-outline" size={22} color={colors.dark} />
                  </View>
                  <View style={styles.proSubTextBox}>
                    <Text style={styles.proSubText}>Business</Text>
                    <Text style={styles.proSubDesc}>Gym, Studio, Store...</Text>
                  </View>
                  <View style={[styles.radio, styles.radioActive]}>
                    <View style={styles.radioInner} />
                  </View>
                </TouchableOpacity>
              </LinearGradient>
            ) : (
              <TouchableOpacity
                style={styles.proSubCard}
                onPress={() => handleSelectProType('business')}
                activeOpacity={0.7}
              >
                <View style={styles.proSubIconBox}>
                  <Ionicons name="storefront-outline" size={22} color={colors.dark} />
                </View>
                <View style={styles.proSubTextBox}>
                  <Text style={styles.proSubText}>Business</Text>
                  <Text style={styles.proSubDesc}>Gym, Studio, Store...</Text>
                </View>
                <View style={styles.radio} />
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Footer */}
        <View style={styles.bottomSection}>
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
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, paddingHorizontal: SPACING.xl },

  // Title
  titleBox: { alignItems: 'center', marginBottom: SPACING.xl },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 28, color: colors.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, color: colors.dark, textAlign: 'center' },

  // Cards - Horizontal Rectangles
  cardsContainer: { marginBottom: SPACING.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    borderWidth: 2,
    borderColor: colors.grayLight,
    borderRadius: SIZES.radiusLg,
    backgroundColor: colors.backgroundSecondary,
    marginBottom: SPACING.sm,
  },
  cardGradientBorder: {
    borderRadius: SIZES.radiusLg,
    padding: 2,
    marginBottom: SPACING.sm,
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    borderRadius: SIZES.radiusLg - 2,
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#E8FAF7',
  },
  cardInactive: { opacity: 0.4 },
  cardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
    marginRight: SPACING.md,
  },
  cardIconBoxActive: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  cardTextBox: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.dark, marginBottom: 2 },
  cardDesc: { fontSize: 13, color: colors.grayMuted },
  cardTextInactive: { color: colors.grayMuted },

  // Radio
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  radioActive: { borderColor: colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary },

  // Pro Sub-options - Horizontal Rectangles
  proSubContainer: {},
  proSubTitle: { fontSize: 15, fontWeight: '600', color: colors.dark, textAlign: 'center', marginBottom: SPACING.md },
  proSubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    borderWidth: 2,
    borderColor: colors.grayLight,
    borderRadius: SIZES.radiusLg,
    backgroundColor: colors.backgroundSecondary,
    marginBottom: SPACING.sm,
  },
  proSubGradientBorder: {
    borderRadius: SIZES.radiusLg,
    padding: 2,
    marginBottom: SPACING.sm,
  },
  proSubCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    borderRadius: SIZES.radiusLg - 2,
    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.1)' : '#E8FAF7',
  },
  proSubIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: isDark ? colors.backgroundSecondary : '#F3F4F6',
    marginRight: SPACING.md,
  },
  proSubIconBoxActive: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  proSubTextBox: { flex: 1 },
  proSubText: { fontSize: 15, fontWeight: '600', color: colors.dark, marginBottom: 2 },
  proSubDesc: { fontSize: 12, color: colors.grayMuted },

  // Spacer
  spacer: { flex: 1 },

  // Bottom
  bottomSection: { paddingBottom: SPACING.sm },
});
