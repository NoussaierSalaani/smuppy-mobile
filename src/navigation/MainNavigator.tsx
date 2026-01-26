import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useUserStore } from '../stores';
import { getCurrentProfile } from '../services/database';
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
import PasswordManagerScreen from '../screens/settings/PasswordManagerScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';
import ReportProblemScreen from '../screens/settings/ReportProblemScreen';
import TermsPoliciesScreen from '../screens/settings/TermsPoliciesScreen';
import FacialRecognitionScreen from '../screens/settings/FacialRecognitionScreen';
import BlockedUsersScreen from '../screens/settings/BlockedUsersScreen';
import MutedUsersScreen from '../screens/settings/MutedUsersScreen';

// PEAKS Screens
import PeaksFeedScreen from '../screens/peaks/PeaksFeedScreen';
import PeakViewScreen from '../screens/peaks/PeakViewScreen';
import CreatePeakScreen from '../screens/peaks/CreatePeakScreen';
import PeakPreviewScreen from '../screens/peaks/PeakPreviewScreen';

// Live Streaming Screens
import { GoLiveIntroScreen, GoLiveScreen, LiveStreamingScreen, LiveEndedScreen, ViewerLiveStreamScreen } from '../screens/live';

// Private Sessions Screens
import {
  BookSessionScreen,
  SessionPaymentScreen,
  SessionBookedScreen,
  WaitingRoomScreen,
  PrivateCallScreen,
  SessionEndedScreen,
  PrivateSessionsManageScreen,
} from '../screens/sessions';

// Components
import CreateOptionsPopup from '../components/CreateOptionsPopup';
import BottomNav from '../components/BottomNav';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenWithBackSwipe = { gestureEnabled: true, gestureDirection: 'horizontal' as const };

function TabNavigator({ navigation }) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);

  return (
    <>
      <Tab.Navigator id="MainTabs" tabBar={(props) => <BottomNav {...props} onCreatePress={() => setShowCreatePopup(true)} />} screenOptions={{ headerShown: false }}>
        <Tab.Screen name="Home" component={FeedScreen} />
        <Tab.Screen name="Peaks" component={PeaksFeedScreen} />
        <Tab.Screen name="CreateTab" component={CreatePostScreen} />
        <Tab.Screen name="Messages" component={MessagesScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>

      <CreateOptionsPopup
        visible={showCreatePopup}
        onClose={() => setShowCreatePopup(false)}
        onSelectPost={() => { setShowCreatePopup(false); navigation.navigate('CreatePost'); }}
        onSelectPeak={() => { setShowCreatePopup(false); navigation.navigate('CreatePeak'); }}
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
            avatar: data.avatar_url || undefined,
            coverImage: data.cover_url || undefined,
            bio: data.bio || undefined,
            accountType: data.account_type as 'personal' | 'pro_creator' | 'pro_local',
            isVerified: data.is_verified || false,
            interests: data.interests || [],
            expertise: data.expertise || [],
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
      <Stack.Screen name="Chat" component={ChatScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Create Post Flow */}
      <Stack.Screen name="CreatePost" component={CreatePostScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="VideoRecorder" component={VideoRecorderScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="AddPostDetails" component={AddPostDetailsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PostSuccess" component={PostSuccessScreen} options={{ animation: 'fade' }} />

      {/* Profile Stack */}
      <Stack.Screen name="FansList" component={FansListScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Post Detail Screens */}
      <Stack.Screen name="PostDetailFanFeed" component={PostDetailFanFeedScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PostDetailVibesFeed" component={PostDetailVibesFeedScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PostDetailProfile" component={PostDetailProfileScreen} options={{ animation: 'fade' }} />

      {/* Settings Stack */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditInterests" component={EditInterestsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PasswordManager" component={PasswordManagerScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="ReportProblem" component={ReportProblemScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="TermsPolicies" component={TermsPoliciesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="FacialRecognition" component={FacialRecognitionScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="MutedUsers" component={MutedUsersScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="FollowRequests" component={FollowRequestsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

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

      {/* Private Sessions */}
      <Stack.Screen name="PrivateSessionsManage" component={PrivateSessionsManageScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="BookSession" component={BookSessionScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="SessionPayment" component={SessionPaymentScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="SessionBooked" component={SessionBookedScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="WaitingRoom" component={WaitingRoomScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PrivateCall" component={PrivateCallScreen} options={{ animation: 'fade', gestureEnabled: false }} />
      <Stack.Screen name="SessionEnded" component={SessionEndedScreen} options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
