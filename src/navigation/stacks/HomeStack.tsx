import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PostDetailFanFeedScreen from '../../screens/home/PostDetailFanFeedScreen';
import PostDetailVibesFeedScreen from '../../screens/home/PostDetailVibesFeedScreen';
import PostDetailProfileScreen from '../../screens/profile/PostDetailProfileScreen';
import PeakViewScreen from '../../screens/peaks/PeakViewScreen';
import { lazyScreen, screenWithBackSwipe } from '../shared';

const PrescriptionsScreen = lazyScreen(() => import('../../screens/vibe/PrescriptionsScreen'));
const ActivePrescriptionScreen = lazyScreen(() => import('../../screens/vibe/ActivePrescriptionScreen'));

const Stack = createNativeStackNavigator();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="PostDetailFanFeed" component={PostDetailFanFeedScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PostDetailVibesFeed" component={PostDetailVibesFeedScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PostDetailProfile" component={PostDetailProfileScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="PeakView" component={PeakViewScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="Prescriptions" component={PrescriptionsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="ActivePrescription" component={ActivePrescriptionScreen} options={{ animation: 'slide_from_bottom' }} />
    </Stack.Navigator>
  );
}
