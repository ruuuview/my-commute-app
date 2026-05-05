// app/(tabs)/_layout.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import FractalGlassTabBar from '../components/FractalGlassTabBar';

const tabs = [
  { key: 'dashboard', icon: 'home', label: 'Dashboard' },
  { key: 'status', icon: 'information-circle', label: 'Status' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

const TabsLayout = ({ children }) => {
  const activeKey = useUserPreferencesStore((state) => state.onboardingStep);

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
