// app/(tabs)/_layout.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Slot, useRouter } from 'expo-router';
import FractalGlassTabBar from '../../components/FractalGlassTabBar';

import { Ionicons } from '@expo/vector-icons';

const tabs: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'dashboard', icon: 'home', label: 'Dashboard' },
  { key: 'status', icon: 'information-circle', label: 'Status' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

const TabsLayout = () => {
  const router = useRouter();
  // Hardcoded activeKey to 'dashboard' for now since we're on the dashboard index
  const activeKey = 'dashboard';

  // Dismiss native splash now that the dashboard has fully painted
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.flex1}>
        <Slot />
      </View>
      <View style={styles.tabBarContainer}>
        <FractalGlassTabBar 
          tabs={tabs} 
          activeKey={activeKey} 
          onPress={(key: string) => {
            if (key === 'settings') {
              router.push('/settings');
            } else if (key === 'status') {
              router.push('/journeyPlanner');
            }
          }} 
        />
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
  },
  flex1: { flex: 1 },
});

export default TabsLayout;
