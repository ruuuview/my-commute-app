/**
 * AlertHoursSheet.tsx
 * ─────────────────────────────────────────────────────────────────
 * Apple Dark Glass bottom sheet for managing commute alert hours.
 * Supports 2-mode architecture:
 *   1. "Custom" — Native Alarm tumbler wheel for start/end with overnight shift support
 *   2. "24/7 Always" — Unrestricted around-the-clock disruption alerts
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
  ScrollView,
  Dimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Clock,
  WarningCircle,
  Check,
  SlidersHorizontal,
  Lightning,
  Sun,
  Moon,
} from 'phosphor-react-native';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { GLASS } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
}

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
  const alertHoursMode = useUserPreferencesStore((s) => s.alertHoursMode || 'custom');
  const alertWindowStart = useUserPreferencesStore((s) => s.alertWindowStart || '06:00');
  const alertWindowEnd = useUserPreferencesStore((s) => s.alertWindowEnd || '22:00');
  const severeBypassAlertHours = useUserPreferencesStore((s) => s.severeBypassAlertHours !== false);
  const setAlertHoursMode = useUserPreferencesStore((s) => s.setAlertHoursMode);
  const setAlertHours = useUserPreferencesStore((s) => s.setAlertHours);
  const setSevereBypassAlertHours = useUserPreferencesStore((s) => s.setSevereBypassAlertHours);
  const hapticsEnabled = useUserPreferencesStore((s) => s.hapticsEnabled);

  // Local draft state so user can adjust before saving
  const [localMode, setLocalMode] = useState<'custom' | '24h'>(alertHoursMode);
  const [localStart, setLocalStart] = useState<string>(alertWindowStart);
  const [localEnd, setLocalEnd] = useState<string>(alertWindowEnd);
  const [localBypass, setLocalBypass] = useState<boolean>(severeBypassAlertHours);
  const [activeTab, setActiveTab] = useState<'start' | 'end'>('start');

  // Sync state when sheet opens
  React.useEffect(() => {
    if (visible) {
      setLocalMode(alertHoursMode);
      setLocalStart(alertWindowStart);
      setLocalEnd(alertWindowEnd);
      setLocalBypass(severeBypassAlertHours);
      setActiveTab('start');
    }
  }, [visible, alertHoursMode, alertWindowStart, alertWindowEnd, severeBypassAlertHours]);

  const startDate = useMemo(() => parseTimeString(localStart), [localStart]);
  const endDate = useMemo(() => parseTimeString(localEnd), [localEnd]);

  // Check if current schedule spans midnight (night shift)
  const isOvernight = useMemo(() => {
    const [startH, startM] = localStart.split(':').map(Number);
    const [endH, endM] = localEnd.split(':').map(Number);
    const startMin = (startH || 0) * 60 + (startM || 0);
    const endMin = (endH || 0) * 60 + (endM || 0);
    return startMin > endMin;
  }, [localStart, localEnd]);

  const handleModeChange = useCallback(
    (mode: 'custom' | '24h') => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      setLocalMode(mode);
    },
    [hapticsEnabled]
  );

  const handleTabChange = useCallback(
    (tab: 'start' | 'end') => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
      setActiveTab(tab);
    },
    [hapticsEnabled]
  );

  const handleTimeChange = useCallback(
    (_: DateTimePickerEvent, selectedDate?: Date) => {
      if (!selectedDate) return;
      const formatted = formatTimeString(selectedDate);
      if (activeTab === 'start') {
        setLocalStart(formatted);
      } else {
        setLocalEnd(formatted);
      }
    },
    [activeTab]
  );

  const handleSave = useCallback(() => {
    if (localMode === 'custom' && localStart === localEnd) {
      Alert.alert(
        'Invalid Alert Window',
        'Start time and end time cannot be identical. Please choose a valid window or select 24/7 Always.',
        [{ text: 'OK' }]
      );
      return;
    }
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setAlertHoursMode(localMode);
    setAlertHours(localStart, localEnd);
    setSevereBypassAlertHours(localBypass);
    onClose();
  }, [
    hapticsEnabled,
    localMode,
    localStart,
    localEnd,
    localBypass,
    setAlertHoursMode,
    setAlertHours,
    setSevereBypassAlertHours,
    onClose,
  ]);

  const bottomPadding = Math.max(insets.bottom + 16, 24);
  const windowHeight = Dimensions.get('window').height;
  const wheelHeight = Math.min(180, Math.max(120, windowHeight * 0.22));

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
            Choose when you receive live disruption push notifications.
          </Text>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* 2-Option Segmented Control */}
            <View style={styles.modeSegmentContainer}>
              <Pressable
                style={({ pressed }) => [
                  styles.modeSegment,
                  localMode === 'custom' && styles.modeSegmentActive,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => handleModeChange('custom')}
                accessibilityRole="button"
                accessibilityLabel="Custom Alert Hours"
                accessibilityState={{ selected: localMode === 'custom' }}
              >
                <SlidersHorizontal
                  size={16}
                  color={localMode === 'custom' ? '#007AFF' : 'rgba(255,255,255,0.6)'}
                  weight={localMode === 'custom' ? 'bold' : 'regular'}
                />
                <Text
                  style={[
                    styles.modeSegmentText,
                    localMode === 'custom' && styles.modeSegmentTextActive,
                  ]}
                >
                  Custom
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modeSegment,
                  localMode === '24h' && styles.modeSegmentActive,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => handleModeChange('24h')}
                accessibilityRole="button"
                accessibilityLabel="24/7 Always On"
                accessibilityState={{ selected: localMode === '24h' }}
              >
                <Lightning
                  size={16}
                  color={localMode === '24h' ? '#007AFF' : 'rgba(255,255,255,0.6)'}
                  weight={localMode === '24h' ? 'fill' : 'regular'}
                />
                <Text
                  style={[
                    styles.modeSegmentText,
                    localMode === '24h' && styles.modeSegmentTextActive,
                  ]}
                >
                  24/7 Always
                </Text>
              </Pressable>
            </View>

            {/* Mode Content */}
            {localMode === '24h' ? (
              /* 24/7 Mode Information Card */
              <View style={styles.alwaysOnCard}>
                <View style={styles.alwaysOnHeader}>
                  <View style={styles.alwaysOnIconWrap}>
                    <Lightning size={24} color="#007AFF" weight="fill" />
                  </View>
                  <View style={styles.alwaysOnTextWrap}>
                    <Text style={styles.alwaysOnTitle}>24/7 Unrestricted Alerts</Text>
                    <Text style={styles.alwaysOnDescription}>
                      Disruption alerts delivered around the clock. Ideal for Night Tube,
                      shift workers, and all-hours London travel.
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              /* Custom Mode — Alarm Wheel Experience */
              <View>
                {/* Dual Time Selector Tabs */}
                <View style={styles.tabsRow}>
                  {/* Start Tab */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.timeTab,
                      activeTab === 'start' && styles.timeTabActive,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => handleTabChange('start')}
                    accessibilityRole="button"
                    accessibilityLabel={`Start alerts at ${localStart}`}
                    accessibilityState={{ selected: activeTab === 'start' }}
                  >
                    <View style={styles.tabHeader}>
                      <Sun
                        size={15}
                        color={activeTab === 'start' ? '#FF9F0A' : 'rgba(255,255,255,0.5)'}
                        weight="bold"
                      />
                      <Text
                        style={[
                          styles.tabLabel,
                          activeTab === 'start' && styles.tabLabelActive,
                        ]}
                      >
                        Start Alerts
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.tabTimeText,
                        activeTab === 'start' && styles.tabTimeTextActive,
                      ]}
                    >
                      {localStart}
                    </Text>
                  </Pressable>

                  {/* End Tab */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.timeTab,
                      activeTab === 'end' && styles.timeTabActive,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => handleTabChange('end')}
                    accessibilityRole="button"
                    accessibilityLabel={`End alerts at ${localEnd}`}
                    accessibilityState={{ selected: activeTab === 'end' }}
                  >
                    <View style={styles.tabHeader}>
                      <Moon
                        size={15}
                        color={activeTab === 'end' ? '#5E5CE6' : 'rgba(255,255,255,0.5)'}
                        weight="bold"
                      />
                      <Text
                        style={[
                          styles.tabLabel,
                          activeTab === 'end' && styles.tabLabelActive,
                        ]}
                      >
                        End Alerts
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.tabTimeText,
                        activeTab === 'end' && styles.tabTimeTextActive,
                      ]}
                    >
                      {localEnd}
                    </Text>
                  </Pressable>
                </View>

                {/* Overnight Shift Indicator */}
                {isOvernight && (
                  <View style={styles.overnightBadge}>
                    <Moon size={14} color="#5E5CE6" weight="fill" />
                    <View style={styles.overnightTextCol}>
                      <Text style={styles.overnightBadgeTitle}>
                        Overnight Shift (Spans midnight)
                      </Text>
                      <Text style={styles.overnightBadgeSub}>
                        Alerts active through late night into morning
                      </Text>
                    </View>
                  </View>
                )}

                {/* Native Alarm Tumbler Wheel */}
                <View style={styles.wheelCard}>
                  <View style={styles.wheelHeader}>
                    <Text style={styles.wheelHeaderLabel}>
                      Adjust {activeTab === 'start' ? 'Start' : 'End'} Time
                    </Text>
                    <Text style={styles.wheelHeaderValue}>
                      {activeTab === 'start' ? localStart : localEnd}
                    </Text>
                  </View>
                  <View style={[styles.wheelContainer, { height: wheelHeight }]}>
                    <DateTimePicker
                      key={activeTab}
                      value={activeTab === 'start' ? startDate : endDate}
                      mode="time"
                      is24Hour={true}
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleTimeChange}
                      textColor="#FFFFFF"
                      themeVariant="dark"
                      style={[styles.wheelPicker, { height: wheelHeight }]}
                    />
                  </View>
                </View>

                {/* Severe Disruption Bypass Card */}
                <View style={[styles.card, styles.bypassCard]}>
                  <View style={styles.bypassInfo}>
                    <View style={styles.bypassLabelRow}>
                      <WarningCircle size={18} color="#FF453A" weight="bold" />
                      <Text style={styles.bypassTitle}>Severe Disruption Bypass</Text>
                    </View>
                    <Text style={styles.bypassDescription}>
                      Always notify for line suspensions and major closures even outside alert
                      hours.
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
              </View>
            )}

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
          </ScrollView>
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
    backgroundColor: Platform.OS === 'android' ? '#0F121E' : 'rgba(15, 20, 42, 0.92)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    overflow: 'hidden',
    maxHeight: '90%',
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
    marginBottom: 14,
    lineHeight: 18,
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  scrollContent: {
    paddingBottom: 8,
  },
  modeSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    gap: 4,
  },
  modeSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeSegmentActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.22)',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  modeSegmentText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  modeSegmentTextActive: {
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
  },
  alwaysOnCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(0, 122, 255, 0.12)',
    borderWidth: 1.25,
    borderColor: 'rgba(0, 122, 255, 0.35)',
    padding: 18,
    marginBottom: 16,
  },
  alwaysOnHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  alwaysOnIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alwaysOnTextWrap: {
    flex: 1,
  },
  alwaysOnTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  alwaysOnDescription: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.70)',
    lineHeight: 18,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  timeTab: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  timeTabActive: {
    backgroundColor: 'rgba(0, 122, 255, 0.18)',
    borderColor: '#007AFF',
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  tabLabel: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  tabLabelActive: {
    color: 'rgba(255, 255, 255, 0.90)',
    fontFamily: 'SpaceGrotesk_600SemiBold',
  },
  tabTimeText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 22,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  tabTimeTextActive: {
    color: '#FFFFFF',
  },
  overnightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(94, 92, 230, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(94, 92, 230, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  overnightTextCol: {
    flex: 1,
  },
  overnightBadgeTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    color: '#D1D0F8',
  },
  overnightBadgeSub: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(209, 208, 248, 0.75)',
  },
  wheelCard: {
    borderRadius: 16,
    backgroundColor: GLASS.background,
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingTop: 12,
    paddingBottom: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  wheelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  wheelHeaderLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  wheelHeaderValue: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#007AFF',
  },
  wheelContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelPicker: {
    width: '100%',
  },
  card: {
    borderRadius: 16,
    backgroundColor: GLASS.background,
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
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
