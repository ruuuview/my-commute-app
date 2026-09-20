// components/FractalGlassTabBar.tsx
import React, { memo } from 'react';
import { View, StyleSheet, Pressable, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/colors';
import { useReduceTransparency } from '../hooks/useReduceTransparency';

let isNativeGlassAvailable = false;
try {
  if (Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function') {
    isNativeGlassAvailable = isLiquidGlassAvailable();
  }
} catch {
  isNativeGlassAvailable = false;
}

interface TabBarProps {
  tabs: { key: string; icon: React.ComponentType<{size?: number; color?: string}>; label: string }[];
  activeKey: string;
  onPress: (key: string) => void;
}

const TabButton = memo(({ tab, isActive, onPress }: { tab: any; isActive: boolean; onPress: () => void }) => {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    if (reducedMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(0.82, { damping: 10, stiffness: 220 });
  };

  const handlePressOut = () => {
    if (reducedMotion) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(1.0, { damping: 10, stiffness: 220 });
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={tab.label}
      style={[
        styles.tab,
        isActive && styles.activeTab
      ]}
    >
      <Animated.View style={[styles.tabContent, animatedStyle]}>
        {React.createElement(tab.icon, {
          size: 20,
          color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.60)"
        })}
        <Text style={[styles.tabLabel, !isActive && styles.inactiveTabLabel]}>
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});
TabButton.displayName = 'TabButton';

const FractalGlassTabBar: React.FC<TabBarProps> = ({ tabs, activeKey, onPress }) => {
  const insets = useSafeAreaInsets();
  const reduceTransparency = useReduceTransparency();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 16 }]}>
      <View style={styles.outerShadowWrapper}>
        <View style={[styles.blurContainer, reduceTransparency && { backgroundColor: '#1C1C1E' }]}>
          {!reduceTransparency && (
            isNativeGlassAvailable ? (
              <GlassView
                glassEffectStyle="regular"
                colorScheme="dark"
                pointerEvents="none"
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <BlurView
                intensity={GLASS.blurIntensity}
                tint="systemChromeMaterial"
                pointerEvents="none"
                style={StyleSheet.absoluteFillObject}
              />
            )
          )}
          <View style={styles.tabs}>
            {tabs.map(tab => (
              <TabButton
                key={tab.key}
                tab={tab}
                isActive={activeKey === tab.key}
                onPress={() => onPress(tab.key)}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  outerShadowWrapper: {
    borderRadius: 32,
    overflow: 'visible',
    alignSelf: 'center',
  },
  blurContainer: {
    flexDirection: 'row',
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: GLASS.background,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    alignSelf: 'center',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 4,
  },
  tab: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    minWidth: 114,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.40)',
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    borderRadius: 24,
  },
  tabLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: '#FFFFFF',
    fontSize: 14,
  },
  inactiveTabLabel: {
    color: 'rgba(255, 255, 255, 0.60)',
  },
});

export default FractalGlassTabBar;

