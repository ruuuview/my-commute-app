// app/(tabs)/_layout.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Slot, useRouter, usePathname } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, useReducedMotion, withTiming } from 'react-native-reanimated';
import FractalGlassTabBar from '../../components/FractalGlassTabBar';

import { House, Broadcast, Gear } from 'phosphor-react-native';
import { DEMO_MODE } from '../../config/demoMode';

const allTabs: { key: string; icon: React.ComponentType<{size?: number; color?: string}>; label: string }[] = [
  { key: 'dashboard', icon: House, label: 'Dashboard' },
  { key: 'refunds', icon: Broadcast, label: 'Radar' },
  { key: 'settings', icon: Gear, label: 'Settings' },
];

// Phase 7 #14: a DEMO_MODE build must have ZERO Refund Radar surface.
const tabs = DEMO_MODE ? allTabs.filter((t) => t.key !== 'refunds') : allTabs;

const TabsLayout = () => {
  const router = useRouter();
  const pathname = usePathname();
  
  // Calculate activeKey dynamically using pathname prefixes to support nested routes
  const activeKey = pathname.startsWith('/refunds') || pathname.startsWith('/(tabs)/refunds')
    ? 'refunds'
    : pathname.startsWith('/settings')
      ? 'settings'
      : 'dashboard';

  // Dismiss native splash now that the dashboard has fully painted
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const tabBarTranslateY = useSharedValue(40);
  const contentOpacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      tabBarTranslateY.value = 0;
      return;
    }
    tabBarTranslateY.value = withDelay(60, withSpring(0, { damping: 20, stiffness: 180 }));
  }, [reducedMotion, tabBarTranslateY]);

  const isInitialMount = React.useRef(true);

  // Tab content opacity crossfades on switch (skips initial mount to prevent blank flash)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (reducedMotion) {
      contentOpacity.value = 1;
      return;
    }
    contentOpacity.value = withTiming(0, { duration: 120 }, (finished) => {
      if (finished) {
        contentOpacity.value = withDelay(20, withTiming(1, { duration: 160 }));
      }
    });
  }, [pathname, contentOpacity, reducedMotion]);

  const tabBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: tabBarTranslateY.value }],
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.flex1, contentStyle]}>
        <Slot />
      </Animated.View>
      <Animated.View style={[styles.tabBarContainer, tabBarStyle]}>
        <FractalGlassTabBar 
          tabs={tabs} 
          activeKey={activeKey} 
          onPress={(key: string) => {
            if (key === 'refunds') {
              if (DEMO_MODE) return; // demo build: Radar is unreachable
              router.push('/(tabs)/refunds');
            } else if (key === 'settings') {
              router.push('/settings');
            } else if (key === 'dashboard') {
              router.push('/(tabs)');
            }
          }} 
        />
      </Animated.View>
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


