import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/useTheme';
// Auth screens
import WelcomeScreen from '../screens/auth/WelcomeScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import VerifyCodeScreen from '../screens/auth/VerifyCodeScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import CheckEmailScreen from '../screens/auth/CheckEmailScreen';
import ResetCodeScreen from '../screens/auth/ResetCodeScreen';
import NewPasswordScreen from '../screens/auth/NewPasswordScreen';
import PasswordSuccessScreen from '../screens/auth/PasswordSuccessScreen';
import EmailVerificationPendingScreen from '../screens/auth/EmailVerificationPendingScreen';

// Onboarding screens
import TellUsAboutYouScreen from '../screens/onboarding/TellUsAboutYouScreen';
import AccountTypeScreen from '../screens/onboarding/AccountTypeScreen';
import InterestsScreen from '../screens/onboarding/InterestsScreen';
import GuidelinesScreen from '../screens/onboarding/GuidelinesScreen';
import SuccessScreen from '../screens/onboarding/SuccessScreen';
import ExpertiseScreen from '../screens/onboarding/ExpertiseScreen';

// Pro Creator & Business screens
import CreatorInfoScreen from '../screens/onboarding/CreatorInfoScreen';
import CreatorOptionalInfoScreen from '../screens/onboarding/CreatorOptionalInfoScreen';
import BusinessCategoryScreen from '../screens/onboarding/BusinessCategoryScreen';
import BusinessInfoScreen from '../screens/onboarding/BusinessInfoScreen';

/**
 * Auth Navigator Param List
 */
export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  VerifyCode: {
    email: string;
    password: string;
    rememberMe?: boolean;
  };
  ForgotPassword: undefined;
  CheckEmail: { email: string };
  ResetCode: { email: string };
  NewPassword: undefined;
  PasswordSuccess: undefined;
  EmailVerificationPending: { email: string };
  AccountType: undefined;
  TellUsAboutYou: { accountType: string; [key: string]: unknown };
  Interests: { [key: string]: unknown };
  CreatorInfo: { accountType: string; [key: string]: unknown };
  CreatorOptionalInfo: undefined;
  Expertise: { [key: string]: unknown };
  BusinessCategory: { accountType: string; [key: string]: unknown };
  BusinessInfo: { [key: string]: unknown };
  Guidelines: { [key: string]: unknown };
  Success: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator(): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Stack.Navigator
      id="AuthStack"
      initialRouteName="Welcome"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: 'fade' }}
    >
      {/* Welcome */}
      <Stack.Screen name="Welcome" component={WelcomeScreen} />

      {/* Auth */}
      <Stack.Screen name="Login" component={LoginScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="Signup" component={SignupScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="CheckEmail" component={CheckEmailScreen} />
      <Stack.Screen name="ResetCode" component={ResetCodeScreen} />

      <Stack.Screen name="NewPassword" component={NewPasswordScreen} />

      <Stack.Screen name="PasswordSuccess" component={PasswordSuccessScreen} />
      <Stack.Screen
        name="EmailVerificationPending"
        component={EmailVerificationPendingScreen}
        options={{ gestureEnabled: false }}
      />

      {/* Onboarding */}
      <Stack.Screen name="AccountType" component={AccountTypeScreen} />
      <Stack.Screen name="TellUsAboutYou" component={TellUsAboutYouScreen} />
      <Stack.Screen name="Interests" component={InterestsScreen} />
      <Stack.Screen name="CreatorInfo" component={CreatorInfoScreen} />
      <Stack.Screen name="CreatorOptionalInfo" component={CreatorOptionalInfoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Expertise" component={ExpertiseScreen} />
      <Stack.Screen name="BusinessCategory" component={BusinessCategoryScreen} />
      <Stack.Screen name="BusinessInfo" component={BusinessInfoScreen} />
      <Stack.Screen name="Guidelines" component={GuidelinesScreen} />
      <Stack.Screen name="Success" component={SuccessScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
