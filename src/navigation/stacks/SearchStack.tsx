import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SearchScreen from '../../screens/search/SearchScreen';
import { screenWithBackSwipe } from '../shared';

const Stack = createNativeStackNavigator();

export default function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
    </Stack.Navigator>
  );
}
