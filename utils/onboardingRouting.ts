export function getOnboardingRedirectPath(onboardingStep: number): string {
  if (onboardingStep === 1) return '/onboarding/stations';
  if (onboardingStep === 2) return '/onboarding/tfl-registration';
  return '/onboarding/lines';
}
