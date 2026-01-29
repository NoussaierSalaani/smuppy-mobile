import React from 'react';
import { createStackNavigator, StackCardInterpolationProps, StackNavigationOptions } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';

// Auth screens
import SplashScreen from '../screens/auth/SplashScreen';
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

// Biometric screens
import EnableBiometricScreen from '../screens/auth/EnableBiometricScreen';
import BiometricSuccessScreen from '../screens/auth/BiometricSuccessScreen';
import BiometricLoginScreen from '../screens/auth/BiometricLoginScreen';

// Onboarding screens
import TellUsAboutYouScreen from '../screens/onboarding/TellUsAboutYouScreen';
import AccountTypeScreen from '../screens/onboarding/AccountTypeScreen';
import InterestsScreen from '../screens/onboarding/InterestsScreen';
import FindFriendsScreen from '../screens/onboarding/FindFriendsScreen';
import GuidelinesScreen from '../screens/onboarding/GuidelinesScreen';
import SuccessScreen from '../screens/onboarding/SuccessScreen';
import ProfessionScreen from '../screens/onboarding/ProfessionScreen';
import BusinessDetailsScreen from '../screens/onboarding/BusinessDetailsScreen';
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
  Splash: undefined;
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  VerifyCode: {
    email: string;
    password: string;
    rememberMe?: boolean;
    accountCreated?: boolean;
  };
  ForgotPassword: undefined;
  CheckEmail: { email: string };
  ResetCode: { email: string };
  NewPassword: { onRecoveryComplete?: () => void };
  PasswordSuccess: undefined;
  EmailVerificationPending: { email: string };
  EnableBiometric: undefined;
  BiometricSuccess: undefined;
  BiometricLogin: undefined;
  AccountType: undefined;
  TellUsAboutYou: { accountType: string; [key: string]: unknown };
  Interests: { [key: string]: unknown };
  CreatorInfo: { accountType: string; [key: string]: unknown };
  CreatorOptionalInfo: { [key: string]: unknown };
  Expertise: { [key: string]: unknown };
  BusinessCategory: { accountType: string; [key: string]: unknown };
  BusinessInfo: { [key: string]: unknown };
  Guidelines: { onProfileCreated?: () => void; [key: string]: unknown };
  Profession: undefined;
  BusinessDetails: undefined;
  FindFriends: undefined;
  Success: { onProfileCreated?: () => void };
};

const Stack = createStackNavigator<AuthStackParamList>();

const fadeTransition: StackNavigationOptions = {
  cardStyleInterpolator: ({ current }: StackCardInterpolationProps) => ({
    cardStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
    },
  }),
  transitionSpec: {
    open: { animation: 'timing' as const, config: { duration: 300 } },
    close: { animation: 'timing' as const, config: { duration: 300 } },
  },
};

interface AuthNavigatorRouteParams {
  initialRouteName?: keyof AuthStackParamList;
  onRecoveryComplete?: () => void;
  onProfileCreated?: () => void;
}

interface AuthNavigatorProps {
  route?: RouteProp<{ params: AuthNavigatorRouteParams }, 'params'>;
}

export default function AuthNavigator({ route }: AuthNavigatorProps): React.JSX.Element {
  const initialRouteName = route?.params?.initialRouteName || 'Splash';
  const onRecoveryComplete = route?.params?.onRecoveryComplete;
  const onProfileCreated = route?.params?.onProfileCreated;

  return (
    <Stack.Navigator
      id="AuthStack"
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, cardStyle: { backgroundColor: '#fff' } }}
    >
      {/* Splash & Welcome */}
      <Stack.Screen name="Splash" component={SplashScreen} options={fadeTransition} />
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={fadeTransition} />

      {/* Auth */}
      <Stack.Screen name="Login" component={LoginScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="Signup" component={SignupScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="VerifyCode" component={VerifyCodeScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="CheckEmail" component={CheckEmailScreen} />
      <Stack.Screen name="ResetCode" component={ResetCodeScreen} />

      {/* NewPassword receives onRecoveryComplete via initialParams */}
      <Stack.Screen
        name="NewPassword"
        component={NewPasswordScreen}
        initialParams={{ onRecoveryComplete }}
      />

      <Stack.Screen name="PasswordSuccess" component={PasswordSuccessScreen} />
      <Stack.Screen
        name="EmailVerificationPending"
        component={EmailVerificationPendingScreen}
        options={{ gestureEnabled: false }}
      />

      {/* Biometric */}
      <Stack.Screen
        name="EnableBiometric"
        component={EnableBiometricScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="BiometricSuccess"
        component={BiometricSuccessScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="BiometricLogin"
        component={BiometricLoginScreen}
        options={{ gestureEnabled: false }}
      />

      {/* Onboarding */}
      <Stack.Screen name="AccountType" component={AccountTypeScreen} />
      <Stack.Screen name="TellUsAboutYou" component={TellUsAboutYouScreen} />
      <Stack.Screen name="Interests" component={InterestsScreen} />
      <Stack.Screen name="CreatorInfo" component={CreatorInfoScreen} />
      <Stack.Screen name="CreatorOptionalInfo" component={CreatorOptionalInfoScreen} />
      <Stack.Screen name="Expertise" component={ExpertiseScreen} />
      <Stack.Screen name="BusinessCategory" component={BusinessCategoryScreen} />
      <Stack.Screen name="BusinessInfo" component={BusinessInfoScreen} />
      <Stack.Screen
        name="Guidelines"
        component={GuidelinesScreen}
        initialParams={{ onProfileCreated }}
      />
      {/* Legacy screens - kept for compatibility */}
      <Stack.Screen name="Profession" component={ProfessionScreen} />
      <Stack.Screen name="BusinessDetails" component={BusinessDetailsScreen} />
      <Stack.Screen name="FindFriends" component={FindFriendsScreen} />
      <Stack.Screen
        name="Success"
        component={SuccessScreen}
        initialParams={{ onProfileCreated }}
        options={{ gestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
