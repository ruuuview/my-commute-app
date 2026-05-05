// app/(tabs)/index.tsx
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Animated, { useSharedValue, withTiming } from 'react-native-reanimated';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import LivingDot from '../components/LivingDot';

const ZeroState = () => {
  return (
    <View style={styles.zeroState}>
      <LivingDot />
      <Text style={styles.title}>Your commute is a blank slate.</Text>
      <TouchableOpacity style={styles.ctaButton} onPress={() => {}}>
        <Text style={styles.ctaButtonText}>Add Your First Line</Text>
      </TouchableOpacity>
    </View>
  );
};

const Dashboard = () => {
  const selectedLines = useUserPreferencesStore((state) => state.selectedLines);
  const pinnedStations = useUserPreferencesStore((state) => state.pinnedStations);

  return (
    <ScrollView style={styles.container}>
      {selectedLines.length === 0 && pinnedStations.length === 0 ? (
        <ZeroState />
      ) : (
        <Text>Cards go here</Text>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    paddingTop: 60,
  },
  zeroState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 30,
  },
  ctaButton: {
    backgroundColor: '#388E3C',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default Dashboard;
