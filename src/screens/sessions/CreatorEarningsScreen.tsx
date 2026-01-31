/**
 * Creator Earnings Screen
 * Dashboard for Pro Creators to view their earnings from sessions, packs, and tips
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { awsAPI } from '../../services/aws-api';

const { width } = Dimensions.get('window');

type PeriodType = 'week' | 'month' | 'year' | 'all';

interface Transaction {
  id: string;
  type: 'session' | 'pack' | 'tip' | 'subscription' | 'payout';
  description: string;
  amount: number;
  status: 'completed' | 'pending' | 'failed';
  date: Date;
  fanName?: string;
  fanAvatar?: string;
}

interface EarningsData {
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  breakdown: {
    sessions: { count: number; total: number };
    packs: { count: number; total: number };
    subscriptions: { count: number; total: number };
  };
  transactions: Array<{
    id: string;
    type: 'session' | 'pack' | 'subscription';
    amount: number;
    currency: string;
    status: string;
    description: string;
    buyer: { name: string; avatar: string } | null;
    createdAt: string;
  }>;
}

const CreatorEarningsScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('month');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [earningsData, setEarningsData] = useState<EarningsData | null>(null);

  // Fetch earnings data
  const fetchEarnings = useCallback(async () => {
    try {
      const response = await awsAPI.getEarnings({ period: selectedPeriod, limit: 20 });
      if (response.success && response.earnings) {
        setEarningsData(response.earnings);
      }
    } catch (error) {
      if (__DEV__) console.error('Failed to fetch earnings:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEarnings();
    setRefreshing(false);
  }, [fetchEarnings]);

  // Transform API transactions to local format
  const transactions: Transaction[] = earningsData?.transactions.map(t => ({
    id: t.id,
    type: t.type,
    description: t.description,
    amount: t.amount,
    status: t.status as 'completed' | 'pending' | 'failed',
    date: new Date(t.createdAt),
    fanName: t.buyer?.name,
    fanAvatar: t.buyer?.avatar,
  })) || [];

  // Calculate stats from earnings data
  const balance = {
    available: earningsData?.availableBalance || 0,
    pending: earningsData?.pendingBalance || 0,
    lifetime: earningsData?.totalEarnings || 0,
  };

  const stats = {
    sessionsThisMonth: earningsData?.breakdown.sessions.count || 0,
    packsActive: earningsData?.breakdown.packs.count || 0,
    tipsReceived: 0, // Tips not in current API
    avgSessionRating: 4.8, // Rating not in current API
  };

  const getTypeIcon = (type: Transaction['type']): string => {
    switch (type) {
      case 'session': return 'videocam';
      case 'pack': return 'cube';
      case 'tip': return 'heart';
      case 'subscription': return 'repeat';
      case 'payout': return 'wallet';
      default: return 'cash';
    }
  };

  const getTypeColor = (type: Transaction['type']): string => {
    switch (type) {
      case 'session': return colors.primary;
      case 'pack': return '#8B5CF6';
      case 'tip': return '#EC4899';
      case 'subscription': return '#06B6D4';
      case 'payout': return '#F59E0B';
      default: return colors.gray;
    }
  };

  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return "À l'instant";
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  const formatAmount = (amount: number): string => {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${amount.toFixed(2)} €`;
  };

  const periods: { key: PeriodType; label: string }[] = [
    { key: 'week', label: 'Semaine' },
    { key: 'month', label: 'Mois' },
    { key: 'year', label: 'Année' },
    { key: 'all', label: 'Tout' },
  ];

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ color: colors.gray, marginTop: 16 }}>Loading earnings...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Mes Revenus</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={22} color={colors.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <LinearGradient
            colors={[colors.primary, colors.cyanBlue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceGradient}
          >
            <View style={styles.balanceHeader}>
              <Text style={styles.balanceLabel}>Solde disponible</Text>
              <TouchableOpacity style={styles.withdrawButton}>
                <Text style={styles.withdrawText}>Retirer</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.white} />
              </TouchableOpacity>
            </View>
            <Text style={styles.balanceAmount}>{balance.available.toFixed(2)} €</Text>
            <View style={styles.balanceDetails}>
              <View style={styles.balanceItem}>
                <Text style={styles.balanceItemLabel}>En attente</Text>
                <Text style={styles.balanceItemValue}>{balance.pending.toFixed(2)} €</Text>
              </View>
              <View style={styles.balanceDivider} />
              <View style={styles.balanceItem}>
                <Text style={styles.balanceItemLabel}>Total gagné</Text>
                <Text style={styles.balanceItemValue}>{balance.lifetime.toFixed(2)} €</Text>
              </View>
            </View>
          </LinearGradient>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {periods.map(period => (
            <TouchableOpacity
              key={period.key}
              style={[styles.periodButton, selectedPeriod === period.key && styles.periodButtonActive]}
              onPress={() => setSelectedPeriod(period.key)}
            >
              <Text style={[styles.periodText, selectedPeriod === period.key && styles.periodTextActive]}>
                {period.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="videocam" size={22} color={colors.primary} />
            </View>
            <Text style={styles.statValue}>{stats.sessionsThisMonth}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#8B5CF620' }]}>
              <Ionicons name="cube" size={22} color="#8B5CF6" />
            </View>
            <Text style={styles.statValue}>{stats.packsActive}</Text>
            <Text style={styles.statLabel}>Packs actifs</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#EC489920' }]}>
              <Ionicons name="heart" size={22} color="#EC4899" />
            </View>
            <Text style={styles.statValue}>{stats.tipsReceived.toFixed(0)}€</Text>
            <Text style={styles.statLabel}>Tips</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#FFA50020' }]}>
              <Ionicons name="star" size={22} color="#FFA500" />
            </View>
            <Text style={styles.statValue}>{stats.avgSessionRating}</Text>
            <Text style={styles.statLabel}>Note moy.</Text>
          </View>
        </View>

        {/* Revenue Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Répartition des revenus</Text>
          <View style={styles.breakdownCard}>
            {(() => {
              const total = (earningsData?.breakdown.sessions.total || 0) +
                           (earningsData?.breakdown.packs.total || 0) +
                           (earningsData?.breakdown.subscriptions.total || 0);
              const sessionsPercent = total > 0 ? Math.round((earningsData?.breakdown.sessions.total || 0) / total * 100) : 0;
              const packsPercent = total > 0 ? Math.round((earningsData?.breakdown.packs.total || 0) / total * 100) : 0;
              const subscriptionsPercent = total > 0 ? Math.round((earningsData?.breakdown.subscriptions.total || 0) / total * 100) : 0;
              return (
                <>
                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownLeft}>
                      <View style={[styles.breakdownDot, { backgroundColor: colors.primary }]} />
                      <Text style={styles.breakdownLabel}>Sessions 1:1</Text>
                    </View>
                    <Text style={styles.breakdownValue}>{sessionsPercent}%</Text>
                  </View>
                  <View style={styles.breakdownBar}>
                    <View style={[styles.breakdownFill, { width: `${sessionsPercent}%`, backgroundColor: colors.primary }]} />
                  </View>

                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownLeft}>
                      <View style={[styles.breakdownDot, { backgroundColor: '#8B5CF6' }]} />
                      <Text style={styles.breakdownLabel}>Packs</Text>
                    </View>
                    <Text style={styles.breakdownValue}>{packsPercent}%</Text>
                  </View>
                  <View style={styles.breakdownBar}>
                    <View style={[styles.breakdownFill, { width: `${packsPercent}%`, backgroundColor: '#8B5CF6' }]} />
                  </View>

                  <View style={styles.breakdownRow}>
                    <View style={styles.breakdownLeft}>
                      <View style={[styles.breakdownDot, { backgroundColor: '#EC4899' }]} />
                      <Text style={styles.breakdownLabel}>Abonnements</Text>
                    </View>
                    <Text style={styles.breakdownValue}>{subscriptionsPercent}%</Text>
                  </View>
                  <View style={styles.breakdownBar}>
                    <View style={[styles.breakdownFill, { width: `${subscriptionsPercent}%`, backgroundColor: '#EC4899' }]} />
                  </View>
                </>
              );
            })()}
          </View>
        </View>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Transactions récentes</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>Voir tout</Text>
            </TouchableOpacity>
          </View>

          {transactions.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <Ionicons name="receipt-outline" size={48} color={colors.gray} />
              <Text style={{ color: colors.gray, marginTop: 12 }}>Aucune transaction</Text>
            </View>
          ) : null}

          {transactions.map(transaction => (
            <View key={transaction.id} style={styles.transactionCard}>
              <View style={[styles.transactionIcon, { backgroundColor: getTypeColor(transaction.type) + '20' }]}>
                <Ionicons name={getTypeIcon(transaction.type) as any} size={20} color={getTypeColor(transaction.type)} />
              </View>
              <View style={styles.transactionInfo}>
                <Text style={styles.transactionDescription}>{transaction.description}</Text>
                <Text style={styles.transactionMeta}>
                  {transaction.fanName ? `${transaction.fanName} • ` : ''}{formatDate(transaction.date)}
                </Text>
              </View>
              <Text style={[
                styles.transactionAmount,
                { color: transaction.amount >= 0 ? colors.primary : '#FF4444' }
              ]}>
                {formatAmount(transaction.amount)}
              </Text>
            </View>
          ))}
        </View>

        {/* Payout Info */}
        <View style={styles.payoutInfo}>
          <Ionicons name="information-circle-outline" size={20} color={colors.gray} />
          <Text style={styles.payoutText}>
            Les virements sont effectués automatiquement chaque lundi pour les soldes supérieurs à 50€.
            Smuppy prélève 20% de commission sur chaque transaction.
          </Text>
        </View>

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
};

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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
  },
  settingsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  balanceGradient: {
    padding: 20,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  withdrawButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  withdrawText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 20,
  },
  balanceDetails: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 12,
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  balanceDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 12,
  },
  balanceItemLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  balanceItemValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  periodSelector: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray,
  },
  periodTextActive: {
    color: colors.white,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    marginBottom: 24,
  },
  statCard: {
    width: (width - 48) / 4,
    alignItems: 'center',
    paddingVertical: 12,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: colors.gray,
    textAlign: 'center',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  breakdownCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownLabel: {
    fontSize: 14,
    color: colors.grayLight,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  breakdownBar: {
    height: 6,
    backgroundColor: colors.background,
    borderRadius: 3,
    marginBottom: 16,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    borderRadius: 3,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.white,
    marginBottom: 2,
  },
  transactionMeta: {
    fontSize: 13,
    color: colors.gray,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  payoutInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
  },
  payoutText: {
    flex: 1,
    fontSize: 13,
    color: colors.gray,
    lineHeight: 18,
  },
});

export default CreatorEarningsScreen;
