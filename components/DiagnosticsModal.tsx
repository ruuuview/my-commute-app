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
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
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
} from 'phosphor-react-native';
import { usePermissionOrchestrator, PERMISSION_KEYS } from '../store/permissionOrchestrator';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { checkGeofenceHealthAsync } from '../services/backgroundTask';
import { LineId } from '../services/notifications/payload';
import { CANONICAL_ALTERNATIVES } from '../services/notifications/intent';
import { GLASS } from '../theme/colors';

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
  const permissions = usePermissionOrchestrator((s) => s.permissions);
  const tier1HitCount = usePermissionOrchestrator((s) => s.tier1HitCount);
  const tflAccountStatus = useUserPreferencesStore((s) => s.tflAccountStatus);
  const setTflAccountStatus = useUserPreferencesStore((s) => s.setTflAccountStatus);
  const setSimulatedClaimActive = useUserPreferencesStore((s) => s.setSimulatedClaimActive);
  const selectedLines = useUserPreferencesStore((s) => s.selectedLines);
  const primaryLineId = (selectedLines && selectedLines[0]) || 'piccadilly';
  const primaryLineName = primaryLineId.charAt(0).toUpperCase() + primaryLineId.slice(1);

  const [geofenceInfo, setGeofenceInfo] = useState<{
    active: boolean;
    regionCount: number;
    taskRegistered: boolean;
  }>({ active: false, regionCount: 0, taskRegistered: false });

  useEffect(() => {
    if (visible) {
      checkGeofenceHealthAsync().then(setGeofenceInfo).catch(() => {});
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
          Alert.alert(
            'Notifications Disabled in Settings',
            'To receive real lockscreen banners, please turn on Notifications for My Commute in Settings.',
            [
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
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

      Alert.alert(
        '🔒 Lock Screen Now (5s)',
        'Press your side button to lock your phone right now. In 5 seconds, iOS will light up your lock screen with the notification banner!',
        [{ text: 'OK, Locking Phone' }]
      );
    } catch (err) {
      console.warn('[SimulateClaim] Push schedule error:', err);
      Alert.alert('Error', 'Failed to schedule notification: ' + String(err));
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
          Alert.alert(
            'Notifications Disabled in Settings',
            'To receive real lockscreen banners, please turn on Notifications for My Commute in Settings.',
            [
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
              { text: 'Cancel', style: 'cancel' },
            ]
          );
          return;
        }
      }

      const alt = CANONICAL_ALTERNATIVES[lineId];
      const altSnippet = alt ? ` ${alt.lineName} running normally, +${alt.deltaMinutes} min.` : '';

      await Notifications.scheduleNotificationAsync({
        content: {
          title: `Disruption on ${lineName} line`,
          body: `Severe delays (signal failure).${altSnippet}`,
          data: {
            action: 'show-disruption',
            lineId,
            alternative: alt,
            statusAsOf: Date.now(),
            isSimulated: true,
            type: 'COMMUTE_DISRUPTION',
          },
          categoryIdentifier: 'REROUTE_ONLY',
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 5,
          repeats: false,
        },
      });

      Alert.alert(
        '🔒 Lock Screen Now (5s)',
        `Press side button to lock your phone now. In 5 seconds, the "${lineName} Line Disruption" push will arrive.\n\n• Normal Tap: Opens the in-detail card on the dashboard showing full status.\n• Long-Press: Expands banner to reveal "[View Reroute 🚇]" action button.`,
        [{ text: 'OK, Locking Phone' }]
      );
    } catch (err) {
      console.warn('[SimulateReroute] Push schedule error:', err);
      Alert.alert('Error', 'Failed to schedule notification: ' + String(err));
    }
  };

  const handleResetTflCoverage = () => {
    Alert.alert(
      'Reset TfL Coverage Status',
      'Choose a state to force for testing:',
      [
        {
          text: 'Set 28-Day Registered',
          onPress: () => {
            setTflAccountStatus('REGISTERED_28_DAY');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
        {
          text: 'Set 7-Day Unregistered',
          onPress: () => {
            setTflAccountStatus('UNREGISTERED_7_DAY');
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        },
        {
          text: 'Reset to Not Set (Unlinked)',
          style: 'destructive',
          onPress: () => {
            setTflAccountStatus('NOT_SET');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const bottomPadding = Math.max(insets.bottom + 20, 24);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: bottomPadding }]}>
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

            {/* Test Actions */}
            <Text style={styles.sectionHeader}>SIMULATION & OVERRIDES</Text>
            <View style={styles.card}>
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
                  <Text style={styles.actionSubtitle}>{`Fires in 5s · Tap opens in-detail card · Long-press reveals [View Reroute]`}</Text>
                </View>
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={() => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setSimulatedClaimActive(false);
                  Alert.alert('Cleared', 'Simulated test claim removed.');
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
    backgroundColor: Platform.OS === 'android' ? '#0A0C14' : 'rgba(10, 14, 30, 0.90)',
    paddingHorizontal: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1.25,
    borderColor: GLASS.borderColor,
    overflow: 'hidden',
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
    borderWidth: 1.25,
    borderColor: 'rgba(255, 255, 255, 0.18)',
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
});
