// app/_layout.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import GrandRevealOverlay from '../components/GrandRevealOverlay';
import Stack from 'expo-router';

const RootLayout = () => {
  const hasCompletedOnboarding = useUserPreferencesStore((state) => state.hasCompletedOnboarding);

  return (
    <View style={styles.container}>
      {hasCompletedOnboarding && <GrandRevealOverlay pointerEvents="none" />}
      <Stack screenOptions={{ headerShown: false }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default RootLayout;
