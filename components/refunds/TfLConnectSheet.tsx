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
import * as WebBrowser from 'expo-web-browser';
import {
  CreditCard,
  DeviceMobile,
  LinkBreak,
  ArrowSquareOut,
} from 'phosphor-react-native';

const TFL_CONTACTLESS_PORTAL_URL =
  'https://tfl.gov.uk/fares/contactless-and-oyster-account';

export interface TfLConnectSheetProps {
  visible: boolean;
  onClose: () => void;
  onRegistered: () => void;
  onUnregistered: () => void;
  onDismiss?: () => void;
}

export default function TfLConnectSheet({
  visible,
  onClose,
  onRegistered,
  onUnregistered,
  onDismiss,
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

  const handleOpenTflPortal = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await WebBrowser.openBrowserAsync(TFL_CONTACTLESS_PORTAL_URL, {
        toolbarColor: '#0A0F3C',
        controlsColor: '#0098D4',
      });
    } catch (err) {
      console.warn('[TfLConnectSheet] openBrowserAsync failed:', err);
    } finally {
      onRegistered();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismiss}
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
                <CreditCard size={26} color="#0098D4" weight="bold" />
              </View>
              <Text style={styles.eyebrow}>TFL DELAY REPAY PROTECTION</Text>
              <Text style={styles.title}>Link Your Travel Card or Phone</Text>
              <Text style={styles.subhead}>
                TfL requires your Contactless card, Apple Pay, Google Pay, or Oyster card to be linked to an online account to protect claims for the full 28 days.
              </Text>
            </View>

            {/* Block 2: High-Contrast Comparison Table */}
            <View style={styles.block2}>
              <View style={styles.comparisonRow}>
                <View style={styles.pillIcon}>
                  <CreditCard size={18} color="#0098D4" weight="bold" />
                </View>
                <View style={styles.pillText}>
                  <Text style={styles.pillHeading}>Card or Phone Registered on TfL</Text>
                  <Text style={styles.pillDesc}>
                    {"Full 28-day claim window. Every eligible delay on your physical card, iPhone, Apple Watch, or Google Pay is protected and claimable."}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.comparisonRow}>
                <View style={styles.linkIconB}>
                  <LinkBreak size={18} color="rgba(255,255,255,0.6)" weight="bold" />
                </View>
                <View style={styles.linkText}>
                  <Text style={styles.linkHeading}>Unregistered Card / Phone Tap Only</Text>
                  <Text style={styles.linkDesc}>
                    Only 7 days of journey history kept by TfL. Delays older than 7 days are erased and non-refundable.
                  </Text>
                </View>
              </View>
            </View>

            {/* Apple Pay & Google Pay Explainer Callout */}
            <View style={styles.applePayTipBox}>
              <View style={styles.applePayIconWrap}>
                <DeviceMobile size={18} color="#0098D4" weight="bold" />
              </View>
              <Text style={styles.applePayTipText}>
                <Text style={styles.applePayTipBold}>Using Apple Pay or Google Pay? </Text>
                Simply enter the bank card details linked to your phone wallet on TfL. TfL automatically detects and links your device taps.
              </Text>
            </View>

            {/* Block 3: Primary Action */}
            <View style={styles.actionBlock}>
              <Pressable
                style={styles.primaryCta}
                onPress={handleOpenTflPortal}
                accessibilityRole="button"
                accessibilityLabel="Sign In or Link Card on TfL"
              >
                <ArrowSquareOut size={18} color="#0A0F3C" weight="bold" />
                <Text style={styles.primaryCtaText}>
                  Sign In / Link Card or Phone on TfL
                </Text>
              </Pressable>
              <Text style={styles.microcopy}>
                🔒 Opens official TfL portal. No card details or passwords are ever stored by MyCommute.
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
                accessibilityLabel="Continue with 7-Day Window"
              >
                <Text style={styles.secondaryPillText}>
                  Continue with 7-Day Window (Unregistered)
                </Text>
              </Pressable>
              
              <Text style={styles.caption}>
                Delays on unregistered cards older than 7 days stay invisible to Refund Radar.
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
  applePayTipBox: {
    backgroundColor: 'rgba(0, 152, 212, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.25)',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  applePayIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 152, 212, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  applePayTipText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 17,
  },
  applePayTipBold: {
    fontWeight: '700',
    color: '#FFFFFF',
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
