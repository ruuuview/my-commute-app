// app/lines.tsx
// Deep link target for widget tap: mycommute://lines
// Smoothly routes into dashboard and opens the Manage Lines modal
import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { getOnboardingRedirectPath } from '../utils/onboardingRouting';

export default function LinesRoute() {
  const router = useRouter();
  const hasCompletedOnboarding = useUserPreferencesStore((s) => s.hasCompletedOnboarding);
  const onboardingStep = useUserPreferencesStore((s) => s.onboardingStep);

  useEffect(() => {
    if (!hasCompletedOnboarding) {
      router.replace(getOnboardingRedirectPath(onboardingStep) as any);
      return;
    }
    router.replace(`/(tabs)?manageLines=${Date.now()}` as any);
  }, [hasCompletedOnboarding, onboardingStep, router]);

  return <View style={{ flex: 1, backgroundColor: '#0A0A0F' }} />;
}
