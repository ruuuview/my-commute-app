// app/onboarding/tfl-registration.tsx — TfL Registration (v1)
// REMOVED from the onboarding flow (2026-08-01): onboarding is exactly 2 value
// screens (lines, stations) — no permission asks, no TfL account sign-in.
// Kept on disk as a rescue path for persisted mid-onboarding users
// (onboardingStep === 2) and as the screen to re-surface with Refund Radar
// post-activation. See master plan → REFUND RADAR → TfL registration section.
//
// ICON NOTE: This file uses @expo/vector-icons (MaterialIcons) as a stand-in for Phosphor.
// AGENTS.md mandates Phosphor-only icons, but `phosphor-react-native` is not yet in package.json.
// Once the dependency is added, swap the import below for `@phosphor-icons/react/native`
// (e.g. TflRegistrationIcon -> `Link`, RegisterIcon -> `OpenInNew`, LaterIcon -> `ArrowRight`)
// and delete this note. The icon *slots* already match the intended Phosphor glyphs.
import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  ScrollView,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useNavigation } from 'expo-router';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { OnboardingGradient } from '../../components/OnboardingGradient';
import { ProgressDots } from '../../components/ProgressDots';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { BlurView } from 'expo-blur';
import { GLASS, PREMIUM_BUTTON } from '../../theme/colors';

// ─────────────────────────────────────────────────────────────────────────────
// TFL_REGISTRATION_URL — PLACEHOLDER, NEEDS CONFIRMING.
// This is where the user signs in to their TfL account to access Oyster /
// contactless journey history (the 12-month window Refund Radar needs).
// Default is the contactless/account sign-in landing page. Confirm the exact
// deep-link target with product before launch — it may be a specific
// "manage journey history" or "register an Oyster card" URL.
// ─────────────────────────────────────────────────────────────────────────────
const TFL_REGISTRATION_URL = 'https://contactless.tfl.gov.uk/';

export default function TflRegistrationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const setTflRegistered = useUserPreferencesStore((s) => s.setTflRegistered);
  const completeOnboarding = useUserPreferencesStore((s) => s.completeOnboarding);

  const registerAnim = usePressAnimation('continue_btn');
  const laterAnim = usePressAnimation('skip_btn');
  const backAnim = usePressAnimation('back_btn');

  // Subtle entrance — mirror the calm peer tone, no pulsing, no sound on mount.
  const contentOpacity = useSharedValue(0);
  useEffect(() => {
    contentOpacity.value = withTiming(1, { duration: 260, easing: Easing.inOut(Easing.ease) });
  }, [contentOpacity]);
  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const finishAndExit = useCallback(() => {
    completeOnboarding();
    const parentNav = navigation.getParent();
    if (parentNav) {
      (parentNav as any).reset({
        index: 0,
        routes: [{ name: '(tabs)' }],
      });
    } else {
      router.replace('/(tabs)');
    }
  }, [completeOnboarding, navigation, router]);

  const handleRegister = useCallback(async () => {
    // Haptics on CTA tap — interaction feedback only, matches AGENTS.md.
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playSound('select', 0.45);

    // Record the choice immediately — they've committed to registering.
    // We set true optimistically: they are being routed to TfL to register.
    setTflRegistered(true);

    // Open TfL's registration / journey-history sign-in.
    try {
      const supported = await Linking.canOpenURL(TFL_REGISTRATION_URL);
      if (supported) {
        await Linking.openURL(TFL_REGISTRATION_URL);
      }
    } catch (err) {
      console.log('[tfl-registration] failed to open TFL_REGISTRATION_URL:', err);
    }

    // Either way, advance onboarding — registration happens in the browser,
    // the app should not block on it.
    finishAndExit();
  }, [setTflRegistered, finishAndExit]);

  const handleLater = useCallback(() => {
    // Absent-if-not-applicable pattern: "Do it later" is an outline button,
    // never greyed, never disabled. Records the unregistered choice.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('pop', 0.32);
    setTflRegistered(false);
    finishAndExit();
  }, [setTflRegistered, finishAndExit]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('pop', 0.32);
    // Step back to station selection.
    useUserPreferencesStore.setState({ onboardingStep: 1 });
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/onboarding/stations');
    }
  }, [router]);

  return (
    <View style={styles.root}>
      <OnboardingGradient />

      {/* Grain Overlay */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>

      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

      {/* Skip — absolute top-right, matches lines.tsx pattern */}
      <Pressable
        onPress={handleLater}
        style={[styles.skipAbsolute, { top: insets.top + 12 }]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.skipAbsoluteText}>Do it later</Text>
      </Pressable>

      {/* Back — top-left crown, matches stations.tsx pattern */}
      <View style={[styles.navHeader, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={handleBack}
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          style={({ pressed }) => [
            styles.backButtonPressable,
            pressed && styles.backButtonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Animated.View style={[styles.navHeaderBtn, backAnim.animatedStyle]}>
            <MaterialIcons name="arrow-back" size={18} color="#FFFFFF" />
            <Text style={styles.navBackText}>Back</Text>
          </Animated.View>
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 56, paddingBottom: Math.max(insets.bottom, 16) + 96 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={contentAnimatedStyle}>
          {/* Progress — this is step 3 of the onboarding flow */}
          <View style={{ marginBottom: 14 }}>
            <ProgressDots total={3} current={3} />
          </View>

          <Text style={styles.eyebrow}>SETUP · STEP 3 OF 3</Text>

          <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
            One tap makes Refund Radar actually work
          </Text>

          <Text style={styles.subtitle} allowFontScaling maxFontSizeMultiplier={1.3}>
            Refund Radar claims your delay money back from TfL. But it can only reach
            the journeys TfL lets it see.
          </Text>

          {/* Glass explainer card — 4px top accent bar, PREMIUM_GLASS behind it */}
          <View style={styles.cardWrap}>
            <BlurView
              intensity={20}
              tint="light"
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.accentBar} />
            <View style={styles.cardInner}>
              <View style={styles.compareRow}>
                <MaterialIcons name="link" size={20} color="#34D399" />
                <View style={styles.compareText}>
                  <Text style={styles.compareHeading}>Registered with TfL</Text>
                  <Text style={styles.compareBody}>
                    12 months of claimable journey history. Refund Radar can reach
                    nearly every delay you were owed.
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.compareRow}>
                <MaterialIcons name="link-off" size={20} color="#9CA3AF" />
                <View style={styles.compareText}>
                  <Text style={styles.compareHeading}>Not registered</Text>
                  <Text style={styles.compareBody}>
                    Just 7 days of history. Most delays fall outside that window,
                    so Refund Radar is nearly useless until you register.
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.noteRow}>
            <MaterialIcons name="open-in-new" size={16} color="rgba(255,255,255,0.55)" />
            <Text style={styles.noteText} allowFontScaling maxFontSizeMultiplier={1.3}>
              Takes about a minute. We send you to TfL to sign in — your card details
              never touch this app.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Sticky CTA footer — primary solid white + secondary outline */}
      <View
        style={[styles.ctaWrap, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <Pressable
          onPress={handleRegister}
          onPressIn={registerAnim.onPressIn}
          onPressOut={registerAnim.onPressOut}
          style={styles.ctaPressable}
        >
          <Animated.View
            style={[
              styles.cta,
              registerAnim.animatedStyle,
              { backgroundColor: '#FFFFFF' },
            ]}
          >
            <MaterialIcons name="open-in-new" size={18} color="#0A0F3C" />
            <Text style={[styles.ctaText, { color: '#0A0F3C' }]}>
              Register with TfL
            </Text>
          </Animated.View>
        </Pressable>

        <Pressable
          onPress={handleLater}
          onPressIn={laterAnim.onPressIn}
          onPressOut={laterAnim.onPressOut}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.laterPressable}
        >
          <Animated.View
            style={[
              styles.later,
              laterAnim.animatedStyle,
              {
                backgroundColor: PREMIUM_BUTTON.background,
                borderWidth: PREMIUM_BUTTON.borderWidth,
                borderColor: PREMIUM_BUTTON.borderColor,
              },
            ]}
          >
            <Text style={styles.laterText}>Do it later</Text>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex1: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  navHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    paddingHorizontal: 16,
  },
  backButtonPressable: {
    alignSelf: 'flex-start',
  },
  backButtonPressed: {
    opacity: 0.6,
  },
  navHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 4,
  },
  navBackText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: '#FFFFFF',
  },
  skipAbsolute: {
    position: 'absolute',
    right: 16,
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: PREMIUM_BUTTON.background,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
  },
  skipAbsoluteText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.30)',
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.9,
    lineHeight: 31,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.62)',
    lineHeight: 22,
    marginBottom: 22,
  },
  cardWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: GLASS.background,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#0098D4',
    zIndex: 2,
  },
  cardInner: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  compareText: {
    flex: 1,
  },
  compareHeading: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  compareBody: {
    fontSize: 13.5,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.62)',
    lineHeight: 19,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginVertical: 14,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 18,
    paddingRight: 8,
  },
  noteText: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.50)',
    lineHeight: 18,
  },
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    overflow: 'hidden',
  },
  ctaPressable: {
    width: '100%',
  },
  cta: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  laterPressable: {
    width: '100%',
    marginTop: 10,
  },
  later: {
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.80)',
  },
});
