// app/_layout.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import Audio from 'expo-av';

const GrandRevealOverlay = () => {
  const fadeAnim = useSharedValue(1);

  useEffect(() => {
    const startGrandReveal = async () => {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Audio.loadAsync(require('../assets/audio/reveal.aac'));
        setAudioModeAsync({ playsInSilentModeIOS: false });
        setVolumeAsync(0.6);
        playAsync();
        fadeAnim.value = withTiming(0, { duration: 400 });
      } catch (error) {
        console.error('Failed to start grand reveal:', error);
      }
    };

    const unsubscribe = useUserPreferencesStore.subscribe((state) => state.hasCompletedOnboarding, (hasCompletedOnboarding) => {
      if (hasCompletedOnboarding) {
        startGrandReveal();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      {/* Black overlay */}
    </Animated.View>
  );
};

const RootLayout = ({ children }) => {
  const hasCompletedOnboarding = useUserPreferencesStore((state) => state.hasCompletedOnboarding);

  return (
    <View style={styles.container}>
      {hasCompletedOnboarding && <GrandRevealOverlay />}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'black',
  },
});

export default RootLayout;
