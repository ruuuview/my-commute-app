/**
 * AlertHoursSheet.tsx
 * ─────────────────────────────────────────────────────────────────
 * Apple Dark Glass bottom half-sheet for adjusting commute alert hours.
 * Enforces Model A (allowed-window semantics): e.g. 06:00 to 22:00.
 * Single-interval presets, severe disruption bypass toggle, and
 * direct MMKV synchronization via userPreferencesStore.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Clock, WarningCircle, Check } from 'phosphor-react-native';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { GLASS } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface PresetOption {
  id: string;
  label: string;
  start: string;
  end: string;
}

const PRESETS: PresetOption[] = [
  { id: 'commute', label: 'Commute day', start: '06:30', end: '20:00' },
  { id: 'allday', label: 'All day', start: '06:00', end: '23:00' },
  { id: '24h', label: '24 hours', start: '00:00', end: '23:59' },
];

function parseTimeString(timeStr: string): Date {
  const [hours, minutes] = (timeStr || '06:00').split(':').map((n) => parseInt(n, 10) || 0);
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

function formatTimeString(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export const AlertHoursSheet: React.FC<Props> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const alertWindowStart = useUserPreferencesStore((s) => s.alertWindowStart || '06:00');
  const alertWindowEnd = useUserPreferencesStore((s) => s.alertWindowEnd || '22:00');
  const severeBypassAlertHours = useUserPreferencesStore((s) => s.severeBypassAlertHours !== false);
  const setAlertHours = useUserPreferencesStore((s) => s.setAlertHours);
  const setSevereBypassAlertHours = useUserPreferencesStore((s) => s.setSevereBypassAlertHours);
  const hapticsEnabled = useUserPreferencesStore((s) => s.hapticsEnabled);

  // Local draft state so user can adjust before saving
  const [localStart, setLocalStart] = useState<string>(alertWindowStart);
  const [localEnd, setLocalEnd] = useState<string>(alertWindowEnd);
  const [localBypass, setLocalBypass] = useState<boolean>(severeBypassAlertHours);

  // Sync state when sheet opens
  React.useEffect(() => {
    if (visible) {
      setLocalStart(alertWindowStart);
      setLocalEnd(alertWindowEnd);
      setLocalBypass(severeBypassAlertHours);
    }
  }, [visible, alertWindowStart, alertWindowEnd, severeBypassAlertHours]);

  const [activePicker, setActivePicker] = useState<'start' | 'end' | null>(null);

  const startDate = useMemo(() => parseTimeString(localStart), [localStart]);
  const endDate = useMemo(() => parseTimeString(localEnd), [localEnd]);

  const handleApplyPreset = useCallback((preset: PresetOption) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    setLocalStart(preset.start);
    setLocalEnd(preset.end);
    setActivePicker(null);
  }, [hapticsEnabled]);

  const handleStartDateChange = useCallback((_: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setLocalStart(formatTimeString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }
  }, []);

  const handleEndDateChange = useCallback((_: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) {
      setLocalEnd(formatTimeString(selectedDate));
    }
    if (Platform.OS === 'android') {
      setActivePicker(null);
    }
  }, []);

  const handleSave = useCallback(() => {
    if (localStart === localEnd) {
      Alert.alert(
        'Invalid Alert Window',
        'Start time and end time cannot be identical. Please choose a valid window or select the 24 hours preset.',
        [{ text: 'OK' }]
      );
      return;
    }
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setAlertHours(localStart, localEnd);
    setSevereBypassAlertHours(localBypass);
    onClose();
  }, [hapticsEnabled, localStart, localEnd, localBypass, setAlertHours, setSevereBypassAlertHours, onClose]);

  const bottomPadding = Math.max(insets.bottom + 16, 24);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismissArea} onPress={onClose} />
        
        <View style={[styles.sheetContainer, { paddingBottom: bottomPadding }]}>
          <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
          <LinearGradient
            colors={[GLASS.specularStart, GLASS.specularEnd]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={styles.specularTopSheen}
          />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Clock size={22} color="#FFFFFF" weight="bold" />
              <Text style={styles.headerTitle}>Alert Hours</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={12}
              accessibilityLabel="Close alert hours picker"
              accessibilityRole="button"
            >
              <X size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          <Text style={styles.headerSubtitle}>
            Disruption alerts will only be delivered during this window.
          </Text>

          {/* Presets */}
          <View style={styles.presetsRow}>
            {PRESETS.map((preset) => {
              const isSelected = localStart === preset.start && localEnd === preset.end;
              return (
                <Pressable
                  key={preset.id}
                  style={({ pressed }) => [
                    styles.presetChip,
                    isSelected && styles.presetChipActive,
                    pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
                  ]}
                  onPress={() => handleApplyPreset(preset)}
                  accessibilityRole="button"
                  accessibilityLabel={`Preset ${preset.label}: ${preset.start} to ${preset.end}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Time Pickers Card */}
          <View style={styles.card}>
            {/* Start Time Row */}
            <Pressable
              style={({ pressed }) => [styles.timeRow, pressed && { opacity: 0.7 }]}
              onPress={() => setActivePicker(activePicker === 'start' ? null : 'start')}
              accessibilityRole="button"
              accessibilityLabel={`Start alerts at ${localStart}`}
              accessibilityHint="Tap to toggle start time picker"
            >
              <Text style={styles.timeRowLabel}>Start Alerts</Text>
              <View style={[styles.timeBadge, activePicker === 'start' && styles.timeBadgeActive]}>
                <Text style={styles.timeBadgeText}>{localStart}</Text>
              </View>
            </Pressable>

            {activePicker === 'start' && (
              <View style={styles.pickerWrapper}>
                <DateTimePicker
                  value={startDate}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleStartDateChange}
                  textColor="#FFFFFF"
                  themeVariant="dark"
                  style={styles.picker}
                />
              </View>
            )}

            <View style={styles.divider} />

            {/* End Time Row */}
            <Pressable
              style={({ pressed }) => [styles.timeRow, pressed && { opacity: 0.7 }]}
              onPress={() => setActivePicker(activePicker === 'end' ? null : 'end')}
              accessibilityRole="button"
              accessibilityLabel={`End alerts at ${localEnd}`}
              accessibilityHint="Tap to toggle end time picker"
            >
              <Text style={styles.timeRowLabel}>End Alerts</Text>
              <View style={[styles.timeBadge, activePicker === 'end' && styles.timeBadgeActive]}>
                <Text style={styles.timeBadgeText}>{localEnd}</Text>
              </View>
            </Pressable>

            {activePicker === 'end' && (
              <View style={styles.pickerWrapper}>
                <DateTimePicker
                  value={endDate}
                  mode="time"
                  is24Hour={true}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleEndDateChange}
                  textColor="#FFFFFF"
                  themeVariant="dark"
                  style={styles.picker}
                />
              </View>
            )}
          </View>

          {/* Severe Disruption Bypass Toggle */}
          <View style={[styles.card, styles.bypassCard]}>
            <View style={styles.bypassInfo}>
              <View style={styles.bypassLabelRow}>
                <WarningCircle size={18} color="#DC3545" weight="bold" />
                <Text style={styles.bypassTitle}>Severe Disruption Bypass</Text>
              </View>
              <Text style={styles.bypassDescription}>
                Always notify for line suspensions and major closures even outside alert hours.
              </Text>
            </View>
            <Switch
              value={localBypass}
              onValueChange={(val) => {
                if (hapticsEnabled) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                }
                setLocalBypass(val);
              }}
              trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
              thumbColor="#FFFFFF"
              accessibilityRole="switch"
              accessibilityLabel="Severe Disruption Bypass"
            />
          </View>

          {/* Save Button */}
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
            onPress={handleSave}
            accessibilityRole="button"
            accessibilityLabel="Save Alert Window"
          >
            <Check size={20} color="#000000" weight="bold" />
            <Text style={styles.saveButtonText}>Save Alert Window</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: Platform.OS === 'android' ? '#0F121E' : 'rgba(15, 20, 42, 0.90)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 16,
  },
  specularTopSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.60)',
    marginTop: 6,
    marginBottom: 16,
    lineHeight: 18,
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  presetChipActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.22)',
    borderColor: '#007AFF',
  },
  presetChipText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.70)',
  },
  presetChipTextActive: {
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
  },
  card: {
    borderRadius: 16,
    backgroundColor: GLASS.background,
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.20)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  timeRowLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  timeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  timeBadgeActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.25)',
    borderColor: '#007AFF',
  },
  timeBadgeText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  pickerWrapper: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  picker: {
    height: 120,
    width: '100%',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 8,
  },
  bypassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  bypassInfo: {
    flex: 1,
  },
  bypassLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  bypassTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  bypassDescription: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 16,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 4,
  },
  saveButtonText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#000000',
  },
});
