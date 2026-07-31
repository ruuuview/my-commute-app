// app/index.tsx
import { Redirect } from 'expo-router';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { getOnboardingRedirectPath } from '../utils/onboardingRouting';

export default function Index() {
  const hasCompletedOnboarding = useUserPreferencesStore(
    (state) => state.hasCompletedOnboarding
  );
  const onboardingStep = useUserPreferencesStore(
    (state) => state.onboardingStep
  );

  if (!hasCompletedOnboarding) {
    return <Redirect href={getOnboardingRedirectPath(onboardingStep) as any} />;
  }

  return <Redirect href="/(tabs)" />;
}
