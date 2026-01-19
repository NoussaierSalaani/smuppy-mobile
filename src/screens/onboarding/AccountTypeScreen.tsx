import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES, SPACING } from '../../config/theme';
import Button from '../../components/Button';
import { SmuppyText } from '../../components/SmuppyLogo';
import { usePreventDoubleNavigation } from '../../hooks/usePreventDoubleClick';

type AccountType = 'personal' | 'pro' | null;
type ProType = 'creator' | 'business' | null;

export default function AccountTypeScreen({ navigation, route }) {
  const [selected, setSelected] = useState<AccountType>(null);
  const [proType, setProType] = useState<ProType>(null);
  const proSubAnim = useRef(new Animated.Value(0)).current;

  const { email, password } = route?.params || {};
  const { goBack, navigate, disabled } = usePreventDoubleNavigation(navigation);

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

    const baseParams = { email, password };

    if (selected === 'personal') {
      navigate('TellUsAboutYou', { ...baseParams, accountType: 'personal' });
    } else if (proType === 'creator') {
      navigate('CreatorInfo', { ...baseParams, accountType: 'pro_creator' });
    } else if (proType === 'business') {
      navigate('BusinessCategory', { ...baseParams, accountType: 'pro_local' });
    }
  }, [isFormValid, selected, proType, email, password, navigate]);

  const proSubTranslateY = proSubAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={disabled}>
            <Ionicons name="arrow-back" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Title */}
        <View style={styles.titleBox}>
          <Text style={styles.title}>What type of account?</Text>
          <Text style={styles.subtitle}>Choose how you'll use Smuppy</Text>
        </View>

        {/* Main Cards - Horizontal Rectangles */}
        <View style={styles.cardsContainer}>
          {/* Personal Card */}
          <TouchableOpacity
            style={[
              styles.card,
              selected === 'personal' && styles.cardActive,
              selected === 'pro' && styles.cardInactive,
            ]}
            onPress={() => handleSelectMain('personal')}
            activeOpacity={0.7}
          >
            <View style={[styles.cardIconBox, selected === 'personal' && styles.cardIconBoxActive]}>
              <Ionicons name="person-outline" size={26} color={COLORS.dark} />
            </View>
            <View style={styles.cardTextBox}>
              <Text style={[styles.cardTitle, selected === 'pro' && styles.cardTextInactive]}>Personal</Text>
              <Text style={[styles.cardDesc, selected === 'pro' && styles.cardTextInactive]}>Sports lover & fitness enthusiast</Text>
            </View>
            <View style={[styles.radio, selected === 'personal' && styles.radioActive]}>
              {selected === 'personal' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>

          {/* Professional Card */}
          <TouchableOpacity
            style={[
              styles.card,
              selected === 'pro' && styles.cardActive,
              selected === 'personal' && styles.cardInactive,
            ]}
            onPress={() => handleSelectMain('pro')}
            activeOpacity={0.7}
          >
            <View style={[styles.cardIconBox, selected === 'pro' && styles.cardIconBoxActive]}>
              <Ionicons name="briefcase-outline" size={26} color={COLORS.dark} />
            </View>
            <View style={styles.cardTextBox}>
              <Text style={[styles.cardTitle, selected === 'personal' && styles.cardTextInactive]}>Professional</Text>
              <Text style={[styles.cardDesc, selected === 'personal' && styles.cardTextInactive]}>For professionals & businesses</Text>
            </View>
            <View style={[styles.radio, selected === 'pro' && styles.radioActive]}>
              {selected === 'pro' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>
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
            <TouchableOpacity
              style={[styles.proSubCard, proType === 'creator' && styles.proSubCardActive]}
              onPress={() => handleSelectProType('creator')}
              activeOpacity={0.7}
            >
              <View style={[styles.proSubIconBox, proType === 'creator' && styles.proSubIconBoxActive]}>
                <Ionicons name="videocam-outline" size={22} color={COLORS.dark} />
              </View>
              <View style={styles.proSubTextBox}>
                <Text style={styles.proSubText}>Creator</Text>
                <Text style={styles.proSubDesc}>Coach, Athlete, Influencer...</Text>
              </View>
              <View style={[styles.radio, proType === 'creator' && styles.radioActive]}>
                {proType === 'creator' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>

            {/* Business Card */}
            <TouchableOpacity
              style={[styles.proSubCard, proType === 'business' && styles.proSubCardActive]}
              onPress={() => handleSelectProType('business')}
              activeOpacity={0.7}
            >
              <View style={[styles.proSubIconBox, proType === 'business' && styles.proSubIconBoxActive]}>
                <Ionicons name="storefront-outline" size={22} color={COLORS.dark} />
              </View>
              <View style={styles.proSubTextBox}>
                <Text style={styles.proSubText}>Business</Text>
                <Text style={styles.proSubDesc}>Gym, Studio, Store...</Text>
              </View>
              <View style={[styles.radio, proType === 'business' && styles.radioActive]}>
                {proType === 'business' && <View style={styles.radioInner} />}
              </View>
            </TouchableOpacity>
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

        {/* Logo Footer */}
        <View style={styles.footer}>
          <SmuppyText width={120} variant="dark" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  inner: { flex: 1, paddingHorizontal: SPACING.xl },

  // Header
  header: { paddingTop: SPACING.base, marginBottom: SPACING.xl },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.dark, justifyContent: 'center', alignItems: 'center' },

  // Title
  titleBox: { alignItems: 'center', marginBottom: SPACING.xl },
  title: { fontFamily: 'WorkSans-ExtraBold', fontSize: 28, color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.sm },
  subtitle: { fontSize: 15, color: COLORS.dark, textAlign: 'center' },

  // Cards - Horizontal Rectangles
  cardsContainer: { marginBottom: SPACING.lg },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    borderWidth: 2,
    borderColor: COLORS.grayLight,
    borderRadius: SIZES.radiusLg,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.sm,
  },
  cardActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  cardInactive: { opacity: 0.4 },
  cardIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    marginRight: SPACING.md,
  },
  cardIconBoxActive: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  cardTextBox: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.dark, marginBottom: 2 },
  cardDesc: { fontSize: 13, color: COLORS.grayMuted },
  cardTextInactive: { color: COLORS.grayMuted },

  // Radio
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.grayLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  radioActive: { borderColor: COLORS.primary },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: COLORS.primary },

  // Pro Sub-options - Horizontal Rectangles
  proSubContainer: {},
  proSubTitle: { fontSize: 15, fontWeight: '600', color: COLORS.dark, textAlign: 'center', marginBottom: SPACING.md },
  proSubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.base,
    borderWidth: 2,
    borderColor: COLORS.grayLight,
    borderRadius: SIZES.radiusLg,
    backgroundColor: COLORS.white,
    marginBottom: SPACING.sm,
  },
  proSubCardActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  proSubIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    marginRight: SPACING.md,
  },
  proSubIconBoxActive: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  proSubTextBox: { flex: 1 },
  proSubText: { fontSize: 15, fontWeight: '600', color: COLORS.dark, marginBottom: 2 },
  proSubDesc: { fontSize: 12, color: COLORS.grayMuted },

  // Spacer
  spacer: { flex: 1 },

  // Bottom
  bottomSection: { paddingBottom: SPACING.sm },
  footer: { alignItems: 'center', paddingBottom: SPACING.md },
});
