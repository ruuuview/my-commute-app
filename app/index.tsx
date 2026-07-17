// app/index.tsx
import { Redirect } from 'expo-router';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

export default function Index() {
  const hasCompletedOnboarding = useUserPreferencesStore(
    (state) => state.hasCompletedOnboarding
  );
  const onboardingStep = useUserPreferencesStore(
    (state) => state.onboardingStep
  );

  if (!hasCompletedOnboarding) {
    if (onboardingStep === 1) {
      return <Redirect href={"/onboarding/stations" as any} />;
    }
    if (onboardingStep === 2) {
      return <Redirect href={"/onboarding/tfl-registration" as any} />;
    }
    return <Redirect href={"/onboarding/lines" as any} />;
  }

  return <Redirect href="/(tabs)" />;
}
