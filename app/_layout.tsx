// app/_layout.tsx

import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
// Use expo-audio per v4.2 spec (stubbed until asset is provided)
// import { useAudioPlayer } from 'expo-audio';

// Prevent native splash from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function Layout() {
  const router = useRouter();
  const _hasHydrated = useUserPreferencesStore((state) => state._hasHydrated);
  const hasCompletedOnboarding = useUserPreferencesStore((state) => state.hasCompletedOnboarding);
  
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  const isReady = _hasHydrated && fontsLoaded;
  
  // Grand Reveal Transition State
  const [isRevealing, setIsRevealing] = useState(false);
  const prevCompleted = useRef(hasCompletedOnboarding);
  const blackOpacity = useSharedValue(0);
  const initialHydrationFinished = useRef(false);

  useEffect(() => {
    if (_hasHydrated) {
      setTimeout(() => {
        initialHydrationFinished.current = true;
      }, 500);
    }
  }, [_hasHydrated]);

  const playAudioCue = async () => {
    try {
      // expo-audio implementation goes here once asset is available
      // e.g. player.play();
      console.log('Grand Reveal Audio Cue: *THUD*');
    } catch (e) {
      console.warn('Audio cue failed, continuing transition safely', e);
    }
  };

  useEffect(() => {
    // Only trigger the Grand Reveal if hydration finished a while ago.
    // This prevents the transition from triggering on every cold app launch.
    if (!prevCompleted.current && hasCompletedOnboarding && initialHydrationFinished.current) {
      setIsRevealing(true);
      playAudioCue();
      
      // 1. Fade whole screen to pure Black (#000000) for 100ms.
      blackOpacity.value = withTiming(1, { duration: 100 }, (finished) => {
        if (finished) {
          // 2. Perform the route swap behind the black screen.
          // Wrapped in a small timeout to ensure the Root Layout is ready
          runOnJS(setTimeout)(() => router.replace('/'), 50);
          
          // 3. Fade Black out over 400ms, revealing the Dashboard.
          blackOpacity.value = withTiming(0, { duration: 400 }, (fadeFinished) => {
            if (fadeFinished) {
              runOnJS(setIsRevealing)(false);
            }
          });
        }
      });
    }
    prevCompleted.current = hasCompletedOnboarding;
  }, [hasCompletedOnboarding, router]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: blackOpacity.value,
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      <SafeAreaProvider>
        {isReady ? <Stack screenOptions={{ headerShown: false }} /> : null}
        
        {/* Grand Reveal Black Overlay */}
        <Animated.View 
          style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000000' }, overlayStyle]} 
          pointerEvents={isRevealing ? 'auto' : 'none'}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
