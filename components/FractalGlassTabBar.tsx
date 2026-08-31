// components/FractalGlassTabBar.tsx
import React, { memo } from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, useReducedMotion } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/colors';

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
      style={[
        styles.tab,
        isActive && styles.activeTab
      ]}
    >
      <Animated.View style={[styles.tabContent, animatedStyle]}>
        {React.createElement(tab.icon, {
          size: 24,
          color: isActive ? "#FFFFFF" : "rgba(255,255,255,0.35)"
        })}
        {isActive && <Text style={styles.tabLabel}>{tab.label}</Text>}
      </Animated.View>
    </Pressable>
  );
});
TabButton.displayName = 'TabButton';

const FractalGlassTabBar: React.FC<TabBarProps> = ({ tabs, activeKey, onPress }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 16 }]}>
      <View style={styles.outerShadowWrapper}>
        <View style={styles.blurContainer}>
          <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={styles.specularTopSheen}
          />
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
    paddingHorizontal: 32,
  },
  outerShadowWrapper: {
    borderRadius: 32,
    overflow: 'visible',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 12,
  },
  blurContainer: {
    flexDirection: 'row',
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: GLASS.background,
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingVertical: 6,
    width: '100%',
  },
  tab: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
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
    borderRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.30,
    shadowRadius: 6,
    elevation: 3,
  },
  tabLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: '#FFFFFF',
    fontSize: 14,
  }
});

export default FractalGlassTabBar;

