/**
 * BusinessDashboardScreen
 * Simplified dashboard for business owners — 3 main actions + compact stats
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores';
import type { IconName } from '../../types';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface Props {
  navigation: any;
}

interface DashboardStats {
  todayBookings: number;
  activeMembers: number;
}

interface ActionCard {
  id: string;
  label: string;
  description: string;
  icon: IconName;
  color: string;
  screen: string;
  params?: object;
}

const ACTION_CARDS: ActionCard[] = [
  {
    id: 'offers',
    label: 'Mes Offres',
    description: 'Gérer vos services et tarifs',
    icon: 'pricetags',
    color: '#FF6B35',
    screen: 'BusinessServicesManage',
  },
  {
    id: 'program',
    label: 'Mon Programme',
    description: 'Planning et activités',
    icon: 'calendar',
    color: '#9B59B6',
    screen: 'BusinessProgram',
  },
  {
    id: 'scanner',
    label: 'Scanner Accès',
    description: 'Vérifier les QR codes',
    icon: 'qr-code',
    color: '#3498DB',
    screen: 'BusinessScanner',
  },
];

export default function BusinessDashboardScreen({ navigation }: Props) {
  const { colors, isDark } = useTheme();
  const user = useUserStore((state) => state.user);

  const [stats, setStats] = useState<DashboardStats | null>(null);
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
        setStats({
          todayBookings: response.stats.todayBookings ?? 0,
          activeMembers: response.stats.activeMembers ?? 0,
        });
      } else {
        setStats({ todayBookings: 0, activeMembers: 0 });
      }
    } catch (error) {
      if (__DEV__) console.error('Load dashboard error:', error);
      setStats({ todayBookings: 0, activeMembers: 0 });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadDashboard();
  }, []);

  const handleAction = useCallback((action: ActionCard) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate(action.screen, action.params);
  }, [navigation]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
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
            <Text style={styles.businessName} numberOfLines={1}>
              {user?.businessName || user?.fullName || 'Business'}
            </Text>
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
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Action Cards */}
          <View style={styles.cardsContainer}>
            {ACTION_CARDS.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={styles.actionCard}
                onPress={() => handleAction(action)}
                activeOpacity={0.7}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: `${action.color}20` }]}>
                  <Ionicons name={action.icon} size={32} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
                <Text style={styles.actionDescription}>{action.description}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.gray}
                  style={styles.actionChevron}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Compact Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} />
              <Text style={styles.statValue}>{stats?.todayBookings ?? 0}</Text>
              <Text style={styles.statLabel}>réservations aujourd'hui</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Ionicons name="people-outline" size={16} color={colors.primary} />
              <Text style={styles.statValue}>{stats?.activeMembers ?? 0}</Text>
              <Text style={styles.statLabel}>membres actifs</Text>
            </View>
          </View>
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
  businessName: {
    fontSize: 22,
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // Action Cards
  cardsContainer: {
    gap: 14,
    marginTop: 12,
  },
  actionCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    flex: 1,
  },
  actionDescription: {
    display: 'none',
  },
  actionChevron: {
    marginLeft: 8,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  statLabel: {
    fontSize: 12,
    color: colors.gray,
    flex: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.grayBorder,
    marginHorizontal: 12,
  },
});
