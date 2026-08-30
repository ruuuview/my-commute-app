import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import { ShieldCheck, Clock, Lock } from 'phosphor-react-native';
import { GLASS, PREMIUM_BUTTON } from '../theme/colors';

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
      <BlurView intensity={GLASS.blurIntensity} tint="dark" style={styles.blurFill}>
        <View style={styles.card}>
          <View style={styles.row}>
            <ShieldCheck size={24} color="#30D158" style={styles.icon} />
            <View style={styles.textContainer}>
              <Text style={styles.title}>You are a Pro Member</Text>
              <Text style={styles.subtitle}>You have unlimited lifetime access.</Text>
            </View>
          </View>
        </View>
      </BlurView>
    );
  }

  if (trialCommutesRemaining > 0) {
    return (
      <BlurView intensity={GLASS.blurIntensity} tint="dark" style={styles.blurFill}>
        <View style={styles.card}>
          <View style={styles.row}>
            <Clock size={24} color="#30D158" style={styles.icon} />
            <View style={styles.textContainer}>
              <Text style={styles.title}>Pro Trial Active</Text>
              <Text style={styles.subtitle}>
                You have {trialCommutesRemaining} of 10 trial commutes remaining.
              </Text>
            </View>
          </View>
          <Pressable style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]} onPress={onUpgrade}>
            <Text style={styles.buttonText}>Upgrade for Life - £7.99</Text>
          </Pressable>
        </View>
      </BlurView>
    );
  }

  return (
    <BlurView intensity={GLASS.blurIntensity} tint="dark" style={styles.blurFill}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Lock size={24} color="#FF453A" style={styles.icon} />
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
  );
};

const styles = StyleSheet.create({
  blurFill: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    borderLeftColor: GLASS.borderSides,
    borderRightColor: GLASS.borderSides,
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
