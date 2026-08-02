export function getOnboardingRedirectPath(onboardingStep: number): string {
  if (onboardingStep === 1) return '/onboarding/stations';
  // Step 2 (tfl-registration) is no longer part of the onboarding flow
  // (2026-08-01: onboarding = 2 value screens). Kept as a rescue path only
  // for users persisted mid-onboarding before the change — the screen
  // completes onboarding and exits to the dashboard.
  if (onboardingStep === 2) return '/onboarding/tfl-registration';
  return '/onboarding/lines';
}
