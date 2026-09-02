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
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import {
  CreditCard,
  LinkBreak,
  ArrowSquareOut,
  X,
  ShieldCheck,
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

    // Close the sheet first so the alert is clean upon return
    onClose();

    try {
      const supported = await Linking.canOpenURL(TFL_CONTACTLESS_PORTAL_URL);
      if (supported) {
        await Linking.openURL(TFL_CONTACTLESS_PORTAL_URL);
      } else {
        await WebBrowser.openBrowserAsync(TFL_CONTACTLESS_PORTAL_URL, {
          toolbarColor: '#070E26',
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

        {/* Outer Plain View owns layout boundaries; BlurView & Gradients act as background layers */}
        <View style={styles.sheet}>
          {/* Glass optical blur */}
          <BlurView intensity={Platform.OS === 'ios' ? 70 : 100} tint="dark" style={StyleSheet.absoluteFillObject} />

          {/* Electric sapphire/obsidian depth gradient */}
          <LinearGradient
            colors={[
              'rgba(0, 152, 212, 0.15)',
              'rgba(10, 22, 58, 0.55)',
              'rgba(4, 9, 26, 0.92)',
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Top specular rim catch-light */}
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.75)', 'rgba(255, 255, 255, 0.15)', 'transparent']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.specularTopSheen}
            pointerEvents="none"
          />

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
              <View style={styles.titleWrap}>
                <View style={styles.badgeHeader}>
                  <ShieldCheck size={14} color="#38BDF8" weight="fill" />
                  <Text style={styles.badgeHeaderText}>REFUND RADAR PROTECTION</Text>
                </View>
                <Text style={styles.title}>
                  Link your card so Refund Radar can see your delays
                </Text>
              </View>
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
                <X size={16} color="#FFFFFF" weight="bold" />
              </Pressable>
            </View>

            {/* Apple Frosted Glass Comparison Card */}
            <View style={styles.comparisonBox}>
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.03)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.35)', 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.cardSpecularTop}
                pointerEvents="none"
              />

              {/* Row 1: Registered (28-day) */}
              <View style={styles.comparisonRow}>
                <View style={styles.pillIconRegistered}>
                  <CreditCard size={20} color="#38BDF8" weight="bold" />
                </View>
                <View style={styles.pillText}>
                  <View style={styles.rowHeadingWrap}>
                    <Text style={styles.pillHeading}>Card or Phone Registered on TfL</Text>
                    <View style={styles.badgeCyan}>
                      <Text style={styles.badgeCyanText}>28-DAY WINDOW</Text>
                    </View>
                  </View>
                  <Text style={styles.pillDesc}>
                    Full 28-day claim window. Every eligible delay on your contactless card, iPhone, Apple Watch, or Google Pay is protected.
                  </Text>
                  <View style={styles.applePayContainer}>
                    <Text style={styles.applePayFoldedNote}>
                      ✦ Using Apple Pay or Google Pay? Link the underlying card on TfL to auto-protect phone taps.
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Row 2: Unregistered (7-day) */}
              <View style={styles.comparisonRow}>
                <View style={styles.pillIconUnregistered}>
                  <LinkBreak size={20} color="rgba(255, 255, 255, 0.70)" weight="bold" />
                </View>
                <View style={styles.linkText}>
                  <View style={styles.rowHeadingWrap}>
                    <Text style={styles.linkHeading}>Unregistered Card / Phone Tap Only</Text>
                    <View style={styles.badgeMuted}>
                      <Text style={styles.badgeMutedText}>7-DAY LIMIT</Text>
                    </View>
                  </View>
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
                style={({ pressed }) => [styles.primaryCtaPressable, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
                onPress={handleOpenTflPortal}
                accessibilityRole="button"
                accessibilityLabel="Sign In or Link Card on TfL"
              >
                <LinearGradient
                  colors={['#00B8FF', '#0098D4', '#0072A8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.primaryCtaGradient}
                >
                  <LinearGradient
                    colors={['rgba(255, 255, 255, 0.45)', 'transparent']}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={styles.buttonSpecular}
                    pointerEvents="none"
                  />
                  <ArrowSquareOut size={19} color="#FFFFFF" weight="bold" />
                  <Text style={styles.primaryCtaText}>
                    Sign In / Link Card or Phone on TfL
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryPressable, pressed && { opacity: 0.75, transform: [{ scale: 0.99 }] }]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onUnregistered();
                }}
                accessibilityRole="button"
                accessibilityLabel="Continue with 7-Day Window (Unregistered)"
              >
                <LinearGradient
                  colors={['rgba(255, 255, 255, 0.14)', 'rgba(255, 255, 255, 0.04)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.secondaryGradient}
                >
                  <Text style={styles.secondaryPillText}>
                    Continue with 7-Day Window (Unregistered)
                  </Text>
                </LinearGradient>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    alignSelf: 'stretch',
    maxHeight: Math.round(Dimensions.get('window').height * 0.90),
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'ios' ? 'rgba(7, 14, 38, 0.72)' : 'rgba(7, 14, 38, 0.96)',
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.75,
    shadowRadius: 24,
    elevation: 20,
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    zIndex: 10,
  },
  cardSpecularTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    zIndex: 2,
  },
  buttonSpecular: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    zIndex: 2,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
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
  titleWrap: {
    flex: 1,
    gap: 4,
  },
  badgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  badgeHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.8,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 26,
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  comparisonBox: {
    borderRadius: 20,
    padding: 16,
    gap: 14,
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 6,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rowHeadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgeCyan: {
    backgroundColor: 'rgba(0, 152, 212, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.40)',
  },
  badgeCyanText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 0.4,
  },
  badgeMuted: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  badgeMutedText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 0.4,
  },
  pillIconRegistered: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 152, 212, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.50)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  pillIconUnregistered: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  pillText: {
    flex: 1,
    gap: 4,
  },
  pillHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  pillDesc: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.80)',
    lineHeight: 17,
  },
  applePayContainer: {
    marginTop: 4,
    backgroundColor: 'rgba(0, 152, 212, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.30)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  applePayFoldedNote: {
    fontSize: 11.5,
    color: '#7DD3FC',
    lineHeight: 16,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  linkText: {
    flex: 1,
    gap: 4,
  },
  linkHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.92)',
    letterSpacing: -0.2,
  },
  linkDesc: {
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.65)',
    lineHeight: 17,
  },
  actionBlock: {
    gap: 12,
  },
  microcopy: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.60)',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  primaryCtaPressable: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#0098D4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryCtaGradient: {
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.40)',
    borderRadius: 16,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  secondaryPressable: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  secondaryGradient: {
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryPillText: {
    color: 'rgba(255, 255, 255, 0.90)',
    fontSize: 14,
    fontWeight: '600',
  },
});

