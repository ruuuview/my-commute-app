import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

interface ArrivalPillProps {
  minutes: number | null;
  error: boolean;
}

export function ArrivalPill({ minutes, error }: ArrivalPillProps) {
  if (error) {
    return (
      <View style={styles.pill}>
        <Text style={[styles.pillText, { opacity: 0.4 }]}>—</Text>
      </View>
    );
  }
  
  if (minutes === null) return null;
  
  const isDue = minutes < 1;
  
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillText, isDue && styles.dueColor]}>
        {isDue ? 'Due' : `${minutes} min`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(10,15,60,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    fontWeight: '700',
    color: '#0A0F3C',
    fontVariant: ['tabular-nums'],
  },
  dueColor: {
    color: '#16A34A',
  },
});
