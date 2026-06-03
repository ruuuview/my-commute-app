import React from 'react';
import { View, StyleSheet } from 'react-native';

type Props = { total: number; current: number };

// ─── Layout Constants ─────────────────────────────────────────────────────────
const PIP_HEIGHT = 4;
const PIP_RADIUS = 2;
const PIP_GAP = 6;
const PIP_ACTIVE_WIDTH = 32;
const PIP_INACTIVE_WIDTH = 20;

export function ProgressPips({ total, current }: Props) {
  return (
    <View 
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: current }}
    >
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === current - 1;
        const isComplete = i < current - 1;

        let pipStyle = styles.pipPending;
        if (isActive) {
          pipStyle = styles.pipActive;
        } else if (isComplete) {
          pipStyle = styles.pipComplete;
        }

        return (
          <View
            key={i}
            accessible={false}
            style={[
              styles.pip,
              pipStyle,
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
    gap: PIP_GAP,
    marginTop: 6,
  },
  pip: {
    height: PIP_HEIGHT,
    borderRadius: PIP_RADIUS,
    // Add subtle shadow to stay visible on light backgrounds before gradient loads
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 1.5,
    elevation: 1,
  },
  pipActive: {
    width: PIP_ACTIVE_WIDTH,
    backgroundColor: '#FFFFFF',
  },
  pipComplete: {
    width: PIP_INACTIVE_WIDTH,
    backgroundColor: '#FFFFFF',
  },
  pipPending: {
    width: PIP_INACTIVE_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
