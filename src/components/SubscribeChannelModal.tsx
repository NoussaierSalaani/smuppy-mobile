// src/components/SubscribeChannelModal.tsx
// Modal for subscribing to a pro_creator's channel
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AvatarImage } from './OptimizedImage';
import { GRADIENTS } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import { useSmuppyAlert } from '../context/SmuppyAlertContext';

interface SubscriptionTier {
  id: string;
  name: string;
  price: number;
  period: 'month' | 'year';
  features: string[];
  popular?: boolean;
}

interface SubscribeChannelModalProps {
  visible: boolean;
  onClose: () => void;
  creatorName: string;
  creatorAvatar: string;
  creatorUsername: string;
  onSubscribe?: (tierId: string) => void;
}

const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'basic',
    name: 'Fan',
    price: 4.99,
    period: 'month',
    features: [
      'Access to exclusive posts',
      'Join live streams',
      'Fan badge on comments',
    ],
  },
  {
    id: 'premium',
    name: 'Super Fan',
    price: 9.99,
    period: 'month',
    features: [
      'All Fan benefits',
      'Access to exclusive videos',
      'Priority in live chat',
      'Monthly 1-on-1 Q&A',
    ],
    popular: true,
  },
  {
    id: 'vip',
    name: 'VIP',
    price: 24.99,
    period: 'month',
    features: [
      'All Super Fan benefits',
      'Private Discord access',
      'Early access to content',
      'Personal shoutouts',
      '10% off private sessions',
    ],
  },
];

export default function SubscribeChannelModal({
  visible,
  onClose,
  creatorName,
  creatorAvatar,
  creatorUsername,
  onSubscribe,
}: SubscribeChannelModalProps): React.JSX.Element {
  const { showSuccess, showConfirm } = useSmuppyAlert();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [selectedTier, setSelectedTier] = useState<string>('premium');

  const handleSubscribe = () => {
    const tier = SUBSCRIPTION_TIERS.find(t => t.id === selectedTier);
    if (tier) {
      showConfirm(
        'Confirm Subscription',
        `Subscribe to ${creatorName}'s ${tier.name} plan for $${tier.price}/${tier.period}?`,
        () => {
          onSubscribe?.(selectedTier);
          onClose();
          showSuccess('Subscribed!', `You're now a ${tier.name} of ${creatorName}!`);
        },
        'Subscribe'
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.dark} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Subscribe</Text>
            <View style={styles.closeButton} />
          </View>

          {/* Creator Info */}
          <View style={styles.creatorSection}>
            <AvatarImage source={creatorAvatar} size={64} />
            <Text style={styles.creatorName}>{creatorName}</Text>
            <Text style={styles.creatorUsername}>@{creatorUsername}</Text>
          </View>

          {/* Subscription Tiers */}
          <View style={styles.tiersContainer}>
            {SUBSCRIPTION_TIERS.map((tier) => (
              <TouchableOpacity
                key={tier.id}
                style={[
                  styles.tierCard,
                  selectedTier === tier.id && styles.tierCardSelected,
                ]}
                onPress={() => setSelectedTier(tier.id)}
                activeOpacity={0.7}
              >
                {tier.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>POPULAR</Text>
                  </View>
                )}

                <View style={styles.tierHeader}>
                  <Text style={[
                    styles.tierName,
                    selectedTier === tier.id && styles.tierNameSelected,
                  ]}>
                    {tier.name}
                  </Text>
                  <View style={styles.priceContainer}>
                    <Text style={[
                      styles.tierPrice,
                      selectedTier === tier.id && styles.tierPriceSelected,
                    ]}>
                      ${tier.price}
                    </Text>
                    <Text style={styles.tierPeriod}>/{tier.period}</Text>
                  </View>
                </View>

                <View style={styles.featuresContainer}>
                  {tier.features.map((feature, index) => (
                    <View key={index} style={styles.featureRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={16}
                        color={selectedTier === tier.id ? colors.primary : colors.grayLight}
                      />
                      <Text style={[
                        styles.featureText,
                        selectedTier === tier.id && styles.featureTextSelected,
                      ]}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                </View>

                {selectedTier === tier.id && (
                  <View style={styles.selectedIndicator}>
                    <LinearGradient
                      colors={GRADIENTS.primary}
                      style={styles.selectedIndicatorGradient}
                    >
                      <Ionicons name="checkmark" size={16} color="white" />
                    </LinearGradient>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Subscribe Button */}
          <TouchableOpacity onPress={handleSubscribe} activeOpacity={0.9}>
            <LinearGradient
              colors={GRADIENTS.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.subscribeButton}
            >
              <Text style={styles.subscribeButtonText}>
                Subscribe for ${SUBSCRIPTION_TIERS.find(t => t.id === selectedTier)?.price}/month
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Terms */}
          <Text style={styles.termsText}>
            Cancel anytime. Subscription auto-renews monthly.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  content: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  creatorSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  creatorName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
    marginTop: 12,
  },
  creatorUsername: {
    fontSize: 14,
    color: 'rgba(10, 37, 47, 0.6)',
    marginTop: 4,
  },
  tiersContainer: {
    gap: 12,
    marginBottom: 24,
  },
  tierCard: {
    borderWidth: 2,
    borderColor: 'rgba(10, 37, 47, 0.1)',
    borderRadius: 16,
    padding: 16,
    position: 'relative',
  },
  tierCardSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(14, 191, 138, 0.05)',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  popularBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tierName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  tierNameSelected: {
    color: colors.primary,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tierPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.dark,
  },
  tierPriceSelected: {
    color: colors.primary,
  },
  tierPeriod: {
    fontSize: 14,
    color: 'rgba(10, 37, 47, 0.5)',
  },
  featuresContainer: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    color: 'rgba(10, 37, 47, 0.7)',
  },
  featureTextSelected: {
    color: colors.dark,
  },
  selectedIndicator: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  selectedIndicatorGradient: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscribeButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subscribeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  termsText: {
    fontSize: 12,
    color: 'rgba(10, 37, 47, 0.5)',
    textAlign: 'center',
    marginTop: 12,
  },
});
