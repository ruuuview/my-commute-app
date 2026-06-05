import React from 'react';
import { View, StyleSheet } from 'react-native';

type Props = { total: number; current: number };

// ─── Layout Constants ─────────────────────────────────────────────────────────
const DOT_HEIGHT = 5;
const DOT_RADIUS = 2.5;
const DOT_GAP = 6;
const DOT_ACTIVE_WIDTH = 28;
const DOT_INACTIVE_WIDTH = 20;

export function ProgressDots({ total, current }: Props) {
  return (
    <View 
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current - 1;
        const isComplete = i < current - 1;

        const dotStyle = isActive
          ? styles.dotActive
          : isComplete
          ? styles.dotComplete
          : styles.dotPending;

        return (
          <View
            key={i}
            accessible={false}
            style={[
              styles.dot,
              dotStyle,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: DOT_GAP,
    marginTop: 6,
  },
  dot: {
    height: DOT_HEIGHT,
    borderRadius: DOT_RADIUS,
  },
  dotActive: {
    width: DOT_ACTIVE_WIDTH,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
  },
  dotComplete: {
    width: DOT_INACTIVE_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.90)',
  },
  dotPending: {
    width: DOT_INACTIVE_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
});
