import React from 'react';
import { ALL_INTERESTS } from '../../config/interests';
import CategorySelectionScreen from '../../components/CategorySelectionScreen';

type InterestsScreenProps = Readonly<{
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}>;

export default function InterestsScreen({ navigation, route }: InterestsScreenProps) {
  return (
    <CategorySelectionScreen
      navigation={navigation}
      route={route}
      allCategories={ALL_INTERESTS}
      title="What are you into?"
      subtitle="Select your interests to personalize your feed"
      currentStep={2}
      totalSteps={3}
      paramKey="interests"
      nextScreen="Guidelines"
      variant="interests"
    />
  );
}
