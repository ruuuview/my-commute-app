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
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
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
  const lineId = claim.lineId ?? '';
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
    line: lineId.charAt(0).toUpperCase() + lineId.slice(1),
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
          <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={[StyleSheet.absoluteFillObject, styles.sheetTint]} />
          
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
          >
            {/* Header row: Copy icon + title + close X */}
            <View style={styles.headerRow}>
              <View style={styles.copyIcon}>
                <Copy size={20} color="#0098D4" weight="bold" />
              </View>
              <Text style={styles.title}>TfL Claim Assistant</Text>
              <Pressable
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close claim assistant"
                onPress={onClose}
              >
                <X size={24} color="rgba(255, 255, 255, 0.5)" />
              </Pressable>
            </View>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              {entryStation} → {exitStation} · ~{formatPence(amount)}
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
                    {chip.icon && <chip.icon size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={styles.chipLabel}>
                    {chip.label}: {chip.value}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Pressable
                style={styles.primaryFooter}
                accessibilityRole="button"
                accessibilityLabel="Open TfL Portal"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onLaunch(claim);
                }}
              >
                <ArrowSquareOut size={16} color="#0A0F3C" weight="bold" />
                <Text style={styles.primaryFooterText}>
                  Open TfL Portal
                </Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={10} style={{ paddingVertical: 6 }}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  // Plain View owns ALL layout (maxHeight/radius/overflow) — never BlurView.
  sheet: {
    alignSelf: 'stretch',
    maxHeight: Math.round(Dimensions.get('window').height * 0.88),
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(10, 15, 60, 0.96)',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  sheetTint: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  content: {
    padding: 20,
    gap: 12,
    paddingBottom: 34,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
  },
  copyIcon: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 800,
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 8,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginHorizontal: 20,
    marginVertical: 12,
  },
  chipGrid: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    minWidth: 60,
  },
  chipCopied: {
    backgroundColor: 'rgba(52, 199, 89, 0.25)',
    borderColor: '#34C759',
  },
  chipIcon: {
    width: 20,
    height: 20,
    marginBottom: 4,
  },
  chipLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryFooter: {
    backgroundColor: '#0098D4',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginRight: 12,
  },
  primaryFooterText: {
    color: '#0A0F3C',
    fontSize: 14,
    fontWeight: 700,
  },
  secondaryFooterText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    textAlign: 'center',
  },
});
