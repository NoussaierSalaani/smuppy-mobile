/**
 * Subscription Success Screen
 * Confirmation screen after successful channel subscription
 */

import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import OptimizedImage from '../../components/OptimizedImage';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import SuccessScreen from '../../components/SuccessScreen';
import type { SuccessAction } from '../../components/SuccessScreen';

interface ChannelTier {
  id: string;
  name: string;
  price: number;
  perks: string[];
}

interface Creator {
  id: string;
  name: string;
  username: string;
  avatar: string;
}

type RouteParams = {
  SubscriptionSuccess: { tier: ChannelTier; creator: Creator };
};

const SubscriptionSuccessScreen = (): React.JSX.Element => {
  const navigation = useNavigation<{ replace: (screen: string, params?: Record<string, unknown>) => void }>();
  const route = useRoute<RouteProp<RouteParams, 'SubscriptionSuccess'>>();
  const { tier, creator } = route.params;
  const { colors } = useTheme();
  const { formatAmount: formatCurrencyAmount } = useCurrency();

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<ConfettiCannon>(null);

  const styles = useMemo(() => createLocalStyles(colors), [colors]);
  const gradientColors = useMemo(() => [colors.primary, colors.cyanBlue] as const, [colors]);

  useEffect(() => {
    setTimeout(() => {
      confettiRef.current?.start();
    }, 300);

    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 10,
        stiffness: 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleViewChannel = useCallback(() => {
    navigation.replace('UserProfile', { userId: creator.id });
  }, [navigation, creator.id]);

  const handleExploreContent = useCallback(() => {
    navigation.replace('Tabs', { screen: 'Home' });
  }, [navigation]);

  const handleManageSubscription = useCallback(() => {
    navigation.replace('Settings', { screen: 'Subscriptions' });
  }, [navigation]);

  const renewalDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  }, []);

  const actions: SuccessAction[] = useMemo(() => [
    { label: 'View exclusive content', onPress: handleViewChannel, variant: 'primary', icon: 'play-circle' },
    { label: 'Explore feed', onPress: handleExploreContent, variant: 'secondary' },
    { label: 'Manage my subscription', onPress: handleManageSubscription, variant: 'link' },
  ], [handleViewChannel, handleExploreContent, handleManageSubscription]);

  const avatarHero = useMemo(() => (
    <Animated.View style={[styles.avatarContainer, { transform: [{ scale: scaleAnim }] }]}>
      <OptimizedImage
        source={creator.avatar}
        style={styles.avatar as StyleProp<ImageStyle>}
        contentFit="cover"
        priority="high"
      />
      <View style={styles.badgeContainer}>
        <LinearGradient
          colors={[colors.primary, colors.cyanBlue]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.badge}
        >
          <Ionicons name="heart" size={24} color={colors.white} />
        </LinearGradient>
      </View>
    </Animated.View>
  ), [styles, colors, creator.avatar, scaleAnim]);

  const tierCard = useMemo(() => (
    <Animated.View style={{ opacity: fadeAnim, width: '100%' }}>
      <View style={styles.tierCard}>
        <View style={styles.tierHeader}>
          <Text style={styles.tierName}>{tier.name}</Text>
          <Text style={styles.tierPrice}>{formatCurrencyAmount(Math.round(tier.price * 100))}/mo</Text>
        </View>
        <View style={styles.perksContainer}>
          {tier.perks.slice(0, 3).map((perk, index) => (
            <View key={perk} style={styles.perkRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              <Text style={styles.perkText}>{perk}</Text>
            </View>
          ))}
          {tier.perks.length > 3 && (
            <Text style={styles.morePerks}>+{tier.perks.length - 3} more perks</Text>
          )}
        </View>
      </View>
    </Animated.View>
  ), [styles, colors, tier, fadeAnim, formatCurrencyAmount]);

  const renewalCard = useMemo(() => (
    <Animated.View style={{ opacity: fadeAnim, width: '100%' }}>
      <View style={styles.renewalCard}>
        <Ionicons name="calendar-outline" size={20} color={colors.gray} />
        <Text style={styles.renewalText}>
          Next renewal on{' '}
          {renewalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </Text>
      </View>
    </Animated.View>
  ), [styles, colors, renewalDate, fadeAnim]);

  return (
    <SuccessScreen
      title="Welcome to the community!"
      subtitle={`You are now subscribed to ${creator.name}`}
      details={tierCard}
      extraContent={renewalCard}
      actions={actions}
      gradientColors={gradientColors}
      customHero={avatarHero}
      centerContent
      darkBackground={false}
    >
      <ConfettiCannon
        ref={confettiRef}
        count={100}
        origin={{ x: -10, y: 0 }}
        autoStart={false}
        fadeOut
        colors={[colors.primary, colors.cyanBlue, '#EC4899', '#8B5CF6', '#F59E0B']}
      />
    </SuccessScreen>
  );
};

const createLocalStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    avatarContainer: {
      marginBottom: 24,
      position: 'relative',
    },
    avatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
      borderWidth: 4,
      borderColor: colors.primary,
    },
    badgeContainer: {
      position: 'absolute',
      bottom: -5,
      right: -5,
    },
    badge: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: colors.background,
    },
    tierCard: {
      width: '100%',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 16,
      padding: 18,
      marginBottom: 12,
    },
    tierHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    tierName: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.white,
    },
    tierPrice: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    perksContainer: {
      gap: 10,
    },
    perkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    perkText: {
      fontSize: 14,
      color: colors.grayLight,
      flex: 1,
    },
    morePerks: {
      fontSize: 13,
      color: colors.primary,
      marginTop: 4,
      fontWeight: '500',
    },
    renewalCard: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 12,
      padding: 14,
    },
    renewalText: {
      fontSize: 14,
      color: colors.gray,
    },
  });

export default SubscriptionSuccessScreen;
