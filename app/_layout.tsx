import { useEffect, useRef, useCallback, useState } from 'react';
import { View, StyleSheet, AccessibilityInfo, AppState } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
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

  // Increment session statistics once per cold start when store hydrates
  useEffect(() => {
    if (_hasHydrated) {
      const store = useUserPreferencesStore.getState();
      const updates: any = {
        sessionCount: (store.sessionCount || 0) + 1
      };
      if (!store.firstOpenTimestamp) {
        updates.firstOpenTimestamp = Date.now();
      }
      useUserPreferencesStore.setState(updates);
    }
  }, [_hasHydrated]);

  // Track active background-to-foreground transitions to increment sessionCount
  useEffect(() => {
    let lastBackgroundTime = 0;
    
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background') {
        lastBackgroundTime = Date.now();
      } else if (nextAppState === 'active') {
        // True app open from background (if backgrounded for > 60 seconds to prevent notification check noise)
        if (lastBackgroundTime > 0 && Date.now() - lastBackgroundTime > 60000) {
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
  
  const overlayOpacity = useSharedValue(0);
  
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
      playHaptic();
      navigateToDashboard();
    }
  }, [hasCompletedOnboarding, navigateToDashboard, playHaptic, _hasHydrated]);

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
