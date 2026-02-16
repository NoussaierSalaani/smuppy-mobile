import React, { useState, useEffect, ComponentType } from 'react';
import { AppState } from 'react-native';
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
import { ScreenSkeleton } from '../components/skeleton';

// Type helper to cast screen components for React Navigation compatibility

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React Navigation requires ComponentType<any> for screen components with diverse prop shapes
const asScreen = <T,>(component: T): ComponentType<any> => component as ComponentType<any>;

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
      const total = data.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      if (__DEV__) console.log('[Badges] messages:', total, `(${data.length} convos)`);
      useAppStore.getState().setUnreadMessages(total);
    })
    .catch((err) => { if (__DEV__) console.warn('[Badges] msg fetch error:', err); });
};

// ============================================
// LAZY SCREEN HELPER
// ============================================
// Visible fallback — shows shimmer skeleton matching typical screen layout
const LazyFallback = () => <ScreenSkeleton />;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React.lazy requires ComponentType<any> for dynamic imports
function lazyScreen(importFn: () => Promise<{ default: ComponentType<any> }>) {
  const Lazy = React.lazy(importFn);
  return (props: Record<string, unknown>) => (
    <ErrorBoundary name="LazyScreen" minimal>
      <React.Suspense fallback={<LazyFallback />}>
        <Lazy {...props} />
      </React.Suspense>
    </ErrorBoundary>
  );
}

// ============================================
// EAGER IMPORTS — Tab screens + high-frequency navigation
// ============================================

// Tab Screens
import FeedScreen from '../screens/home/FeedScreen';
import CreatePostScreen from '../screens/home/CreatePostScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

// High-frequency stack screens (navigated from tabs / header)
import SearchScreen from '../screens/search/SearchScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import ChatScreen from '../screens/messages/ChatScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';

// Post detail screens (navigated from feed — must be instant)
import PostDetailFanFeedScreen from '../screens/home/PostDetailFanFeedScreen';
import PostDetailVibesFeedScreen from '../screens/home/PostDetailVibesFeedScreen';
import PostDetailProfileScreen from '../screens/profile/PostDetailProfileScreen';

// Peaks feed (tab screen)
import PeaksFeedScreen from '../screens/peaks/PeaksFeedScreen';
import PeakViewScreen from '../screens/peaks/PeakViewScreen';

// Components
import CreateOptionsPopup from '../components/CreateOptionsPopup';
import BottomNav from '../components/BottomNav';

// ============================================
// LAZY IMPORTS — Non-core / deep screens
// ============================================

// Messages (deep)
const NewMessageScreen = lazyScreen(() => import('../screens/messages/NewMessageScreen'));

// Create Post Flow
const AddPostDetailsScreen = lazyScreen(() => import('../screens/home/AddPostDetailsScreen'));
const PostSuccessScreen = lazyScreen(() => import('../screens/home/PostSuccessScreen'));
const VideoRecorderScreen = lazyScreen(() => import('../screens/home/VideoRecorderScreen'));

// Notifications (deep)
const FollowRequestsScreen = lazyScreen(() => import('../screens/notifications/FollowRequestsScreen'));

// Vibe Screens
const PrescriptionsScreen = lazyScreen(() => import('../screens/vibe/PrescriptionsScreen'));
const ActivePrescriptionScreen = lazyScreen(() => import('../screens/vibe/ActivePrescriptionScreen'));
const PrescriptionPreferencesScreen = lazyScreen(() => import('../screens/settings/PrescriptionPreferencesScreen'));

// Profile (deep)
const FansListScreen = lazyScreen(() => import('../screens/profile/FansListScreen'));
const PostLikersScreen = lazyScreen(() => import('../screens/profile/PostLikersScreen'));

// Settings Screens
const SettingsScreen = lazyScreen(() => import('../screens/settings/SettingsScreen'));
const EditProfileScreen = lazyScreen(() => import('../screens/settings/EditProfileScreen'));
const EditInterestsScreen = lazyScreen(() => import('../screens/settings/EditInterestsScreen'));
const EditExpertiseScreen = lazyScreen(() => import('../screens/settings/EditExpertiseScreen'));
const EditBusinessCategoryScreen = lazyScreen(() => import('../screens/settings/EditBusinessCategoryScreen'));
const PasswordManagerScreen = lazyScreen(() => import('../screens/settings/PasswordManagerScreen'));
const NotificationSettingsScreen = lazyScreen(() => import('../screens/settings/NotificationSettingsScreen'));
const ReportProblemScreen = lazyScreen(() => import('../screens/settings/ReportProblemScreen'));
const TermsPoliciesScreen = lazyScreen(() => import('../screens/settings/TermsPoliciesScreen'));
const BlockedUsersScreen = lazyScreen(() => import('../screens/settings/BlockedUsersScreen'));
const MutedUsersScreen = lazyScreen(() => import('../screens/settings/MutedUsersScreen'));
const UpgradeToProScreen = lazyScreen(() => import('../screens/settings/UpgradeToProScreen'));
const DataExportScreen = lazyScreen(() => import('../screens/settings/DataExportScreen'));

// PEAKS (create/preview)
const CreatePeakScreen = lazyScreen(() => import('../screens/peaks/CreatePeakScreen'));
const PeakPreviewScreen = lazyScreen(() => import('../screens/peaks/PeakPreviewScreen'));
const ChallengesScreen = lazyScreen(() => import('../screens/peaks/ChallengesScreen'));

// Live Streaming Screens
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
const PaymentMethodsScreen = lazyScreen(() => import('../screens/payments/PaymentMethodsScreen'));

// WebView (already lazy)
const LazyWebViewScreen = React.lazy(() => import('../screens/WebViewScreen'));
const WebViewScreen = (props: Record<string, unknown>) => (
  <ErrorBoundary name="WebView" minimal>
    <React.Suspense fallback={<LazyFallback />}>
      <LazyWebViewScreen {...props} />
    </React.Suspense>
  </ErrorBoundary>
);

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

const screenWithBackSwipe = { gestureEnabled: true, gestureDirection: 'horizontal' as const };

interface TabNavigatorProps {
  navigation: NativeStackNavigationProp<MainStackParamList, 'Tabs'>;
}

function TabNavigator({ navigation }: TabNavigatorProps) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const user = useUserStore((state) => state.user);
  const isProCreator = user?.accountType === 'pro_creator' || user?.accountType === 'pro_business';

  // Auto-trigger FindFriends popup ~30s after first mount
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const shown = await storage.get(STORAGE_KEYS.FIND_FRIENDS_SHOWN);
        if (!shown) {
          navigation.navigate('FindFriends');
        }
      } catch {
        // Silent fail
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
          onSelectChallenge={FEATURES.CHALLENGES && user?.accountType === 'pro_creator' ? () => { setShowCreatePopup(false); navigation.navigate('Challenges'); } : undefined}
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
  // Skip fetch if user is already loaded from persistence (avoid double fetch)
  useEffect(() => {
    const syncProfile = async () => {
      // Skip if user already exists in store (loaded from AsyncStorage)
      // AppNavigator already fetched fresh data, no need to duplicate
      if (currentUserId && isAuthenticated) {
        if (__DEV__) console.log('[MainNavigator] User already in store, skipping fetch');
        return;
      }

      try {
        const { data, error } = await getCurrentProfile();
        if (data && !error && data.id && data.username) {
          // Update Zustand with fresh profile data
          setUser({
            id: data.id,
            username: data.username,
            fullName: data.full_name || '',
            displayName: (data.account_type === 'pro_business' && data.business_name) ? data.business_name : (data.display_name || data.full_name || ''),
            avatar: data.avatar_url || null,
            coverImage: data.cover_url || null,
            bio: data.bio || '',
            accountType: (data.account_type as 'personal' | 'pro_creator' | 'pro_business') || 'personal',
            isVerified: data.is_verified || false,
            isPremium: data.is_premium || false,
            interests: data.interests || [],
            expertise: data.expertise || [],
            businessName: data.business_name || '',
            businessCategory: data.business_category || '',
            businessAddress: data.business_address || '',
            businessLatitude: data.business_latitude,
            businessLongitude: data.business_longitude,
            stats: {
              fans: data.fan_count || 0,
              posts: data.post_count || 0,
            },
          });
        }
      } catch (err) {
        if (__DEV__) console.warn('[MainNavigator] Error syncing profile:', err);
      }
    };

    syncProfile();

    // Fetch initial unread counts (retry in case auth token wasn't ready)
    fetchBadgeCounts();
    const retryTimer = setTimeout(fetchBadgeCounts, AUTH_RETRY_DELAY_MS);
    return () => clearTimeout(retryTimer);
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

      {/* Search */}
      <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Notifications (accessible from HomeHeader) */}
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="Chat" component={asScreen(ChatScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Create Post Flow */}
      <Stack.Screen name="CreatePost" component={asScreen(CreatePostScreen)} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="VideoRecorder" component={VideoRecorderScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="AddPostDetails" component={AddPostDetailsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PostSuccess" component={PostSuccessScreen} options={{ animation: 'fade' }} />

      {/* Profile Stack */}
      <Stack.Screen name="FansList" component={FansListScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PostLikers" component={PostLikersScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Vibe */}
      <Stack.Screen name="Prescriptions" component={PrescriptionsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="ActivePrescription" component={ActivePrescriptionScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PrescriptionPreferences" component={PrescriptionPreferencesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Post Detail Screens */}
      <Stack.Screen name="PostDetailFanFeed" component={PostDetailFanFeedScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PostDetailVibesFeed" component={PostDetailVibesFeedScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PostDetailProfile" component={PostDetailProfileScreen} options={{ animation: 'fade' }} />

      {/* Settings Stack */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditInterests" component={EditInterestsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditExpertise" component={EditExpertiseScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditBusinessCategory" component={EditBusinessCategoryScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PasswordManager" component={PasswordManagerScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="ReportProblem" component={ReportProblemScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="TermsPolicies" component={TermsPoliciesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="MutedUsers" component={MutedUsersScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="DataExport" component={DataExportScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="FollowRequests" component={FollowRequestsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      {FEATURES.UPGRADE_TO_PRO && (
      <Stack.Screen name="UpgradeToPro" component={UpgradeToProScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      )}

      {/* PEAKS */}
      <Stack.Screen name="PeakView" component={PeakViewScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="CreatePeak" component={CreatePeakScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PeakPreview" component={PeakPreviewScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      {FEATURES.CHALLENGES && (
      <Stack.Screen name="Challenges" component={ChallengesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      )}

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
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
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
