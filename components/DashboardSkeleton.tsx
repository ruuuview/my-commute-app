/**
 * DashboardSkeleton - Premium glassmorphic shimmering placeholder cards for loading state.
 * Renders dark ghost cards that match the exact layout of the real dashboard components.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

const ShimmerBar: React.FC<{ width: number | string; height: number; style?: any }> = ({ width: w, height: h, style }) => {
  const shimmerAnim = useSharedValue(-200);

  useEffect(() => {
    shimmerAnim.value = withRepeat(
      withTiming(200, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [shimmerAnim]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerAnim.value }],
  }));

  return (
    <View style={[styles.shimmerContainer, { width: w as any, height: h }, style]}>
      <Animated.View style={[styles.shimmerBase, animatedStyle]} />
    </View>
  );
};

const SkeletonLineCard: React.FC = () => (
  <View style={styles.lineCard}>
    <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
    <View style={styles.colorBarPlaceholder} />
    <View style={styles.lineCardContent}>
      <ShimmerBar width={100} height={14} />
      <View style={styles.spacer} />
      <ShimmerBar width={60} height={12} />
    </View>
  </View>
);

const SkeletonStationCard: React.FC = () => (
  <View style={styles.stationCard}>
    <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
    <View style={styles.stationHeader}>
      <ShimmerBar width={140} height={16} />
      <View style={styles.spacer} />
      <ShimmerBar width={24} height={24} style={styles.br12} />
    </View>
    <View style={styles.nextTrainSkeleton}>
      <View style={styles.nextTrainColumn}>
        <ShimmerBar width={100} height={14} />
        <ShimmerBar width={160} height={10} style={styles.mt8} />
      </View>
      <ShimmerBar width={40} height={18} style={styles.br6} />
    </View>
  </View>
);

export const DashboardSkeleton: React.FC = () => {
  return (
    <View style={styles.container}>
      <ShimmerBar width={80} height={14} style={styles.sectionTitle} />
      <SkeletonLineCard />
      <SkeletonLineCard />
      <SkeletonLineCard />

      <ShimmerBar width={100} height={14} style={[styles.sectionTitle, { marginTop: 24 }]} />
      <SkeletonStationCard />
      <SkeletonStationCard />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  shimmerContainer: {
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    position: 'relative',
  },
  shimmerBase: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 120,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  lineCard: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Platform.OS === 'android' ? 'rgba(30, 30, 40, 0.85)' : 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  colorBarPlaceholder: {
    width: 3,
    height: 20,
    borderRadius: 2,
    marginRight: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  lineCardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  stationCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    minHeight: 110,
    paddingHorizontal: 16,
    paddingVertical: 16,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: Platform.OS === 'android' ? 'rgba(15, 20, 70, 0.85)' : 'rgba(255, 255, 255, 0.06)',
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  nextTrainSkeleton: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextTrainColumn: {
    flexDirection: 'column',
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 12,
    opacity: 0.6,
  },
  mt8: { marginTop: 8 },
  br12: { borderRadius: 12 },
  br6: { borderRadius: 6 },
});

export default DashboardSkeleton;