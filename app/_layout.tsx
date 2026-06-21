import { useEffect, useRef } from 'react';
import { StyleSheet, AccessibilityInfo, AppState, LogBox } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useUserPreferencesStore, UserPreferencesState } from '../store/userPreferencesStore';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { setAudioModeAsync } from 'expo-audio';
import { preloadSounds } from '../utils/sound';
import { registerBackgroundFetchAsync, syncGeofencesAsync } from '../services/backgroundTask';
import { syncToWidget } from '../utils/widgetSync';

SplashScreen.preventAutoHideAsync();
LogBox.ignoreLogs([
  'ref.measureLayout must be called with a ref to a native component',
]);

// Suppress the upstream react-native-draggable-flatlist measureLayout warning
// from flooding the Metro console. This is a known library bug with no upstream fix.
// React 19 sends these as format strings ("Warning: %s") so we must check ALL args.
const MEASURE_MSG = 'ref.measureLayout must be called with a ref to a native component';
const _origConsoleError = console.error;
const _origConsoleWarn = console.warn;
const _isMeasureLayoutWarning = (...args: any[]) =>
  args.some((a) => typeof a === 'string' && a.includes(MEASURE_MSG));
console.error = (...args: any[]) => {
  if (_isMeasureLayoutWarning(...args)) return;
  _origConsoleError(...args);
};
console.warn = (...args: any[]) => {
  if (_isMeasureLayoutWarning(...args)) return;
  _origConsoleWarn(...args);
};

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const hasCompletedOnboarding = useUserPreferencesStore(s => s.hasCompletedOnboarding);
  const onboardingStep = useUserPreferencesStore(s => s.onboardingStep);
  const _hasHydrated = useUserPreferencesStore((state) => state._hasHydrated);
  const pinnedStations = useUserPreferencesStore(s => s.pinnedStations);
  const locationGranted = useUserPreferencesStore(s => s.locationGranted);

  // Preload UI sounds and configure audio ducking
  useEffect(() => {
    async function initAudio() {
      try {
        await setAudioModeAsync({
          playsInSilentMode: false,
          shouldPlayInBackground: false,
          interruptionMode: 'doNotMix',
        });
        await preloadSounds();
      } catch (e) {
        console.log('Failed to initialize audio mode or preload sounds:', e);
      }
    }
    initAudio();
  }, []);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  const isReady = _hasHydrated && fontsLoaded;

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();
    }
  }, [isReady]);

  const hasIncrementedSession = useRef(false);

  // Increment session statistics once per cold start when store hydrates
  useEffect(() => {
    if (_hasHydrated && !hasIncrementedSession.current) {
      hasIncrementedSession.current = true;
      const store = useUserPreferencesStore.getState();
      const updates: Partial<UserPreferencesState> = {
        sessionCount: (store.sessionCount || 0) + 1
      };
      if (!store.firstOpenTimestamp) {
        updates.firstOpenTimestamp = Date.now();
      }
      useUserPreferencesStore.setState(updates);
    }
  }, [_hasHydrated]);

  // Register background task once store hydrates
  useEffect(() => {
    if (_hasHydrated) {
      registerBackgroundFetchAsync();
    }
  }, [_hasHydrated]);

  // Synchronize geofences whenever hydration is complete, location permissions change, or pinned stations change
  useEffect(() => {
    if (_hasHydrated) {
      syncGeofencesAsync(pinnedStations);
    }
  }, [_hasHydrated, locationGranted, pinnedStations]);

  // Synchronize with iOS Widget when selectedLines changes
  const selectedLines = useUserPreferencesStore(s => s.selectedLines);
  useEffect(() => {
    if (_hasHydrated) {
      syncToWidget(selectedLines);
    }
  }, [_hasHydrated, selectedLines]);

  // Track active background-to-foreground transitions to increment sessionCount
  useEffect(() => {
    let lastBackgroundTime = 0;
    
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        lastBackgroundTime = Date.now();
      } else if (nextAppState === 'active') {
        // True app open from background (if backgrounded for > 60 seconds to prevent notification check noise)
        if (hasIncrementedSession.current && lastBackgroundTime > 0 && Date.now() - lastBackgroundTime > 60000) {
          const store = useUserPreferencesStore.getState();
          useUserPreferencesStore.setState({
            sessionCount: (store.sessionCount || 0) + 1
          });
        }
        lastBackgroundTime = 0;
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
  
  const whiteOverlayOpacity = useSharedValue(0);
  
  // Guard: Initialize with current state to prevent cold-start animations
  const hasAnimatedReveal = useRef(hasCompletedOnboarding);

  // Snapshot hasCompletedOnboarding at the exact moment hydration finishes to prevent cold-start race condition flashes
  const atHydrationCompletedOnboarding = useRef<boolean | null>(null);

  useEffect(() => {
    if (_hasHydrated && atHydrationCompletedOnboarding.current === null) {
      atHydrationCompletedOnboarding.current = hasCompletedOnboarding;
    }
  }, [_hasHydrated, hasCompletedOnboarding]);

  useEffect(() => {
    // Only fire if they just completed it in this session (i.e. they were not completed at hydration)
    if (_hasHydrated && hasCompletedOnboarding) {
      if (atHydrationCompletedOnboarding.current === false) {
        if (!hasAnimatedReveal.current) {
          hasAnimatedReveal.current = true;
          
          // Success haptics
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          AccessibilityInfo.announceForAccessibility("Welcome to your dashboard");

          // 1-frame pure white flash sequence
          whiteOverlayOpacity.value = 1;
          whiteOverlayOpacity.value = withTiming(0, {
            duration: 350,
            easing: Easing.out(Easing.poly(3)),
          });
        }
      } else {
        // If they completed it in a prior session, mark as revealed instantly without animations
        hasAnimatedReveal.current = true;
      }
    }
  }, [_hasHydrated, hasCompletedOnboarding, whiteOverlayOpacity]);

  useEffect(() => {
    if (_hasHydrated && !hasCompletedOnboarding) {
      hasAnimatedReveal.current = false;
      atHydrationCompletedOnboarding.current = false;
      
      const pathSegments = segments as string[];
      const inOnboarding = pathSegments[0] === 'onboarding';
      const onRootIndex = pathSegments.length === 0 || pathSegments[0] === 'index';
      
      if (!inOnboarding && !onRootIndex) {
        const t = setTimeout(() => {
          let targetPath = '/onboarding/lines';
          if (onboardingStep === 1) {
            targetPath = '/onboarding/stations';
          } else if (onboardingStep === 2) {
            targetPath = '/onboarding/permissions';
          }
          router.replace(targetPath as any);
        }, 100);
        return () => clearTimeout(t);
      }
    }
  }, [_hasHydrated, hasCompletedOnboarding, onboardingStep, router, segments]);

  const whiteOverlayStyle = useAnimatedStyle(() => ({
    opacity: whiteOverlayOpacity.value,
    zIndex: whiteOverlayOpacity.value > 0 ? 1000 : -1,
  }));

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {isReady ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        ) : null}
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.whiteOverlay, whiteOverlayStyle]} pointerEvents="none" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  whiteOverlay: { backgroundColor: '#FFFFFF' },
});

