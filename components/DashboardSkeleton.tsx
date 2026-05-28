/**
 * SkeletonLoader - Shimmering placeholder cards for loading state
 * Renders ghost cards that match the exact layout of real content.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';

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
    <View style={[{ width: w as any, height: h, borderRadius: 6, backgroundColor: '#E8E8ED', overflow: 'hidden' }, style]}>
      <Animated.View style={[styles.shimmerBase, { width: 100 }, animatedStyle]} />
    </View>
  );
};

const SkeletonLineCard: React.FC<{ compact?: boolean; cardWidth: number }> = ({ compact = false, cardWidth }) => (
  <View style={[styles.card, compact && { width: (cardWidth - 12) / 2 }]}>
    <View style={styles.accentBar} />
    <View style={styles.cardContent}>
      <ShimmerBar width={compact ? 80 : 120} height={16} />
      <ShimmerBar width={compact ? 60 : 100} height={12} style={styles.mt8} />
    </View>
  </View>
);

const SkeletonStationCard: React.FC = () => (
  <View style={styles.stationCard}>
    <View style={styles.stationHeader}>
      <ShimmerBar width={24} height={24} style={styles.br12} />
      <ShimmerBar width={140} height={16} style={styles.ml8} />
    </View>
    <View style={styles.nextTrainSkeleton}>
      <ShimmerBar width={100} height={14} />
      <ShimmerBar width={50} height={28} />
    </View>
    <ShimmerBar width={"80%"} height={12} style={styles.mt8} />
    <ShimmerBar width={"65%"} height={12} style={styles.mt6} />
  </View>
);



export const DashboardSkeleton: React.FC = () => {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const CARD_WIDTH = SCREEN_WIDTH - 40;

  return (
    <View style={styles.container}>
      <ShimmerBar width={120} height={20} style={styles.sectionTitle} />
      <SkeletonStationCard />
      <SkeletonStationCard />

      <ShimmerBar width={100} height={20} style={[styles.sectionTitle, { marginTop: 24 }]} />
      
      <View style={styles.compactRow}>
        <SkeletonLineCard compact cardWidth={CARD_WIDTH} />
        <SkeletonLineCard compact cardWidth={CARD_WIDTH} />
        <SkeletonLineCard compact cardWidth={CARD_WIDTH} />
      </View>
    </View>
  );
};

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
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
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
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
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
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  shimmerBase: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  mt8: { marginTop: 8 },
  mt6: { marginTop: 6 },
  mt10: { marginTop: 10 },
  br12: { borderRadius: 12 },
  br10: { borderRadius: 10 },
  ml8: { marginLeft: 8 },
  ml12: { marginLeft: 12 },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { marginTop: 28, marginBottom: 16 },
});

export default DashboardSkeleton;