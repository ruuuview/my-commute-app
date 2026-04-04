/**
 * StatusDot - Animated semantic status indicator
 * Green = Good, Amber = Minor, Red = Severe
 * Optionally pulses for disrupted states.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface StatusDotProps {
  severity: number; // TfL scale: 0=Good, 3+=Minor, 7+=Severe
  size?: number;
  pulse?: boolean;
}

const getColorForSeverity = (severity: number): string => {
  if (severity >= 7) return '#D93025'; // Deep crimson
  if (severity >= 3) return '#CC8400'; // Warm amber
  return '#2A9D5C'; // Deep emerald
};

const StatusDot: React.FC<StatusDotProps> = ({
  severity,
  size = 12,
  pulse,
}) => {
  const shouldPulse = pulse !== undefined ? pulse : severity >= 3;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const color = getColorForSeverity(severity);

  useEffect(() => {
    if (shouldPulse) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [shouldPulse]);

  return (
    <View style={[styles.container, { width: size + 8, height: size + 8 }]}>
      {/* Glow ring behind the dot */}
      {shouldPulse && (
        <Animated.View
          style={[
            styles.glow,
            {
              width: size + 6,
              height: size + 6,
              borderRadius: (size + 6) / 2,
              backgroundColor: color,
              opacity: Animated.multiply(pulseAnim, new Animated.Value(0.3)),
            },
          ]}
        />
      )}
      {/* Main dot */}
      <Animated.View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: shouldPulse ? pulseAnim : 1,
            shadowColor: color,
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
  },
  dot: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 3,
  },
});

export default StatusDot;