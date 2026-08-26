import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { formatPence } from '../../services/refundSlaService';
import { RADAR } from '../../theme/radarTheme';

interface LifetimeMetricsCardProps {
  recoveredTotalPence: number;
  settledCount: number;
}

const LifetimeMetricsCard: React.FC<LifetimeMetricsCardProps> = ({
  recoveredTotalPence,
  settledCount,
}) => {
  const penceText = formatPence(recoveredTotalPence);

  return (
    <View
      style={styles.outer}
      accessibilityLabel={`Lifetime recovered ${formatPence(recoveredTotalPence)} across ${settledCount} settled claims`}
    >
      <BlurView intensity={45} tint="dark" style={styles.blurFill}>
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
      </BlurView>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  blurFill: StyleSheet.absoluteFillObject,
  glassFill: {
    backgroundColor: 'rgba(18, 26, 43, 0.75)',
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