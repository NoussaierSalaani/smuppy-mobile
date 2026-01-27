/**
 * MySubscriptionsScreen
 * View and manage user's business subscriptions
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
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DARK_COLORS as COLORS, GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';

interface Subscription {
  id: string;
  business: {
    id: string;
    name: string;
    logo_url?: string;
    category: {
      name: string;
      icon: string;
      color: string;
    };
  };
  plan: {
    id: string;
    name: string;
    price_cents: number;
    period: 'weekly' | 'monthly' | 'yearly';
  };
  status: 'active' | 'cancelled' | 'expired' | 'trial';
  current_period_start: string;
  current_period_end: string;
  trial_end?: string;
  cancel_at_period_end: boolean;
  sessions_used?: number;
  sessions_limit?: number;
}

const STATUS_CONFIG = {
  active: { label: 'Active', color: '#4CAF50', icon: 'checkmark-circle' },
  trial: { label: 'Trial', color: '#FFD700', icon: 'gift' },
  cancelled: { label: 'Cancelled', color: '#FF9800', icon: 'close-circle' },
  expired: { label: 'Expired', color: '#F44336', icon: 'time' },
};

const PERIOD_LABELS = {
  weekly: '/week',
  monthly: '/month',
  yearly: '/year',
};

export default function MySubscriptionsScreen({ navigation }: { navigation: any }) {
  const { formatAmount } = useCurrency();

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    try {
      const response = await awsAPI.getMyBusinessSubscriptions();
      if (response.success) {
        setSubscriptions(response.subscriptions || []);
      }
    } catch (error) {
      console.error('Load subscriptions error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadSubscriptions();
  };

  const handleCancelSubscription = (subscription: Subscription) => {
    Alert.alert(
      'Cancel Subscription',
      `Are you sure you want to cancel your ${subscription.plan.name} subscription at ${subscription.business.name}?\n\nYou'll still have access until ${formatDate(subscription.current_period_end)}.`,
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await awsAPI.cancelBusinessSubscription(subscription.id);
              if (response.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                loadSubscriptions();
              } else {
                throw new Error(response.message);
              }
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to cancel subscription');
            }
          },
        },
      ]
    );
  };

  const handleReactivate = async (subscription: Subscription) => {
    try {
      const response = await awsAPI.reactivateBusinessSubscription(subscription.id);
      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Reactivated', 'Your subscription has been reactivated!');
        loadSubscriptions();
      } else {
        throw new Error(response.message);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to reactivate subscription');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDaysRemaining = (endDate: string) => {
    const end = new Date(endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const renderSubscriptionCard = (subscription: Subscription) => {
    const statusConfig = STATUS_CONFIG[subscription.status];
    const daysRemaining = getDaysRemaining(subscription.current_period_end);
    const isTrialEnding = subscription.status === 'trial' && subscription.trial_end &&
      getDaysRemaining(subscription.trial_end) <= 3;

    return (
      <TouchableOpacity
        key={subscription.id}
        style={styles.subscriptionCard}
        onPress={() => navigation.navigate('BusinessProfile', { businessId: subscription.business.id })}
        activeOpacity={0.8}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.businessInfo}>
            {subscription.business.logo_url ? (
              <Image source={{ uri: subscription.business.logo_url }} style={styles.businessLogo} />
            ) : (
              <View style={[styles.businessLogoPlaceholder, { backgroundColor: subscription.business.category.color }]}>
                <Ionicons name={subscription.business.category.icon as any} size={20} color="#fff" />
              </View>
            )}
            <View style={styles.businessDetails}>
              <Text style={styles.businessName}>{subscription.business.name}</Text>
              <Text style={styles.planName}>{subscription.plan.name}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.color + '20' }]}>
            <Ionicons name={statusConfig.icon as any} size={14} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        {/* Warning for ending trial */}
        {isTrialEnding && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={16} color="#FFD700" />
            <Text style={styles.warningText}>
              Trial ends in {getDaysRemaining(subscription.trial_end!)} days
            </Text>
          </View>
        )}

        {/* Pricing */}
        <View style={styles.pricingRow}>
          <View>
            <Text style={styles.priceLabel}>Subscription</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{formatAmount(subscription.plan.price_cents)}</Text>
              <Text style={styles.period}>{PERIOD_LABELS[subscription.plan.period]}</Text>
            </View>
          </View>
          {subscription.sessions_limit && (
            <View style={styles.sessionsInfo}>
              <Text style={styles.sessionsLabel}>Sessions</Text>
              <Text style={styles.sessionsCount}>
                {subscription.sessions_used || 0}/{subscription.sessions_limit}
              </Text>
            </View>
          )}
        </View>

        {/* Period Info */}
        <View style={styles.periodInfo}>
          <View style={styles.periodItem}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.gray} />
            <Text style={styles.periodText}>
              {subscription.cancel_at_period_end
                ? `Ends ${formatDate(subscription.current_period_end)}`
                : `Renews ${formatDate(subscription.current_period_end)}`}
            </Text>
          </View>
          {subscription.status === 'active' && !subscription.cancel_at_period_end && (
            <View style={styles.periodItem}>
              <Ionicons name="time-outline" size={16} color={COLORS.gray} />
              <Text style={styles.periodText}>{daysRemaining} days left</Text>
            </View>
          )}
        </View>

        {/* Actions */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('BusinessProfile', { businessId: subscription.business.id })}
          >
            <Ionicons name="eye-outline" size={18} color="#fff" />
            <Text style={styles.actionButtonText}>View</Text>
          </TouchableOpacity>

          {subscription.status === 'active' && !subscription.cancel_at_period_end && (
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => handleCancelSubscription(subscription)}
            >
              <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
              <Text style={[styles.actionButtonText, styles.cancelButtonText]}>Cancel</Text>
            </TouchableOpacity>
          )}

          {subscription.cancel_at_period_end && subscription.status === 'active' && (
            <TouchableOpacity
              style={[styles.actionButton, styles.reactivateButton]}
              onPress={() => handleReactivate(subscription)}
            >
              <Ionicons name="refresh-outline" size={18} color={COLORS.primary} />
              <Text style={[styles.actionButtonText, styles.reactivateButtonText]}>Reactivate</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Subscriptions</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.primary}
            />
          }
        >
          {/* Stats Summary */}
          {subscriptions.length > 0 && (
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {subscriptions.filter(s => s.status === 'active' || s.status === 'trial').length}
                </Text>
                <Text style={styles.statLabel}>Active</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {formatAmount(
                    subscriptions
                      .filter(s => s.status === 'active' && !s.cancel_at_period_end)
                      .reduce((sum, s) => {
                        const multiplier = s.plan.period === 'yearly' ? 1/12 : s.plan.period === 'weekly' ? 4 : 1;
                        return sum + (s.plan.price_cents * multiplier);
                      }, 0)
                  )}
                </Text>
                <Text style={styles.statLabel}>Monthly</Text>
              </View>
            </View>
          )}

          {/* Subscriptions List */}
          {subscriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="card-outline" size={64} color={COLORS.gray} />
              <Text style={styles.emptyTitle}>No Subscriptions</Text>
              <Text style={styles.emptySubtitle}>
                Subscribe to gyms, studios, and more to see them here
              </Text>
              <TouchableOpacity
                style={styles.discoverButton}
                onPress={() => navigation.navigate('BusinessDiscovery')}
              >
                <LinearGradient colors={GRADIENTS.primary} style={styles.discoverGradient}>
                  <Text style={styles.discoverButtonText}>Discover Businesses</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.subscriptionsList}>
              {subscriptions.map(renderSubscriptionCard)}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },

  // Header
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
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // Stats
  statsCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 20,
  },

  // Subscriptions
  subscriptionsList: {
    gap: 16,
  },
  subscriptionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  businessInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  businessLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
  },
  businessLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessDetails: {
    flex: 1,
  },
  businessName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  planName: {
    fontSize: 13,
    color: COLORS.gray,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,215,0,0.15)',
    padding: 10,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  warningText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFD700',
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  priceLabel: {
    fontSize: 12,
    color: COLORS.gray,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  period: {
    fontSize: 14,
    color: COLORS.gray,
    marginLeft: 2,
  },
  sessionsInfo: {
    alignItems: 'flex-end',
  },
  sessionsLabel: {
    fontSize: 12,
    color: COLORS.gray,
    marginBottom: 4,
  },
  sessionsCount: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  periodInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  periodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  periodText: {
    fontSize: 13,
    color: COLORS.gray,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    backgroundColor: 'rgba(255,59,48,0.1)',
  },
  cancelButtonText: {
    color: '#FF3B30',
  },
  reactivateButton: {
    backgroundColor: 'rgba(14,191,138,0.1)',
  },
  reactivateButtonText: {
    color: COLORS.primary,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    marginBottom: 16,
  },
  discoverButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  discoverGradient: {
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  discoverButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
