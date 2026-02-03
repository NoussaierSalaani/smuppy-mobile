/**
 * BusinessSubscriptionSuccessScreen
 * Confirmation screen after successful subscription
 */

import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { GRADIENTS } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface Props {
  route: {
    params: {
      subscriptionId: string;
      businessName: string;
      planName: string;
      period: 'weekly' | 'monthly' | 'yearly';
      trialDays?: number;
    };
  };
  navigation: any;
}

const PERIOD_TEXT = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Annual',
};

export default function BusinessSubscriptionSuccessScreen({ route, navigation }: Props) {
  const { colors, isDark } = useTheme();
  const { subscriptionId, businessName, planName, period, trialDays } = route.params;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `I just subscribed to ${businessName} on Smuppy! 🏋️‍♂️\n\nJoin me and let's workout together!`,
      });
    } catch (error) {
      if (__DEV__) console.warn('Share error:', error);
    }
  };

  const handleViewSubscription = () => {
    navigation.replace('MySubscriptions');
  };

  const handleDone = () => {
    navigation.popToTop();
    navigation.navigate('Tabs');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* Success Animation */}
          <Animated.View
            style={[
              styles.animationContainer,
              {
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
          >
            <LinearGradient colors={GRADIENTS.primary} style={styles.successCircle}>
              <Ionicons name="checkmark" size={60} color="#fff" />
            </LinearGradient>
          </Animated.View>

          {/* Success Message */}
          <Text style={styles.title}>
            {trialDays ? 'Trial Started! 🎉' : 'Subscribed! 🎉'}
          </Text>
          <Text style={styles.subtitle}>
            {trialDays
              ? `Enjoy your ${trialDays}-day free trial`
              : 'You now have full access to all features'}
          </Text>

          {/* Subscription Card */}
          <View style={styles.subscriptionCard}>
            <View style={styles.cardHeader}>
              <View style={styles.planBadge}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={styles.planBadgeText}>{PERIOD_TEXT[period]}</Text>
              </View>
            </View>

            <Text style={styles.businessName}>{businessName}</Text>
            <Text style={styles.planName}>{planName}</Text>

            {trialDays && (
              <View style={styles.trialInfo}>
                <Ionicons name="gift" size={18} color="#FFD700" />
                <Text style={styles.trialText}>
                  {trialDays}-day free trial • Cancel anytime
                </Text>
              </View>
            )}

            <View style={styles.cardDivider} />

            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.benefitText}>Unlimited access to all facilities</Text>
              </View>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.benefitText}>Priority booking for classes</Text>
              </View>
              <View style={styles.benefitItem}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.benefitText}>Exclusive member discounts</Text>
              </View>
            </View>
          </View>

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color={colors.primary} />
            <Text style={styles.infoText}>
              You can manage your subscription anytime from your profile settings
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleViewSubscription}>
              <Ionicons name="card-outline" size={20} color="#fff" />
              <Text style={styles.secondaryButtonText}>My Subscriptions</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={styles.secondaryButtonText}>Share</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleDone}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.primaryGradient}>
              <Text style={styles.primaryButtonText}>Start Exploring</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  animationContainer: {
    width: 120,
    height: 120,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.dark,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 32,
  },
  subscriptionCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(14,191,138,0.3)',
  },
  cardHeader: {
    marginBottom: 12,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,215,0,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFD700',
  },
  businessName: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 4,
  },
  planName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.dark,
    marginBottom: 16,
  },
  trialInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: 12,
    borderRadius: 12,
    gap: 10,
    marginBottom: 16,
  },
  trialText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFD700',
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  benefitsList: {
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 14,
    color: colors.grayLight,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14,191,138,0.1)',
    padding: 14,
    borderRadius: 14,
    gap: 12,
    width: '100%',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: colors.primary,
  },
  actions: {
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
