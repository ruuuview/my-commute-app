// components/PermissionPrimerModal.tsx
// THE custom permission primer — single instance, mounted in the root
// layout. Consumes the orchestrator's primer request (promise pair), so
// exactly ONE primer can ever be visible. OS dialogs fire only after
// Continue is pressed (plan Phase 4: primer FIRST, then OS prompt).
//
// Styling per AGENTS.md §2: overFullScreen + transparent + slide,
// BlurView intensity 80 (Level 3 overlay), hairline translucent border,
// capsule primary CTA, drag handle anchor.

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getPrimerRequest,
  resolvePrimer,
  subscribePrimer,
  PRIMER_COPY,
  type PermissionKey,
} from '../store/permissionOrchestrator';
import { usePressAnimation } from '../hooks/usePressAnimation';

export function PermissionPrimerModal() {
  const insets = useSafeAreaInsets();
  const [request, setRequest] = useState<{
    key: PermissionKey;
    trigger: string;
  } | null>(null);
  const continuePress = usePressAnimation('continue_btn');
  const dismissPress = usePressAnimation('back_btn');

  useEffect(() => {
    // Hydrate the current request (may exist before this modal mounted).
    const current = getPrimerRequest();
    if (current) setRequest({ key: current.key, trigger: current.trigger });

    const unsubscribe = subscribePrimer((next) => {
      setRequest(next ? { key: next.key, trigger: next.trigger } : null);
    });
    return unsubscribe;
  }, []);

  if (!request) return null;
  const copy = PRIMER_COPY[request.key];

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={() => resolvePrimer(false)}
    >
      <View style={styles.scrim}>
        <BlurView intensity={80} tint="dark" style={styles.blurFill}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.handle} />
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.body}>{copy.body}</Text>

            <Pressable
              onPressIn={continuePress.onPressIn}
              onPressOut={continuePress.onPressOut}
              onPress={() => resolvePrimer(true)}
              style={[styles.primaryCta, continuePress.animatedStyle]}
            >
              <Text style={styles.primaryCtaText}>Continue</Text>
            </Pressable>

            <Pressable
              onPressIn={dismissPress.onPressIn}
              onPressOut={dismissPress.onPressOut}
              onPress={() => resolvePrimer(false)}
              style={[styles.dismissCta, dismissPress.animatedStyle]}
            >
              <Text style={styles.dismissCtaText}>Not now</Text>
            </Pressable>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  blurFill: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: 'rgba(20, 24, 42, 0.88)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 14,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  title: {
    color: '#FFFFFF',
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    marginTop: 10,
  },
  body: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    lineHeight: 21,
  },
  primaryCta: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 26,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryCtaText: {
    color: '#07103a',
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
  },
  dismissCta: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissCtaText: {
    color: 'rgba(255, 255, 255, 0.80)',
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
  },
});
