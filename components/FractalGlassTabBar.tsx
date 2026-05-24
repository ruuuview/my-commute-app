// components/FractalGlassTabBar.tsx
import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

interface TabBarProps {
  tabs: Array<{ key: string; icon: keyof typeof Ionicons.glyphMap; label: string }>;
  activeKey: string;
  onPress: (key: string) => void;
}

const FractalGlassTabBar: React.FC<TabBarProps> = ({ tabs, activeKey, onPress }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom || 16 }]}>
      <BlurView intensity={40} tint="dark" style={styles.blurContainer}>
        <View style={styles.tabs}>
          {tabs.map(tab => {
            const isActive = activeKey === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => onPress(tab.key)}
                style={[
                  styles.tab,
                  isActive && styles.activeTab
                ]}
              >
                <Ionicons 
                  name={tab.icon} 
                  size={24} 
                  color={isActive ? "#FFFFFF" : "rgba(255,255,255,0.4)"} 
                />
                {isActive && <Text style={styles.tabLabel}>{tab.label}</Text>}
              </Pressable>
            );
          })}
        </View>
      </BlurView>
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
  blurContainer: {
    flexDirection: 'row',
    borderRadius: 32,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: '100%',
  },
  tab: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    gap: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  tabLabel: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    color: 'white',
    fontSize: 14,
  }
});

export default FractalGlassTabBar;
