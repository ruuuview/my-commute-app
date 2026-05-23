import { useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
// import { useAudioPlayer } from 'expo-audio'; 

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const hasCompletedOnboarding = useUserPreferencesStore(s => s.hasCompletedOnboarding);
  const _hasHydrated = useUserPreferencesStore((state) => state._hasHydrated);

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
  
  const overlayOpacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  
  // Guard: Initialize with current state to prevent cold-start animations
  const hasAnimatedReveal = useRef(hasCompletedOnboarding);

  const navigateToDashboard = useCallback(() => {
    // Navigate to the index screen (dashboard) as we don't have a (app) folder group setup yet, 
    // or we can just replace('/') which goes to the dashboard.
    router.replace('/');
  }, [router]);

  const playHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    AccessibilityInfo.announceForAccessibility("Welcome to your dashboard");
  }, []);

  useEffect(() => {
    // Only fire if they just completed it in this session
    if (hasCompletedOnboarding && !hasAnimatedReveal.current && _hasHydrated) {
      hasAnimatedReveal.current = true;

      if (reducedMotion) {
        // Accessibility App Store Requirement: Instant swap
        playHaptic();
        navigateToDashboard();
        return;
      }

      // 1. Fade to Black (100ms)
      overlayOpacity.value = withTiming(1, { duration: 100 }, (finished) => {
        if (finished) {
          // 2. The Route Swap (Hidden behind black)
          runOnJS(navigateToDashboard)();
          
          // 3. The Physical "Thud"
          runOnJS(playHaptic)();
          
          /* AUDIO MOCKED FOR NOW TO PREVENT BUNDLER CRASH
          try {
            const player = useAudioPlayer(require('../assets/audio/thud.wav'));
            player.volume = 0.6;
            player.play();
          } catch (e) {
            console.log("Audio skipped");
          }
          */

          // 4. Fade Black Out to reveal Dashboard (400ms)
          overlayOpacity.value = withTiming(0, { duration: 400 });
        }
      });
    }
  }, [hasCompletedOnboarding, overlayOpacity, reducedMotion, navigateToDashboard, playHaptic, _hasHydrated]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    zIndex: overlayOpacity.value > 0 ? 999 : -1,
  }));

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {isReady ? <Stack screenOptions={{ headerShown: false }} /> : null}
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.blackOverlay, overlayStyle]} pointerEvents="none" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0A0F' },
  blackOverlay: { backgroundColor: '#000000' },
});
