// components/SegmentedGlassControl.tsx
import React, { memo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/colors';
import { Bell, Sparkle, BellSlash } from 'phosphor-react-native';
import { useLiveReducedMotion } from '../hooks/useReducedMotion';

export type DeliveryMode = 'loud' | 'shush' | 'off';

interface SegmentOption {
  id: DeliveryMode;
  title: string;
  desc: string;
  accessibilityLabel: string;
  hint: string;
  color: string;
  activeBg: string;
  activeBorder: string;
  icon: (color: string) => React.ReactNode;
}

const SEGMENTS: SegmentOption[] = [
  {
    id: 'loud',
    title: 'Standard',
    desc: 'Banners & sound',
    accessibilityLabel: 'Standard, 1 of 3',
    hint: 'Switches notification delivery to banners and alert sounds.',
    color: '#0A84FF', // Apple System Blue
    activeBg: 'rgba(10, 132, 255, 0.16)',
    activeBorder: '#0A84FF',
    icon: (color) => <Bell size={18} color={color} weight="fill" />,
  },
  {
    id: 'shush',
    title: 'Ambient',
    desc: 'Dynamic Island',
    accessibilityLabel: 'Ambient, 2 of 3',
    hint: 'Switches notification delivery to Dynamic Island and Lock Screen.',
    color: '#5E5CE6', // Apple System Indigo
    activeBg: 'rgba(94, 92, 230, 0.16)',
    activeBorder: '#5E5CE6',
    icon: (color) => <Sparkle size={18} color={color} weight="fill" />,
  },
  {
    id: 'off',
    title: 'Muted',
    desc: 'Open app manually',
    accessibilityLabel: 'Muted, 3 of 3',
    hint: 'Silences commute notifications. App updates only when opened.',
    color: '#8E8E93', // Apple System Gray
    activeBg: 'rgba(142, 142, 147, 0.16)',
    activeBorder: 'rgba(142, 142, 147, 0.40)',
    icon: (color) => <BellSlash size={18} color={color} weight="fill" />,
  },
];

export interface SegmentedGlassControlProps {
  currentMode: DeliveryMode;
  onSelectMode: (mode: DeliveryMode) => void;
  hapticsEnabled?: boolean;
}

export const SegmentedGlassControl = memo(function SegmentedGlassControl({
  currentMode,
  onSelectMode,
  hapticsEnabled = true,
}: SegmentedGlassControlProps) {
  const reduceMotion = useLiveReducedMotion();

  const handlePress = useCallback(
    (mode: DeliveryMode) => {
      if (mode !== currentMode) {
        if (hapticsEnabled && !reduceMotion) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        }
        onSelectMode(mode);
      }
    },
    [currentMode, hapticsEnabled, reduceMotion, onSelectMode]
  );

  return (
    <View
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel="Notification delivery mode"
    >
      {SEGMENTS.map((seg) => {
        const isSelected = currentMode === seg.id;
        const iconColor = isSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.45)';

        return (
          <Pressable
            key={seg.id}
            style={[
              styles.segmentCard,
              isSelected ? styles.segmentCardActive : styles.segmentCardInactive,
            ]}
            onPress={() => handlePress(seg.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={seg.accessibilityLabel}
            accessibilityHint={seg.hint}
          >
            {/* Active Pill Subtle Accent Rim */}
            {isSelected && (
              <View
                style={[
                  styles.activeGlowLine,
                  { backgroundColor: seg.color },
                ]}
              />
            )}

            {/* Icon + Title Row */}
            <View style={styles.contentRow}>
              <View style={[styles.iconWrapper, isSelected && { backgroundColor: `${seg.color}33` }]}>
                {seg.icon(isSelected ? seg.color : iconColor)}
              </View>
              <View style={styles.textColumn}>
                <Text style={[styles.title, !isSelected && styles.titleInactive]}>
                  {seg.title}
                </Text>
                <Text style={[styles.desc, !isSelected && styles.descInactive]} numberOfLines={1}>
                  {seg.desc}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

SegmentedGlassControl.displayName = 'SegmentedGlassControl';
export default SegmentedGlassControl;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    borderWidth: GLASS.borderWidth,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    padding: 4,
    gap: 4,
    marginVertical: 6,
  },
  segmentCard: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  segmentCardActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: GLASS.borderWidth,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  segmentCardInactive: {
    backgroundColor: 'transparent',
    borderWidth: GLASS.borderWidth,
    borderColor: 'transparent',
  },
  activeGlowLine: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 1.5,
    borderRadius: 1,
    opacity: 0.85,
  },
  contentRow: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  iconWrapper: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  textColumn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#FFFFFF', // WCAG AAA: > 16:1 contrast ratio over tinted backdrops
    textAlign: 'center',
  },
  titleInactive: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  desc: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 9.5,
    color: 'rgba(255, 255, 255, 0.80)',
    marginTop: 1,
    textAlign: 'center',
  },
  descInactive: {
    color: 'rgba(255, 255, 255, 0.40)',
  },
});
