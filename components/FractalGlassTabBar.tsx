// components/FractalGlassTabBar.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, dimensions } from '../tokens';

const FractalGlassTabBar: React.FC = ({ tabs, activeKey, onPress }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + dimensions.tabBarHeight + 16 }]}>
      <View style={styles.tabs}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onPress(tab.key)}
            style={[
              styles.tab,
              activeKey === tab.key && styles.activeTab
            ]}
          >
            <Ionicons name={tab.icon} size={dimensions.iconSize} color="white" />
            <Text style={styles.tabLabel}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.deepBaseBackground,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.frostedGlassBackground,
    borderWidth: 1,
    borderColor: colors.frostedGlassBorder
  },
  activeTab: {
    backgroundColor: '#388E3C'
  },
  tabLabel: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold'
  }
});

export default FractalGlassTabBar;
