import React, { useState, useEffect, ComponentType } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useUserStore } from '../stores';
import { getCurrentProfile } from '../services/database';
import { storage, STORAGE_KEYS } from '../utils/secureStorage';
import type { MainStackParamList } from '../types';
import { FEATURES } from '../config/featureFlags';

// Type helper to cast screen components for React Navigation compatibility
 
const asScreen = <T,>(component: T): ComponentType<any> => component as ComponentType<any>;
// TabBarProvider removed - was causing issues and not being used

// Tab Screens
import FeedScreen from '../screens/home/FeedScreen';
import CreatePostScreen from '../screens/home/CreatePostScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import FollowRequestsScreen from '../screens/notifications/FollowRequestsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

// Stack Screens
import SearchScreen from '../screens/search/SearchScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import ChatScreen from '../screens/messages/ChatScreen';
import NewMessageScreen from '../screens/messages/NewMessageScreen';

// Create Post Screens
import AddPostDetailsScreen from '../screens/home/AddPostDetailsScreen';
import PostSuccessScreen from '../screens/home/PostSuccessScreen';
import VideoRecorderScreen from '../screens/home/VideoRecorderScreen';

// Vibe Screens
import PrescriptionsScreen from '../screens/vibe/PrescriptionsScreen';
import ActivePrescriptionScreen from '../screens/vibe/ActivePrescriptionScreen';
import PrescriptionPreferencesScreen from '../screens/settings/PrescriptionPreferencesScreen';

// Profile Screens
import FansListScreen from '../screens/profile/FansListScreen';
import UserProfileScreen from '../screens/profile/UserProfileScreen';
import PostDetailProfileScreen from '../screens/profile/PostDetailProfileScreen';

// Post Detail Screens
import PostDetailFanFeedScreen from '../screens/home/PostDetailFanFeedScreen';
import PostDetailVibesFeedScreen from '../screens/home/PostDetailVibesFeedScreen';

// Settings Screens
import SettingsScreen from '../screens/settings/SettingsScreen';
import EditProfileScreen from '../screens/settings/EditProfileScreen';
import EditInterestsScreen from '../screens/settings/EditInterestsScreen';
import EditExpertiseScreen from '../screens/settings/EditExpertiseScreen';
import PasswordManagerScreen from '../screens/settings/PasswordManagerScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';
import ReportProblemScreen from '../screens/settings/ReportProblemScreen';
import TermsPoliciesScreen from '../screens/settings/TermsPoliciesScreen';
import FacialRecognitionScreen from '../screens/settings/FacialRecognitionScreen';
import BlockedUsersScreen from '../screens/settings/BlockedUsersScreen';
import MutedUsersScreen from '../screens/settings/MutedUsersScreen';
import UpgradeToProScreen from '../screens/settings/UpgradeToProScreen';

// PEAKS Screens
import PeaksFeedScreen from '../screens/peaks/PeaksFeedScreen';
import PeakViewScreen from '../screens/peaks/PeakViewScreen';
import CreatePeakScreen from '../screens/peaks/CreatePeakScreen';
import PeakPreviewScreen from '../screens/peaks/PeakPreviewScreen';

// Live Streaming Screens
import { GoLiveIntroScreen, GoLiveScreen, LiveStreamingScreen, LiveEndedScreen, ViewerLiveStreamScreen } from '../screens/live';


// Battles Screens
import BattleLobbyScreen from '../screens/battles/BattleLobbyScreen';
import BattleStreamScreen from '../screens/battles/BattleStreamScreen';

// Events Screens
import CreateEventScreen from '../screens/events/CreateEventScreen';
import EventListScreen from '../screens/events/EventListScreen';
import EventDetailScreen from '../screens/events/EventDetailScreen';
import EventManageScreen from '../screens/events/EventManageScreen';

// Group Screens
import CreateGroupScreen from '../screens/groups/CreateGroupScreen';
import GroupDetailScreen from '../screens/groups/GroupDetailScreen';

// Activity Screens (unified)
import CreateActivityScreen from '../screens/activities/CreateActivityScreen';

// Spot Screens
import SuggestSpotScreen from '../screens/spots/SuggestSpotScreen';
import SpotDetailScreen from '../screens/spots/SpotDetailScreen';

// Business Screens
import {
  BusinessProfileScreen,
  BusinessDiscoveryScreen,
  BusinessBookingScreen,
  BusinessSubscriptionScreen,
  BusinessBookingSuccessScreen,
  BusinessSubscriptionSuccessScreen,
  BusinessProgramScreen,
  MySubscriptionsScreen,
  MemberAccessScreen,
  BusinessScannerScreen,
  BusinessDashboardScreen,
  BusinessServicesManageScreen,
  BusinessScheduleUploadScreen,
} from '../screens/business';

// Private Sessions Screens
import {
  BookSessionScreen,
  SessionPaymentScreen,
  SessionBookedScreen,
  WaitingRoomScreen,
  PrivateCallScreen,
  SessionEndedScreen,
  PrivateSessionsManageScreen,
  MySessionsScreen,
  SessionDetailScreen,
  CreatorOfferingsScreen,
  PackPurchaseScreen,
  PackPurchaseSuccessScreen,
  ChannelSubscribeScreen,
  SubscriptionSuccessScreen,
  CreatorEarningsScreen,
} from '../screens/sessions';

// Payment Screens
import {
  CreatorWalletScreen,
  PlatformSubscriptionScreen,
  ChannelSubscriptionScreen,
  IdentityVerificationScreen,
} from '../screens/payments';

// Find Friends (standalone popup)
import FindFriendsScreen from '../screens/onboarding/FindFriendsScreen';

// Components
import CreateOptionsPopup from '../components/CreateOptionsPopup';
import BottomNav from '../components/BottomNav';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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
          navigation.navigate('FindFriends' as any);
        }
      } catch {
        // Silent fail
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
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
        onSelectChallenge={undefined}
        onSelectEvent={FEATURES.CREATE_EVENT && isProCreator ? () => { setShowCreatePopup(false); navigation.navigate('CreateEvent'); } : undefined}
      />
    </>
  );
}

export default function MainNavigator() {
  const setUser = useUserStore((state) => state.setUser);
  const currentUserId = useUserStore((state) => state.user?.id);

  // Sync profile from database to Zustand store on mount
  // This ensures fresh data after login, not stale persisted data
  useEffect(() => {
    const syncProfile = async () => {
      try {
        const { data, error } = await getCurrentProfile();
        if (data && !error) {
          // Check if user ID changed (different account logged in)
          if (currentUserId && currentUserId !== data.id) {
            console.log('[MainNavigator] Different user detected, updating store');
          }
          // Update Zustand with fresh profile data
          setUser({
            id: data.id,
            username: data.username,
            fullName: data.full_name,
            displayName: data.display_name || data.full_name,
            avatar: data.avatar_url || null,
            coverImage: data.cover_url || null,
            bio: data.bio || '',
            accountType: data.account_type as 'personal' | 'pro_creator' | 'pro_business',
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
        console.error('[MainNavigator] Error syncing profile:', err);
      }
    };

    syncProfile();
  }, [setUser, currentUserId]);

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
      <Stack.Screen name="AddPostDetails" component={asScreen(AddPostDetailsScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PostSuccess" component={asScreen(PostSuccessScreen)} options={{ animation: 'fade' }} />

      {/* Profile Stack */}
      <Stack.Screen name="FansList" component={FansListScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Vibe */}
      <Stack.Screen name="Prescriptions" component={asScreen(PrescriptionsScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="ActivePrescription" component={asScreen(ActivePrescriptionScreen)} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PrescriptionPreferences" component={asScreen(PrescriptionPreferencesScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Post Detail Screens */}
      <Stack.Screen name="PostDetailFanFeed" component={PostDetailFanFeedScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PostDetailVibesFeed" component={PostDetailVibesFeedScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PostDetailProfile" component={PostDetailProfileScreen} options={{ animation: 'fade' }} />

      {/* Settings Stack */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditInterests" component={EditInterestsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditExpertise" component={EditExpertiseScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PasswordManager" component={PasswordManagerScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="ReportProblem" component={ReportProblemScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="TermsPolicies" component={TermsPoliciesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="FacialRecognition" component={FacialRecognitionScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="MutedUsers" component={MutedUsersScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="FollowRequests" component={FollowRequestsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="UpgradeToPro" component={UpgradeToProScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* PEAKS */}
      <Stack.Screen name="PeakView" component={PeakViewScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="CreatePeak" component={CreatePeakScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PeakPreview" component={PeakPreviewScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Live Streaming */}
      <Stack.Screen name="GoLiveIntro" component={GoLiveIntroScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="GoLive" component={GoLiveScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="LiveStreaming" component={LiveStreamingScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="LiveEnded" component={LiveEndedScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="ViewerLiveStream" component={ViewerLiveStreamScreen} options={{ animation: 'fade', gestureEnabled: false }} />

      {/* Live Battles */}
      <Stack.Screen name="BattleLobby" component={BattleLobbyScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="BattleStream" component={BattleStreamScreen} options={{ animation: 'fade', gestureEnabled: false }} />

      {/* Events (Xplorer) */}
      <Stack.Screen name="EventList" component={EventListScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EventDetail" component={asScreen(EventDetailScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EventManage" component={asScreen(EventManageScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="CreateEvent" component={asScreen(CreateEventScreen)} options={{ animation: 'slide_from_bottom' }} />

      {/* Groups */}
      <Stack.Screen name="CreateGroup" component={asScreen(CreateGroupScreen)} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="GroupDetail" component={asScreen(GroupDetailScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Activities (unified) */}
      <Stack.Screen name="CreateActivity" component={asScreen(CreateActivityScreen)} options={{ animation: 'slide_from_bottom' }} />

      {/* Spots */}
      <Stack.Screen name="SuggestSpot" component={asScreen(SuggestSpotScreen)} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="SpotDetail" component={asScreen(SpotDetailScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Business (Pro Local) - User Screens */}
      <Stack.Screen name="BusinessDiscovery" component={BusinessDiscoveryScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessProfile" component={asScreen(BusinessProfileScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessBooking" component={asScreen(BusinessBookingScreen)} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="BusinessSubscription" component={asScreen(BusinessSubscriptionScreen)} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="BusinessBookingSuccess" component={asScreen(BusinessBookingSuccessScreen)} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="BusinessSubscriptionSuccess" component={asScreen(BusinessSubscriptionSuccessScreen)} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="MySubscriptions" component={MySubscriptionsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="MemberAccess" component={asScreen(MemberAccessScreen)} options={{ animation: 'slide_from_bottom' }} />

      {/* Business (Pro Local) - Owner Screens */}
      <Stack.Screen name="BusinessDashboard" component={BusinessDashboardScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessServicesManage" component={BusinessServicesManageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessProgram" component={asScreen(BusinessProgramScreen)} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BusinessScheduleUpload" component={BusinessScheduleUploadScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="BusinessScanner" component={BusinessScannerScreen} options={{ animation: 'slide_from_bottom' }} />

      {/* Private Sessions - Fan Flow */}
      <Stack.Screen name="MySessions" component={MySessionsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BookSession" component={BookSessionScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="SessionPayment" component={SessionPaymentScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="SessionBooked" component={SessionBookedScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="WaitingRoom" component={WaitingRoomScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PrivateCall" component={PrivateCallScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="SessionEnded" component={SessionEndedScreen} options={{ animation: 'fade', gestureEnabled: false }} />

      {/* Creator Offerings & Checkout (Fan) */}
      <Stack.Screen name="CreatorOfferings" component={CreatorOfferingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PackPurchase" component={PackPurchaseScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PackPurchaseSuccess" component={PackPurchaseSuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="ChannelSubscribe" component={ChannelSubscribeScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="SubscriptionSuccess" component={SubscriptionSuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />

      {/* Creator Dashboard */}
      <Stack.Screen name="PrivateSessionsManage" component={PrivateSessionsManageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="CreatorEarnings" component={CreatorEarningsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Payments & Subscriptions */}
      <Stack.Screen name="CreatorWallet" component={CreatorWalletScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PlatformSubscription" component={PlatformSubscriptionScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="ChannelSubscription" component={ChannelSubscriptionScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Find Friends (standalone popup) */}
      <Stack.Screen name="FindFriends" component={FindFriendsScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}
