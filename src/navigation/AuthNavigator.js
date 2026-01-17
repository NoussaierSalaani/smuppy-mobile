import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

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
import GuidelinesScreen from '../screens/onboarding/GuidelinesScreen';
import SuccessScreen from '../screens/onboarding/SuccessScreen';
import ProfessionScreen from '../screens/onboarding/ProfessionScreen';
import BusinessDetailsScreen from '../screens/onboarding/BusinessDetailsScreen';
import ExpertiseScreen from '../screens/onboarding/ExpertiseScreen';

const Stack = createStackNavigator();

const fadeTransition = {
  cardStyleInterpolator: ({ current }) => ({ cardStyle: { opacity: current.progress } }),
  transitionSpec: {
    open: { animation: 'timing', config: { duration: 300 } },
    close: { animation: 'timing', config: { duration: 300 } },
  },
};

export default function AuthNavigator({ route }) {
  // Support dynamic initialRouteName from parent (for recovery flow)
  const initialRouteName = route?.params?.initialRouteName || 'Splash';

  // Callback to signal recovery is complete (passed to NewPasswordScreen)
  const onRecoveryComplete = route?.params?.onRecoveryComplete;

  return (
    <Stack.Navigator
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
      <Stack.Screen name="EmailVerificationPending" component={EmailVerificationPendingScreen} options={{ gestureEnabled: false }} />

      {/* Biometric */}
      <Stack.Screen name="EnableBiometric" component={EnableBiometricScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="BiometricSuccess" component={BiometricSuccessScreen} options={{ gestureEnabled: false }} />
      <Stack.Screen name="BiometricLogin" component={BiometricLoginScreen} options={{ gestureEnabled: false }} />

      {/* Onboarding */}
      <Stack.Screen name="TellUsAboutYou" component={TellUsAboutYouScreen} />
      <Stack.Screen name="AccountType" component={AccountTypeScreen} />
      <Stack.Screen name="Interests" component={InterestsScreen} />
      <Stack.Screen name="Profession" component={ProfessionScreen} />
      <Stack.Screen name="BusinessDetails" component={BusinessDetailsScreen} />
      <Stack.Screen name="Expertise" component={ExpertiseScreen} />
      <Stack.Screen name="Guidelines" component={GuidelinesScreen} />
      <Stack.Screen name="Success" component={SuccessScreen} />
    </Stack.Navigator>
  );
}
