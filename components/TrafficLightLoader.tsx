/**
 * TrafficLightLoader - Signature loading animation
 * Three stacked circles (red, amber, green) that illuminate in sequence.
 * Always completes on GREEN before dismissing.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

interface TrafficLightLoaderProps {
  size?: 'small' | 'medium' | 'large';
  isComplete?: boolean;
  horizontal?: boolean;
}

const COLORS = {
  red: '#D93025',
  amber: '#CC8400',
  green: '#2A9D5C',
  off: 'rgba(142, 142, 147, 0.2)',
};

const SIZES = {
  small: { dot: 8, gap: 4, container: 36 },
  medium: { dot: 10, gap: 6, container: 48 },
  large: { dot: 14, gap: 8, container: 64 },
};

const TrafficLightLoader: React.FC<TrafficLightLoaderProps> = ({
  size = 'medium',
  isComplete = false,
  horizontal = false,
}) => {
  const redOpacity = useRef(new Animated.Value(0.2)).current;
  const amberOpacity = useRef(new Animated.Value(0.2)).current;
  const greenOpacity = useRef(new Animated.Value(0.2)).current;

  const redScale = useRef(new Animated.Value(1)).current;
  const amberScale = useRef(new Animated.Value(1)).current;
  const greenScale = useRef(new Animated.Value(1)).current;

  const dims = SIZES[size];

  useEffect(() => {
    if (isComplete) {
      // Hold on green with a pulse
      redOpacity.setValue(0.2);
      amberOpacity.setValue(0.2);
      Animated.sequence([
        Animated.timing(greenOpacity, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(greenScale, {
          toValue: 1.4,
          useNativeDriver: true,
          tension: 200,
          friction: 8,
        }),
        Animated.spring(greenScale, {
          toValue: 1,
          useNativeDriver: true,
          tension: 200,
          friction: 8,
        }),
      ]).start();
      return;
    }

    const PHASE_DURATION = 250;
    const HOLD_DURATION = 50;

    const lightUp = (opacity: Animated.Value, scale: Animated.Value) =>
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: PHASE_DURATION,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.15,
          duration: PHASE_DURATION,
          useNativeDriver: true,
        }),
      ]);

    const dimDown = (opacity: Animated.Value, scale: Animated.Value) =>
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0.2,
          duration: PHASE_DURATION,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: PHASE_DURATION,
          useNativeDriver: true,
        }),
      ]);

    const hold = Animated.delay(HOLD_DURATION);

    const cycle = Animated.sequence([
      // Red
      lightUp(redOpacity, redScale),
      hold,
      dimDown(redOpacity, redScale),
      // Amber
      lightUp(amberOpacity, amberScale),
      hold,
      dimDown(amberOpacity, amberScale),
      // Green
      lightUp(greenOpacity, greenScale),
      hold,
      dimDown(greenOpacity, greenScale),
    ]);

    const loop = Animated.loop(cycle);
    loop.start();

    return () => loop.stop();
  }, [isComplete]);

  const containerStyle = horizontal
    ? [styles.containerH, { height: dims.dot + 8, borderRadius: (dims.dot + 8) / 2 }]
    : [styles.containerV, { width: dims.dot + 8, borderRadius: (dims.dot + 8) / 2 }];

  return (
    <View style={containerStyle}>
      {/* Red */}
      <Animated.View
        style={[
          styles.dot,
          {
            width: dims.dot,
            height: dims.dot,
            borderRadius: dims.dot / 2,
            backgroundColor: COLORS.red,
            opacity: redOpacity,
            transform: [{ scale: redScale }],
            marginBottom: horizontal ? 0 : dims.gap,
            marginRight: horizontal ? dims.gap : 0,
          },
        ]}
      />
      {/* Amber */}
      <Animated.View
        style={[
          styles.dot,
          {
            width: dims.dot,
            height: dims.dot,
            borderRadius: dims.dot / 2,
            backgroundColor: COLORS.amber,
            opacity: amberOpacity,
            transform: [{ scale: amberScale }],
            marginBottom: horizontal ? 0 : dims.gap,
            marginRight: horizontal ? dims.gap : 0,
          },
        ]}
      />
      {/* Green */}
      <Animated.View
        style={[
          styles.dot,
          {
            width: dims.dot,
            height: dims.dot,
            borderRadius: dims.dot / 2,
            backgroundColor: COLORS.green,
            opacity: greenOpacity,
            transform: [{ scale: greenScale }],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  containerV: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  containerH: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dot: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});

export default TrafficLightLoader;