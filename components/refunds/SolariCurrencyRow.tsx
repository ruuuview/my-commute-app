import React, { memo, useEffect, useState, useMemo } from 'react';
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

  const targetChars = useMemo(
    () => ['£', ...poundStr.split(''), '.', ...penceStr.split('')],
    [poundStr, penceStr]
  );

  const [displayChars, setDisplayChars] = useState<string[]>(['£', '0', '7', '.', '5', '0']);

  // 400ms mechanical flap awakening cascade
  useEffect(() => {
    const t1 = setTimeout(() => {
      setDisplayChars(['£', '0', '0', '.', '2', '0']);
    }, 120);
    const t2 = setTimeout(() => {
      setDisplayChars(targetChars);
    }, 380);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [targetChars]);

  const accessibilityText = `Refund Radar: £${(amountPence / 100).toFixed(2)} claimable`;

  return (
    <View
      style={styles.container}
      accessibilityRole="summary"
      accessibilityLabel={accessibilityText}
    >
      {displayChars.map((ch, idx) => (
        <View key={idx} accessibilityElementsHidden={true} importantForAccessibility="no">
          <SolariFlapTile char={ch} isDot={ch === '.'} />
        </View>
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
