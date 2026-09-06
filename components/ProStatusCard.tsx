import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShieldCheck, Clock, Lock } from 'phosphor-react-native';
import { LiquidGlassView } from './LiquidGlassView';

interface ProStatusCardProps {
  isPro: boolean;
  trialCommutesRemaining: number;
  onUpgrade: () => void;
}

export const ProStatusCard: React.FC<ProStatusCardProps> = ({
  isPro,
  trialCommutesRemaining,
  onUpgrade,
}) => {
  if (isPro) {
    return (
      <LiquidGlassView borderRadius={14} style={styles.glassWrapper} contentStyle={styles.card}>
        <View style={styles.row}>
          <ShieldCheck size={24} color="#30D158" style={styles.icon} />
          <View style={styles.textContainer}>
            <Text style={styles.title}>You are a Pro Member</Text>
            <Text style={styles.subtitle}>You have unlimited lifetime access.</Text>
          </View>
        </View>
      </LiquidGlassView>
    );
  }

  if (trialCommutesRemaining > 0) {
    return (
      <LiquidGlassView borderRadius={14} style={styles.glassWrapper} contentStyle={styles.card}>
        <View style={styles.row}>
          <Clock size={24} color="#30D158" style={styles.icon} />
          <View style={styles.textContainer}>
            <Text style={styles.title}>Pro Trial Active</Text>
            <Text style={styles.subtitle}>
              {trialCommutesRemaining} of 10 trial commutes remaining.
            </Text>
          </View>
        </View>
      </LiquidGlassView>
    );
  }

  return (
    <LiquidGlassView borderRadius={14} style={styles.glassWrapper} contentStyle={styles.card}>
      <View style={styles.row}>
        <Lock size={24} color="rgba(255, 255, 255, 0.45)" style={styles.icon} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>Trial Complete</Text>
          <Text style={styles.subtitle}>Thank you for evaluating My Commute early preview.</Text>
        </View>
      </View>
    </LiquidGlassView>
  );
};

const styles = StyleSheet.create({
  glassWrapper: {
    borderRadius: 14,
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  card: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.60)',
    lineHeight: 16,
  },
});
