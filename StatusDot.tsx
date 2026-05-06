// components/StatusDot.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';

const StatusDot = ({ severity }) => {
  const getColor = (severity) => {
    if (severity >= 7) return '#D32F2F'; // Red for severe delays
    if (severity >= 3) return '#FFA000'; // Amber for minor delays
    return '#388E3C'; // Green for good service
  };

  return (
    <View style={[styles.dot, { backgroundColor: getColor(severity) }]} />
  );
};

const styles = StyleSheet.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

export default StatusDot;
