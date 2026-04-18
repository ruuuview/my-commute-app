/**
 * MY COMMUTE — Fractal Glass Bottom Tab Bar
 * Custom blurred native-feel tab implementation
 */

import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { TouchableOpacity } from 'react-native';

// Tab definitions
interface Tab {
  key: string;
  label: string;
  icon: React.ReactNode;
}

interface FractalGlassTabBarProps {
  tabs: Tab[];
  activeKey: string;
  onPress: (key: string) => void;
}

// Minimal SVG-inspired icons via View composition
const HomeIcon = ({ active }: { active: boolean }) => (
  <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
    {/* Roof */}
    <View style={{
      width: 0, height: 0,
      borderLeftWidth: 11, borderRightWidth: 11,
      borderBottomWidth: 9,
      borderLeftColor: 'transparent', borderRightColor: 'transparent',
      borderBottomColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
      marginBottom: 1,
    }} />
    {/* Body */}
    <View style={{
      width: 14, height: 9,
      backgroundColor: active ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
      borderRadius: 1,
    }} />
  </View>
);

const SearchIcon = ({ active }: { active: boolean }) => {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.4)';
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 14, height: 14, borderRadius: 7,
        borderWidth: 2, borderColor: color,
      }} />
      <View style={{
        position: 'absolute', bottom: 2, right: 2,
        width: 6, height: 2,
        backgroundColor: color,
        transform: [{ rotate: '45deg' }],
        borderRadius: 1,
      }} />
    </View>
  );
};

const SettingsIcon = ({ active }: { active: boolean }) => {
  const color = active ? '#FFFFFF' : 'rgba(255,255,255,0.4)';
  return (
    <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 16, height: 16, borderRadius: 8,
        borderWidth: 2, borderColor: color,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
      </View>
    </View>
  );
};

// Individual tab item
interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onPress: () => void;
}

const TabItem = ({ tab, isActive, onPress }: TabItemProps) => {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(isActive ? 1 : 0.5);

  useEffect(() => {
    opacity.value = withTiming(isActive ? 1 : 0.5, { duration: 200 });
  }, [isActive]);

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 180, mass: 0.7 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1.0, { damping: 15, stiffness: 180, mass: 0.7 });
  };
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const itemStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.tabItem}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: isActive }}
      activeOpacity={1}
    >
      <Animated.View style={[styles.tabItemInner, itemStyle]}>
        {tab.icon}
        <Text style={[styles.tabLabel, { color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }]}>
          {tab.label}
        </Text>
        {isActive && <View style={styles.activeIndicator} />}
      </Animated.View>
    </TouchableOpacity>
  );
};

// Main tab bar
export const FractalGlassTabBar = ({ tabs, activeKey, onPress }: FractalGlassTabBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <BlurView
        intensity={80}
        tint="dark"
        style={styles.blur}
      >
        <View style={styles.tabRow}>
          {tabs.map(tab => (
            <TabItem
              key={tab.key}
              tab={tab}
              isActive={tab.key === activeKey}
              onPress={() => onPress(tab.key)}
            />
          ))}
        </View>
      </BlurView>
    </View>
  );
};

// Pre-built tab set for My Commute
export const MY_COMMUTE_TABS: Tab[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: <HomeIcon active={false} />,  // icon receives active prop at render
  },
  {
    key: 'search',
    label: 'Search',
    icon: <SearchIcon active={false} />,
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: <SettingsIcon active={false} />,
  },
];

// Icon resolver (returns icon with correct active state)
export function getTabIcon(key: string, active: boolean): React.ReactNode {
  switch (key) {
    case 'dashboard': return <HomeIcon active={active} />;
    case 'search':    return <SearchIcon active={active} />;
    case 'settings':  return <SettingsIcon active={active} />;
    default:          return <HomeIcon active={active} />;
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  blur: {
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  tabRow: {
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 0 : 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'flex-start',
  },
  tabItemInner: {
    alignItems: 'center',
    gap: 3,
    paddingTop: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  activeIndicator: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
});
