// app/index.tsx
import { Redirect } from 'expo-router';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

export default function Index() {
  const hasCompletedOnboarding = useUserPreferencesStore(
    (state) => state.hasCompletedOnboarding
  );

  if (!hasCompletedOnboarding) {
    return <Redirect href="/onboarding/lines" />;
  }

  return <Redirect href="/(tabs)" />;
}
