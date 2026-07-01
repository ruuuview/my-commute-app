import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { GLASS, PREMIUM_BUTTON } from '../theme/colors';
import { GlassRim } from './GlassRim';

interface ProStatusCardProps {
  isPro: boolean;
  trialDaysRemaining: number;
  onUpgrade: () => void;
}

export const ProStatusCard: React.FC<ProStatusCardProps> = ({
  isPro,
  trialDaysRemaining,
  onUpgrade,
}) => {

  if (isPro) {
    return (
      <GlassRim borderRadius={12}>
        <BlurView intensity={GLASS.blurIntensity} tint="dark" style={styles.blurFill}>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="shield-checkmark" size={24} color="#30D158" style={styles.icon} />
              <View style={styles.textContainer}>
                <Text style={styles.title}>You are a Pro Member</Text>
                <Text style={styles.subtitle}>You have unlimited lifetime access.</Text>
              </View>
            </View>
          </View>
        </BlurView>
      </GlassRim>
    );
  }

  if (trialDaysRemaining > 0) {
    return (
      <GlassRim borderRadius={12}>
        <BlurView intensity={GLASS.blurIntensity} tint="dark" style={styles.blurFill}>
          <View style={styles.card}>
            <View style={styles.row}>
              <Ionicons name="time" size={24} color="#30D158" style={styles.icon} />
              <View style={styles.textContainer}>
                <Text style={styles.title}>Pro Trial Active</Text>
                <Text style={styles.subtitle}>
                  You have {trialDaysRemaining} days of all-access features remaining.
                </Text>
              </View>
            </View>
            <Pressable style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]} onPress={onUpgrade}>
              <Text style={styles.buttonText}>Upgrade for Life - £7.99</Text>
            </Pressable>
          </View>
        </BlurView>
      </GlassRim>
    );
  }

  return (
    <GlassRim borderRadius={12}>
      <BlurView intensity={GLASS.blurIntensity} tint="dark" style={styles.blurFill}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="lock-closed" size={24} color="#FF453A" style={styles.icon} />
            <View style={styles.textContainer}>
              <Text style={styles.title}>You are on the Free Plan</Text>
              <Text style={styles.subtitle}>You are limited to 3 items. Upgrade for unlimited access.</Text>
            </View>
          </View>
          <Pressable style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]} onPress={onUpgrade}>
            <Text style={styles.buttonText}>Upgrade for Life - £7.99</Text>
          </Pressable>
        </View>
      </BlurView>
    </GlassRim>
  );
};

const styles = StyleSheet.create({
  blurFill: {
    borderRadius: 11,
    overflow: 'hidden',
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
  button: {
    ...PREMIUM_BUTTON,
    marginTop: 14,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#07103a',
  },
});
