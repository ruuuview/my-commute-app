// frontend/utils/onboardingCta.ts

export interface OnboardingCtaVisibilityParams {
  itemCount: number;
  isFocused?: boolean;
  searchActive?: boolean;
  query?: string;
}

/**
 * Pure visibility gate for Onboarding Step 1 (lines) and Step 2 (stations) CTA.
 * Invariant: When 0 items are selected, CTA is strictly HIDDEN (empty canvas at bottom).
 * When keyboard is focused or active search query exists, CTA is also HIDDEN.
 */
export function shouldHideOnboardingCta(params: OnboardingCtaVisibilityParams): boolean {
  const { itemCount, isFocused = false, searchActive = false, query = '' } = params;

  // 1. Zero selection invariant: never show CTA at 0 items
  if (itemCount === 0) {
    return true;
  }

  // 2. Keyboard focus invariant: never cover keyboard or suggestion results
  if (isFocused) {
    return true;
  }

  // 3. Search query invariant: hide CTA while actively searching
  if (searchActive && query.trim() !== '') {
    return true;
  }

  return false;
}
