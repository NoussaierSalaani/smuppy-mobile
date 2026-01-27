/**
 * Channel Subscribe Screen
 * Checkout screen for subscribing to a creator's channel
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useStripe } from '@stripe/stripe-react-native';
import { DARK_COLORS as COLORS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';

interface ChannelTier {
  id: string;
  name: string;
  price: number;
  perks: string[];
  popular?: boolean;
}

interface Creator {
  id: string;
  name: string;
  username: string;
  avatar: string;
  verified: boolean;
  subscribersCount: number;
}

type RouteParams = {
  ChannelSubscribe: { creatorId: string; tier: ChannelTier };
};

// Mock creator data
const getCreator = (_creatorId: string): Creator => ({
  id: 'c1',
  name: 'Sarah Fitness',
  username: 'sarah_fitness',
  avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
  verified: true,
  subscribersCount: 12500,
});

const ChannelSubscribeScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'ChannelSubscribe'>>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const { creatorId, tier } = route.params;
  const creator = getCreator(creatorId);

  const [loading, setLoading] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);

  useEffect(() => {
    initializePayment();
  }, []);

  const initializePayment = async () => {
    try {
      setLoading(true);

      // Create subscription checkout
      const response = await awsAPI.subscribeToChannel(creatorId);

      if (!response.success) {
        throw new Error('Failed to create subscription');
      }

      // For subscriptions, we use Stripe's hosted checkout
      // In a real app, you'd redirect to response.checkoutUrl
      // For now, we'll use payment sheet for demo

      const intentResponse = await awsAPI.createPaymentIntent({
        creatorId,
        amount: Math.round(tier.price * 100),
        description: `Abonnement ${tier.name} - @${creator.username}`,
      });

      if (!intentResponse.success || !intentResponse.paymentIntent) {
        throw new Error('Failed to create payment intent');
      }

      const { error } = await initPaymentSheet({
        merchantDisplayName: 'Smuppy',
        paymentIntentClientSecret: intentResponse.paymentIntent.clientSecret,
        defaultBillingDetails: {
          name: '',
        },
        appearance: {
          colors: {
            primary: COLORS.primary,
            background: COLORS.dark,
            componentBackground: COLORS.darkGray,
            componentText: COLORS.white,
            primaryText: COLORS.white,
            secondaryText: COLORS.gray,
            placeholderText: COLORS.gray,
          },
        },
      });

      if (error) {
        console.error('Payment sheet init error:', error);
      } else {
        setPaymentReady(true);
      }
    } catch (error) {
      console.error('Payment init error:', error);
      Alert.alert('Erreur', 'Impossible d\'initialiser le paiement. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!paymentReady) {
      await initializePayment();
      return;
    }

    try {
      setLoading(true);
      const { error } = await presentPaymentSheet();

      if (error) {
        if (error.code !== 'Canceled') {
          Alert.alert('Erreur de paiement', error.message);
        }
      } else {
        // Payment successful
        navigation.replace('SubscriptionSuccess', {
          tier,
          creator,
        });
      }
    } catch (error) {
      console.error('Payment error:', error);
      Alert.alert('Erreur', 'Le paiement a échoué. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const renewalDate = new Date();
  renewalDate.setMonth(renewalDate.getMonth() + 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.title}>S'abonner</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Creator Hero */}
        <View style={styles.heroSection}>
          <Image source={{ uri: creator.avatar }} style={styles.heroAvatar} />
          <View style={styles.heroInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.heroName}>{creator.name}</Text>
              {creator.verified && (
                <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
              )}
            </View>
            <Text style={styles.heroUsername}>@{creator.username}</Text>
            <Text style={styles.subscribersCount}>
              {creator.subscribersCount.toLocaleString()} abonnés
            </Text>
          </View>
        </View>

        {/* Selected Tier */}
        <View style={styles.tierCard}>
          {tier.popular && (
            <LinearGradient
              colors={[COLORS.primary, COLORS.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tierBadge}
            >
              <Ionicons name="star" size={12} color={COLORS.white} />
              <Text style={styles.tierBadgeText}>Recommandé</Text>
            </LinearGradient>
          )}

          <View style={styles.tierHeader}>
            <View style={styles.tierIconContainer}>
              <Ionicons name="heart" size={28} color={COLORS.primary} />
            </View>
            <View style={styles.tierTitleContainer}>
              <Text style={styles.tierName}>{tier.name}</Text>
              <View style={styles.tierPriceRow}>
                <Text style={styles.tierPrice}>{tier.price.toFixed(2)} €</Text>
                <Text style={styles.tierPeriod}>/mois</Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <Text style={styles.perksTitle}>Ce qui est inclus :</Text>
          <View style={styles.perksList}>
            {tier.perks.map((perk, index) => (
              <View key={index} style={styles.perkRow}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Billing Info */}
        <View style={styles.billingCard}>
          <Text style={styles.billingTitle}>Informations de facturation</Text>

          <View style={styles.billingRow}>
            <Text style={styles.billingLabel}>Abonnement mensuel</Text>
            <Text style={styles.billingValue}>{tier.price.toFixed(2)} €/mois</Text>
          </View>

          <View style={styles.billingRow}>
            <Text style={styles.billingLabel}>Prochain renouvellement</Text>
            <Text style={styles.billingValue}>
              {renewalDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
            </Text>
          </View>

          <View style={styles.billingRow}>
            <Text style={styles.billingLabel}>Annulation</Text>
            <Text style={styles.billingValue}>À tout moment</Text>
          </View>
        </View>

        {/* Benefits */}
        <View style={styles.benefitsCard}>
          <View style={styles.benefitItem}>
            <View style={[styles.benefitIcon, { backgroundColor: COLORS.primary + '20' }]}>
              <Ionicons name="lock-open" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Accès immédiat</Text>
              <Text style={styles.benefitText}>Débloquez tout le contenu exclusif dès maintenant</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={[styles.benefitIcon, { backgroundColor: '#EC489920' }]}>
              <Ionicons name="close-circle" size={20} color="#EC4899" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Sans engagement</Text>
              <Text style={styles.benefitText}>Annulez quand vous voulez sans frais</Text>
            </View>
          </View>

          <View style={styles.benefitItem}>
            <View style={[styles.benefitIcon, { backgroundColor: '#22C55E20' }]}>
              <Ionicons name="shield-checkmark" size={20} color="#22C55E" />
            </View>
            <View style={styles.benefitContent}>
              <Text style={styles.benefitTitle}>Paiement sécurisé</Text>
              <Text style={styles.benefitText}>Protégé par Stripe, le leader du paiement</Text>
            </View>
          </View>
        </View>

        {/* Terms */}
        <Text style={styles.terms}>
          En vous abonnant, vous acceptez que votre abonnement se renouvelle automatiquement
          chaque mois jusqu'à annulation. Vous pouvez annuler à tout moment depuis votre profil.
        </Text>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.subscribeButton, !paymentReady && styles.subscribeButtonDisabled]}
          onPress={handleSubscribe}
          disabled={loading}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.subscribeGradient}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="heart" size={20} color={COLORS.white} />
                <Text style={styles.subscribeButtonText}>
                  S'abonner pour {tier.price.toFixed(2)} €/mois
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heroAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 14,
    borderWidth: 3,
    borderColor: COLORS.primary,
  },
  heroInfo: {
    alignItems: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.white,
  },
  heroUsername: {
    fontSize: 15,
    color: COLORS.gray,
    marginTop: 4,
  },
  subscribersCount: {
    fontSize: 14,
    color: COLORS.primary,
    marginTop: 6,
    fontWeight: '500',
  },
  tierCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  tierTitleContainer: {
    flex: 1,
  },
  tierName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  tierPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tierPrice: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.primary,
  },
  tierPeriod: {
    fontSize: 16,
    color: COLORS.gray,
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.dark,
    marginVertical: 16,
  },
  perksTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 12,
  },
  perksList: {
    gap: 12,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  perkText: {
    fontSize: 14,
    color: COLORS.lightGray,
    flex: 1,
  },
  billingCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  billingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 16,
  },
  billingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  billingLabel: {
    fontSize: 14,
    color: COLORS.gray,
  },
  billingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  benefitsCard: {
    backgroundColor: COLORS.darkGray,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 16,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  benefitText: {
    fontSize: 13,
    color: COLORS.gray,
    lineHeight: 18,
  },
  terms: {
    fontSize: 12,
    color: COLORS.gray,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: COLORS.dark,
    borderTopWidth: 1,
    borderTopColor: COLORS.darkGray,
  },
  subscribeButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  subscribeButtonDisabled: {
    opacity: 0.6,
  },
  subscribeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  subscribeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default ChannelSubscribeScreen;
