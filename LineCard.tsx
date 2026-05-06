// components/LineCard.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTflApi } from '../hooks/useTflApi';

const LineCard = ({ lineId }) => {
  const { data, status } = useTflApi();
  const [isExpanded, setIsExpanded] = useState(false);
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    setIsExpanded(!isExpanded);
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <TouchableOpacity onPress={handlePress} style={styles.card}>
        <View style={styles.lineColorBar} />
        <Text style={styles.lineName}>{lineId}</Text>
        <StatusDot severity={data[lineId]?.status_severity || 0} />
        {isExpanded && (
          <View style={styles.departuresContainer}>
            {Array.from({ length: 3 }, (_, i) => (
              <Text key={i} style={styles.departure}>{monospacedDigit(data[lineId]?.minutes_away - i)}</Text>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const monospacedDigit = (digit) => {
  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <Text style={styles.monospaced}>{digits[digit]}</Text>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0A0A0F',
    opacity: 0.10,
    marginHorizontal: 24,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: '#050505',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#388E3C',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  lineColorBar: {
    width: 6,
    height: '100%',
    backgroundColor: '#388E3C',
  },
  lineName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#388E3C',
    marginLeft: 12,
  },
  departuresContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  departure: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginRight: 8,
  },
  monospaced: {
    fontFamily: 'monospace',
  },
});

export default LineCard;
