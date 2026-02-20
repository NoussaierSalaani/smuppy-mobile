import React, { useCallback } from 'react';
import OnboardingProfileForm from '../../components/OnboardingProfileForm';
import { sanitizeDisplayText } from '../../utils/sanitize';

const NAME_MAX_LENGTH = 100;

type TellUsAboutYouScreenProps = Readonly<{
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}>;

export default function TellUsAboutYouScreen({ navigation, route }: TellUsAboutYouScreenProps) {
  const { accountType } = route?.params || {};

  const handleNext = useCallback((data: {
    profileImage: string | null;
    name: string;
    gender: string;
    dateOfBirth: string;
  }) => {
    navigation.navigate('Interests', {
      accountType,
      name: data.name,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth,
      profileImage: data.profileImage,
    });
  }, [navigation, accountType]);

  return (
    <OnboardingProfileForm
      navigation={navigation}
      currentStep={1}
      totalSteps={3}
      title="Tell us about you"
      subtitle="Help us personalize your experience"
      nameLabel="Full name"
      namePlaceholder="Your name"
      showInfoNote
      onNext={handleNext}
      sanitizeName={sanitizeDisplayText}
      nameMaxLength={NAME_MAX_LENGTH}
    />
  );
}
