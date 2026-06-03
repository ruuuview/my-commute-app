import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export function SkeletonCard() {
  const shimmerTranslate = useSharedValue(-200);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      shimmerTranslate.value = 0;
      return;
    }
    shimmerTranslate.value = withRepeat(
      withTiming(400, {
        duration: 750,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false
    );
  }, [reducedMotion, shimmerTranslate]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerTranslate.value }],
  }));

  return (
    <View style={styles.card}>
      <View style={styles.accentBar} />
      <View style={styles.content}>
        <View style={styles.barMain} />
        <View style={styles.barSub} />
      </View>
      <View style={styles.shimmerContainer}>
        <AnimatedLinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.shimmer, shimmerStyle]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 68,
    backgroundColor: 'rgba(10,20,100,0.04)',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  accentBar: {
    width: 3.5,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(10,20,100,0.06)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 12,
    gap: 6,
  },
  barMain: {
    width: '45%',
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(10,20,100,0.05)',
  },
  barSub: {
    width: '30%',
    height: 10,
    borderRadius: 3,
    backgroundColor: 'rgba(10,20,100,0.03)',
  },
  shimmerContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  shimmer: {
    width: 150,
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
