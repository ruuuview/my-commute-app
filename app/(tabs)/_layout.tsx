// app/(tabs)/_layout.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Slot } from 'expo-router';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import FractalGlassTabBar from '../../components/FractalGlassTabBar';

const tabs = [
  { key: 'dashboard', icon: 'home', label: 'Dashboard' },
  { key: 'status', icon: 'information-circle', label: 'Status' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

const TabsLayout = () => {
  // Hardcoded activeKey to 'dashboard' for now since we're on the dashboard index
  const activeKey = 'dashboard';

  // Dismiss native splash now that the dashboard has fully painted
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.container}>
      <View style={{ flex: 1 }}>
        <Slot />
      </View>
      <View style={styles.tabBarContainer}>
        <FractalGlassTabBar tabs={tabs} activeKey={activeKey} onPress={(key) => {}} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  tabBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  }
});

export default TabsLayout;
