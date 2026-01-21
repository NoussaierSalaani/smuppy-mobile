import React, { useState } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
// TabBarProvider removed - was causing issues and not being used

// Tab Screens
import FeedScreen from '../screens/home/FeedScreen';
import CreatePostScreen from '../screens/home/CreatePostScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

// Stack Screens
import SearchScreen from '../screens/search/SearchScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import ChatScreen from '../screens/messages/ChatScreen';

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
import EditProfilScreen from '../screens/settings/EditProfilScreen';
import EditInterestsScreen from '../screens/settings/EditInterestsScreen';
import PasswordManagerScreen from '../screens/settings/PasswordManagerScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';
import ReportProblemScreen from '../screens/settings/ReportProblemScreen';
import TermsPoliciesScreen from '../screens/settings/TermsPoliciesScreen';
import FacialRecognitionScreen from '../screens/settings/FacialRecognitionScreen';

// PEAKS Screens
import PeaksFeedScreen from '../screens/peaks/PeaksFeedScreen';
import PeakViewScreen from '../screens/peaks/PeakViewScreen';
import CreatePeakScreen from '../screens/peaks/CreatePeakScreen';
import PeakPreviewScreen from '../screens/peaks/PeakPreviewScreen';

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
        <Tab.Screen name="Notifications" component={NotificationsScreen} />
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
  return (
    <Stack.Navigator id="MainStack" screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />

      {/* Search */}
      <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* Messages */}
      <Stack.Screen name="Messages" component={MessagesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

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
      <Stack.Screen name="EditProfil" component={EditProfilScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="EditInterests" component={EditInterestsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PasswordManager" component={PasswordManagerScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="ReportProblem" component={ReportProblemScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="TermsPolicies" component={TermsPoliciesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="FacialRecognition" component={FacialRecognitionScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />

      {/* PEAKS */}
      <Stack.Screen name="PeakView" component={PeakViewScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="CreatePeak" component={CreatePeakScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PeakPreview" component={PeakPreviewScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
    </Stack.Navigator>
  );
}
