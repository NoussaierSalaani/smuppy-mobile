import React from 'react';
import { ALL_EXPERTISE } from '../../config/expertise';
import CategorySelectionScreen from '../../components/CategorySelectionScreen';

type ExpertiseScreenProps = Readonly<{
  navigation: {
    canGoBack: () => boolean;
    goBack: () => void;
    navigate: (screen: string, params?: Record<string, unknown>) => void;
    replace: (screen: string, params?: Record<string, unknown>) => void;
    reset: (state: { index: number; routes: Array<{ name: string; params?: Record<string, unknown> }> }) => void;
  };
  route: { params?: Record<string, unknown> };
}>;

export default function ExpertiseScreen({ navigation, route }: ExpertiseScreenProps) {
  return (
    <CategorySelectionScreen
      navigation={navigation}
      route={route}
      allCategories={ALL_EXPERTISE}
      title="Your Expertise"
      subtitle="What do you specialize in?"
      infoText="You can add your bio, website and social links later in Settings."
      currentStep={3}
      totalSteps={4}
      paramKey="expertise"
      nextScreen="Guidelines"
      variant="expertise"
    />
  );
}
