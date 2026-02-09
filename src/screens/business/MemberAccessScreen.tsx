/**
 * MemberAccessScreen
 * Shows member QR code for gym/facility access
 * Business scans this to validate entry
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { awsAPI } from '../../services/aws-api';
import { useUserStore } from '../../stores/userStore';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatDateShort } from '../../utils/dateFormatters';

const { width } = Dimensions.get('window');
const QR_SIZE = width * 0.55;

interface Props {
  route: {
    params: {
      subscriptionId: string;
      businessId: string;
      businessName: string;
    };
  };
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void };
}

interface AccessPass {
  id: string;
  qrCode: string;
  memberName: string;
  membershipType: string;
  validUntil: string;
  status: 'active' | 'expired' | 'suspended';
  remainingSessions?: number;
  businessName: string;
  businessLogo?: string;
}

export default function MemberAccessScreen({ route, navigation }: Props) {
  const { colors, isDark } = useTheme();
  const { subscriptionId, businessId, businessName: _businessName } = route.params;
  const _user = useUserStore((state) => state.user);
  const _getFullName = useUserStore((state) => state.getFullName);

  const [accessPass, setAccessPass] = useState<AccessPass | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const isMountedRef = useRef(true);
  const isRefreshingRef = useRef(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Validate route params
  useEffect(() => {
    if (!subscriptionId || !businessId) {
      setError('Invalid access pass parameters');
      setIsLoading(false);
    }
  }, [subscriptionId, businessId]);

  useEffect(() => {
    isMountedRef.current = true;
    
    const loadAccessPass = async () => {
      if (!subscriptionId) return;
      
      try {
        const response = await awsAPI.getMemberAccessPass(subscriptionId);

        if (!isMountedRef.current) return;

        if (response.success && response.accessPass) {
          setAccessPass(response.accessPass);
          setError(null);
        } else {
          setError('Failed to load access pass');
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        if (__DEV__) console.warn('Load access pass error:', err);
        setError('Failed to load access pass. Please try again.');
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    loadAccessPass();

    // Pulse animation for QR container
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    // Glow animation
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();

    return () => {
      isMountedRef.current = false;
      pulse.stop();
      glow.stop();
    };
    // pulseAnim and glowAnim are refs, not needed in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscriptionId]);

  const handleRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await awsAPI.getMemberAccessPass(subscriptionId);
      
      if (!isMountedRef.current) return;
      
      if (response.success && response.accessPass) {
        setAccessPass(response.accessPass);
        setError(null);
      } else {
        setError('Failed to refresh access pass');
      }
    } catch (_err) {
      if (!isMountedRef.current) return;
      setError('Failed to refresh. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
      isRefreshingRef.current = false;
    }
  }, [subscriptionId]);

  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'active': return '#0EBF8A';
      case 'expired': return '#FF6B6B';
      case 'suspended': return '#FFD93D';
      default: return colors.gray;
    }
  }, [colors.gray]);

  const getStatusText = useCallback((status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'expired': return 'Expired';
      case 'suspended': return 'Suspended';
      default: return status;
    }
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading your access pass...</Text>
      </View>
    );
  }

  if (error || !accessPass) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={64} color="#FF6B6B" />
            <Text style={styles.errorText}>{error || 'Access pass not found'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.6],
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Access Pass</Text>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
            <Ionicons name="refresh" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Business Info */}
          <View style={styles.businessInfo}>
            <Text style={styles.businessName}>{accessPass?.businessName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(accessPass?.status || 'active')}20` }]}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(accessPass?.status || 'active') }]} />
              <Text style={[styles.statusText, { color: getStatusColor(accessPass?.status || 'active') }]}>
                {getStatusText(accessPass?.status || 'active')}
              </Text>
            </View>
          </View>

          {/* QR Code Card */}
          <Animated.View style={[styles.qrContainer, { transform: [{ scale: pulseAnim }] }]}>
            {/* Glow effect */}
            <Animated.View style={[styles.qrGlow, { opacity: glowOpacity }]} />

            <BlurView intensity={20} tint="dark" style={styles.qrCard}>
              <View style={styles.qrWrapper}>
                {/* Simple QR Code Pattern */}
                <View style={styles.qrPattern}>
                  {/* Top left corner */}
                  <View style={[styles.qrCorner, styles.qrCornerTL]} />
                  {/* Top right corner */}
                  <View style={[styles.qrCorner, styles.qrCornerTR]} />
                  {/* Bottom left corner */}
                  <View style={[styles.qrCorner, styles.qrCornerBL]} />
                  {/* Center pattern */}
                  <View style={styles.qrCenter}>
                    <Ionicons name="qr-code" size={QR_SIZE * 0.6} color="#0f0f1a" />
                  </View>
                  {/* Subscription ID */}
                  <Text style={styles.qrIdText}>{subscriptionId.slice(0, 8).toUpperCase()}</Text>
                </View>
              </View>

              {/* Member Info */}
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{accessPass?.memberName}</Text>
                <Text style={styles.membershipType}>{accessPass?.membershipType}</Text>
              </View>
            </BlurView>
          </Animated.View>

          {/* Pass Details */}
          <View style={styles.passDetails}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={20} color={colors.gray} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Valid Until</Text>
                <Text style={styles.detailValue}>{formatDateShort(accessPass?.validUntil || '')}</Text>
              </View>
            </View>

            {accessPass?.remainingSessions !== undefined && (
              <View style={styles.detailItem}>
                <Ionicons name="ticket-outline" size={20} color={colors.gray} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Sessions Left</Text>
                  <Text style={styles.detailValue}>{accessPass.remainingSessions}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Instructions */}
          <View style={styles.instructions}>
            <Ionicons name="scan" size={24} color={colors.primary} />
            <Text style={styles.instructionsText}>
              Show this QR code at the entrance for quick access
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.viewSubscriptionButton}
            onPress={() => navigation.navigate('MySubscriptions')}
          >
            <Text style={styles.viewSubscriptionText}>View Subscription Details</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
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
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: colors.gray,
  },

  // Error State
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: colors.gray,
    textAlign: 'center',
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
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
    color: colors.dark,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
  },

  // Business Info
  businessInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  businessName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // QR Container
  qrContainer: {
    position: 'relative',
    marginBottom: 24,
  },
  qrGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    backgroundColor: colors.primary,
    borderRadius: 40,
    opacity: 0.3,
  },
  qrCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 28,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  qrWrapper: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  qrPattern: {
    width: QR_SIZE,
    height: QR_SIZE,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  qrCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#0f0f1a',
    borderWidth: 6,
  },
  qrCornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  qrCornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  qrCornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  qrCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrIdText: {
    position: 'absolute',
    bottom: 8,
    fontSize: 12,
    fontWeight: '700',
    color: '#0f0f1a',
    letterSpacing: 2,
  },
  memberInfo: {
    alignItems: 'center',
  },
  memberName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  membershipType: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },

  // Pass Details
  passDetails: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    gap: 16,
    marginBottom: 20,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },

  // Instructions
  instructions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14,191,138,0.1)',
    padding: 14,
    borderRadius: 14,
    gap: 12,
    width: '100%',
  },
  instructionsText: {
    flex: 1,
    fontSize: 14,
    color: colors.primary,
  },

  // Footer
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 34,
  },
  viewSubscriptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  viewSubscriptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
});
