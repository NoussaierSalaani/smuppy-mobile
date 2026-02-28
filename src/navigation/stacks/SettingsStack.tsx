import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FEATURES } from '../../config/featureFlags';
import { lazyScreen, screenWithBackSwipe } from '../shared';

const SettingsScreen = lazyScreen(() => import('../../screens/settings/SettingsScreen'));
const EditProfileScreen = lazyScreen(() => import('../../screens/settings/EditProfileScreen'));
const EditInterestsScreen = lazyScreen(() => import('../../screens/settings/EditInterestsScreen'));
const EditExpertiseScreen = lazyScreen(() => import('../../screens/settings/EditExpertiseScreen'));
const EditBusinessCategoryScreen = lazyScreen(() => import('../../screens/settings/EditBusinessCategoryScreen'));
const PasswordManagerScreen = lazyScreen(() => import('../../screens/settings/PasswordManagerScreen'));
const NotificationSettingsScreen = lazyScreen(() => import('../../screens/settings/NotificationSettingsScreen'));
const ReportProblemScreen = lazyScreen(() => import('../../screens/settings/ReportProblemScreen'));
const TermsPoliciesScreen = lazyScreen(() => import('../../screens/settings/TermsPoliciesScreen'));
const BlockedUsersScreen = lazyScreen(() => import('../../screens/settings/BlockedUsersScreen'));
const MutedUsersScreen = lazyScreen(() => import('../../screens/settings/MutedUsersScreen'));
const UpgradeToProScreen = lazyScreen(() => import('../../screens/settings/UpgradeToProScreen'));
const DataExportScreen = lazyScreen(() => import('../../screens/settings/DataExportScreen'));

const Stack = createNativeStackNavigator();

export default function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, gestureEnabled: false }}>
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
      {FEATURES.UPGRADE_TO_PRO && (
      <Stack.Screen name="UpgradeToPro" component={UpgradeToProScreen} options={{ animation: 'slide_from_right', ...screenWithBackSwipe }} />
      )}
    </Stack.Navigator>
  );
}
