/**
 * BusinessDashboardScreen
 * Main dashboard for business owners to manage their business
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useUserStore } from '../../stores';
import type { IconName } from '../../types';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width } = Dimensions.get('window');

interface Props {
  navigation: any;
}

interface DashboardStats {
  todayBookings: number;
  activeMembers: number;
  monthlyRevenue: number;
  pendingRequests: number;
  todayCheckIns: number;
  upcomingClasses: number;
}

interface QuickAction {
  id: string;
  label: string;
  icon: IconName;
  color: string;
  screen: string;
  params?: object;
}

interface RecentActivity {
  id: string;
  type: 'booking' | 'check_in' | 'subscription' | 'cancellation';
  memberName: string;
  serviceName?: string;
  time: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { id: 'scanner', label: 'Scan Access', icon: 'qr-code', color: '#0EBF8A', screen: 'BusinessScanner' },
  { id: 'services', label: 'Services', icon: 'pricetags', color: '#FF6B35', screen: 'BusinessServicesManage' },
  { id: 'schedule', label: 'Schedule', icon: 'calendar', color: '#9B59B6', screen: 'BusinessProgram', params: { tab: 'schedule' } },
  { id: 'upload', label: 'Upload Program', icon: 'cloud-upload', color: '#3498DB', screen: 'BusinessScheduleUpload' },
];

export default function BusinessDashboardScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const user = useUserStore((state) => state.user);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const response = await awsAPI.getBusinessDashboard();

      if (response.success && response.stats) {
        setStats(response.stats);
        setRecentActivity(response.recentActivity || []);
      } else {
        // Demo data
        setStats({
          todayBookings: 12,
          activeMembers: 234,
          monthlyRevenue: 4520000, // in cents
          pendingRequests: 3,
          todayCheckIns: 45,
          upcomingClasses: 8,
        });
        setRecentActivity([
          { id: '1', type: 'check_in', memberName: 'Sophie Martin', time: '2 min ago' },
          { id: '2', type: 'booking', memberName: 'Lucas Dubois', serviceName: 'Yoga Class', time: '15 min ago' },
          { id: '3', type: 'subscription', memberName: 'Emma Bernard', time: '1h ago' },
          { id: '4', type: 'check_in', memberName: 'Thomas Petit', time: '1h ago' },
        ]);
      }
    } catch (error) {
      if (__DEV__) console.error('Load dashboard error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadDashboard();
  }, []);

  const handleQuickAction = (action: QuickAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(action.screen, action.params);
  };

  const getActivityIcon = (type: string): IconName => {
    switch (type) {
      case 'check_in': return 'enter-outline';
      case 'booking': return 'calendar-outline';
      case 'subscription': return 'card-outline';
      case 'cancellation': return 'close-circle-outline';
      default: return 'ellipse-outline';
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'check_in': return colors.primary;
      case 'booking': return '#3498DB';
      case 'subscription': return '#9B59B6';
      case 'cancellation': return '#FF6B6B';
      default: return colors.gray;
    }
  };

  const getActivityText = (activity: RecentActivity) => {
    switch (activity.type) {
      case 'check_in': return `${activity.memberName} checked in`;
      case 'booking': return `${activity.memberName} booked ${activity.serviceName}`;
      case 'subscription': return `${activity.memberName} subscribed`;
      case 'cancellation': return `${activity.memberName} cancelled booking`;
      default: return activity.memberName;
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.background, colors.background]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color={colors.white} />
          </TouchableOpacity>
          <View style={styles.headerTitleBlock}>
            <Text style={styles.welcomeText}>Welcome back,</Text>
            <Text style={styles.businessName}>{user?.businessName || user?.fullName || 'Business'}</Text>
          </View>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={22} color={colors.white} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Stats Overview */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(14,191,138,0.2)', 'rgba(14,191,138,0.05)']} style={styles.statGradient}>
                <View style={styles.statIconContainer}>
                  <Ionicons name="calendar" size={24} color={colors.primary} />
                </View>
                <Text style={styles.statValue}>{stats?.todayBookings || 0}</Text>
                <Text style={styles.statLabel}>Today's Bookings</Text>
              </LinearGradient>
            </View>

            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(155,89,182,0.2)', 'rgba(155,89,182,0.05)']} style={styles.statGradient}>
                <View style={[styles.statIconContainer, { backgroundColor: 'rgba(155,89,182,0.2)' }]}>
                  <Ionicons name="people" size={24} color="#9B59B6" />
                </View>
                <Text style={styles.statValue}>{stats?.activeMembers || 0}</Text>
                <Text style={styles.statLabel}>Active Members</Text>
              </LinearGradient>
            </View>

            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(52,152,219,0.2)', 'rgba(52,152,219,0.05)']} style={styles.statGradient}>
                <View style={[styles.statIconContainer, { backgroundColor: 'rgba(52,152,219,0.2)' }]}>
                  <Ionicons name="enter" size={24} color="#3498DB" />
                </View>
                <Text style={styles.statValue}>{stats?.todayCheckIns || 0}</Text>
                <Text style={styles.statLabel}>Check-ins Today</Text>
              </LinearGradient>
            </View>

            <View style={styles.statCard}>
              <LinearGradient colors={['rgba(255,107,53,0.2)', 'rgba(255,107,53,0.05)']} style={styles.statGradient}>
                <View style={[styles.statIconContainer, { backgroundColor: 'rgba(255,107,53,0.2)' }]}>
                  <Ionicons name="cash" size={24} color="#FF6B35" />
                </View>
                <Text style={styles.statValue}>{formatAmount(stats?.monthlyRevenue || 0)}</Text>
                <Text style={styles.statLabel}>This Month</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              {QUICK_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={styles.actionCard}
                  onPress={() => handleQuickAction(action)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.actionIcon, { backgroundColor: `${action.color}20` }]}>
                    <Ionicons name={action.icon} size={28} color={action.color} />
                  </View>
                  <Text style={styles.actionLabel}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Today's Overview */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Overview</Text>
              <TouchableOpacity onPress={() => navigation.navigate('BusinessProgram', { tab: 'schedule' })}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.overviewCard}>
              <View style={styles.overviewRow}>
                <View style={styles.overviewItem}>
                  <Ionicons name="fitness" size={20} color={colors.primary} />
                  <View style={styles.overviewInfo}>
                    <Text style={styles.overviewValue}>{stats?.upcomingClasses || 0}</Text>
                    <Text style={styles.overviewLabel}>Classes Today</Text>
                  </View>
                </View>
                <View style={styles.overviewDivider} />
                <View style={styles.overviewItem}>
                  <Ionicons name="notifications" size={20} color="#FFD93D" />
                  <View style={styles.overviewInfo}>
                    <Text style={styles.overviewValue}>{stats?.pendingRequests || 0}</Text>
                    <Text style={styles.overviewLabel}>Pending</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Recent Activity */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <TouchableOpacity>
                <Text style={styles.seeAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activityList}>
              {recentActivity.map((activity) => (
                <View key={activity.id} style={styles.activityItem}>
                  <View style={[styles.activityIcon, { backgroundColor: `${getActivityColor(activity.type)}20` }]}>
                    <Ionicons name={getActivityIcon(activity.type)} size={18} color={getActivityColor(activity.type)} />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText} numberOfLines={1}>
                      {getActivityText(activity)}
                    </Text>
                    <Text style={styles.activityTime}>{activity.time}</Text>
                  </View>
                </View>
              ))}

              {recentActivity.length === 0 && (
                <View style={styles.emptyActivity}>
                  <Ionicons name="time-outline" size={32} color={colors.gray} />
                  <Text style={styles.emptyText}>No recent activity</Text>
                </View>
              )}
            </View>
          </View>

          {/* Management Tools */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Management</Text>
            <View style={styles.managementList}>
              <TouchableOpacity
                style={styles.managementItem}
                onPress={() => navigation.navigate('BusinessServicesManage')}
              >
                <View style={[styles.managementIcon, { backgroundColor: 'rgba(255,107,53,0.15)' }]}>
                  <Ionicons name="pricetags" size={22} color="#FF6B35" />
                </View>
                <View style={styles.managementContent}>
                  <Text style={styles.managementTitle}>Services & Products</Text>
                  <Text style={styles.managementDesc}>Manage your offerings and prices</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.gray} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.managementItem}
                onPress={() => navigation.navigate('BusinessProgram')}
              >
                <View style={[styles.managementIcon, { backgroundColor: 'rgba(155,89,182,0.15)' }]}>
                  <Ionicons name="calendar" size={22} color="#9B59B6" />
                </View>
                <View style={styles.managementContent}>
                  <Text style={styles.managementTitle}>Schedule & Activities</Text>
                  <Text style={styles.managementDesc}>Manage your weekly program</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.gray} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.managementItem}
                onPress={() => navigation.navigate('BusinessScheduleUpload')}
              >
                <View style={[styles.managementIcon, { backgroundColor: 'rgba(52,152,219,0.15)' }]}>
                  <Ionicons name="cloud-upload" size={22} color="#3498DB" />
                </View>
                <View style={styles.managementContent}>
                  <Text style={styles.managementTitle}>Upload Program</Text>
                  <Text style={styles.managementDesc}>AI-powered schedule extraction</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.gray} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.managementItem}
                onPress={() => navigation.navigate('BusinessProfile')}
              >
                <View style={[styles.managementIcon, { backgroundColor: 'rgba(14,191,138,0.15)' }]}>
                  <Ionicons name="people" size={22} color={colors.primary} />
                </View>
                <View style={styles.managementContent}>
                  <Text style={styles.managementTitle}>Members</Text>
                  <Text style={styles.managementDesc}>View and manage subscriptions</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.gray} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTitleBlock: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 4,
  },
  businessName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollView: {
    flex: 1,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    width: (width - 44) / 2,
    borderRadius: 20,
    overflow: 'hidden',
  },
  statGradient: {
    padding: 16,
    alignItems: 'flex-start',
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(14,191,138,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: colors.gray,
  },

  // Sections
  section: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 16,
  },
  seeAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },

  // Quick Actions
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: -8,
  },
  actionCard: {
    width: (width - 52) / 4,
    alignItems: 'center',
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 12,
    color: colors.grayLight,
    textAlign: 'center',
  },

  // Overview
  overviewCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 20,
    padding: 20,
    marginTop: -8,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  overviewItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  overviewInfo: {
    flex: 1,
  },
  overviewValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
  },
  overviewLabel: {
    fontSize: 13,
    color: colors.gray,
  },
  overviewDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.grayBorder,
    marginHorizontal: 16,
  },

  // Activity
  activityList: {
    backgroundColor: colors.cardBg,
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: -8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  activityIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 14,
    color: colors.white,
    marginBottom: 2,
  },
  activityTime: {
    fontSize: 12,
    color: colors.gray,
  },
  emptyActivity: {
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.gray,
  },

  // Management
  managementList: {
    backgroundColor: colors.cardBg,
    borderRadius: 20,
    overflow: 'hidden',
    marginTop: -8,
  },
  managementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  managementIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  managementContent: {
    flex: 1,
  },
  managementTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    marginBottom: 2,
  },
  managementDesc: {
    fontSize: 13,
    color: colors.gray,
  },
});
