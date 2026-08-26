import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { ArrowSquareOut, Link as LinkIcon, LinkBreak } from 'phosphor-react-native';

export interface TfLConnectSheetProps {
  visible: boolean;
  onClose: () => void;
  onRegistered: () => void;
  onUnregistered: () => void;
}

export default function TfLConnectSheet({
  visible,
  onClose,
  onRegistered,
  onUnregistered,
}: TfLConnectSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent={true}
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Plain View owns ALL layout; BlurView is background-only (iOS bug:
            UIVisualEffectView ignores maxHeight/layout caps when it is the
            layout container). Content renders as a sibling above the blur. */}
        <View style={styles.sheet}>
          <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, styles.sheetTint]} />
          <View style={styles.content}>
            {/* Drag handle */}
            <View style={styles.dragHandle} />

            {/* Block 1: eyebrow + title */}
            <View>
              <Text style={styles.eyebrow}>TFL DELAY REPAY ENGINE</Text>
              <Text style={styles.title}>Connect your account</Text>
            </View>

            {/* Block 2: loss-aversion box */}
            <View style={styles.block2}>
              <View style={styles.rowA}>
                <View style={styles.pillIcon}>
                  <LinkIcon size={18} color="#0098D4" weight="bold" />
                </View>
                <View style={styles.pillText}>
                  <Text style={styles.pillHeading}>Registered with TfL</Text>
                  <Text style={styles.pillDesc}>
                    Full 28-day Delay Repay window. Refund Radar reaches every eligible
                    delay within TfL's 28-day claim policy.
                  </Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.rowA}>
                <View style={styles.linkIconB}>
                  <LinkBreak size={18} color="rgba(255,255,255,0.6)" weight="bold" />
                </View>
                <View style={styles.linkText}>
                  <Text style={styles.linkHeading}>Not registered</Text>
                  <Text style={styles.linkDesc}>
                    Only 7 days of journey history visible online. Delays from 8–28 days
                    ago are lost and cannot be viewed.
                  </Text>
                </View>
              </View>
            </View>

            {/* Block 3: PRIMARY CTA */}
            <View>
              <Pressable
                style={styles.primaryCta}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
                  onRegistered()
                }}
                accessibilityRole="button"
                accessibilityLabel="Sign In or Register on TfL"
              >
                <ArrowSquareOut size={18} color="#0A0F3C" weight="bold" />
                <Text style={styles.primaryCtaText}>
                  Sign In / Register on TfL
                </Text>
              </Pressable>
              <Text style={styles.microcopy}>
                We cannot verify this with TfL — we trust your confirmation here.
              </Text>
            </View>

            {/* Block 4: SECONDARY pill + honest caption */}
            <View>
              <Pressable
                style={styles.secondaryPill}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  onUnregistered()
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue with 7-day Radar"
              >
                <Text style={styles.secondaryPillText}>
                  Continue with 7-day Radar
                </Text>
              </Pressable>
              <Text style={styles.caption}>
                Delays older than 7 days stay invisible to Refund Radar.
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Not now"
              >
                <Text style={styles.tiny}>Not now</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  // Plain View owns ALL layout (maxHeight/radius/overflow) — never BlurView.
  sheet: {
    alignSelf: 'stretch',
    maxHeight: Math.round(Dimensions.get('window').height * 0.48),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 26, 43, 0.92)',
  },
  sheetTint: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  content: {
    padding: 20,
    gap: 14,
    paddingBottom: 34,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginTop: 10,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#0098D4',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  block2: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  rowA: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pillIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  pillText: {
    flex: 1,
  },
  pillHeading: {
    fontSize: 14,
    fontWeight: 700,
    color: '#FFFFFF',
  },
  pillDesc: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  rowBStyles: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkIconB: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  linkText: {
    flex: 1,
  },
  linkHeading: {
    fontSize: 14,
    fontWeight: 700,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  linkDesc: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 3,
  },
  block3: {
    marginBottom: 16,
  },
  primaryCta: {
    backgroundColor: '#0098D4',
    borderRadius: 14,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryCtaText: {
    color: '#0A0F3C',
    fontSize: 15,
    fontWeight: 700,
  },
  microcopy: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    textAlign: 'center',
    marginTop: 6,
  },
  block4: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    paddingVertical: 12,
  },
  secondaryPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPillText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    fontWeight: '700',
  },
  caption: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 4,
  },
  tiny: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 8,
    textAlign: 'center',
  },
});
