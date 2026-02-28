import React, { useState, useEffect } from 'react';
import { AppState, InteractionManager } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useUserStore } from '../stores/userStore';
import { useAppStore } from '../stores/appStore';
import { getCurrentProfile, getConversations } from '../services/database';
import { awsAPI } from '../services/aws-api';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';
import type { MainStackParamList } from '../types';
import { FEATURES } from '../config/featureFlags';
import { useAutoRegisterPushNotifications, useNotifications } from '../hooks/useNotifications';
import ErrorBoundary from '../components/ErrorBoundary';
import { lazyScreen, asScreen, screenWithBackSwipe } from './shared';

// Stacks
import SettingsStack from './stacks/SettingsStack';
import ProfileStack from './stacks/ProfileStack';
import NotificationsStack from './stacks/NotificationsStack';
import SearchStack from './stacks/SearchStack';
import HomeStack from './stacks/HomeStack';
import CreateStack from './stacks/CreateStack';

// Fetch both badge counts from server (module-level to avoid hook ordering issues)
const fetchBadgeCounts = (): void => {
  // Notification badge
  awsAPI.getUnreadCount()
    .then(({ unreadCount }) => {
      if (__DEV__) console.log('[Badges] notifications:', unreadCount);
      useAppStore.getState().setUnreadNotifications(unreadCount ?? 0);
    })
    .catch((err) => { if (__DEV__) console.warn('[Badges] notif fetch failed:', err); });

  // Message badge — use the same getConversations as MessagesScreen (proven code path)
  getConversations(50)
    .then(({ data, error }) => {
      if (error || !data) {
        if (__DEV__) console.warn('[Badges] msg fetch failed:', error);
        return;
      }
      const total = data.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
      if (__DEV__) console.log('[Badges] messages:', total, `(${data.length} convos)`);
      useAppStore.getState().setUnreadMessages(total);
    })
    .catch((err) => { if (__DEV__) console.warn('[Badges] msg fetch error:', err); });
};

// ============================================
// EAGER IMPORTS — Tab screens + high-frequency navigation
// ============================================

// Tab Screens
import FeedScreen from '../screens/home/FeedScreen';
import CreatePostScreen from '../screens/home/CreatePostScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import PeaksFeedScreen from '../screens/peaks/PeaksFeedScreen';

// High-frequency stack screens
import MessagesScreen from '../screens/messages/MessagesScreen';
import ChatScreen from '../screens/messages/ChatScreen';

// Components
import CreateOptionsPopup from '../components/CreateOptionsPopup';
import BottomNav from '../components/BottomNav';
import { resolveDisplayName } from '../types/profile';
import { ACCOUNT_TYPE, isPro } from '../config/accountTypes';

// ============================================
// LAZY IMPORTS — Non-core / deep screens
// ============================================

// Remaining lazy screens (not yet split into stacks)
const NewMessageScreen = lazyScreen(() => import('../screens/messages/NewMessageScreen'));
const PrescriptionPreferencesScreen = lazyScreen(() => import('../screens/settings/PrescriptionPreferencesScreen'));

// Live Streaming
const GoLiveIntroScreen = lazyScreen(() => import('../screens/live/GoLiveIntroScreen'));
const GoLiveScreen = lazyScreen(() => import('../screens/live/GoLiveScreen'));
const LiveStreamingScreen = lazyScreen(() => import('../screens/live/LiveStreamingScreen'));
const LiveEndedScreen = lazyScreen(() => import('../screens/live/LiveEndedScreen'));
const ViewerLiveStreamScreen = lazyScreen(() => import('../screens/live/ViewerLiveStreamScreen'));

// Battles Screens
const BattleLobbyScreen = lazyScreen(() => import('../screens/battles/BattleLobbyScreen'));
const BattleStreamScreen = lazyScreen(() => import('../screens/battles/BattleStreamScreen'));
const BattleResultsScreen = lazyScreen(() => import('../screens/battles/BattleResultsScreen'));
const InviteToBattleScreen = lazyScreen(() => import('../screens/battles/InviteToBattleScreen'));

// Events Screens
const EventListScreen = lazyScreen(() => import('../screens/events/EventListScreen'));
const EventManageScreen = lazyScreen(() => import('../screens/events/EventManageScreen'));

// Activity Screens (unified — CreateEventScreen is the final version with Event/Group toggle)
const CreateActivityScreen = lazyScreen(() => import('../screens/events/CreateEventScreen'));
const ActivityDetailScreen = lazyScreen(() => import('../screens/activities/ActivityDetailScreen'));

// Spot Screens
const SuggestSpotScreen = lazyScreen(() => import('../screens/spots/SuggestSpotScreen'));
const SpotDetailScreen = lazyScreen(() => import('../screens/spots/SpotDetailScreen'));

// Business Screens
const BusinessProfileScreen = lazyScreen(() => import('../screens/business/BusinessProfileScreen'));
const BusinessDiscoveryScreen = lazyScreen(() => import('../screens/business/BusinessDiscoveryScreen'));
const BusinessBookingScreen = lazyScreen(() => import('../screens/business/BusinessBookingScreen'));
const BusinessSubscriptionScreen = lazyScreen(() => import('../screens/business/BusinessSubscriptionScreen'));
const BusinessBookingSuccessScreen = lazyScreen(() => import('../screens/business/BusinessBookingSuccessScreen'));
const BusinessSubscriptionSuccessScreen = lazyScreen(() => import('../screens/business/BusinessSubscriptionSuccessScreen'));
const BusinessProgramScreen = lazyScreen(() => import('../screens/business/BusinessProgramScreen'));
const MySubscriptionsScreen = lazyScreen(() => import('../screens/business/MySubscriptionsScreen'));
const MemberAccessScreen = lazyScreen(() => import('../screens/business/MemberAccessScreen'));
const BusinessDashboardScreen = lazyScreen(() => import('../screens/business/BusinessDashboardScreen'));
const BusinessServicesManageScreen = lazyScreen(() => import('../screens/business/BusinessServicesManageScreen'));
const BusinessScheduleUploadScreen = lazyScreen(() => import('../screens/business/BusinessScheduleUploadScreen'));
const BusinessScannerScreen = lazyScreen(() => import('../screens/business/BusinessScannerScreen'));

// Private Sessions Screens
const BookSessionScreen = lazyScreen(() => import('../screens/sessions/BookSessionScreen'));
const SessionPaymentScreen = lazyScreen(() => import('../screens/sessions/SessionPaymentScreen'));
const SessionBookedScreen = lazyScreen(() => import('../screens/sessions/SessionBookedScreen'));
const WaitingRoomScreen = lazyScreen(() => import('../screens/sessions/WaitingRoomScreen'));
const PrivateCallScreen = lazyScreen(() => import('../screens/sessions/PrivateCallScreen'));
const SessionEndedScreen = lazyScreen(() => import('../screens/sessions/SessionEndedScreen'));
const PrivateSessionsManageScreen = lazyScreen(() => import('../screens/sessions/PrivateSessionsManageScreen'));
const MySessionsScreen = lazyScreen(() => import('../screens/sessions/MySessionsScreen'));
const SessionDetailScreen = lazyScreen(() => import('../screens/sessions/SessionDetailScreen'));
const CreatorOfferingsScreen = lazyScreen(() => import('../screens/sessions/CreatorOfferingsScreen'));
const PackPurchaseScreen = lazyScreen(() => import('../screens/sessions/PackPurchaseScreen'));
const PackPurchaseSuccessScreen = lazyScreen(() => import('../screens/sessions/PackPurchaseSuccessScreen'));
const ChannelSubscribeScreen = lazyScreen(() => import('../screens/sessions/ChannelSubscribeScreen'));
const SubscriptionSuccessScreen = lazyScreen(() => import('../screens/sessions/SubscriptionSuccessScreen'));
const CreatorEarningsScreen = lazyScreen(() => import('../screens/sessions/CreatorEarningsScreen'));

// Payment Screens
const CreatorWalletScreen = lazyScreen(() => import('../screens/payments/CreatorWalletScreen'));
const PlatformSubscriptionScreen = lazyScreen(() => import('../screens/payments/PlatformSubscriptionScreen'));
const ChannelSubscriptionScreen = lazyScreen(() => import('../screens/payments/ChannelSubscriptionScreen'));
const IdentityVerificationScreen = lazyScreen(() => import('../screens/payments/IdentityVerificationScreen'));
// PaymentMethodsScreen — removed for V1.0 (no monetization); restore in V3

// WebView
const WebViewScreen = lazyScreen(() => import('../screens/WebViewScreen'));

// Disputes & Resolution
const DisputeCenterScreen = lazyScreen(() => import('../screens/disputes/DisputeCenterScreen'));
const CreateDisputeScreen = lazyScreen(() => import('../screens/disputes/CreateDisputeScreen'));
const DisputeDetailScreen = lazyScreen(() => import('../screens/disputes/DisputeDetailScreen'));
const AdminDisputesScreen = lazyScreen(() => import('../screens/admin/AdminDisputesScreen'));

// Find Friends (standalone popup)
const FindFriendsScreen = lazyScreen(() => import('../screens/onboarding/FindFriendsScreen'));

// ============================================
// NAVIGATORS
// ============================================

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const AUTH_RETRY_DELAY_MS = 3000;
const PROFILE_STALE_MS = 60000; // 60s — skip re-fetch if profile was synced recently
// Use a resettable ref instead of module-level variable to prevent
// cross-user data leaks between login sessions.
const profileSyncState = { lastSyncAt: 0 };
export const resetProfileSyncState = () => { profileSyncState.lastSyncAt = 0; };



type TabNavigatorProps = Readonly<{
  navigation: NativeStackNavigationProp<MainStackParamList, 'Tabs'>;
}>;


function TabNavigator({ navigation }: TabNavigatorProps) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const user = useUserStore((state) => state.user);
  const isProCreator = isPro(user?.accountType);

  // Auto-trigger FindFriends popup ~30s after first mount
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const shown = await storage.get(STORAGE_KEYS.FIND_FRIENDS_SHOWN);
        if (!shown) {
          navigation.navigate('FindFriends');
        }
      } catch {
        // Expected: storage read may fail on first launch — FindFriends prompt is non-critical
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <ErrorBoundary name="TabNavigator" minimal>
      <>
        <Tab.Navigator id="MainTabs" tabBar={(props) => <BottomNav {...props} onCreatePress={() => setShowCreatePopup(true)} />} screenOptions={{ headerShown: false }}>
          <Tab.Screen name="Home" component={FeedScreen} />
          <Tab.Screen name="Peaks" component={PeaksFeedScreen} />
          <Tab.Screen name="CreateTab" component={asScreen(CreatePostScreen)} />
          <Tab.Screen name="Messages" component={MessagesScreen} />
          <Tab.Screen name="Profile" component={ProfileScreen} />
        </Tab.Navigator>

        <CreateOptionsPopup
          visible={showCreatePopup}
          onClose={() => setShowCreatePopup(false)}
          onSelectPost={() => { setShowCreatePopup(false); navigation.navigate('CreatePost'); }}
          onSelectPeak={() => { setShowCreatePopup(false); navigation.navigate('CreatePeak'); }}
          onSelectChallenge={FEATURES.CHALLENGES && user?.accountType === ACCOUNT_TYPE.PRO_CREATOR ? () => { setShowCreatePopup(false); navigation.navigate('Challenges'); } : undefined}
          onSelectEvent={FEATURES.CREATE_ACTIVITY && isProCreator ? () => { setShowCreatePopup(false); navigation.navigate('CreateActivity'); } : undefined}
        />
      </>
    </ErrorBoundary>
  );
}

export default function MainNavigator() {
  const setUser = useUserStore((state) => state.setUser);
  const currentUserId = useUserStore((state) => state.user?.id);
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);

  // Sync profile from database to Zustand store on mount
  // Deferred via InteractionManager so the first screen renders immediately
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      const syncProfile = async () => {
        // Skip if profile was synced recently (within 60s) or already in store
        const now = Date.now();
        if (currentUserId && isAuthenticated && (now - profileSyncState.lastSyncAt < PROFILE_STALE_MS)) {
          if (__DEV__) console.log('[MainNavigator] Profile fresh, skipping fetch');
          return;
        }

        try {
          const { data, error } = await getCurrentProfile();
          if (data && !error && data.id && data.username) {
            profileSyncState.lastSyncAt = Date.now();
            setUser({
              id: data.id,
              username: data.username,
              fullName: data.full_name || '',
              displayName: resolveDisplayName(data, data.display_name || data.full_name || ''),
              avatar: data.avatar_url || null,
              coverImage: data.cover_url || null,
              bio: data.bio || '',
              accountType: (data.account_type as 'personal' | 'pro_creator' | 'pro_business') || 'personal',
              isVerified: !!data.is_verified,
              isPremium: !!data.is_premium,
              interests: data.interests || [],
              expertise: data.expertise || [],
              businessName: data.business_name || '',
              businessCategory: data.business_category || '',
              businessAddress: data.business_address || '',
              businessLatitude: data.business_latitude,
              businessLongitude: data.business_longitude,
              stats: {
                fans: data.fan_count ?? 0,
                posts: data.post_count ?? 0,
              },
            });
          }
        } catch (err) {
          if (__DEV__) console.warn('[MainNavigator] Error syncing profile:', err);
        }
      };

      void syncProfile();

      // Fetch initial unread counts (retry in case auth token wasn't ready)
      fetchBadgeCounts();
    });

    const retryTimer = setTimeout(fetchBadgeCounts, AUTH_RETRY_DELAY_MS);
    return () => { handle.cancel(); clearTimeout(retryTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh badges when app returns from background + periodic polling
  useEffect(() => {
    const BADGE_POLL_MS = 60000; // 60s (push notifications handle real-time updates)
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startBadgePolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(fetchBadgeCounts, BADGE_POLL_MS);
    };

    const stopBadgePolling = () => {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    };

    startBadgePolling();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchBadgeCounts();
        startBadgePolling();
      } else {
        stopBadgePolling();
      }
    });

    return () => {
      stopBadgePolling();
      subscription.remove();
    };
  }, []);

  // Register for push notifications when user is logged in
  useAutoRegisterPushNotifications();

  // Handle incoming push notifications: update badge counts in real-time
  useNotifications({
    onNotificationReceived: (notification) => {
      const data = notification.request.content.data as { type?: string } | undefined;
      if (data?.type === 'message') {
        useAppStore.getState().setUnreadMessages((prev) => prev + 1);
      } else {
        useAppStore.getState().setUnreadNotifications((prev) => prev + 1);
      }
    },
  });

  return (
    <Stack.Navigator id="MainStack" screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />

      {/* Search Stack */}
      <Stack.Screen name="SearchStack" component={SearchStack} options={{ headerShown: false, animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Notifications Stack */}
      <Stack.Screen name="NotificationsStack" component={NotificationsStack} options={{ headerShown: false, animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="Chat" component={asScreen(ChatScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Create Stack */}
      <Stack.Screen name="CreateStack" component={CreateStack} options={{ headerShown: false, animation: 'slide_from_bottom' }} />

      {/* Profile Stack */}
      <Stack.Screen name="ProfileStack" component={ProfileStack} options={{ headerShown: false, animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Home Stack (post details, peaks, prescriptions) */}
      <Stack.Screen name="HomeStack" component={HomeStack} options={{ headerShown: false, animation: 'fade' }} />

      {/* Settings Stack */}
      <Stack.Screen name="SettingsStack" component={SettingsStack} options={{ headerShown: false, animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Remaining screens (not yet in stacks) */}
      <Stack.Screen name="PrescriptionPreferences" component={PrescriptionPreferencesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Live Streaming */}
      {FEATURES.GO_LIVE && (
      <>
      <Stack.Screen name="GoLiveIntro" component={GoLiveIntroScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="GoLive" component={GoLiveScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="LiveStreaming" component={LiveStreamingScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="LiveEnded" component={LiveEndedScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      </>
      )}
      {FEATURES.VIEWER_LIVE_STREAM && (
      <Stack.Screen name="ViewerLiveStream" component={ViewerLiveStreamScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      )}

      {/* Live Battles */}
      {FEATURES.BATTLES && (
      <>
      <Stack.Screen name="BattleLobby" component={BattleLobbyScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="BattleStream" component={BattleStreamScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="BattleResults" component={BattleResultsScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="InviteToBattle" component={InviteToBattleScreen} options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
      </>
      )}

      {/* Activities (unified — events + groups) */}
      {FEATURES.CREATE_ACTIVITY && (
      <Stack.Screen name="CreateActivity" component={CreateActivityScreen} options={{ animation: 'slide_from_bottom' }} />
      )}
      <Stack.Screen name="ActivityDetail" component={ActivityDetailScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EventList" component={EventListScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EventManage" component={EventManageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Spots */}
      {FEATURES.SPOTS && (
      <>
      <Stack.Screen name="SuggestSpot" component={SuggestSpotScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="SpotDetail" component={SpotDetailScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      </>
      )}

      {/* Business (Pro Local) - User Screens */}
      {FEATURES.BUSINESS_DISCOVERY && (
      <>
      <Stack.Screen name="BusinessDiscovery" component={BusinessDiscoveryScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="MySubscriptions" component={MySubscriptionsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="MemberAccess" component={MemberAccessScreen} options={{ animation: 'slide_from_bottom' }} />
      </>
      )}
      {FEATURES.BUSINESS_BOOKING && (
      <>
      <Stack.Screen name="BusinessBooking" component={BusinessBookingScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="BusinessBookingSuccess" component={BusinessBookingSuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="BusinessSubscription" component={BusinessSubscriptionScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="BusinessSubscriptionSuccess" component={BusinessSubscriptionSuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      </>
      )}

      {/* Business (Pro Local) - Owner Screens */}
      {FEATURES.BUSINESS_DASHBOARD && (
      <>
      <Stack.Screen name="BusinessDashboard" component={BusinessDashboardScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessServicesManage" component={BusinessServicesManageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessProgram" component={BusinessProgramScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessScheduleUpload" component={BusinessScheduleUploadScreen} options={{ animation: 'slide_from_bottom' }} />
      </>
      )}
      {FEATURES.BUSINESS_SCANNER && (
      <Stack.Screen name="BusinessScanner" component={BusinessScannerScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      )}
      {/* Private Sessions - Fan Flow */}
      {FEATURES.PRIVATE_SESSIONS && (
      <>
      <Stack.Screen name="MySessions" component={MySessionsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BookSession" component={BookSessionScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="SessionPayment" component={SessionPaymentScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="SessionBooked" component={SessionBookedScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="WaitingRoom" component={WaitingRoomScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PrivateCall" component={PrivateCallScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="SessionEnded" component={SessionEndedScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      </>
      )}

      {/* Creator Offerings & Checkout (Fan) */}
      {FEATURES.CHANNEL_SUBSCRIBE && (
      <>
      <Stack.Screen name="CreatorOfferings" component={CreatorOfferingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PackPurchase" component={PackPurchaseScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PackPurchaseSuccess" component={PackPurchaseSuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="ChannelSubscribe" component={ChannelSubscribeScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="SubscriptionSuccess" component={SubscriptionSuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      </>
      )}

      {/* Creator Dashboard */}
      {FEATURES.PRIVATE_SESSIONS && (
      <>
      <Stack.Screen name="PrivateSessionsManage" component={PrivateSessionsManageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="CreatorEarnings" component={CreatorEarningsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      </>
      )}

      {/* Payments & Subscriptions */}
      {FEATURES.CREATOR_WALLET && (
      <Stack.Screen name="CreatorWallet" component={CreatorWalletScreen} options={{ animation: 'slide_from_bottom' }} />
      )}
      {FEATURES.PLATFORM_SUBSCRIPTION && (
      <Stack.Screen name="PlatformSubscription" component={PlatformSubscriptionScreen} options={{ animation: 'slide_from_bottom' }} />
      )}
      {FEATURES.CHANNEL_SUBSCRIBE && (
      <Stack.Screen name="ChannelSubscription" component={ChannelSubscriptionScreen} options={{ animation: 'slide_from_bottom' }} />
      )}
      {FEATURES.IDENTITY_VERIFICATION && (
      <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      )}
      {/* PaymentMethods — removed for V1.0 (no monetization); restore in V3 */}
      <Stack.Screen name="WebView" component={WebViewScreen} options={{ animation: 'slide_from_bottom' }} />

      {/* Disputes & Resolution */}
      {FEATURES.DISPUTES && (
      <>
      <Stack.Screen name="DisputeCenter" component={DisputeCenterScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="CreateDispute" component={CreateDisputeScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="DisputeDetail" component={DisputeDetailScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="AdminDisputes" component={AdminDisputesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      </>
      )}

      {/* Find Friends (standalone popup) */}
      <Stack.Screen name="FindFriends" component={FindFriendsScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}
