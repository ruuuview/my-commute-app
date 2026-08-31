// components/refunds/SolariCurrencyRow.tsx
import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { SolariFlapTile } from './SolariFlapTile';

export interface SolariCurrencyRowProps {
  amountPence: number;
}

export const SolariCurrencyRow = memo(function SolariCurrencyRow({
  amountPence,
}: SolariCurrencyRowProps) {
  const pounds = Math.floor(amountPence / 100);
  const penceRemainder = amountPence % 100;
  const penceStr = penceRemainder.toString().padStart(2, '0');
  const poundStr = pounds.toString();

  // Split into individual characters: ['£', ...poundDigits, '.', ...penceDigits]
  const chars: string[] = ['£', ...poundStr.split(''), '.', ...penceStr.split('')];

  return (
    <View style={styles.container}>
      {chars.map((ch, idx) => (
        <SolariFlapTile
          key={idx}
          char={ch}
          isDot={ch === '.'}
        />
      ))}
    </View>
  );
});

SolariCurrencyRow.displayName = 'SolariCurrencyRow';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
});
