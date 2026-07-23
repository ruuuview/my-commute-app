// app/(tabs)/_layout.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { Slot, useRouter, usePathname } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, useReducedMotion, withTiming } from 'react-native-reanimated';
import FractalGlassTabBar from '../../components/FractalGlassTabBar';

import { Ionicons } from '@expo/vector-icons';

const tabs: { key: string; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'dashboard', icon: 'home', label: 'Dashboard' },
  { key: 'refunds', icon: 'analytics', label: 'Radar' },
  { key: 'status', icon: 'notifications-outline', label: 'Alerts' },
  { key: 'settings', icon: 'settings', label: 'Settings' },
];

const TabsLayout = () => {
  const router = useRouter();
  const pathname = usePathname();
  
  // Calculate activeKey dynamically using pathname prefixes to support nested routes
  const activeKey = pathname.startsWith('/refunds') || pathname.startsWith('/(tabs)/refunds')
    ? 'refunds'
    : pathname.startsWith('/settings')
      ? 'settings'
      : pathname.startsWith('/journeyPlanner')
        ? 'status'
        : 'dashboard';

  // Dismiss native splash now that the dashboard has fully painted
  useEffect(() => {
    SplashScreen.hideAsync();
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

  // Tab content opacity crossfades on switch
  useEffect(() => {
    if (reducedMotion) {
      contentOpacity.value = 1;
      return;
    }
    contentOpacity.value = withTiming(0, { duration: 160 }, (finished) => {
      if (finished) {
        contentOpacity.value = withDelay(40, withTiming(1, { duration: 200 }));
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
              router.push('/(tabs)/refunds');
            } else if (key === 'settings') {
              router.push('/settings');
            } else if (key === 'status') {
              router.push('/(tabs)');
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


