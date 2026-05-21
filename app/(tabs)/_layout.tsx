// app/(tabs)/_layout.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import FractalGlassTabBar from '../../components/FractalGlassTabBar';

const tabs = [
  { key: 'dashboard', icon: 'home', label: 'Dashboard' },
  { key: 'status', icon: 'information-circle', label: 'Status' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

const TabsLayout = ({ children }) => {
  const activeKey = useUserPreferencesStore((state) => state.onboardingStep);

  // Dismiss native splash now that the dashboard has fully painted
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.container}>
      <FractalGlassTabBar tabs={tabs} activeKey={activeKey} onPress={(key) => {}} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default TabsLayout;
