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
  const _hasHydrated = useUserPreferencesStore((s) => s._hasHydrated);
  const hasCompletedOnboarding = useUserPreferencesStore((s) => s.hasCompletedOnboarding);
  const onboardingStep = useUserPreferencesStore((s) => s.onboardingStep);
  const selectedLines = useUserPreferencesStore((s) => s.selectedLines);

  useEffect(() => {
    // Wait until MMKV store hydration finishes before making routing decisions
    if (!_hasHydrated) {
      return;
    }

    if (!hasCompletedOnboarding) {
      router.replace(getOnboardingRedirectPath(onboardingStep) as any);
      return;
    }

    // If user already has configured lines (e.g. from an older widget build),
    // route cleanly to the dashboard root without forcing the drawer open.
    if (selectedLines && selectedLines.length > 0) {
      router.replace('/(tabs)' as any);
      return;
    }

    router.replace(`/(tabs)?manageLines=${Date.now()}` as any);
  }, [_hasHydrated, hasCompletedOnboarding, onboardingStep, selectedLines, router]);

  return <View style={{ flex: 1, backgroundColor: '#0A0A0F' }} />;
}
