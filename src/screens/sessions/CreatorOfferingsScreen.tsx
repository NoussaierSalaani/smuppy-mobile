import { AvatarImage } from '../../components/OptimizedImage';

/**
 * Creator Offerings Screen
 * Shows all offerings from a creator: Sessions, Packs, Channel Subscription
 * Fan/Member perspective
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SkeletonBase, SkeletonLine } from '../../components/skeleton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { useCurrency } from '../../hooks/useCurrency';
import { awsAPI, SessionPack } from '../../services/aws-api';

type TabType = 'sessions' | 'packs' | 'channel';

interface SessionOffering {
  id: string;
  duration: number; // minutes
  price: number;
  description: string;
}

interface Pack {
  id: string;
  name: string;
  description: string;
  sessionsIncluded: number;
  sessionDuration: number;
  validityDays: number;
  price: number;
  savings: number; // percentage saved vs individual sessions
  popular?: boolean;
}

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
  avatar: string | null;
  verified: boolean;
  bio: string;
  subscribersCount: number;
}

type RouteParams = {
  CreatorOfferings: { creatorId: string };
};

// Channel tiers are static for now (could be fetched from API in future)
const defaultChannelTiers: ChannelTier[] = [
  {
    id: 't1',
    name: 'Fan',
    price: 4.99,
    perks: [
      'Access to exclusive content',
      'Fan badge in comments',
      'Custom emojis',
    ],
  },
  {
    id: 't2',
    name: 'Super Fan',
    price: 9.99,
    perks: [
      'Everything in Fan tier',
      'Access to private Lives',
      'Priority DM responses',
      '10% off sessions',
    ],
    popular: true,
  },
  {
    id: 't3',
    name: 'VIP',
    price: 24.99,
    perks: [
      'Everything in Super Fan tier',
      '1 free session per month',
      'Access to private group',
      'Monthly group call',
      '25% off packs',
    ],
  },
];

const CreatorOfferingsScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const route = useRoute<RouteProp<RouteParams, 'CreatorOfferings'>>();
  const { colors, isDark } = useTheme();
  const { formatAmount } = useCurrency();
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [sessionOfferings, setSessionOfferings] = useState<SessionOffering[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [channelTiers] = useState<ChannelTier[]>(defaultChannelTiers);

  const creatorId = route.params?.creatorId;

  const fetchCreatorData = useCallback(async () => {
    if (!creatorId) return;

    try {
      setLoading(true);

      // Fetch creator profile
      try {
        const profile = await awsAPI.getProfile(creatorId);
        if (profile) {
          setCreator({
            id: profile.id,
            name: profile.fullName || profile.username,
            username: profile.username,
            avatar: profile.avatarUrl || null,
            verified: profile.isVerified,
            bio: profile.bio || '',
            subscribersCount: profile.followersCount,
          });
        }
      } catch (err) {
        if (__DEV__) console.warn('Failed to fetch profile:', err);
      }

      // Fetch creator's availability (session offerings)
      try {
        const availabilityResponse = await awsAPI.getCreatorAvailability(creatorId);
        if (availabilityResponse.success && availabilityResponse.availableSlots) {
          // Extract unique durations and prices from availability
          const uniqueOfferings = new Map<number, SessionOffering>();
          // Use creator info for base pricing
          const basePrice = availabilityResponse.creator?.sessionPrice || 50;
          const baseDuration = availabilityResponse.creator?.sessionDuration || 60;

          // Add default session offerings based on creator settings
          [30, 45, 60, 90].forEach(duration => {
            const priceMultiplier = duration / baseDuration;
            uniqueOfferings.set(duration, {
              id: `s${duration}`,
              duration: duration,
              price: Math.round(basePrice * priceMultiplier * 100) / 100,
              description: getSessionDescription(duration),
            });
          });
          setSessionOfferings(Array.from(uniqueOfferings.values()).sort((a, b) => a.duration - b.duration));
        }
      } catch (err) {
        if (__DEV__) console.warn('Failed to fetch availability:', err);
      }

      // Fetch creator's packs
      try {
        const packsResponse = await awsAPI.listCreatorPacks(creatorId);
        if (packsResponse.success && packsResponse.packs) {
          setPacks(packsResponse.packs.map((pack: SessionPack) => ({
            id: pack.id,
            name: pack.name,
            description: pack.description || '',
            sessionsIncluded: pack.sessionsIncluded,
            sessionDuration: pack.sessionDuration,
            validityDays: pack.validityDays,
            price: pack.price,
            savings: pack.savings || 0,
          })));
        }
      } catch (err) {
        if (__DEV__) console.warn('Failed to fetch packs:', err);
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch creator data:', error);
    } finally {
      setLoading(false);
    }
  }, [creatorId]);

  useEffect(() => {
    fetchCreatorData();
  }, [fetchCreatorData]);

  const getSessionDescription = (duration: number): string => {
    switch (duration) {
      case 30: return 'Quick session - Ideal for follow-ups';
      case 45: return 'Standard session - Full coaching';
      case 60: return 'Long session - In-depth analysis';
      case 90: return 'Premium session - Personalized program';
      default: return `${duration}-minute session`;
    }
  };

  const handleBookSession = useCallback((offering: SessionOffering) => {
    if (!creator) return;
    navigation.navigate('BookSession', {
      creatorId: creator.id,
      preselectedDuration: offering.duration,
    });
  }, [creator, navigation]);

  const handleBuyPack = useCallback((pack: Pack) => {
    if (!creator) return;
    navigation.navigate('PackPurchase', {
      creatorId: creator.id,
      pack,
    });
  }, [creator, navigation]);

  const handleSubscribeChannel = useCallback((tier: ChannelTier) => {
    if (!creator) return;
    navigation.navigate('ChannelSubscribe', {
      creatorId: creator.id,
      tier,
    });
  }, [creator, navigation]);

  // Extracted handlers
  const handleGoBack = useCallback(() => navigation.goBack(), [navigation]);
  const handleTabSessions = useCallback(() => setActiveTab('sessions'), []);
  const handleTabPacks = useCallback(() => setActiveTab('packs'), []);
  const handleTabChannel = useCallback(() => setActiveTab('channel'), []);
  const handleNavigateCreatorProfile = useCallback(() => {
    if (creator) navigation.navigate('UserProfile', { userId: creator.id });
  }, [creator, navigation]);

  const renderSessionsTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Book a 1:1 video session with {creator?.name || 'this creator'}
      </Text>
      {sessionOfferings.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="videocam-outline" size={48} color={colors.gray} />
          <Text style={styles.emptyStateText}>No sessions available</Text>
        </View>
      ) : null}
      {sessionOfferings.map(offering => (
        <TouchableOpacity
          key={offering.id}
          style={styles.offeringCard}
          onPress={() => handleBookSession(offering)}
        >
          <View style={styles.offeringHeader}>
            <View style={styles.durationBadge}>
              <Ionicons name="time" size={16} color={colors.primary} />
              <Text style={styles.durationText}>{offering.duration} min</Text>
            </View>
            <Text style={styles.offeringPrice}>{formatAmount(Math.round(offering.price * 100))}</Text>
          </View>
          <Text style={styles.offeringDescription}>{offering.description}</Text>
          <View style={styles.offeringFooter}>
            <Text style={styles.bookNowText}>Book</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderPacksTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Save with monthly session packs
      </Text>
      {packs.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="cube-outline" size={48} color={colors.gray} />
          <Text style={styles.emptyStateText}>No packs available</Text>
        </View>
      ) : null}
      {packs.map(pack => (
        <TouchableOpacity
          key={pack.id}
          style={[styles.packCard, pack.popular && styles.packCardPopular]}
          onPress={() => handleBuyPack(pack)}
        >
          {pack.popular && (
            <View style={styles.popularBadge}>
              <Ionicons name="star" size={12} color={colors.white} />
              <Text style={styles.popularText}>Popular</Text>
            </View>
          )}
          <View style={styles.packHeader}>
            <Text style={styles.packName}>{pack.name}</Text>
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsText}>-{pack.savings}%</Text>
            </View>
          </View>
          <Text style={styles.packDescription}>{pack.description}</Text>
          <View style={styles.packDetails}>
            <View style={styles.packDetailItem}>
              <Ionicons name="videocam-outline" size={18} color={colors.gray} />
              <Text style={styles.packDetailText}>{pack.sessionsIncluded} sessions</Text>
            </View>
            <View style={styles.packDetailItem}>
              <Ionicons name="time-outline" size={18} color={colors.gray} />
              <Text style={styles.packDetailText}>{pack.sessionDuration} min/session</Text>
            </View>
            <View style={styles.packDetailItem}>
              <Ionicons name="calendar-outline" size={18} color={colors.gray} />
              <Text style={styles.packDetailText}>Valid {pack.validityDays} days</Text>
            </View>
          </View>
          <View style={styles.packFooter}>
            <View>
              <Text style={styles.packPrice}>{formatAmount(Math.round(pack.price * 100))}</Text>
              <Text style={styles.perSessionPrice}>
                {formatAmount(Math.round((pack.price / pack.sessionsIncluded) * 100))}/session
              </Text>
            </View>
            <TouchableOpacity style={styles.buyButton} onPress={() => handleBuyPack(pack)}>
              <Text style={styles.buyButtonText}>Buy</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderChannelTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabDescription}>
        Join the community and access exclusive content
      </Text>
      {channelTiers.map(tier => (
        <TouchableOpacity
          key={tier.id}
          style={[styles.tierCard, tier.popular && styles.tierCardPopular]}
          onPress={() => handleSubscribeChannel(tier)}
        >
          {tier.popular && (
            <LinearGradient
              colors={[colors.primary, colors.cyanBlue]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.tierPopularBadge}
            >
              <Text style={styles.tierPopularText}>Recommended</Text>
            </LinearGradient>
          )}
          <View style={styles.tierHeader}>
            <Text style={styles.tierName}>{tier.name}</Text>
            <View style={styles.tierPriceContainer}>
              <Text style={styles.tierPrice}>{formatAmount(Math.round(tier.price * 100))}</Text>
              <Text style={styles.tierPeriod}>/mo</Text>
            </View>
          </View>
          <View style={styles.tierPerks}>
            {tier.perks.map((perk, index) => (
              <View key={index} style={styles.perkRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                <Text style={styles.perkText}>{perk}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.subscribeButton, tier.popular && styles.subscribeButtonPopular]}
            onPress={() => handleSubscribeChannel(tier)}
          >
            {tier.popular ? (
              <LinearGradient
                colors={[colors.primary, colors.cyanBlue]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.subscribeGradient}
              >
                <Text style={styles.subscribeButtonText}>Subscribe</Text>
              </LinearGradient>
            ) : (
              <Text style={styles.subscribeButtonTextOutline}>Subscribe</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const containerStyle = useMemo(() => [styles.container, { paddingTop: insets.top }], [styles.container, insets.top]);
  const errorContainerStyle = useMemo(() => [styles.container, { paddingTop: insets.top, justifyContent: 'center' as const, alignItems: 'center' as const }], [styles.container, insets.top]);
  const bottomSpacerStyle = useMemo(() => ({ height: insets.bottom + 20 }), [insets.bottom]);

  if (loading) {
    return (
      <View style={containerStyle}>
        <View style={styles.header}>
          <SkeletonBase width={40} height={40} borderRadius={20} />
          <SkeletonBase width={100} height={20} borderRadius={10} />
          <View style={styles.skeletonHeaderSpacer} />
        </View>
        <View style={styles.skeletonCreatorRow}>
          <SkeletonBase width={64} height={64} borderRadius={32} />
          <View style={styles.skeletonNameContainer}>
            <SkeletonLine width="60%" height={18} />
            <SkeletonLine width="40%" height={13} style={styles.skeletonLineSpacing} />
          </View>
        </View>
        <View style={styles.skeletonTabsRow}>
          <SkeletonBase width={100} height={44} borderRadius={10} />
          <SkeletonBase width={100} height={44} borderRadius={10} />
          <SkeletonBase width={100} height={44} borderRadius={10} />
        </View>
        <View style={styles.skeletonContent}>
          <SkeletonLine width="70%" height={14} />
          <SkeletonBase width={340} height={120} borderRadius={16} style={styles.skeletonCardFirst} />
          <SkeletonBase width={340} height={120} borderRadius={16} style={styles.skeletonCardNext} />
        </View>
      </View>
    );
  }

  if (!creator) {
    return (
      <View style={errorContainerStyle}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.gray} />
        <Text style={styles.errorText}>Creator not found</Text>
        <TouchableOpacity onPress={handleGoBack} style={styles.errorGoBackButton}>
          <Text style={styles.errorGoBackText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={isDark ? colors.white : colors.dark} />
        </TouchableOpacity>
        <Text style={styles.title}>Offerings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Creator Info */}
        <TouchableOpacity
          style={styles.creatorCard}
          onPress={handleNavigateCreatorProfile}
        >
          <AvatarImage source={creator.avatar} size={64} style={styles.creatorAvatar} />
          <View style={styles.creatorInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.creatorName}>{creator.name}</Text>
              {creator.verified && (
                <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
              )}
            </View>
            <Text style={styles.subscribersCount}>
              {creator.subscribersCount.toLocaleString()} subscribers
            </Text>
          </View>
        </TouchableOpacity>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'sessions' && styles.activeTab]}
            onPress={handleTabSessions}
          >
            <Ionicons
              name="videocam"
              size={20}
              color={activeTab === 'sessions' ? colors.primary : colors.gray}
            />
            <Text style={[styles.tabText, activeTab === 'sessions' && styles.activeTabText]}>
              Sessions
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'packs' && styles.activeTab]}
            onPress={handleTabPacks}
          >
            <Ionicons
              name="cube"
              size={20}
              color={activeTab === 'packs' ? colors.primary : colors.gray}
            />
            <Text style={[styles.tabText, activeTab === 'packs' && styles.activeTabText]}>
              Packs
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'channel' && styles.activeTab]}
            onPress={handleTabChannel}
          >
            <Ionicons
              name="heart"
              size={20}
              color={activeTab === 'channel' ? colors.primary : colors.gray}
            />
            <Text style={[styles.tabText, activeTab === 'channel' && styles.activeTabText]}>
              Channel
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        {activeTab === 'sessions' && renderSessionsTab()}
        {activeTab === 'packs' && renderPacksTab()}
        {activeTab === 'channel' && renderChannelTab()}

        <View style={bottomSpacerStyle} />
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
    color: isDark ? colors.white : colors.dark,
  },
  placeholder: {
    width: 40,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
  },
  creatorAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 14,
  },
  creatorInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creatorName: {
    fontSize: 18,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  creatorUsername: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 2,
  },
  subscribersCount: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 4,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: colors.primary + '20',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray,
  },
  activeTabText: {
    color: colors.primary,
  },
  tabContent: {
    paddingHorizontal: 16,
  },
  tabDescription: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 16,
    lineHeight: 20,
  },
  // Sessions
  offeringCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  offeringHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary + '20',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  offeringPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  offeringDescription: {
    fontSize: 14,
    color: colors.grayLight,
    marginBottom: 12,
  },
  offeringFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  bookNowText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  // Packs
  packCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  packCardPopular: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  popularText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  packHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packName: {
    fontSize: 18,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  savingsBadge: {
    backgroundColor: '#22C55E20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  savingsText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#22C55E',
  },
  packDescription: {
    fontSize: 14,
    color: colors.grayLight,
    marginBottom: 16,
  },
  packDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  packDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  packDetailText: {
    fontSize: 13,
    color: colors.gray,
  },
  packFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.background,
  },
  packPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: isDark ? colors.white : colors.dark,
  },
  perSessionPrice: {
    fontSize: 12,
    color: colors.gray,
    marginTop: 2,
  },
  buyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  // Channel Tiers
  tierCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  tierCardPopular: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  tierPopularBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  tierPopularText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tierName: {
    fontSize: 20,
    fontWeight: '700',
    color: isDark ? colors.white : colors.dark,
  },
  tierPriceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  tierPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
  },
  tierPeriod: {
    fontSize: 14,
    color: colors.gray,
    marginLeft: 2,
  },
  tierPerks: {
    marginBottom: 16,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  perkText: {
    fontSize: 14,
    color: colors.grayLight,
    flex: 1,
  },
  subscribeButton: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  subscribeButtonPopular: {
    borderWidth: 0,
  },
  subscribeGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  subscribeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    paddingVertical: 14,
  },
  subscribeButtonTextOutline: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    paddingVertical: 14,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    color: colors.gray,
    marginTop: 12,
  },
  errorText: {
    color: colors.gray,
    marginTop: 16,
  },
  errorGoBackButton: {
    marginTop: 16,
  },
  errorGoBackText: {
    color: colors.primary,
  },
  skeletonHeaderSpacer: {
    width: 40,
  },
  skeletonCreatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 16,
  },
  skeletonNameContainer: {
    marginLeft: 14,
    flex: 1,
  },
  skeletonLineSpacing: {
    marginTop: 8,
  },
  skeletonTabsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 20,
    gap: 8,
  },
  skeletonContent: {
    paddingHorizontal: 16,
  },
  skeletonCardFirst: {
    marginTop: 16,
  },
  skeletonCardNext: {
    marginTop: 12,
  },
});

export default CreatorOfferingsScreen;
