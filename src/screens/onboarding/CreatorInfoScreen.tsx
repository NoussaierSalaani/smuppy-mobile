import React, { useCallback, useMemo } from 'react';
import OnboardingProfileForm from '../../components/OnboardingProfileForm';

type CreatorInfoScreenProps = Readonly<{
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}>;

export default function CreatorInfoScreen({ navigation, route }: CreatorInfoScreenProps) {
  const params = useMemo(() => route?.params || {}, [route?.params]);

  const handleNext = useCallback((data: {
    profileImage: string | null;
    name: string;
    gender: string;
    dateOfBirth: string;
  }) => {
    navigation.navigate('CreatorOptionalInfo', {
      ...params,
      profileImage: data.profileImage,
      displayName: data.name,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth,
    });
  }, [navigation, params]);

  return (
    <OnboardingProfileForm
      navigation={navigation}
      currentStep={1}
      totalSteps={4}
      title="Creator Profile"
      subtitle="Tell us about yourself"
      nameLabel="Display Name"
      namePlaceholder="Your brand or display name"
      onNext={handleNext}
    />
  );
}
