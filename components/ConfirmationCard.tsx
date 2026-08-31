/**
 * ConfirmationCard.tsx
 * ─────────────────────────────────────────────────────────────────
 * "Angel is home, Bank is work — right?"
 * Shows after first tracked commute. Single vs multi station.
 */
import React, { useState, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { FixItSheet } from './FixItSheet';
import { GLASS } from '../theme/colors';

interface Props {
  onDismiss?: () => void;
}

export const ConfirmationCard: React.FC<Props> = ({ onDismiss }) => {
  const pinnedStations = useUserPreferencesStore(s => s.pinnedStations);
  const confirmLabels = useUserPreferencesStore(s => s.confirmLabels);
  const dismissConfirmationCard = useUserPreferencesStore(s => s.dismissConfirmationCard);

  const [showFixIt, setShowFixIt] = useState(false);
  const [inlineMode, setInlineMode] = useState<'idle' | 'fixing'>('idle');

  const home = pinnedStations.find(s => s.role === 'home');
  const work = pinnedStations.find(s => s.role === 'work');
  const isSingle = pinnedStations.length === 1;

  const handleYes = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    confirmLabels();
    onDismiss?.();
  }, [confirmLabels, onDismiss]);

  const handleFixIt = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isSingle) {
      setInlineMode('fixing');
    } else {
      setShowFixIt(true);
    }
  }, [isSingle]);

  const handleFixItDone = useCallback(() => {
    confirmLabels();
    setShowFixIt(false);
    setInlineMode('idle');
    onDismiss?.();
  }, [confirmLabels, onDismiss]);

  const handleInlineDone = useCallback(() => {
    confirmLabels();
    onDismiss?.();
  }, [confirmLabels, onDismiss]);

  const handleDismiss = useCallback(() => {
    dismissConfirmationCard();
    onDismiss?.();
  }, [dismissConfirmationCard, onDismiss]);

  const question = isSingle
    ? home
      ? `${home.name} is home, right?`
      : `${pinnedStations[0]?.name} is home, right?`
    : work
      ? `${home?.name} is home, ${work.name} is work — right?`
      : `${home?.name} is home — right?`;

  return (
    <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(200)}>
      {inlineMode === 'fixing' && isSingle ? (
        <InlineFixCard
          station={home || pinnedStations[0]}
          onDone={handleInlineDone}
          onDismiss={handleDismiss}
        />
      ) : (
        <BlurView intensity={45} tint="dark" style={styles.card}>
          <Text style={styles.question}>{question}</Text>
          <View style={styles.buttons}>
            <Pressable onPress={handleYes} style={styles.yesBtn}>
              <Text style={styles.yesText}>Yes</Text>
            </Pressable>
            <Pressable onPress={handleFixIt} style={styles.fixBtn}>
              <Text style={styles.fixText}>No, fix it</Text>
            </Pressable>
          </View>
          <Pressable onPress={handleDismiss} hitSlop={8} style={styles.dismissArea}>
            <Text style={styles.dismissText}>Dismiss</Text>
          </Pressable>
        </BlurView>
      )}

      <FixItSheet
        visible={showFixIt}
        onClose={handleFixItDone}
      />
    </Animated.View>
  );
};

/** Inline chips for single-station fix-it */
const InlineFixCard: React.FC<{
  station: { id: string; name: string; role?: string };
  onDone: () => void;
  onDismiss: () => void;
}> = ({ station, onDone, onDismiss }) => {
  const setStationRole = useUserPreferencesStore(s => s.setStationRole);
  const home = useUserPreferencesStore(s => s.pinnedStations.find(s => s.role === 'home'));
  const work = useUserPreferencesStore(s => s.pinnedStations.find(s => s.role === 'work'));

  const isHome = home?.id === station.id;
  const isWork = work?.id === station.id;

  const handleHomeTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStationRole(station.id, 'home');
  }, [station.id, setStationRole]);

  const handleWorkTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStationRole(station.id, 'work');
  }, [station.id, setStationRole]);

  return (
    <BlurView intensity={45} tint="dark" style={styles.card}>
      <Text style={styles.question}>{station.name} is...</Text>
      <View style={styles.inlineChips}>
        <Pressable onPress={handleHomeTap} style={[styles.chip, isHome && styles.chipSelected]}>
          <Text style={[styles.chipText, isHome && styles.chipTextSelected]}>Home</Text>
        </Pressable>
        <Pressable onPress={handleWorkTap} style={[styles.chip, isWork && styles.chipSelected]}>
          <Text style={[styles.chipText, isWork && styles.chipTextSelected]}>Work</Text>
        </Pressable>
      </View>
      <View style={styles.buttons}>
        <Pressable onPress={onDone} style={styles.yesBtn}>
          <Text style={styles.yesText}>Done</Text>
        </Pressable>
      </View>
      <Pressable onPress={onDismiss} hitSlop={8} style={styles.dismissArea}>
        <Text style={styles.dismissText}>Dismiss</Text>
      </Pressable>
    </BlurView>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderTopWidth: 1.25,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    borderLeftColor: GLASS.borderSides,
    borderRightColor: GLASS.borderSides,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 6,
  },
  question: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
    marginBottom: 14,
    lineHeight: 22,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  yesBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  yesText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.90)',
  },
  fixBtn: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 8,
    alignItems: 'center',
  },
  fixText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
  },
  dismissArea: {
    alignItems: 'center',
    marginTop: 10,
  },
  dismissText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  inlineChips: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipSelected: {
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderColor: 'rgba(255,255,255,0.50)',
  },
  chipText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.60)',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
});
