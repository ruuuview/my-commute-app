import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowSquareOut, Link as LinkIcon, LinkBreak, ShieldCheck } from 'phosphor-react-native';

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
  let bottomPadding = 34;
  try {
    const insets = useSafeAreaInsets();
    if (insets && typeof insets.bottom === 'number') {
      bottomPadding = Math.max(insets.bottom + 16, 34);
    }
  } catch {
    bottomPadding = 34;
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        
        {/* Plain View owns layout; BlurView is background-only */}
        <View style={styles.sheet}>
          <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, styles.sheetTint]} />
          
          {/* Drag Handle */}
          <View style={styles.dragHandle} />

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: bottomPadding },
            ]}
          >
            {/* Block 1: Icon + Eyebrow + Title & Subhead */}
            <View style={styles.headerBlock}>
              <View style={styles.iconAccent}>
                <ShieldCheck size={26} color="#0098D4" weight="fill" />
              </View>
              <Text style={styles.eyebrow}>TFL DELAY REPAY ENGINE</Text>
              <Text style={styles.title}>Connect your account</Text>
              <Text style={styles.subhead}>
                Link your contactless card on TfL to protect all 28 days of statutory claim history.
              </Text>
            </View>

            {/* Block 2: High-Contrast Comparison Table */}
            <View style={styles.block2}>
              <View style={styles.comparisonRow}>
                <View style={styles.pillIcon}>
                  <LinkIcon size={18} color="#0098D4" weight="bold" />
                </View>
                <View style={styles.pillText}>
                  <Text style={styles.pillHeading}>Registered with TfL</Text>
                  <Text style={styles.pillDesc}>
                    {"Full 28-day Delay Repay window. Refund Radar reaches every eligible delay within TfL's 28-day claim policy."}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.comparisonRow}>
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

            {/* Block 3: Primary Action */}
            <View style={styles.actionBlock}>
              <Pressable
                style={styles.primaryCta}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onRegistered();
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
                🔒 Opens official TfL portal. No login or card details are ever stored by MyCommute.
              </Text>
            </View>

            {/* Block 4: Secondary Action & Dismiss */}
            <View style={styles.secondaryBlock}>
              <Pressable
                style={styles.secondaryPill}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onUnregistered();
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
                hitSlop={12}
                style={styles.dismissButton}
                accessibilityRole="button"
                accessibilityLabel="Not now"
              >
                <Text style={styles.tiny}>Not now</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    alignSelf: 'stretch',
    maxHeight: Math.round(Dimensions.get('window').height * 0.88),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(18, 26, 43, 0.96)',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sheetTint: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 16,
  },
  headerBlock: {
    gap: 4,
  },
  iconAccent: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#0098D4',
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
  },
  subhead: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    lineHeight: 18,
    marginTop: 2,
  },
  block2: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  pillIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 152, 212, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  pillText: {
    flex: 1,
  },
  pillHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pillDesc: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  linkDesc: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
    lineHeight: 16,
  },
  actionBlock: {
    gap: 8,
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
    fontWeight: '700',
  },
  microcopy: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 8,
  },
  secondaryBlock: {
    gap: 10,
    alignItems: 'center',
  },
  secondaryPill: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPillText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '700',
  },
  dismissButton: {
    paddingVertical: 4,
    paddingHorizontal: 16,
  },
  caption: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 2,
  },
  tiny: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.45)',
    textAlign: 'center',
  },
});
