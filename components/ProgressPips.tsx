import React from 'react';
import { View, StyleSheet } from 'react-native';

type Props = { total: number; current: number };

export function ProgressPips({ total, current }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.pip,
            i < current ? styles.pipComplete : styles.pipPending,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 6,
  },
  pip: {
    height: 3,
    borderRadius: 1.5,
  },
  pipComplete: {
    width: 20,
    backgroundColor: '#FFFFFF',
  },
  pipPending: {
    width: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
});
