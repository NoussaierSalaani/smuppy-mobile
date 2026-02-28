import { createNativeStackNavigator } from '@react-navigation/native-stack';
import CreatePostScreen from '../../screens/home/CreatePostScreen';
import { FEATURES } from '../../config/featureFlags';
import { lazyScreen, asScreen, screenWithBackSwipe } from '../shared';

const VideoRecorderScreen = lazyScreen(() => import('../../screens/home/VideoRecorderScreen'));
const AddPostDetailsScreen = lazyScreen(() => import('../../screens/home/AddPostDetailsScreen'));
const PostSuccessScreen = lazyScreen(() => import('../../screens/home/PostSuccessScreen'));
const CreatePeakScreen = lazyScreen(() => import('../../screens/peaks/CreatePeakScreen'));
const PeakPreviewScreen = lazyScreen(() => import('../../screens/peaks/PeakPreviewScreen'));
const ChallengesScreen = lazyScreen(() => import('../../screens/peaks/ChallengesScreen'));

const Stack = createNativeStackNavigator();

export default function CreateStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="CreatePost" component={asScreen(CreatePostScreen)} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="VideoRecorder" component={VideoRecorderScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="AddPostDetails" component={AddPostDetailsScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      <Stack.Screen name="PostSuccess" component={PostSuccessScreen} options={{ animation: 'fade' }} />
      <Stack.Screen name="CreatePeak" component={CreatePeakScreen} options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="PeakPreview" component={PeakPreviewScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      {FEATURES.CHALLENGES && (
      <Stack.Screen name="Challenges" component={ChallengesScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      )}
    </Stack.Navigator>
  );
}
