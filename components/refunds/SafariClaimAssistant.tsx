import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import {
  CalendarBlank,
  Clock,
  MapPin,
  Train,
  X,
  ArrowSquareOut,
  Copy,
} from 'phosphor-react-native';
import { formatPence } from '../../services/refundSlaService';
import { RadarClaim } from '../../components/refunds/types';
import { LINE_NAMES } from '../../constants/lineColors';

const TFL_CLAIM_URL = 'https://tfl.gov.uk/fares/refunds-and-replacements';

export interface SafariClaimAssistantProps {
  visible: boolean;
  claim: RadarClaim;
  onClose: () => void;
  onLaunch: (claim: RadarClaim) => void;
  onDismiss?: () => void;
}

export default function SafariClaimAssistant({
  visible,
  claim,
  onClose,
  onLaunch,
  onDismiss,
}: SafariClaimAssistantProps) {
  const insets = useSafeAreaInsets();
  let bottomPadding = 34;
  if (insets && typeof insets.bottom === 'number') {
    bottomPadding = Math.max(insets.bottom + 16, 34);
  }

  const [copiedStates, setCopiedStates] = React.useState<
    Record<string, boolean>
  >({});

  // Initialize copied states for each chip
  React.useEffect(() => {
    setCopiedStates({
      date: false,
      time: false,
      origin: false,
      destination: false,
      line: false,
    });
  }, []);

  const entryTime = claim.entryTime ? new Date(claim.entryTime) : null;
  const entryStation = claim.entryStation ?? 'Origin';
  const exitStation = claim.exitStation ?? 'Destination';
  const lineKey = (claim.lineId ?? '').toLowerCase().trim();
  const lineDisplayName = LINE_NAMES[lineKey] ?? (claim.lineId ? claim.lineId.charAt(0).toUpperCase() + claim.lineId.slice(1) : '');
  const amount = claim.amountPence ?? 0;

  const chipValues = {
    date: entryTime
      ? entryTime.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '',
    time: entryTime
      ? entryTime.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
    origin: entryStation,
    destination: exitStation,
    line: lineDisplayName,
  };

  const handleCopy = async (key: string, value: string) => {
    if (!value) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(value);
    // Update state to show copied
    setCopiedStates((prev) => ({ ...prev, [key]: true }));
    // Reset after 1800ms
    const timeout = setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [key]: false }));
    }, 1800);
    return () => clearTimeout(timeout);
  };

  const chipComponents = [
    { key: 'date', label: 'Date', icon: CalendarBlank, value: chipValues.date },
    { key: 'time', label: 'Time', icon: Clock, value: chipValues.time },
    { key: 'origin', label: 'Origin', icon: MapPin, value: chipValues.origin },
    { key: 'destination', label: 'Destination', icon: MapPin, value: chipValues.destination },
    { key: 'line', label: 'Line', icon: Train, value: chipValues.line },
  ];

  const handleOpenTflPortal = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Open in system Safari so user login sessions, FaceID autofill, and cookie preferences are permanently preserved
      const supported = await Linking.canOpenURL(TFL_CLAIM_URL);
      if (supported) {
        await Linking.openURL(TFL_CLAIM_URL);
      } else {
        await WebBrowser.openBrowserAsync(TFL_CLAIM_URL, {
          toolbarColor: '#0A0F3C',
          controlsColor: '#0098D4',
        });
      }
    } catch (err) {
      console.warn('[SafariClaimAssistant] Failed to launch Safari:', err);
      try {
        await WebBrowser.openBrowserAsync(TFL_CLAIM_URL, {
          toolbarColor: '#0A0F3C',
          controlsColor: '#0098D4',
        });
      } catch (browserErr) {
        console.warn('[SafariClaimAssistant] WebBrowser fallback failed:', browserErr);
      }
    } finally {
      onLaunch(claim);
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
        {/* Plain View owns ALL layout; BlurView is background-only */}
        <View style={styles.sheet}>
          <BlurView intensity={Platform.OS === 'ios' ? 70 : 100} tint="dark" style={StyleSheet.absoluteFillObject} />
          
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
            contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          >
            {/* Header row: Copy icon + title + close X */}
            <View style={styles.headerRow}>
              <View style={styles.copyIcon}>
                <Copy size={20} color="#38BDF8" weight="bold" />
              </View>
              <Text style={styles.title}>TfL Claim Assistant</Text>
              <Pressable
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close claim assistant"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                }}
              >
                <X size={18} color="#FFFFFF" weight="bold" />
              </Pressable>
            </View>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              {entryStation} → {exitStation} · <Text style={styles.subtitleAmount}>{formatPence(amount)}</Text>
            </Text>

            {/* Clipboard chip grid */}
            <View style={styles.chipGrid}>
              {chipComponents.map((chip) => (
                <Pressable
                  key={chip.key}
                  style={[
                    styles.chip,
                    copiedStates[chip.key] && styles.chipCopied,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Copy ${chip.label}`}
                  onPress={() => handleCopy(chip.key, chip.value)}
                >
                  <View style={styles.chipIcon}>
                    {chip.icon && <chip.icon size={13} color={copiedStates[chip.key] ? '#34C759' : '#38BDF8'} />}
                  </View>
                  <Text style={[styles.chipLabel, copiedStates[chip.key] && styles.chipLabelCopied]}>
                    {chip.label}: {chip.value}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* How to claim step guidance */}
            <View style={styles.guidanceBox}>
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.02)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              <Text style={styles.guidanceTitle}>How TfL delay refunds work:</Text>
              <Text style={styles.guidanceText}>
                1. Tap the button below to open TfL in Safari.
              </Text>
              <Text style={styles.guidanceText}>
                2. Sign in to your TfL account & tap your Contactless / Oyster card.
              </Text>
              <Text style={styles.guidanceText}>
                {"3. Under 'Journey history', tap this delayed journey & select 'Service delay refund'."}
              </Text>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Pressable
                style={({ pressed }) => [styles.primaryFooterPressable, pressed && { opacity: 0.88, transform: [{ scale: 0.99 }] }]}
                accessibilityRole="button"
                accessibilityLabel="Open TfL in Safari"
                onPress={handleOpenTflPortal}
              >
                <LinearGradient
                  colors={['#00B8FF', '#0098D4', '#0072A8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.primaryFooterGradient}
                >
                  <ArrowSquareOut size={18} color="#FFFFFF" weight="bold" />
                  <Text style={styles.primaryFooterText}>
                    Open TfL in Safari ↗
                  </Text>
                </LinearGradient>
              </Pressable>

              <Pressable
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onClose();
                }}
                hitSlop={10}
                style={styles.cancelBtn}
              >
                <Text style={styles.secondaryFooterText}>
                  Cancel
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
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  copyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 152, 212, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.40)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'center',
    marginHorizontal: 16,
  },
  subtitleAmount: {
    color: '#34C759',
    fontWeight: '700',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipCopied: {
    backgroundColor: 'rgba(52, 199, 89, 0.20)',
    borderColor: '#34C759',
  },
  chipIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipLabel: {
    fontSize: 12.5,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  chipLabelCopied: {
    color: '#34C759',
  },
  guidanceBox: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    overflow: 'hidden',
    gap: 6,
  },
  guidanceTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  guidanceText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    lineHeight: 17,
  },
  footer: {
    paddingTop: 8,
    gap: 10,
    alignItems: 'stretch',
  },
  primaryFooterPressable: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#0098D4',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.50,
    shadowRadius: 14,
    elevation: 8,
  },
  primaryFooterGradient: {
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    borderRadius: 16,
  },
  primaryFooterText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryFooterText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
