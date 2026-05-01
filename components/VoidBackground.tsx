import React from 'react';
import { StyleSheet, View } from 'react-native';

interface VoidBackgroundProps {
  children?: React.ReactNode;
}

const VoidBackground: React.FC<VoidBackgroundProps> = ({ children }) => {
  return (
    <View style={styles.container}>
      <View style={styles.background} />
      <View style={styles.grainOverlay} />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0F',
  },
  grainOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0F',
    opacity: 0.02,
    pointerEvents: 'none',
  },
});

export default VoidBackground;