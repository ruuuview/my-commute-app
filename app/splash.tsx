// app/splash.tsx
import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

const Splash: React.FC = () => {

  return (
    <View style={styles.container}>
      <Animated.View style={styles.wordmarkWrapper}>
        <Text style={styles.wordmark}>Commute</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    justifyContent: 'center',
    alignItems: 'center'
  },
  wordmarkWrapper: {
    opacity: 0
  },
  wordmark: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: -0.5
  }
});

export default Splash;
