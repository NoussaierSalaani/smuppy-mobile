/**
 * Payment Methods Screen - Premium Fintech-Inspired Design
 * Manage saved cards and payment methods
 * Inspired by Revolut, Apple Pay, and modern banking apps
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe } from '@stripe/stripe-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { DARK_COLORS as COLORS, GRADIENTS, SHADOWS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 48;

interface PaymentMethod {
  id: string;
  type: string;
  isDefault: boolean;
  card: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    funding: string;
    country: string;
  } | null;
  billingDetails: {
    name: string | null;
    email: string | null;
  };
  created: string;
}

// Card brand styling - premium look
const CARD_BRANDS: Record<string, {
  gradient: readonly [string, string, ...string[]];
  logo: string;
  textColor: string;
}> = {
  visa: {
    gradient: ['#1A1F71', '#2D3ABF', '#1A1F71'] as const,
    logo: 'VISA',
    textColor: '#FFFFFF',
  },
  mastercard: {
    gradient: ['#EB001B', '#F79E1B', '#EB001B'] as const,
    logo: 'Mastercard',
    textColor: '#FFFFFF',
  },
  amex: {
    gradient: ['#006FCF', '#00AEEF', '#006FCF'] as const,
    logo: 'AMEX',
    textColor: '#FFFFFF',
  },
  discover: {
    gradient: ['#FF6600', '#FF8C00', '#FF6600'] as const,
    logo: 'Discover',
    textColor: '#FFFFFF',
  },
  default: {
    gradient: ['#2C2C2E', '#3A3A3C', '#2C2C2E'] as const,
    logo: 'Card',
    textColor: '#FFFFFF',
  },
};

const PaymentMethodsScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const { showError, showSuccess, showDestructiveConfirm } = useSmuppyAlert();

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const response = await awsAPI.listPaymentMethods();
      if (response.success && response.paymentMethods) {
        setPaymentMethods(response.paymentMethods);
        // Set default card as selected
        const defaultCard = response.paymentMethods.find(pm => pm.isDefault);
        if (defaultCard) {
          setSelectedCard(defaultCard.id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch payment methods:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [loading, fadeAnim, slideAnim]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPaymentMethods();
  };

  const handleAddCard = async () => {
    try {
      setAddingCard(true);

      const setupResponse = await awsAPI.createSetupIntent();
      if (!setupResponse.success || !setupResponse.setupIntent) {
        throw new Error(setupResponse.message || 'Failed to create setup intent');
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'Smuppy',
        setupIntentClientSecret: setupResponse.setupIntent.clientSecret,
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

      if (initError) {
        throw new Error(initError.message);
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          showError('Erreur', presentError.message);
        }
        return;
      }

      showSuccess('Succes', 'Carte ajoutee avec succes');
      fetchPaymentMethods();
    } catch (error: any) {
      console.error('Failed to add card:', error);
      showError('Erreur', error.message || 'Impossible d\'ajouter la carte');
    } finally {
      setAddingCard(false);
    }
  };

  const handleSetDefault = async (methodId: string) => {
    try {
      const response = await awsAPI.setDefaultPaymentMethod(methodId);
      if (response.success) {
        setPaymentMethods((prev) =>
          prev.map((pm) => ({
            ...pm,
            isDefault: pm.id === methodId,
          }))
        );
        setSelectedCard(methodId);
      } else {
        showError('Erreur', response.message || 'Impossible de definir comme defaut');
      }
    } catch (error) {
      console.error('Failed to set default:', error);
      showError('Erreur', 'Une erreur est survenue');
    }
  };

  const handleRemove = (method: PaymentMethod) => {
    showDestructiveConfirm(
      'Supprimer la carte',
      `Voulez-vous supprimer la carte **** ${method.card?.last4} ?`,
      async () => {
        try {
          const response = await awsAPI.removePaymentMethod(method.id);
          if (response.success) {
            setPaymentMethods((prev) => prev.filter((pm) => pm.id !== method.id));
            if (selectedCard === method.id) {
              setSelectedCard(null);
            }
          } else {
            showError('Erreur', response.message || 'Impossible de supprimer');
          }
        } catch (error) {
          console.error('Failed to remove card:', error);
          showError('Erreur', 'Une erreur est survenue');
        }
      }
    );
  };

  const getCardBrandInfo = (brand: string) => {
    return CARD_BRANDS[brand.toLowerCase()] || CARD_BRANDS.default;
  };

  const renderCreditCard = (method: PaymentMethod, index: number) => {
    if (!method.card) return null;

    const brandInfo = getCardBrandInfo(method.card.brand);
    const isSelected = selectedCard === method.id;

    return (
      <Animated.View
        key={method.id}
        style={[
          styles.cardWrapper,
          {
            opacity: fadeAnim,
            transform: [
              { translateY: slideAnim },
              { scale: isSelected ? 1 : 0.95 },
            ],
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => handleSetDefault(method.id)}
          onLongPress={() => handleRemove(method)}
        >
          <LinearGradient
            colors={brandInfo.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[
              styles.creditCard,
              isSelected && styles.creditCardSelected,
            ]}
          >
            {/* Card Shine Effect */}
            <View style={styles.cardShine} />

            {/* Top Row - Brand & Default Badge */}
            <View style={styles.cardTopRow}>
              <Text style={[styles.cardBrandLogo, { color: brandInfo.textColor }]}>
                {brandInfo.logo}
              </Text>
              {method.isDefault && (
                <View style={styles.defaultChip}>
                  <Ionicons name="checkmark-circle" size={14} color={COLORS.primary} />
                  <Text style={styles.defaultChipText}>Principale</Text>
                </View>
              )}
            </View>

            {/* Chip Icon */}
            <View style={styles.chipIcon}>
              <LinearGradient
                colors={['#FFD700', '#FFA500', '#FFD700']}
                style={styles.chipGradient}
              />
            </View>

            {/* Card Number */}
            <View style={styles.cardNumberRow}>
              <Text style={[styles.cardNumberGroup, { color: brandInfo.textColor }]}>****</Text>
              <Text style={[styles.cardNumberGroup, { color: brandInfo.textColor }]}>****</Text>
              <Text style={[styles.cardNumberGroup, { color: brandInfo.textColor }]}>****</Text>
              <Text style={[styles.cardNumberLast, { color: brandInfo.textColor }]}>
                {method.card.last4}
              </Text>
            </View>

            {/* Bottom Row - Expiry & Type */}
            <View style={styles.cardBottomRow}>
              <View>
                <Text style={[styles.cardLabel, { color: brandInfo.textColor + 'AA' }]}>
                  EXPIRE
                </Text>
                <Text style={[styles.cardExpiry, { color: brandInfo.textColor }]}>
                  {String(method.card.expMonth).padStart(2, '0')}/{String(method.card.expYear).slice(-2)}
                </Text>
              </View>
              <View style={styles.cardTypeContainer}>
                <Text style={[styles.cardType, { color: brandInfo.textColor + 'AA' }]}>
                  {method.card.funding.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* NFC Icon */}
            <View style={styles.nfcIcon}>
              <Ionicons name="wifi" size={20} color={brandInfo.textColor + '60'} style={{ transform: [{ rotate: '90deg' }] }} />
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Delete hint */}
        <Text style={styles.cardHint}>
          Appui long pour supprimer
        </Text>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={GRADIENTS.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.loadingHeader, { paddingTop: insets.top + 10 }]}
        >
          <ActivityIndicator size="large" color={COLORS.white} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Gradient Header */}
      <LinearGradient
        colors={GRADIENTS.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Moyens de paiement</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Stats */}
        <View style={styles.statsContainer}>
          <BlurView intensity={20} tint="light" style={styles.statCard}>
            <Ionicons name="card" size={20} color={COLORS.white} />
            <Text style={styles.statNumber}>{paymentMethods.length}</Text>
            <Text style={styles.statLabel}>Cartes</Text>
          </BlurView>
          <BlurView intensity={20} tint="light" style={styles.statCard}>
            <Ionicons name="shield-checkmark" size={20} color={COLORS.white} />
            <Text style={styles.statNumber}>256</Text>
            <Text style={styles.statLabel}>bit SSL</Text>
          </BlurView>
          <BlurView intensity={20} tint="light" style={styles.statCard}>
            <Ionicons name="lock-closed" size={20} color={COLORS.white} />
            <Text style={styles.statNumber}>3DS</Text>
            <Text style={styles.statLabel}>Secure</Text>
          </BlurView>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* Cards Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Vos cartes</Text>
            <TouchableOpacity onPress={handleAddCard} disabled={addingCard}>
              {addingCard ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <View style={styles.addButton}>
                  <Ionicons name="add" size={20} color={COLORS.white} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {paymentMethods.length === 0 ? (
            <Animated.View
              style={[
                styles.emptyState,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
              ]}
            >
              <LinearGradient
                colors={['#2C2C2E', '#3A3A3C']}
                style={styles.emptyCard}
              >
                <View style={styles.emptyCardContent}>
                  <Ionicons name="card-outline" size={48} color={COLORS.gray} />
                  <Text style={styles.emptyTitle}>Aucune carte</Text>
                  <Text style={styles.emptySubtitle}>
                    Ajoutez une carte pour des paiements rapides et securises
                  </Text>
                </View>
                <View style={styles.emptyCardDots}>
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                  <View style={styles.dot} />
                </View>
              </LinearGradient>
            </Animated.View>
          ) : (
            paymentMethods.map((method, index) => renderCreditCard(method, index))
          )}
        </View>

        {/* Add Card Large Button */}
        <TouchableOpacity
          style={styles.addCardLarge}
          onPress={handleAddCard}
          disabled={addingCard}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.addCardGradient}
          >
            {addingCard ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Ionicons name="add-circle" size={24} color={COLORS.white} />
                <Text style={styles.addCardLargeText}>Ajouter une nouvelle carte</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Security Info */}
        <View style={styles.securitySection}>
          <View style={styles.securityItem}>
            <View style={styles.securityIcon}>
              <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.securityText}>
              <Text style={styles.securityTitle}>Chiffrement SSL</Text>
              <Text style={styles.securityDesc}>Donnees chiffrees de bout en bout</Text>
            </View>
          </View>
          <View style={styles.securityItem}>
            <View style={styles.securityIcon}>
              <Ionicons name="finger-print" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.securityText}>
              <Text style={styles.securityTitle}>Authentification 3DS</Text>
              <Text style={styles.securityDesc}>Verification securisee des paiements</Text>
            </View>
          </View>
          <View style={styles.securityItem}>
            <View style={styles.securityIcon}>
              <Ionicons name="eye-off" size={20} color={COLORS.primary} />
            </View>
            <View style={styles.securityText}>
              <Text style={styles.securityTitle}>Donnees masquees</Text>
              <Text style={styles.securityDesc}>Numeros de carte jamais stockes</Text>
            </View>
          </View>
        </View>

        {/* Powered by Stripe */}
        <View style={styles.poweredBy}>
          <Text style={styles.poweredByText}>Paiements securises par</Text>
          <Text style={styles.stripeLogo}>stripe</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  loadingHeader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.white,
    fontSize: 16,
    marginTop: 12,
  },
  header: {
    paddingBottom: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  placeholder: {
    width: 40,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  statCard: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginTop: 4,
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 24,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.button,
  },
  cardWrapper: {
    marginBottom: 16,
  },
  creditCard: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 0.63,
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    ...SHADOWS.cardMedium,
  },
  creditCardSelected: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  cardShine: {
    position: 'absolute',
    top: -50,
    left: -50,
    width: 200,
    height: 200,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 100,
    transform: [{ rotate: '45deg' }],
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardBrandLogo: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 2,
  },
  defaultChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  defaultChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.dark,
  },
  chipIcon: {
    width: 45,
    height: 32,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 16,
  },
  chipGradient: {
    flex: 1,
    opacity: 0.9,
  },
  cardNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 16,
  },
  cardNumberGroup: {
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 2,
    opacity: 0.7,
  },
  cardNumberLast: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 3,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 'auto',
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 2,
  },
  cardExpiry: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  cardTypeContainer: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cardType: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  nfcIcon: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -10,
  },
  cardHint: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyCard: {
    width: CARD_WIDTH,
    height: CARD_WIDTH * 0.63,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  emptyCardContent: {
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  emptyCardDots: {
    flexDirection: 'row',
    position: 'absolute',
    bottom: 20,
    gap: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.gray + '40',
  },
  addCardLarge: {
    marginHorizontal: 24,
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
    ...SHADOWS.buttonGradient,
  },
  addCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  addCardLargeText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  securitySection: {
    paddingHorizontal: 24,
    gap: 16,
  },
  securityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.darkGray,
    padding: 16,
    borderRadius: 14,
  },
  securityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityText: {
    flex: 1,
  },
  securityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  securityDesc: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  poweredBy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 32,
  },
  poweredByText: {
    fontSize: 12,
    color: COLORS.gray,
  },
  stripeLogo: {
    fontSize: 18,
    fontWeight: '700',
    color: '#635BFF',
    letterSpacing: -0.5,
  },
});

export default PaymentMethodsScreen;
