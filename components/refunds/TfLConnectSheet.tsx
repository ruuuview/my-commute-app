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
  ArrowSquareOut,
  X,
  ShieldCheck,
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
          {/* Deep dark glass optical blur to block background bleed-through */}
          <BlurView intensity={Platform.OS === 'ios' ? 85 : 100} tint="dark" style={StyleSheet.absoluteFillObject} />

          {/* Deep dark glass background gradient for ultra-crisp text legibility */}
          <LinearGradient
            colors={[
              'rgba(0, 152, 212, 0.12)',
              'rgba(10, 22, 58, 0.70)',
              'rgba(4, 9, 26, 0.95)',
            ]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />

          {/* Top specular rim catch-light */}
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
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
                  <ShieldCheck size={14} color="rgba(255, 255, 255, 0.75)" weight="fill" />
                  <Text style={styles.badgeHeaderText}>REFUND RADAR</Text>
                </View>
                <Text style={styles.title}>
                  Stop losing money to TfL delays.
                </Text>
                <Text style={styles.subtitle}>
                  Connect once for a 28-day claim window.
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel="Close sheet"
              >
                <X size={16} color="#FFFFFF" weight="bold" />
              </Pressable>
            </View>

            {/* The single recommended card — Full Protection (28 Days) */}
            <View style={styles.recommendedCard}>
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.18)', 'rgba(255, 255, 255, 0.00)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={styles.cardSpecularTop}
                pointerEvents="none"
              />

              <View style={styles.cardRow}>
                <View style={styles.cardIconWrap}>
                  <CreditCard size={20} color="#FFFFFF" weight="bold" />
                </View>
                <View style={styles.cardTextWrap}>
                  <View style={styles.cardHeadingRow}>
                    <Text style={styles.cardHeading}>Full Protection</Text>
                    <View style={styles.badgeDays}>
                      <Text style={styles.badgeDaysText}>28 DAYS</Text>
                    </View>
                  </View>
                  <Text style={styles.cardBody}>
                    Auto-detects delays on cards & wallets. Max claim window.
                  </Text>
                </View>
              </View>
            </View>

            {/* Flattened Apple Pay & Google Pay tip (zero nested containers) */}
            <Text style={styles.applePayLine}>
              Apple Pay / Google Pay: link the card behind your phone on TfL to cover taps.
            </Text>

            {/* Actions: Security Trust Note → Primary Solid White CTA → Consequence Skip Text */}
            <View style={styles.actionBlock}>
              <Text style={styles.microcopy}>
                🔒 Opens official TfL portal. We never see your password.
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.primaryCtaButton,
                  pressed && { opacity: 0.90, transform: [{ scale: 0.99 }] },
                ]}
                onPress={handleOpenTflPortal}
                accessibilityRole="button"
                accessibilityLabel="Unlock 28-Day Refunds"
              >
                <ArrowSquareOut size={18} color="#04091A" weight="bold" />
                <Text style={styles.primaryCtaText}>
                  Unlock 28-Day Refunds
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.skipButton,
                  pressed && { opacity: 0.6 },
                ]}
                hitSlop={{ top: 12, bottom: 16, left: 20, right: 20 }}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onUnregistered();
                }}
                accessibilityRole="button"
                accessibilityLabel="Skip · Lose delays after 7 days"
              >
                <Text style={styles.skipButtonText}>
                  Skip · Lose delays after 7 days
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
    backgroundColor: 'rgba(0, 0, 0, 0.70)',
    justifyContent: 'flex-end',
  },
  sheet: {
    alignSelf: 'stretch',
    maxHeight: Math.round(Dimensions.get('window').height * 0.90),
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'ios' ? 'rgba(7, 14, 38, 0.85)' : '#0E0E14',
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.32)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.65,
    shadowRadius: 24,
    elevation: 20,
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    zIndex: 10,
  },
  cardSpecularTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
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
    gap: 2,
  },
  badgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  badgeHeaderText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.70)',
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 21,
    color: '#FFFFFF',
    lineHeight: 27,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13.5,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 18,
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  recommendedCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    overflow: 'hidden',
    position: 'relative',
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: GLASS.elevation,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  cardTextWrap: {
    flex: 1,
    gap: 4,
  },
  cardHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardHeading: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  badgeDays: {
    backgroundColor: 'rgba(0, 152, 212, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 152, 212, 0.60)',
    flexShrink: 0,
  },
  badgeDaysText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10.5,
    color: '#38BDF8',
    letterSpacing: 0.6,
  },
  cardBody: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 18,
  },
  applePayLine: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.70)',
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  actionBlock: {
    gap: 12,
    marginTop: 4,
  },
  microcopy: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  primaryCtaButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.90)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  primaryCtaText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#04091A',
    fontSize: 15.5,
    letterSpacing: -0.2,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  skipButtonText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13.5,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
});

