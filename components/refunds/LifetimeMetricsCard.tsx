import React from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useReduceTransparency } from '../../hooks/useReduceTransparency';
import { formatPence } from '../../services/refundSlaService';
import { GLASS } from '../../theme/colors';

let isNativeGlassAvailable = false;
try {
  if (Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function') {
    isNativeGlassAvailable = isLiquidGlassAvailable();
  }
} catch {
  isNativeGlassAvailable = false;
}

interface LifetimeMetricsCardProps {
  recoveredTotalPence: number;
  settledCount: number;
}

const LifetimeMetricsCard: React.FC<LifetimeMetricsCardProps> = ({
  recoveredTotalPence,
  settledCount,
}) => {
  const reduceTransparency = useReduceTransparency();
  const penceText = formatPence(recoveredTotalPence);

  return (
    <View
      style={[styles.outer, reduceTransparency && { backgroundColor: '#1C1C1E' }]}
      accessibilityLabel={`Lifetime recovered ${formatPence(recoveredTotalPence)} across ${settledCount} settled claims`}
    >
      {!reduceTransparency && (
        isNativeGlassAvailable ? (
          <GlassView
            glassEffectStyle="regular"
            colorScheme="dark"
            style={styles.blurFill}
            pointerEvents="none"
          />
        ) : (
          <BlurView intensity={GLASS.blurIntensity} tint={GLASS.blurTint} style={styles.blurFill} pointerEvents="none" />
        )
      )}
      <View style={styles.glassFill}>
        <View style={styles.content}>
          <View style={styles.leftColumn}>
            <Text style={styles.labelLeft}>LIFETIME RECOVERED</Text>
            <Text style={styles.amount}>{penceText}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.rightColumn}>
            <Text style={styles.labelRight}>SETTLED CLAIMS</Text>
            <Text style={styles.count}>{settledCount}</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    backgroundColor: GLASS.background,
  },
  blurFill: StyleSheet.absoluteFillObject,
  glassFill: {
    backgroundColor: 'rgba(18, 26, 43, 0.35)',
    padding: 18,
  },
  content: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flex: 1,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 8,
  },
  labelLeft: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.45)',
  },
  amount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#34C759',
  },
  labelRight: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.45)',
  },
  count: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default LifetimeMetricsCard;