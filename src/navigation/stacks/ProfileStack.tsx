import { createNativeStackNavigator } from '@react-navigation/native-stack';
import UserProfileScreen from '../../screens/profile/UserProfileScreen';
import { lazyScreen, screenWithBackSwipe } from '../shared';

const FansListScreen = lazyScreen(() => import('../../screens/profile/FansListScreen'));
const PostLikersScreen = lazyScreen(() => import('../../screens/profile/PostLikersScreen'));

const Stack = createNativeStackNavigator();

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="FansList" component={FansListScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PostLikers" component={PostLikersScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
    </Stack.Navigator>
  );
}
