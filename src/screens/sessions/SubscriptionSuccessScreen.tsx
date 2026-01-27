/**
 * Subscription Success Screen
 * Confirmation screen after successful channel subscription
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import OptimizedImage from '../../components/OptimizedImage';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Haptics from 'expo-haptics';
import { DARK_COLORS as COLORS } from '../../config/theme';

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
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'SubscriptionSuccess'>>();
  const { tier, creator } = route.params;

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const confettiRef = useRef<any>(null);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Start confetti
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
  }, []);

  const handleViewChannel = () => {
    navigation.replace('UserProfile', { userId: creator.id });
  };

  const handleExploreContent = () => {
    navigation.replace('Tabs', { screen: 'Home' });
  };

  const handleManageSubscription = () => {
    navigation.replace('Settings', { screen: 'Subscriptions' });
  };

  const renewalDate = new Date();
  renewalDate.setMonth(renewalDate.getMonth() + 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Confetti */}
      <ConfettiCannon
        ref={confettiRef}
        count={100}
        origin={{ x: -10, y: 0 }}
        autoStart={false}
        fadeOut
        colors={[COLORS.primary, COLORS.secondary, '#EC4899', '#8B5CF6', '#F59E0B']}
      />

      <View style={styles.content}>
        {/* Creator Avatar with Badge */}
        <Animated.View style={[styles.avatarContainer, { transform: [{ scale: scaleAnim }] }]}>
          <OptimizedImage
            source={creator.avatar}
            style={styles.avatar as StyleProp<ImageStyle>}
            contentFit="cover"
            priority="high"
          />
          <View style={styles.badgeContainer}>
            <LinearGradient
              colors={[COLORS.primary, COLORS.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.badge}
            >
              <Ionicons name="heart" size={24} color={COLORS.white} />
            </LinearGradient>
          </View>
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
          <Text style={styles.title}>Bienvenue dans la communauté !</Text>
          <Text style={styles.subtitle}>
            Vous êtes maintenant abonné(e) à @{creator.username}
          </Text>

          {/* Tier Info */}
          <View style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <Text style={styles.tierPrice}>{tier.price.toFixed(2)} €/mois</Text>
            </View>

            <View style={styles.perksContainer}>
              {tier.perks.slice(0, 3).map((perk, index) => (
                <View key={index} style={styles.perkRow}>
                  <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />
                  <Text style={styles.perkText}>{perk}</Text>
                </View>
              ))}
              {tier.perks.length > 3 && (
                <Text style={styles.morePerks}>+{tier.perks.length - 3} autres avantages</Text>
              )}
            </View>
          </View>

          {/* Renewal Info */}
          <View style={styles.renewalCard}>
            <Ionicons name="calendar-outline" size={20} color={COLORS.gray} />
            <Text style={styles.renewalText}>
              Prochain renouvellement le{' '}
              {renewalDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Actions */}
      <Animated.View style={[styles.actions, { paddingBottom: insets.bottom + 16, opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleViewChannel}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            <Ionicons name="play-circle" size={22} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Voir le contenu exclusif</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleExploreContent}>
          <Text style={styles.secondaryButtonText}>Explorer le feed</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={handleManageSubscription}>
          <Text style={styles.linkButtonText}>Gérer mon abonnement</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  avatarContainer: {
    marginBottom: 24,
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: COLORS.primary,
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
    borderColor: COLORS.dark,
  },
  textContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    textAlign: 'center',
    marginBottom: 28,
  },
  tierCard: {
    width: '100%',
    backgroundColor: COLORS.darkGray,
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
    borderBottomColor: COLORS.dark,
  },
  tierName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  tierPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
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
    color: COLORS.lightGray,
    flex: 1,
  },
  morePerks: {
    fontSize: 13,
    color: COLORS.primary,
    marginTop: 4,
    fontWeight: '500',
  },
  renewalCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.darkGray,
    borderRadius: 12,
    padding: 14,
  },
  renewalText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  actions: {
    paddingHorizontal: 24,
    gap: 12,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  linkButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkButtonText: {
    fontSize: 15,
    color: COLORS.gray,
  },
});

export default SubscriptionSuccessScreen;
