import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import {
  CreditCard,
  LinkBreak,
  ArrowSquareOut,
  X,
} from 'phosphor-react-native';
import { GLASS } from '../../theme/colors';

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

    // Close the sheet first so the alert is clean upon return
    onClose();

    try {
      const supported = await Linking.canOpenURL(TFL_CONTACTLESS_PORTAL_URL);
      if (supported) {
        await Linking.openURL(TFL_CONTACTLESS_PORTAL_URL);
      } else {
        await WebBrowser.openBrowserAsync(TFL_CONTACTLESS_PORTAL_URL, {
          toolbarColor: '#0A0F3C',
          controlsColor: '#0098D4',
        });
      }
    } catch (err) {
      console.warn('[TfLConnectSheet] open URL failed:', err);
    }

    // Prompt user for verified status rather than blindly marking as registered
    setTimeout(() => {
      Alert.alert(
        'TfL Account Status',
        'Did you sign in and link your card or phone on TfL?',
        [
          {
            text: 'Not yet',
            style: 'cancel',
            onPress: () => {
              onUnregistered();
            },
          },
          {
            text: 'Yes, signed in',
            style: 'default',
            onPress: () => {
              onRegistered();
            },
          },
        ]
      );
    }, 600);
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
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss sheet"
        />
        
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
            {/* Header: Headline + Top-Right Close Button */}
            <View style={styles.headerRow}>
              <Text style={styles.title}>
                Link your card so Refund Radar can see your delays
              </Text>
              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                }}
                hitSlop={12}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel="Close sheet"
              >
                <X size={18} color="rgba(255, 255, 255, 0.7)" weight="bold" />
              </Pressable>
            </View>

            {/* Comparison Box with Folded Apple Pay Note */}
            <View style={styles.comparisonBox}>
              {/* Row 1: Registered (28-day) */}
              <View style={styles.comparisonRow}>
                <View style={styles.pillIcon}>
                  <CreditCard size={18} color="#0098D4" weight="bold" />
                </View>
                <View style={styles.pillText}>
                  <Text style={styles.pillHeading}>Card or Phone Registered on TfL</Text>
                  <Text style={styles.pillDesc}>
                    Full 28-day claim window. Every eligible delay on your physical card, iPhone, Apple Watch, or Google Pay is protected and claimable.
                  </Text>
                  <Text style={styles.applePayFoldedNote}>
                    Using Apple Pay or Google Pay? Link the underlying card on TfL to auto-protect phone taps.
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Row 2: Unregistered (7-day) */}
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

            {/* Actions: Security Trust Note → Primary CTA → Secondary CTA */}
            <View style={styles.actionBlock}>
              <Text style={styles.microcopy}>
                🔒 Opens official TfL portal. No card details or passwords stored by MyCommute.
              </Text>

              <Pressable
                style={({ pressed }) => [styles.primaryCta, pressed && { opacity: 0.85 }]}
                onPress={handleOpenTflPortal}
                accessibilityRole="button"
                accessibilityLabel="Sign In or Link Card on TfL"
              >
                <ArrowSquareOut size={18} color="#0A0F3C" weight="bold" />
                <Text style={styles.primaryCtaText}>
                  Sign In / Link Card or Phone on TfL
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryPill, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onUnregistered();
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue with 7-Day Window (Unregistered)"
              >
                <Text style={styles.secondaryPillText}>
                  Continue with 7-Day Window (Unregistered)
                </Text>
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
    borderTopWidth: 1.25,
    borderLeftWidth: 1.25,
    borderRightWidth: 1.25,
    borderColor: GLASS.borderColor,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 16,
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
    paddingTop: 8,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: GLASS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  comparisonBox: {
    backgroundColor: 'rgba(10, 15, 60, 0.65)',
    borderRadius: 16,
    padding: 14,
    gap: 12,
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
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
  applePayFoldedNote: {
    fontSize: 11,
    color: 'rgba(0, 152, 212, 0.95)',
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 15,
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
    gap: 10,
  },
  microcopy: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.55)',
    textAlign: 'center',
    lineHeight: 15,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  primaryCta: {
    backgroundColor: '#0098D4',
    borderRadius: 14,
    paddingVertical: 14,
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
  secondaryPill: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPillText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
});
