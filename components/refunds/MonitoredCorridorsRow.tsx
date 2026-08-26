import React from 'react';
import { View, StyleSheet, Text } from 'react-native';
import {
  RADAR_LINE_BRAND,
  RADAR_LINE_NAMES,
  lineChipBorderColor,
} from '../../theme/radarTheme';

export interface MonitoredCorridorsRowProps {
  lineIds: string[];
}

const MonitoredCorridorsRow: React.FC<MonitoredCorridorsRowProps> = ({
  lineIds,
}) => {
  if (!lineIds || lineIds.length === 0) {
    return null;
  }

  return (
    <View
      style={styles.container}
      accessibilityLabel={`Monitoring ${lineIds.length} lines`}
    >
      <View style={styles.chipRow}>
        {lineIds.map((lineId) => {
          const brandColor = RADAR_LINE_BRAND[lineId] ?? '#0098D4';
          const lineName = RADAR_LINE_NAMES[lineId] ?? lineId.charAt(0).toUpperCase() + lineId.slice(1);
          const borderColor = lineChipBorderColor(lineId);
          return (
            <View
              key={lineId}
              style={chipStyle(brandColor, borderColor)}
            >
              <View style={dotStyle(brandColor)} />
              <Text style={labelStyle}>{lineName}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

function chipStyle(brandColor: string, borderColor: string) {
  return {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: borderColor,
  };
}

function dotStyle(brandColor: string) {
  return {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: brandColor,
  };
}

const labelStyle = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 6,
  },
}).label;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

export default MonitoredCorridorsRow;