import { createNativeStackNavigator } from '@react-navigation/native-stack';
import NotificationsScreen from '../../screens/notifications/NotificationsScreen';
import { lazyScreen, screenWithBackSwipe } from '../shared';

const FollowRequestsScreen = lazyScreen(() => import('../../screens/notifications/FollowRequestsScreen'));

const Stack = createNativeStackNavigator();

export default function NotificationsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="FollowRequests" component={FollowRequestsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
    </Stack.Navigator>
  );
}
