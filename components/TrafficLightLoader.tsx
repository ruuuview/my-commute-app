/**
 * TrafficLightLoader - Signature loading animation
 * Three stacked circles (red, amber, green) that illuminate in sequence.
 * Always completes on GREEN before dismissing.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withRepeat,
  withDelay,
  Easing,
  withSpring
} from 'react-native-reanimated';

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
  const redOpacity = useSharedValue(0.2);
  const amberOpacity = useSharedValue(0.2);
  const greenOpacity = useSharedValue(0.2);

  const redScale = useSharedValue(1);
  const amberScale = useSharedValue(1);
  const greenScale = useSharedValue(1);

  const dims = SIZES[size];

  useEffect(() => {
    if (isComplete) {
      redOpacity.value = 0.2;
      amberOpacity.value = 0.2;
      greenOpacity.value = withTiming(1, { duration: 150 });
      greenScale.value = withSequence(
        withSpring(1.4, { damping: 8, stiffness: 200 }),
        withSpring(1, { damping: 8, stiffness: 200 })
      );
      return;
    }

    const PHASE_DURATION = 250;
    const HOLD_DURATION = 50;

    // Red
    redOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: PHASE_DURATION, easing: Easing.out(Easing.ease) }),
        withDelay(HOLD_DURATION, withTiming(0.2, { duration: PHASE_DURATION, easing: Easing.in(Easing.ease) })),
        withDelay(1100, withTiming(0.2, { duration: 0 }))
      ),
      -1
    );
    redScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: PHASE_DURATION }),
        withDelay(HOLD_DURATION, withTiming(1, { duration: PHASE_DURATION })),
        withDelay(1100, withTiming(1, { duration: 0 }))
      ),
      -1
    );

    // Amber
    amberOpacity.value = withRepeat(
      withSequence(
        withDelay(550, withTiming(1, { duration: PHASE_DURATION, easing: Easing.out(Easing.ease) })),
        withDelay(HOLD_DURATION, withTiming(0.2, { duration: PHASE_DURATION, easing: Easing.in(Easing.ease) })),
        withDelay(550, withTiming(0.2, { duration: 0 }))
      ),
      -1
    );
    amberScale.value = withRepeat(
      withSequence(
        withDelay(550, withTiming(1.15, { duration: PHASE_DURATION })),
        withDelay(HOLD_DURATION, withTiming(1, { duration: PHASE_DURATION })),
        withDelay(550, withTiming(1, { duration: 0 }))
      ),
      -1
    );

    // Green
    greenOpacity.value = withRepeat(
      withSequence(
        withDelay(1100, withTiming(1, { duration: PHASE_DURATION, easing: Easing.out(Easing.ease) })),
        withDelay(HOLD_DURATION, withTiming(0.2, { duration: PHASE_DURATION, easing: Easing.in(Easing.ease) }))
      ),
      -1
    );
    greenScale.value = withRepeat(
      withSequence(
        withDelay(1100, withTiming(1.15, { duration: PHASE_DURATION })),
        withDelay(HOLD_DURATION, withTiming(1, { duration: PHASE_DURATION }))
      ),
      -1
    );

  }, [isComplete]);

  const containerStyle = horizontal
    ? [styles.containerH, { height: dims.dot + 8, borderRadius: (dims.dot + 8) / 2 }]
    : [styles.containerV, { width: dims.dot + 8, borderRadius: (dims.dot + 8) / 2 }];

  const redStyle = useAnimatedStyle(() => ({
    opacity: redOpacity.value,
    transform: [{ scale: redScale.value }],
  }));
  const amberStyle = useAnimatedStyle(() => ({
    opacity: amberOpacity.value,
    transform: [{ scale: amberScale.value }],
  }));
  const greenStyle = useAnimatedStyle(() => ({
    opacity: greenOpacity.value,
    transform: [{ scale: greenScale.value }],
  }));

  return (
    <View style={containerStyle}>
      <Animated.View
        style={[
          styles.dot,
          {
            width: dims.dot,
            height: dims.dot,
            borderRadius: dims.dot / 2,
            backgroundColor: COLORS.red,
            marginBottom: horizontal ? 0 : dims.gap,
            marginRight: horizontal ? dims.gap : 0,
          },
          redStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.dot,
          {
            width: dims.dot,
            height: dims.dot,
            borderRadius: dims.dot / 2,
            backgroundColor: COLORS.amber,
            marginBottom: horizontal ? 0 : dims.gap,
            marginRight: horizontal ? dims.gap : 0,
          },
          amberStyle,
        ]}
      />
      <Animated.View
        style={[
          styles.dot,
          {
            width: dims.dot,
            height: dims.dot,
            borderRadius: dims.dot / 2,
            backgroundColor: COLORS.green,
          },
          greenStyle,
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
    boxShadow: '0 0px 4px rgba(0,0,0,0.3)',
  },
});

export default TrafficLightLoader;