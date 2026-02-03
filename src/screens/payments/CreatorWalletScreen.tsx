/**
 * CreatorWalletScreen - Premium Creator Dashboard
 * Inspired by Revolut, Cash App, and modern fintech apps
 * Features: Earnings overview, transactions, analytics, payouts
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { GRADIENTS, SHADOWS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width: _SCREEN_WIDTH } = Dimensions.get('window');

// Tier colors for visual distinction
const TIER_COLORS = {
  Bronze: { primary: '#CD7F32', secondary: '#8B4513', gradient: ['#CD7F32', '#A0522D'] },
  Silver: { primary: '#C0C0C0', secondary: '#808080', gradient: ['#E8E8E8', '#A8A8A8'] },
  Gold: { primary: '#FFD700', secondary: '#DAA520', gradient: ['#FFD700', '#FFA500'] },
  Platinum: { primary: '#E5E4E2', secondary: '#A0A0A0', gradient: ['#E5E4E2', '#B8B8B8'] },
  Diamond: { primary: '#B9F2FF', secondary: '#00CED1', gradient: ['#B9F2FF', '#00CED1'] },
};

interface Transaction {
  id: string;
  type: 'session' | 'pack' | 'channel';
  amounts: {
    gross: number;
    net: number;
    platformFee: number;
    creatorAmount: number;
  };
  status: string;
  createdAt: string;
  buyer: {
    username: string;
    name: string;
    avatar: string | null;
  };
}

interface DashboardData {
  profile: {
    accountType: string;
    isVerified: boolean;
    hasStripeConnect: boolean;
    fanCount: number;
  };
  tier: {
    name: string;
    creatorPercent: number;
    smuppyPercent: number;
    nextTier: { name: string; fansNeeded: number } | null;
  };
  earnings: {
    lifetime: { total: number; transactions: number };
    thisMonth: { total: number; transactions: number };
    breakdown: { type: string; earnings: number; count: number }[];
  };
  subscribers: { active: number };
  balance: { available: number; pending: number; currency: string } | null;
}

export default function CreatorWalletScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'analytics'>('overview');
  const scrollY = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const fetchDashboard = useCallback(async () => {
    try {
      const response = await awsAPI.request('/payments/wallet', {
        method: 'POST',
        body: { action: 'get-dashboard' },
      }) as { success?: boolean; dashboard?: typeof dashboard };
      if (response.success && response.dashboard) {
        setDashboard(response.dashboard);
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch dashboard:', (error as Error).message);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const response = await awsAPI.request('/payments/wallet', {
        method: 'POST',
        body: { action: 'get-transactions', limit: 20 },
      }) as { success?: boolean; transactions?: typeof transactions };
      if (response.success && response.transactions) {
        setTransactions(response.transactions);
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch transactions:', (error as Error).message);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchDashboard(), fetchTransactions()]);
    setLoading(false);
  }, [fetchDashboard, fetchTransactions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const tierColors = dashboard?.tier ? TIER_COLORS[dashboard.tier.name as keyof typeof TIER_COLORS] || TIER_COLORS.Bronze : TIER_COLORS.Bronze;

  const openStripeDashboard = async () => {
    try {
      const response = await awsAPI.request('/payments/wallet', {
        method: 'POST',
        body: { action: 'get-stripe-dashboard-link' },
      }) as { success?: boolean; url?: string };
      if (response.success && response.url) {
        // Open in browser or WebView
        navigation.navigate('WebView', { url: response.url, title: 'Stripe Dashboard' });
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to get Stripe dashboard link:', (error as Error).message);
    }
  };

  const renderHeader = () => (
    <LinearGradient
      colors={GRADIENTS.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.header, { paddingTop: insets.top + 10 }]}
    >
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet</Text>
        <TouchableOpacity onPress={openStripeDashboard} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {dashboard && (
        <>
          {/* Balance Card */}
          <View style={styles.balanceCard}>
            <BlurView intensity={20} tint="light" style={styles.balanceBlur}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              <Text style={styles.balanceAmount}>
                {dashboard.balance ? formatCurrency(dashboard.balance.available) : '$0.00'}
              </Text>
              {dashboard.balance && dashboard.balance.pending > 0 && (
                <Text style={styles.pendingAmount}>
                  +{formatCurrency(dashboard.balance.pending)} pending
                </Text>
              )}
            </BlurView>
          </View>

          {/* Tier Badge */}
          <View style={styles.tierContainer}>
            <LinearGradient
              colors={tierColors.gradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tierBadge}
            >
              <Ionicons
                name={dashboard.tier.name === 'Diamond' ? 'diamond' : 'trophy'}
                size={16}
                color={dashboard.tier.name === 'Gold' ? '#333' : 'white'}
              />
              <Text style={[styles.tierText, dashboard.tier.name === 'Gold' && { color: '#333' }]}>
                {dashboard.tier.name} Creator
              </Text>
            </LinearGradient>
            <Text style={styles.tierShare}>{dashboard.tier.creatorPercent}% revenue share</Text>
          </View>

          {/* Progress to next tier */}
          {dashboard.tier.nextTier && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, (dashboard.profile.fanCount / (dashboard.profile.fanCount + dashboard.tier.nextTier.fansNeeded)) * 100)}%` }
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {formatNumber(dashboard.tier.nextTier.fansNeeded)} fans to {dashboard.tier.nextTier.name}
              </Text>
            </View>
          )}
        </>
      )}
    </LinearGradient>
  );

  const renderStats = () => (
    <View style={styles.statsContainer}>
      <View style={styles.statCard}>
        <View style={styles.statIconContainer}>
          <Ionicons name="trending-up" size={20} color={colors.primary} />
        </View>
        <Text style={styles.statValue}>{formatCurrency(dashboard?.earnings.thisMonth.total || 0)}</Text>
        <Text style={styles.statLabel}>This Month</Text>
      </View>
      <View style={styles.statCard}>
        <View style={styles.statIconContainer}>
          <Ionicons name="wallet" size={20} color={colors.primary} />
        </View>
        <Text style={styles.statValue}>{formatCurrency(dashboard?.earnings.lifetime.total || 0)}</Text>
        <Text style={styles.statLabel}>Lifetime</Text>
      </View>
      <View style={styles.statCard}>
        <View style={styles.statIconContainer}>
          <Ionicons name="people" size={20} color={colors.primary} />
        </View>
        <Text style={styles.statValue}>{formatNumber(dashboard?.subscribers.active || 0)}</Text>
        <Text style={styles.statLabel}>Subscribers</Text>
      </View>
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      {(['overview', 'transactions', 'analytics'] as const).map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, activeTab === tab && styles.tabActive]}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderOverview = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Revenue Breakdown</Text>
      {dashboard?.earnings.breakdown.map((item) => (
        <View key={item.type} style={styles.breakdownItem}>
          <View style={styles.breakdownLeft}>
            <View style={[styles.breakdownIcon, { backgroundColor: item.type === 'channel' ? '#E8F5E9' : item.type === 'session' ? '#E3F2FD' : '#FFF3E0' }]}>
              <Ionicons
                name={item.type === 'channel' ? 'videocam' : item.type === 'session' ? 'calendar' : 'cube'}
                size={18}
                color={item.type === 'channel' ? '#4CAF50' : item.type === 'session' ? '#2196F3' : '#FF9800'}
              />
            </View>
            <View>
              <Text style={styles.breakdownType}>
                {item.type === 'channel' ? 'Channel Subscriptions' : item.type === 'session' ? 'Sessions' : 'Packs'}
              </Text>
              <Text style={styles.breakdownCount}>{item.count} transactions</Text>
            </View>
          </View>
          <Text style={styles.breakdownAmount}>{formatCurrency(item.earnings)}</Text>
        </View>
      ))}

      {!dashboard?.profile.hasStripeConnect && (
        <TouchableOpacity
          style={styles.setupStripeButton}
          onPress={() => { /* TODO: StripeConnect screen */ }}
        >
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.setupStripeGradient}
          >
            <Ionicons name="card" size={20} color="white" />
            <Text style={styles.setupStripeText}>Set up payouts with Stripe</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderTransactions = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Recent Transactions</Text>
      {transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="receipt-outline" size={48} color={colors.gray} />
          <Text style={styles.emptyText}>No transactions yet</Text>
        </View>
      ) : (
        transactions.map((tx) => (
          <View key={tx.id} style={styles.transactionItem}>
            <View style={styles.transactionLeft}>
              <View style={[styles.transactionIcon, { backgroundColor: tx.type === 'channel' ? '#E8F5E9' : '#E3F2FD' }]}>
                <Ionicons
                  name={tx.type === 'channel' ? 'videocam' : tx.type === 'session' ? 'calendar' : 'cube'}
                  size={18}
                  color={tx.type === 'channel' ? '#4CAF50' : '#2196F3'}
                />
              </View>
              <View>
                <Text style={styles.transactionTitle}>{tx.buyer.name || tx.buyer.username}</Text>
                <Text style={styles.transactionSubtitle}>
                  {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} • {new Date(tx.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
            <View style={styles.transactionRight}>
              <Text style={styles.transactionAmount}>+{formatCurrency(tx.amounts.creatorAmount)}</Text>
              <Text style={styles.transactionStatus}>{tx.status}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );

  const renderAnalytics = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Analytics</Text>
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsLabel}>Average per transaction</Text>
        <Text style={styles.analyticsValue}>
          {dashboard?.earnings.lifetime.transactions
            ? formatCurrency(dashboard.earnings.lifetime.total / dashboard.earnings.lifetime.transactions)
            : '$0.00'}
        </Text>
      </View>
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsLabel}>Transactions this month</Text>
        <Text style={styles.analyticsValue}>{dashboard?.earnings.thisMonth.transactions || 0}</Text>
      </View>
      <TouchableOpacity
        style={styles.viewMoreButton}
        onPress={() => { /* TODO: WalletAnalytics screen */ }}
      >
        <Text style={styles.viewMoreText}>View detailed analytics</Text>
        <Ionicons name="arrow-forward" size={16} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        {renderHeader()}
        {renderStats()}
        {renderTabs()}
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'transactions' && renderTransactions()}
        {activeTab === 'analytics' && renderAnalytics()}
        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: 'white',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  balanceBlur: {
    padding: 24,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 42,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -1,
  },
  pendingAmount: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  tierContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  tierText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'white',
  },
  tierShare: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressBar: {
    width: '80%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -20,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: colors.gray,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 4,
    ...SHADOWS.card,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray,
  },
  tabTextActive: {
    color: 'white',
  },
  section: {
    padding: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 16,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    ...SHADOWS.card,
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  breakdownIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  breakdownType: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  breakdownCount: {
    fontSize: 13,
    color: colors.gray,
  },
  breakdownAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  setupStripeButton: {
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  setupStripeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  setupStripeText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundSecondary,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    ...SHADOWS.card,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  transactionSubtitle: {
    fontSize: 13,
    color: colors.gray,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#22C55E',
  },
  transactionStatus: {
    fontSize: 12,
    color: colors.gray,
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.gray,
    marginTop: 12,
  },
  analyticsCard: {
    backgroundColor: colors.backgroundSecondary,
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    ...SHADOWS.card,
  },
  analyticsLabel: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 4,
  },
  analyticsValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.dark,
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  viewMoreText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});
