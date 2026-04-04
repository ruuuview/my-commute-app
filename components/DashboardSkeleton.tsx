/**
 * SkeletonLoader - Shimmering placeholder cards for loading state
 * Renders ghost cards that match the exact layout of real content.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40; // 20px padding each side
const HALF_CARD = (CARD_WIDTH - 12) / 2;

const ShimmerBar: React.FC<{ width: number | string; height: number; style?: any }> = ({ width: w, height: h, style }) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, []);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View style={[{ width: w as any, height: h, borderRadius: 6, backgroundColor: '#E8E8ED', overflow: 'hidden' }, style]}>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255,255,255,0.4)',
          transform: [{ translateX }],
          width: 100,
        }}
      />
    </View>
  );
};

const SkeletonLineCard: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <View style={[styles.card, compact && { width: HALF_CARD }]}>
    <View style={styles.accentBar} />
    <View style={styles.cardContent}>
      <ShimmerBar width={compact ? 80 : 120} height={16} />
      <ShimmerBar width={compact ? 60 : 100} height={12} style={{ marginTop: 8 }} />
    </View>
  </View>
);

const SkeletonStationCard: React.FC = () => (
  <View style={styles.stationCard}>
    <View style={styles.stationHeader}>
      <ShimmerBar width={24} height={24} style={{ borderRadius: 12 }} />
      <ShimmerBar width={140} height={16} style={{ marginLeft: 8 }} />
    </View>
    <View style={styles.nextTrainSkeleton}>
      <ShimmerBar width={100} height={14} />
      <ShimmerBar width={50} height={28} />
    </View>
    <ShimmerBar width={"80%"} height={12} style={{ marginTop: 8 }} />
    <ShimmerBar width={"65%"} height={12} style={{ marginTop: 6 }} />
  </View>
);

const SkeletonHeroCard: React.FC = () => (
  <View style={styles.heroSkeleton}>
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <ShimmerBar width={20} height={20} style={{ borderRadius: 10 }} />
      <ShimmerBar width={140} height={20} style={{ marginLeft: 12 }} />
    </View>
    <ShimmerBar width={200} height={14} style={{ marginTop: 10 }} />
  </View>
);

export const DashboardSkeleton: React.FC = () => (
  <View style={styles.container}>
    {/* Hero card skeleton */}
    <SkeletonHeroCard />

    {/* Section title */}
    <ShimmerBar width={100} height={20} style={{ marginTop: 28, marginBottom: 16 }} />

    {/* Line cards - 2 compact */}
    <View style={styles.compactRow}>
      <SkeletonLineCard compact />
      <SkeletonLineCard compact />
    </View>

    {/* Section title */}
    <ShimmerBar width={130} height={20} style={{ marginTop: 28, marginBottom: 16 }} />

    {/* Station card */}
    <SkeletonStationCard />
  </View>
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  accentBar: {
    width: 4,
    backgroundColor: '#E8E8ED',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  cardContent: {
    flex: 1,
    padding: 16,
  },
  compactRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  nextTrainSkeleton: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroSkeleton: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
});

export default DashboardSkeleton;