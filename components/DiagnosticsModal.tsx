/**
 * DiagnosticsModal.tsx
 * ─────────────────────────────────────────────────────────────────
 * Quarantined Apple Dark Glass Diagnostics Drawer.
 * Houses sensor status matrix, active geofences readout, push simulations,
 * and test resets. Keeps consumer Settings 100% clean of raw debug text.
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import {
  X,
  Wrench,
  Shield,
  Broadcast,
  ArrowsClockwise,
  Trash,
  Train,
  Sparkle,
  CheckCircle,
  WarningCircle,
  Info,
} from 'phosphor-react-native';
import { usePermissionOrchestrator, PERMISSION_KEYS } from '../store/permissionOrchestrator';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { checkGeofenceHealthAsync } from '../services/backgroundTask';
import { LineId } from '../services/notifications/payload';
import { GLASS } from '../theme/colors';
import { LiveActivityService } from '../services/LiveActivityService';
import { handleGoodServiceRecovery } from '../services/GoodServiceRecovery';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useReduceTransparency } from '../hooks/useReduceTransparency';
import { LINE_NAMES } from '../constants/lineColors';
import { useLineDataStore } from '../store/lineDataStore';

let isNativeGlassAvailable = false;
try {
  if (Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function') {
    isNativeGlassAvailable = isLiquidGlassAvailable();
  }
} catch {
  isNativeGlassAvailable = false;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onResetOnboarding: () => void;
}

export const DiagnosticsModal: React.FC<Props> = ({
  visible,
  onClose,
  onResetOnboarding,
}) => {
  const insets = useSafeAreaInsets();
  const reduceTransparency = useReduceTransparency();
  const permissions = usePermissionOrchestrator((s) => s.permissions);
  const tier1HitCount = usePermissionOrchestrator((s) => s.tier1HitCount);
  const tflAccountStatus = useUserPreferencesStore((s) => s.tflAccountStatus);
  const setTflAccountStatus = useUserPreferencesStore((s) => s.setTflAccountStatus);
  const setSimulatedClaimActive = useUserPreferencesStore((s) => s.setSimulatedClaimActive);
  const selectedLines = useUserPreferencesStore((s) => s.selectedLines);
  const shushPreferences = useUserPreferencesStore((s) => s.shushPreferences);
  const setShushActivation = useUserPreferencesStore((s) => s.setShushActivation);
  const primaryLineId = (selectedLines && selectedLines[0]) || 'piccadilly';
  const primaryLineName = LINE_NAMES[primaryLineId] || (primaryLineId === 'dlr' ? 'DLR' : primaryLineId.charAt(0).toUpperCase() + primaryLineId.slice(1));

  const [geofenceInfo, setGeofenceInfo] = useState<{
    active: boolean;
    regionCount: number;
    taskRegistered: boolean;
  }>({ active: false, regionCount: 0, taskRegistered: false });
  const [isSimulatingLiveActivity, setIsSimulatingLiveActivity] = useState(false);
  const [isTestingShush, setIsTestingShush] = useState(false);
  const [liveActivitySupport, setLiveActivitySupport] = useState<string>('checking...');
  const [testFeedback, setTestFeedback] = useState<{
    text: string;
    type: 'info' | 'success' | 'error';
    action?: () => void;
    actionText?: string;
  } | null>(null);

  useEffect(() => {
    if (visible) {
      checkGeofenceHealthAsync().then(setGeofenceInfo).catch(() => { });
      LiveActivityService.isActive().then(setIsSimulatingLiveActivity).catch(() => { });
      LiveActivityService.getSupportStatus().then(setLiveActivitySupport).catch(() => setLiveActivitySupport('error'));
    }
  }, [visible]);

  const handleSimulatePush = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSimulatedClaimActive(true);

    try {
      const settings = await Notifications.getPermissionsAsync();
      if (!settings.granted && settings.status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        if (!req.granted && req.status !== 'granted') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setTestFeedback({
            type: 'error',
            text: 'Notifications are disabled in iOS Settings.',
            actionText: 'Open Settings',
            action: () => Linking.openSettings(),
          });
          return;
        }
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Potential TfL refund detected (${primaryLineName} Line) ☕️`,
          body: `Radar tracked a 22m delay on your ${primaryLineName} line journey. Wanna review your proof and submit to TfL?`,
          data: { lineId: primaryLineId, claimId: 99999, isSimulated: true },
          categoryIdentifier: 'CLAIM_REMINDER',
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
        },
      });

      setTestFeedback({
        type: 'success',
        text: `✓ ${primaryLineName} refund push scheduled! Lock phone now — banner fires in 5s.`,
      });
    } catch (err) {
      console.warn('[SimulateClaim] Push schedule error:', err);
      setTestFeedback({
        type: 'error',
        text: 'Failed to schedule simulated notification.',
      });
    }
  };

  const handleSimulateReroutePush = async (lineId: LineId = (primaryLineId as LineId), lineName: string = primaryLineName) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const settings = await Notifications.getPermissionsAsync();
      if (!settings.granted && settings.status !== 'granted') {
        const req = await Notifications.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        if (!req.granted && req.status !== 'granted') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setTestFeedback({
            type: 'error',
            text: 'Notifications are disabled in iOS Settings.',
            actionText: 'Open Settings',
            action: () => Linking.openSettings(),
          });
          return;
        }
      }

      const deliveryMode = useUserPreferencesStore.getState().shushPreferences?.alertDeliveryMode || 'shush';
      if (deliveryMode === 'off') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTestFeedback({
          type: 'error',
          text: 'Notification delivery mode is OFF in Shush Mode settings.',
        });
        return;
      }
      const shouldPlaySound = deliveryMode === 'loud';

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Disruption on ${lineName} line`,
          body: `Severe delays (signal failure).`,
          data: {
            action: 'show-disruption',
            lineId,
            statusAsOf: Date.now(),
            isSimulated: true,
            type: 'COMMUTE_DISRUPTION',
          },
          categoryIdentifier: 'REROUTE_ONLY',
          sound: shouldPlaySound ? 'default' : false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
        },
      });

      setTestFeedback({
        type: 'success',
        text: `✓ ${lineName} disruption push scheduled! Fires in 5s.`,
      });
    } catch (err) {
      console.warn('[SimulateReroute] Push schedule error:', err);
      setTestFeedback({
        type: 'error',
        text: 'Failed to schedule disruption push.',
      });
    }
  };

  const handleToggleSimulateCommute = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (isSimulatingLiveActivity) {
      await LiveActivityService.stopSimulatedCommute();
      setIsSimulatingLiveActivity(false);
      setTestFeedback({
        type: 'info',
        text: 'Northern Line Live Activity simulation ended.',
      });
      return;
    }

    const status = await LiveActivityService.getSupportStatus();
    setLiveActivitySupport(status);

    if (status === 'system_disabled') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTestFeedback({
        type: 'error',
        text: 'Live Activities are disabled in iOS Settings → My Commute.',
        actionText: 'Open Settings',
        action: () => Linking.openSettings(),
      });
      return;
    }

    if (status !== 'supported') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTestFeedback({
        type: 'error',
        text: `Live Activities unavailable (${status}). Requires native build with ActivityKit.`,
      });
      return;
    }

    setTestFeedback({
      type: 'info',
      text: 'Starting Northern Line commute simulation...',
    });

    const activityId = await LiveActivityService.startSimulatedNorthernCommute();
    if (activityId) {
      setIsSimulatingLiveActivity(true);
      setTestFeedback({
        type: 'success',
        text: '✓ Northern Line Live Activity running! Swipe up to Home or lock phone to view.',
      });
    } else {
      setTestFeedback({
        type: 'error',
        text: 'ActivityKit failed to start Northern Line simulation.',
      });
    }
  };

  const handleTestShushDemo = async () => {
    if (isTestingShush) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await LiveActivityService.stopPreviewActivity();
      setIsTestingShush(false);
      setTestFeedback({
        type: 'info',
        text: 'Shush preview ended.',
      });
      return;
    }

    setTestFeedback({
      type: 'info',
      text: 'Checking Live Activity support...',
    });

    const status = await LiveActivityService.getSupportStatus();
    setLiveActivitySupport(status);

    if (status === 'expo_go') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTestFeedback({
        type: 'error',
        text: 'Live Activities cannot run in Expo Go. Launch the app using Development Build 728.',
      });
      return;
    }

    if (status === 'bridge_unlinked') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTestFeedback({
        type: 'error',
        text: 'Native Live Activity module is not linked in this binary build.',
      });
      return;
    }

    if (status === 'system_disabled') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTestFeedback({
        type: 'error',
        text: 'Live Activities are turned OFF in iOS Settings → My Commute.',
        actionText: 'Open Settings',
        action: () => Linking.openSettings(),
      });
      return;
    }

    const areActivitiesEnabled = status === 'supported';
    if (!areActivitiesEnabled) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTestFeedback({
        type: 'error',
        text: `Live Activities not supported (${status}). Requires iOS 16.2+.`,
      });
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsTestingShush(true);
    setTestFeedback({
      type: 'info',
      text: `Spawning ${primaryLineName} Shush card...`,
    });

    const lineData = useLineDataStore.getState().lines[primaryLineId];
    const disruptionReason = lineData?.reason;

    const activityId = await LiveActivityService.startPreviewActivity({
      lineId: primaryLineId,
      lineName: primaryLineName,
      isDisruption: true,
      durationSeconds: 45,
      disruptionReason,
    });

    if (!activityId) {
      setIsTestingShush(false);
      setTestFeedback({
        type: 'error',
        text: 'ActivityKit returned nil. Check iOS Settings → Live Activities.',
      });
    } else {
      setTestFeedback({
        type: 'success',
        text: `✓ Shush preview running (${primaryLineName})! Swipe up or lock phone to view Dynamic Island & Lock Screen.`,
      });
      setTimeout(() => {
        setIsTestingShush(false);
      }, 45000);
    }
  };

  const handleTestGoodServiceRecovery = async () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // 1. If an unwanted preview activity was started, dismiss it cleanly:
    await LiveActivityService.stopPreviewActivity().catch(() => { });

    // 2. Dispatch genuine Good Service Recovery through unified state machine:
    await handleGoodServiceRecovery(primaryLineId);

    setTestFeedback({
      type: 'success',
      text: `✓ Good Service Recovery sent for ${primaryLineName}! Dynamic Island updated silently.`,
    });
  };

  const handleResetTflCoverage = () => {
    const nextStatus =
      tflAccountStatus === 'NOT_SET'
        ? 'REGISTERED_28_DAY'
        : tflAccountStatus === 'REGISTERED_28_DAY'
          ? 'UNREGISTERED_7_DAY'
          : 'NOT_SET';
    setTflAccountStatus(nextStatus);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTestFeedback({
      type: 'info',
      text: `TfL coverage status reset to ${nextStatus}.`,
    });
  };

  const bottomPadding = Math.max(insets.bottom + 20, 24);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: bottomPadding }, reduceTransparency && { backgroundColor: '#1C1C1E' }]}>
          {!reduceTransparency && (
            isNativeGlassAvailable ? (
              <GlassView
                glassEffectStyle="regular"
                colorScheme="dark"
                pointerEvents="none"
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <BlurView
                intensity={GLASS.blurIntensity}
                tint={GLASS.blurTint}
                pointerEvents="none"
                style={StyleSheet.absoluteFillObject}
              />
            )
          )}

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Wrench size={22} color="#007AFF" weight="bold" />
              <Text style={styles.headerTitle}>Diagnostics & Sensors</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={12}
              accessibilityLabel="Close diagnostics"
              accessibilityRole="button"
            >
              <X size={20} color="rgba(255,255,255,0.7)" />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Sensor & Permissions Matrix */}
            <Text style={styles.sectionHeader}>PERMISSIONS MATRIX</Text>
            <View style={styles.card}>
              {PERMISSION_KEYS.map((key) => {
                const entry = permissions[key];
                const decision = entry?.decision ?? 'not_asked';
                const decisionColor =
                  decision === 'granted'
                    ? '#30D158'
                    : decision === 'denied'
                      ? '#FF3B30'
                      : 'rgba(255,255,255,0.45)';

                return (
                  <View key={key} style={styles.row}>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle}>{key}</Text>
                      <Text style={styles.rowSubtitle}>
                        asked {entry?.askCount ?? 0}× · last{' '}
                        {entry?.lastAskedAt
                          ? new Date(entry.lastAskedAt).toLocaleDateString()
                          : 'never'}
                      </Text>
                    </View>
                    <Text style={[styles.statusBadge, { color: decisionColor }]}>
                      {decision}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.divider} />

              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>tier1 geofence hits</Text>
                  <Text style={styles.rowSubtitle}>Always-upgrade fallback triggers</Text>
                </View>
                <Text style={styles.statusBadge}>{tier1HitCount}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>live activities (ios)</Text>
                  <Text style={styles.rowSubtitle}>Dynamic Island & Lock Screen engine</Text>
                </View>
                <View style={styles.statusBadgeContainer}>
                  <Text
                    style={[
                      styles.statusBadge,
                      {
                        color:
                          liveActivitySupport === 'supported'
                            ? '#30D158'
                            : liveActivitySupport === 'system_disabled'
                              ? '#FF453A'
                              : liveActivitySupport === 'bridge_unlinked' || liveActivitySupport === 'expo_go'
                                ? '#FF9F0A'
                                : 'rgba(255,255,255,0.45)',
                      },
                    ]}
                  >
                    {liveActivitySupport === 'supported'
                      ? 'SUPPORTED'
                      : liveActivitySupport === 'system_disabled'
                        ? 'OFF IN SETTINGS'
                        : liveActivitySupport === 'bridge_unlinked'
                          ? 'UNLINKED'
                          : liveActivitySupport === 'expo_go'
                            ? 'EXPO GO'
                            : liveActivitySupport.toUpperCase()}
                  </Text>
                  {liveActivitySupport === 'system_disabled' && (
                    <Pressable
                      style={styles.inlineActionBtn}
                      onPress={() => Linking.openSettings()}
                      accessibilityRole="button"
                      accessibilityLabel="Open iOS Settings"
                    >
                      <Text style={styles.inlineActionBtnText}>Open Settings</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>

            {/* CoreLocation Geofence Health */}
            <Text style={styles.sectionHeader}>CORELOCATION GEOFENCING</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>Task Registered</Text>
                  <Text style={styles.rowSubtitle}>GEOFENCING_TASK in TaskManager</Text>
                </View>
                <Text
                  style={[
                    styles.statusBadge,
                    { color: geofenceInfo.taskRegistered ? '#30D158' : '#FF3B30' },
                  ]}
                >
                  {geofenceInfo.taskRegistered ? 'REGISTERED' : 'INACTIVE'}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>Monitored Regions</Text>
                  <Text style={styles.rowSubtitle}>Active CoreLocation 200m circular fences</Text>
                </View>
                <Text style={styles.statusBadge}>{geofenceInfo.regionCount} regions</Text>
              </View>
            </View>

            {/* Shush Activation Policy (Subterranean GPS Override) */}
            <Text style={styles.sectionHeader}>SHUSH ACTIVATION POLICY</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle}>Subterranean Trigger Mode</Text>
                  <Text style={styles.rowSubtitle}>Underground fallback when GPS signal is lost</Text>
                </View>
              </View>
              <View style={styles.pillGroup}>
                {(['smart', 'schedule', 'always'] as const).map((act) => (
                  <Pressable
                    key={act}
                    style={[
                      styles.pill,
                      shushPreferences.shushActivation === act && styles.pillActive,
                    ]}
                    onPress={() => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShushActivation(act);
                    }}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        shushPreferences.shushActivation === act && styles.pillTextActive,
                      ]}
                    >
                      {act === 'smart' ? 'Smart (Auto)' : act === 'schedule' ? 'Schedule (Hours)' : 'Always (In-Flight)'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Simulation Feedback Banner */}
            {testFeedback && (
              <View
                style={[
                  styles.feedbackCard,
                  testFeedback.type === 'success' && styles.feedbackCardSuccess,
                  testFeedback.type === 'error' && styles.feedbackCardError,
                  testFeedback.type === 'info' && styles.feedbackCardInfo,
                ]}
              >
                <View style={styles.feedbackContent}>
                  {testFeedback.type === 'success' ? (
                    <CheckCircle size={18} color="#30D158" weight="bold" />
                  ) : testFeedback.type === 'error' ? (
                    <WarningCircle size={18} color="#FF453A" weight="bold" />
                  ) : (
                    <Info size={18} color="#BF5AF2" weight="bold" />
                  )}
                  <Text style={styles.feedbackText}>{testFeedback.text}</Text>
                </View>
                {testFeedback.action && testFeedback.actionText && (
                  <Pressable
                    style={styles.feedbackActionBtn}
                    onPress={testFeedback.action}
                    accessibilityRole="button"
                    accessibilityLabel={testFeedback.actionText}
                  >
                    <Text style={styles.feedbackActionText}>{testFeedback.actionText}</Text>
                  </Pressable>
                )}
                <Pressable
                  style={styles.feedbackDismissBtn}
                  onPress={() => setTestFeedback(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss message"
                >
                  <X size={14} color="rgba(255,255,255,0.5)" />
                </Pressable>
              </View>
            )}

            {/* Test Actions - Strictly Gated Behind __DEV__ */}
            {__DEV__ && (
              <>
                <Text style={styles.sectionHeader}>SIMULATION & OVERRIDES (DEV ONLY)</Text>
                <View style={styles.card}>
                  {/* Test Shush Mode (Preview on Lock Screen) */}
                  <Pressable
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={handleTestShushDemo}
                    accessibilityRole="button"
                    accessibilityLabel="Test Shush Mode (Preview on Lock Screen)"
                  >
                    <Sparkle size={20} color={isTestingShush ? '#FF453A' : '#BF5AF2'} weight="bold" />
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionTitle, { color: isTestingShush ? '#FF453A' : '#BF5AF2' }]}>
                        {isTestingShush ? 'End Preview (Lock screen to view)' : 'Test Shush Mode (Preview on Lock Screen)'}
                      </Text>
                      <Text style={styles.actionSubtitle}>
                        {isTestingShush
                          ? 'Severe delays flash active · Auto-dissolves in 45s'
                          : `Spawns 45s silent disruption card for ${primaryLineName} on Dynamic Island & Lock Screen`}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.divider} />

                  <Pressable
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={handleToggleSimulateCommute}
                    accessibilityRole="button"
                    accessibilityLabel="Simulate Northern Line Commute"
                  >
                    <Train size={20} color={isSimulatingLiveActivity ? '#FF453A' : '#FFFFFF'} weight="bold" />
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionTitle, { color: isSimulatingLiveActivity ? '#FF453A' : '#FFFFFF' }]}>
                        {isSimulatingLiveActivity ? 'Stop Northern Line Live Activity' : 'Simulate Northern Line Commute'}
                      </Text>
                      <Text style={styles.actionSubtitle}>
                        {isSimulatingLiveActivity
                          ? 'Live on Dynamic Island / Lockscreen · Tap to stop'
                          : 'Persistent Live Activity · Tests Bank vs Charing Cross pills'}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.divider} />

                  <Pressable
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={handleSimulatePush}
                    accessibilityRole="button"
                    accessibilityLabel="Simulate iOS Lockscreen Push"
                  >
                    <Broadcast size={20} color="#34C759" weight="bold" />
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionTitle, { color: '#34C759' }]}>
                        {`Simulate ${primaryLineName} Refund Push`}
                      </Text>
                      <Text style={styles.actionSubtitle}>Fires in 5s · Lock phone & tap banner</Text>
                    </View>
                  </Pressable>

                  <View style={styles.divider} />

                  <Pressable
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={() => handleSimulateReroutePush(primaryLineId as LineId, primaryLineName)}
                    accessibilityRole="button"
                    accessibilityLabel={`Simulate ${primaryLineName} Reroute Push`}
                  >
                    <Train size={20} color="#0019A8" weight="bold" />
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionTitle, { color: '#6875E5' }]}>
                        {`Simulate ${primaryLineName} Disruption Push`}
                      </Text>
                      <Text style={styles.actionSubtitle}>{`Fires in 5s · Tap opens in-detail card`}</Text>
                    </View>
                  </Pressable>

                  <View style={styles.divider} />

                  <Pressable
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={handleTestGoodServiceRecovery}
                    accessibilityRole="button"
                    accessibilityLabel="Test Good Service Recovery (Silent Dynamic Island)"
                  >
                    <CheckCircle size={20} color="#30D158" weight="bold" />
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionTitle, { color: '#30D158' }]}>
                        Test Good Service Recovery (Silent)
                      </Text>
                      <Text style={styles.actionSubtitle}>
                        Dynamic Island update · Silent status transition · 0 lockscreen noise
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.divider} />

                  <Pressable
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={() => {
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setSimulatedClaimActive(false);
                      setTestFeedback({
                        type: 'info',
                        text: 'Test claims cleared. Refund Radar zero-state restored.',
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Clear Test Claims"
                  >
                    <ArrowsClockwise size={20} color="rgba(255,255,255,0.7)" />
                    <View style={styles.actionInfo}>
                      <Text style={styles.actionTitle}>Clear Test Claims</Text>
                      <Text style={styles.actionSubtitle}>Restores clear Refund Radar zero-state</Text>
                    </View>
                  </Pressable>

                  <View style={styles.divider} />

                  <Pressable
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={handleResetTflCoverage}
                    accessibilityRole="button"
                    accessibilityLabel="Reset TfL Coverage Status"
                  >
                    <Shield size={20} color="#0098D4" />
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionTitle, { color: '#0098D4' }]}>
                        Reset TfL Coverage Status
                      </Text>
                      <Text style={styles.actionSubtitle}>
                        Current: {tflAccountStatus} · Force state for QA
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.divider} />

                  <Pressable
                    style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                    onPress={onResetOnboarding}
                    accessibilityRole="button"
                    accessibilityLabel="Reset Onboarding State"
                  >
                    <Trash size={20} color="#FF3B30" />
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionTitle, { color: '#FF3B30' }]}>
                        Reset Onboarding State
                      </Text>
                      <Text style={styles.actionSubtitle}>Clears saved lines and stations</Text>
                    </View>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  container: {
    flex: 1,
    backgroundColor: GLASS.background,
    paddingHorizontal: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    borderTopColor: GLASS.borderTop,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
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
  closeButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  scroll: {
    flex: 1,
  },
  sectionHeader: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 12,
  },
  card: {
    borderRadius: 16,
    backgroundColor: GLASS.background,
    borderWidth: GLASS.borderWidth,
    borderColor: GLASS.borderColor,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  rowSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.45)',
    marginTop: 2,
  },
  statusBadge: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  actionRowPressed: {
    opacity: 0.65,
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  actionSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 6,
  },
  pillGroup: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
  },
  pill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
  },
  pillActive: {
    backgroundColor: 'rgba(191, 90, 242, 0.25)',
    borderColor: '#BF5AF2',
  },
  pillText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    textAlign: 'center',
  },
  pillTextActive: {
    color: '#FFFFFF',
  },
  statusBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineActionBtn: {
    backgroundColor: 'rgba(255, 69, 58, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inlineActionBtnText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 11,
    color: '#FF453A',
  },
  feedbackCard: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    flexDirection: 'column',
    gap: 8,
    position: 'relative',
  },
  feedbackCardSuccess: {
    backgroundColor: 'rgba(48, 209, 88, 0.1)',
    borderColor: 'rgba(48, 209, 88, 0.4)',
  },
  feedbackCardError: {
    backgroundColor: 'rgba(255, 69, 58, 0.12)',
    borderColor: 'rgba(255, 69, 58, 0.45)',
  },
  feedbackCardInfo: {
    backgroundColor: 'rgba(191, 90, 242, 0.12)',
    borderColor: 'rgba(191, 90, 242, 0.4)',
  },
  feedbackContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 24,
  },
  feedbackText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 13,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 18,
  },
  feedbackActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: 2,
  },
  feedbackActionText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  feedbackDismissBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4,
  },
});
