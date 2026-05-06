// components/LineCard.tsx
import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, LayoutAnimation } from 'react-native';
import { BlurView } from '@react-native-community/blur';

const LineCard: React.FC<{ lineId: string }> = ({ lineId }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handlePress = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
    setIsExpanded(!isExpanded);
  };

  return (
    <TouchableOpacity onPress={handlePress} style={styles.container}>
      <BlurView tint="dark" intensity={20} style={styles.blurView}>
        <Text style={styles.lineName}>{lineId}</Text>
      </BlurView>
    </TouchableOpacity>
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
  blurView: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
  },
  lineName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 12,
  },
});

export default LineCard;
