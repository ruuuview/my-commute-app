import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  Linking,
  AppState,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  CaretLeft, Bell, Clock, CaretRight,
  Fingerprint, House, MapTrifold, MapPin, Shield,
  WarningCircle, Wrench, Warning,
  SpeakerHigh, BellSlash, Sparkle
} from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { LiveActivityService } from '../services/LiveActivityService';
import { track } from '../services/analyticsService';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as ExpoLocation from 'expo-location';
import { useShallow } from 'zustand/react/shallow';
import Animated from 'react-native-reanimated';

import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { requestPermission, usePermissionOrchestrator } from '../store/permissionOrchestrator';
import { syncGeofencesAsync } from '../services/backgroundTask';
import { ProStatusCard } from '../components/ProStatusCard';
import { FixItSheet } from '../components/FixItSheet';
import { AlertHoursSheet } from '../components/AlertHoursSheet';
import { DiagnosticsModal } from '../components/DiagnosticsModal';
import { LiquidGlassView } from '../components/LiquidGlassView';
import TfLConnectSheet from '../components/refunds/TfLConnectSheet';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { SETTINGS_BACKGROUND_GRADIENT, CANVAS_LONDON_NIGHT } from '../theme/colors';

const TFL_CONTACTLESS_PORTAL_URL = 'https://tfl.gov.uk/fares/contactless-and-oyster-account';

interface IconBadgeProps {
  icon: React.ReactNode;
  backgroundColor: string;
  borderColor?: string;
}

function IconBadge({ icon, backgroundColor, borderColor }: IconBadgeProps) {
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor,
        borderWidth: 1,
        borderColor: borderColor || 'rgba(255, 255, 255, 0.20)',
        marginRight: 12,
      }}
    >
      {icon}
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const backAnim = usePressAnimation('back_btn', false);

  // ── Store Selectors (Zustand + MMKV) ──────────────────────────────
  const {
    hapticsEnabled,
    setHapticsEnabled,
    locationGranted,
    setLocationGranted,
    calendarGranted,
    setCalendarGranted,
    arrivalNotificationsEnabled,
    setArrivalNotificationsEnabled,
    tflAccountStatus,
    setTflAccountStatus,
    completedJourneys,
    pinnedStations,
    resetOnboarding,
    alertHoursMode,
    alertWindowStart,
    alertWindowEnd,
    severeBypassAlertHours,
    shushPreferences,
    setAlertDeliveryMode,
    setShushActivation,
    setTimeSensitiveGranted,
  } = useUserPreferencesStore(
    useShallow((s) => ({
      hapticsEnabled: s.hapticsEnabled,
      setHapticsEnabled: s.setHapticsEnabled,
      locationGranted: s.locationGranted,
      setLocationGranted: s.setLocationGranted,
      calendarGranted: s.calendarGranted,
      setCalendarGranted: s.setCalendarGranted,
      arrivalNotificationsEnabled: s.arrivalNotificationsEnabled,
      setArrivalNotificationsEnabled: s.setArrivalNotificationsEnabled,
      tflAccountStatus: s.tflAccountStatus,
      setTflAccountStatus: s.setTflAccountStatus,
      completedJourneys: s.completedJourneys,
      pinnedStations: s.pinnedStations || [],
      resetOnboarding: s.resetOnboarding,
      alertHoursMode: s.alertHoursMode || (s.alertWindowStart === '00:00' && s.alertWindowEnd === '23:59' ? '24h' : 'custom'),
      alertWindowStart: s.alertWindowStart || '06:00',
      alertWindowEnd: s.alertWindowEnd || '22:00',
      severeBypassAlertHours: s.severeBypassAlertHours !== false,
      shushPreferences: s.shushPreferences,
      setAlertDeliveryMode: s.setAlertDeliveryMode,
      setShushActivation: s.setShushActivation,
      setTimeSensitiveGranted: s.setTimeSensitiveGranted,
    }))
  );

  // ── Shush Mode & Dynamic Island State ─────────────────────────────
  const [hasDI, setHasDI] = useState(true);
  const [isTestingShush, setIsTestingShush] = useState(false);

  useEffect(() => {
    void (async () => {
      const di = await LiveActivityService.hasDynamicIsland();
      setHasDI(di);
      const ts = await LiveActivityService.checkTimeSensitivePermission();
      setTimeSensitiveGranted(ts);
    })();
  }, [setTimeSensitiveGranted]);

  const handleSelectDeliveryMode = useCallback(
    async (mode: 'loud' | 'shush' | 'off') => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      setAlertDeliveryMode(mode);
      if (mode === 'shush') {
        track('shush_mode_enabled');
        const ts = await LiveActivityService.checkTimeSensitivePermission();
        setTimeSensitiveGranted(ts);
        if (!ts) {
          const granted = await LiveActivityService.requestTimeSensitivePermission();
          setTimeSensitiveGranted(granted);
        }
      } else {
        track('shush_mode_disabled', { newMode: mode });
      }
    },
    [hapticsEnabled, setAlertDeliveryMode, setTimeSensitiveGranted]
  );

  const handleTestShushDemo = useCallback(async () => {
    if (hapticsEnabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setIsTestingShush(true);
    await LiveActivityService.startPreviewActivity();
    setTimeout(() => {
      setIsTestingShush(false);
    }, 5200);
  }, [hapticsEnabled]);

  // ── Local Disruption Alerts Content Toggle (Layer 2) ──────────────
  const [disruptionAlertsEnabled, setDisruptionAlertsEnabled] = useState(true);
  const [severeAlertsEnabled, setSevereAlertsEnabled] = useState(true);
  const [minorAlertsEnabled, setMinorAlertsEnabled] = useState(true);

  // ── Modals & Sheets ───────────────────────────────────────────────
  const [showFixItSheet, setShowFixItSheet] = useState(false);
  const [showAlertHoursSheet, setShowAlertHoursSheet] = useState(false);
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [showTflConnectSheet, setShowTflConnectSheet] = useState(false);
  const [versionTaps, setVersionTaps] = useState(0);
  const [developerUnlocked, setDeveloperUnlocked] = useState(false);

  // ── Real OS Permission States (System Truth - Layer 1) ───────────
  const [osNotificationsGranted, setOsNotificationsGranted] = useState(false);
  const [osNotifCanAskAgain, setOsNotifCanAskAgain] = useState(true);
  const [osNotifStatus, setOsNotifStatus] = useState<Notifications.PermissionStatus>(
    Notifications.PermissionStatus.UNDETERMINED
  );
  const [osLocationAlwaysGranted, setOsLocationAlwaysGranted] = useState(false);

  const checkOsPermissions = useCallback(async () => {
    try {
      const notif = await Notifications.getPermissionsAsync();
      setOsNotificationsGranted(notif.status === 'granted');
      setOsNotifCanAskAgain(notif.canAskAgain);
      setOsNotifStatus(notif.status);

      const locBg = await ExpoLocation.getBackgroundPermissionsAsync();
      setOsLocationAlwaysGranted(locBg.status === 'granted');
    } catch (e) {
      console.warn('[Settings] Error checking OS permissions:', e);
    }
  }, []);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    try {
      const res = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      const granted = res.status === 'granted';
      setOsNotificationsGranted(granted);
      setOsNotifStatus(res.status);
      setOsNotifCanAskAgain(res.canAskAgain);
      if (granted) {
        setDisruptionAlertsEnabled(true);
        usePermissionOrchestrator.getState().recordDecision('notifications', 'granted');
      } else if (res.status === Notifications.PermissionStatus.DENIED && !res.canAskAgain) {
        usePermissionOrchestrator.getState().recordDecision('notifications', 'denied');
      }
    } catch (err) {
      console.warn('[Settings] Failed to request notification permissions:', err);
    }
  }, [hapticsEnabled]);

  useEffect(() => {
    void checkOsPermissions();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkOsPermissions();
      }
    });
    return () => sub.remove();
  }, [checkOsPermissions]);

  // ── Station Helpers ───────────────────────────────────────────────
  const homeStation = useMemo(
    () => pinnedStations.find((s) => s.role === 'home'),
    [pinnedStations]
  );
  const workStation = useMemo(
    () => pinnedStations.find((s) => s.role === 'work'),
    [pinnedStations]
  );
  const hasHomeOrWork = Boolean(homeStation || workStation);

  const homeWorkSubtitle = useMemo(() => {
    if (homeStation && workStation) {
      return `${homeStation.name} ⇄ ${workStation.name}`;
    }
    if (homeStation) return `${homeStation.name} (Home)`;
    if (workStation) return `${workStation.name} (Work)`;
    return 'Tap to set Home & Work stations';
  }, [homeStation, workStation]);

  // ── Nearby Station Detection Subtitle ─────────────────────────────
  const nearbySubtitle = useMemo(() => {
    if (!osLocationAlwaysGranted) {
      return 'Requires Always location · Tap to enable';
    }
    if (!hasHomeOrWork) {
      return 'Set Home & Work station first';
    }
    if (locationGranted) {
      return 'Monitoring Home & Work';
    }
    return 'Starts live tracking as you approach Home or Work';
  }, [osLocationAlwaysGranted, hasHomeOrWork, locationGranted]);

  // ── Priority Attention Row (Max 1) ────────────────────────────────
  const attentionRow = useMemo(() => {
    // Priority 1: Notifications
    if (!osNotificationsGranted) {
      // Truly blocked in iOS Settings (status === 'denied' and OS won't allow re-asking in-app)
      if (osNotifStatus === Notifications.PermissionStatus.DENIED && !osNotifCanAskAgain) {
        return {
          id: 'notif_blocked',
          icon: <WarningCircle size={20} color="#FF3B30" weight="bold" />,
          title: 'Disruption alerts are blocked',
          subtitle: 'Notifications are turned off for My Commute in iOS Settings',
          actionLabel: 'Open Settings',
          borderColor: 'rgba(255, 59, 48, 0.45)',
          bgTint: 'rgba(255, 59, 48, 0.12)',
          onPress: () => Linking.openSettings().catch(() => {}),
        };
      }
      // Never asked yet or can prompt directly in-app
      return {
        id: 'notif_enable',
        icon: <Bell size={20} color="#0098D4" weight="bold" />,
        title: 'Enable disruption alerts',
        subtitle: 'Turn on notifications to get real-time delay & closure alerts',
        actionLabel: 'Turn On',
        borderColor: 'rgba(0, 152, 212, 0.45)',
        bgTint: 'rgba(0, 152, 212, 0.12)',
        onPress: handleRequestNotificationPermission,
      };
    }
    // Priority 2: Location Blocked (Feature desired but Always not granted)
    if (locationGranted && !osLocationAlwaysGranted) {
      return {
        id: 'loc_blocked',
        icon: <Warning size={20} color="#FFA500" weight="bold" />,
        title: 'Nearby detection needs Always location',
        subtitle: 'Allow background location to track arrival automatically',
        actionLabel: 'Open Settings',
        borderColor: 'rgba(255, 165, 0, 0.45)',
        bgTint: 'rgba(255, 165, 0, 0.12)',
        onPress: () => Linking.openSettings().catch(() => {}),
      };
    }
    // Priority 3: Home/Work Missing (Feature desired but 0 stations configured)
    if (locationGranted && !hasHomeOrWork) {
      return {
        id: 'stations_missing',
        icon: <MapPin size={20} color="#007AFF" weight="bold" />,
        title: 'Set Home & Work stations to track',
        subtitle: 'Nearby detection requires at least one commute station',
        actionLabel: 'Set Stations',
        borderColor: 'rgba(0, 122, 255, 0.45)',
        bgTint: 'rgba(0, 122, 255, 0.12)',
        onPress: () => setShowFixItSheet(true),
      };
    }
    return null;
  }, [
    osNotificationsGranted,
    osNotifStatus,
    osNotifCanAskAgain,
    handleRequestNotificationPermission,
    locationGranted,
    osLocationAlwaysGranted,
    hasHomeOrWork,
  ]);

  // ── Toggle Handlers ───────────────────────────────────────────────
  const handleToggleDisruptionAlerts = async (val: boolean) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (val && !osNotificationsGranted) {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (current.status === 'granted') {
          setOsNotificationsGranted(true);
          setOsNotifStatus(current.status);
          setDisruptionAlertsEnabled(true);
          return;
        }
        if (current.canAskAgain || current.status === Notifications.PermissionStatus.UNDETERMINED) {
          const res = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
          const granted = res.status === 'granted';
          setOsNotificationsGranted(granted);
          setOsNotifStatus(res.status);
          setOsNotifCanAskAgain(res.canAskAgain);
          if (granted) {
            setDisruptionAlertsEnabled(true);
            usePermissionOrchestrator.getState().recordDecision('notifications', 'granted');
            return;
          }
        }
        Alert.alert(
          'Notifications Required',
          'Please enable notifications in Settings to receive real-time alerts.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      } catch (err) {
        console.warn('[Settings] Failed to toggle disruption alerts:', err);
      }
      return;
    }
    setDisruptionAlertsEnabled(val);
  };

  const handleToggleNearbyDetection = async (val: boolean) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }

    if (val) {
      // Empty guard: if 0 home or work stations exist, force setup
      if (!hasHomeOrWork) {
        Alert.alert(
          'Set Home & Work First',
          'Nearby station detection monitors your commute corridor. Please label your Home or Work station to start tracking.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Set Stations', onPress: () => setShowFixItSheet(true) },
          ]
        );
        return;
      }

      // Request locationAlways through 2-step orchestrator
      if (!osLocationAlwaysGranted) {
        const decision = await requestPermission('locationAlways', 'settings_toggle');
        if (decision !== 'granted') {
          Alert.alert(
            'Background Location Needed',
            'To detect when you approach Home or Work stations in the background, set Location to Always in Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
          return;
        }
        setOsLocationAlwaysGranted(true);
      }

      setLocationGranted(true);
      void syncGeofencesAsync(pinnedStations);
    } else {
      setLocationGranted(false);
      void syncGeofencesAsync([]);
    }
  };

  const handleToggleWelcomeHome = async (val: boolean) => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (val && !osNotificationsGranted) {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (current.status === 'granted') {
          setOsNotificationsGranted(true);
          setOsNotifStatus(current.status);
          setArrivalNotificationsEnabled(true);
          return;
        }
        if (current.canAskAgain || current.status === Notifications.PermissionStatus.UNDETERMINED) {
          const res = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
          const granted = res.status === 'granted';
          setOsNotificationsGranted(granted);
          setOsNotifStatus(res.status);
          setOsNotifCanAskAgain(res.canAskAgain);
          if (granted) {
            setArrivalNotificationsEnabled(true);
            usePermissionOrchestrator.getState().recordDecision('notifications', 'granted');
            return;
          }
        }
        Alert.alert(
          'Notifications Required',
          'Welcome Home sends a local arrival summary when you reach home. Please enable notifications in Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
      } catch (err) {
        console.warn('[Settings] Failed to toggle welcome home:', err);
      }
      return;
    }
    setArrivalNotificationsEnabled(val);
  };

  // ── Option C "Ratchet" TfL Tap Handler ────────────────────────────
  const handleTflRowPress = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    if (tflAccountStatus === 'REGISTERED_28_DAY') {
      // Already registered: Utility action -> direct to official TfL Portal
      Linking.openURL(TFL_CONTACTLESS_PORTAL_URL).catch((err) => {
        console.warn('[Settings] Failed to open TfL portal:', err);
      });
    } else {
      // Unlinked: Acquisition action -> open TfLConnectSheet
      setShowTflConnectSheet(true);
    }
  };

  const trialCommutesRemaining = Math.max(0, 10 - (completedJourneys || 0));

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/* Deep Royal Sapphire to Midnight Atmospheric Gradient */}
      <LinearGradient
        colors={SETTINGS_BACKGROUND_GRADIENT.colors}
        locations={SETTINGS_BACKGROUND_GRADIENT.locations}
        start={SETTINGS_BACKGROUND_GRADIENT.start}
        end={SETTINGS_BACKGROUND_GRADIENT.end}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.mainWrapper, { paddingTop: insets.top }]}>
        {/* Navigation Header */}
        <View style={styles.header}>
          <Animated.View style={backAnim.animatedStyle}>
            <Pressable 
              style={styles.backButton} 
              onPress={() => router.back()}
              onPressIn={backAnim.onPressIn}
              onPressOut={backAnim.onPressOut}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <CaretLeft size={28} color="#FFFFFF" />
            </Pressable>
          </Animated.View>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* Conditional Priority Attention Row (Max 1) */}
          {attentionRow && (
            <LiquidGlassView
              borderRadius={16}
              borderColor={attentionRow.borderColor || 'rgba(255, 59, 48, 0.45)'}
              style={styles.attentionCardOuter}
              contentStyle={[
                styles.attentionContent,
                attentionRow.bgTint ? { backgroundColor: attentionRow.bgTint } : null,
              ]}
            >
              <View style={styles.attentionLeft}>
                {attentionRow.icon}
                <View style={styles.attentionTextWrap}>
                  <Text style={styles.attentionTitle}>{attentionRow.title}</Text>
                  <Text style={styles.attentionSubtitle}>{attentionRow.subtitle}</Text>
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.attentionBtn,
                  pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
                ]}
                onPress={attentionRow.onPress}
                accessibilityRole="button"
                accessibilityLabel={attentionRow.actionLabel}
              >
                <Text style={styles.attentionBtnText}>{attentionRow.actionLabel}</Text>
              </Pressable>
            </LiquidGlassView>
          )}

          {/* Clean Pro Status Meter (Soft Honesty) */}
          <View style={styles.proWrapper}>
            <ProStatusCard 
              isPro={false}
              trialCommutesRemaining={trialCommutesRemaining}
              onUpgrade={() => {}}
            />
          </View>

          {/* ── NOTIFICATION DELIVERY & SHUSH MODE ────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>NOTIFICATION DELIVERY</Text>

            <LiquidGlassView
              borderRadius={16}
              style={styles.cardOuter}
              contentStyle={styles.cardInner}
            >
              {/* Delivery Mode 3-Way Picker */}
              <View style={styles.shushPickerRow}>
                {/* Loud & Proud */}
                <Pressable
                  style={[
                    styles.shushModeCard,
                    shushPreferences.alertDeliveryMode === 'loud' && styles.shushModeCardActiveLoud,
                  ]}
                  onPress={() => handleSelectDeliveryMode('loud')}
                  accessibilityRole="button"
                  accessibilityLabel="Loud & Proud delivery mode"
                >
                  <IconBadge
                    icon={<SpeakerHigh size={18} color="#FF9500" weight="fill" />}
                    backgroundColor="rgba(255, 149, 0, 0.18)"
                    borderColor="rgba(255, 149, 0, 0.35)"
                  />
                  <Text style={styles.shushModeTitle}>Loud & Proud</Text>
                  <Text style={styles.shushModeDesc}>Banners, chimes & haptics</Text>
                </Pressable>

                {/* Shush Mode ✨ */}
                <Pressable
                  style={[
                    styles.shushModeCard,
                    shushPreferences.alertDeliveryMode === 'shush' && styles.shushModeCardActiveShush,
                  ]}
                  onPress={() => handleSelectDeliveryMode('shush')}
                  accessibilityRole="button"
                  accessibilityLabel="Shush Mode delivery mode"
                >
                  <IconBadge
                    icon={<Sparkle size={18} color="#BF5AF2" weight="fill" />}
                    backgroundColor="rgba(191, 90, 242, 0.18)"
                    borderColor="rgba(191, 90, 242, 0.35)"
                  />
                  <Text style={[styles.shushModeTitle, { color: '#BF5AF2' }]}>Shush Mode ✨</Text>
                  <Text style={styles.shushModeDesc}>Silent Dynamic Island</Text>
                </Pressable>

                {/* Off */}
                <Pressable
                  style={[
                    styles.shushModeCard,
                    shushPreferences.alertDeliveryMode === 'off' && styles.shushModeCardActiveOff,
                  ]}
                  onPress={() => handleSelectDeliveryMode('off')}
                  accessibilityRole="button"
                  accessibilityLabel="Off delivery mode"
                >
                  <IconBadge
                    icon={<BellSlash size={18} color="#8E8E93" weight="fill" />}
                    backgroundColor="rgba(142, 142, 147, 0.18)"
                    borderColor="rgba(142, 142, 147, 0.35)"
                  />
                  <Text style={styles.shushModeTitle}>Off</Text>
                  <Text style={styles.shushModeDesc}>Complete silence</Text>
                </Pressable>
              </View>

              {shushPreferences.alertDeliveryMode === 'shush' && (
                <>
                  <View style={styles.divider} />

                  {/* Activation Mode Selector */}
                  <View style={styles.shushSubRow}>
                    <Text style={styles.shushSubLabel}>Activation</Text>
                    <View style={styles.shushPillGroup}>
                      {(['smart', 'schedule', 'always'] as const).map((act) => (
                        <Pressable
                          key={act}
                          style={[
                            styles.shushPill,
                            shushPreferences.shushActivation === act && styles.shushPillActive,
                          ]}
                          onPress={() => {
                            if (hapticsEnabled) {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            }
                            setShushActivation(act);
                          }}
                        >
                          <Text
                            style={[
                              styles.shushPillText,
                              shushPreferences.shushActivation === act && styles.shushPillTextActive,
                            ]}
                          >
                            {act === 'smart' ? 'Smart' : act === 'schedule' ? 'Schedule' : 'Always'}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {/* Surface indicator (DI vs Non-DI) */}
                  <View style={styles.surfaceInfoRow}>
                    <Sparkle size={15} color="#BF5AF2" weight="fill" />
                    <Text style={styles.surfaceInfoText}>
                      {hasDI
                        ? 'Optimized for Dynamic Island & Lock Screen Card'
                        : 'Delivering via silent Notification Center updates'}
                    </Text>
                  </View>

                  {/* Time-Sensitive Permission Soft Nag */}
                  {!shushPreferences.timeSensitiveGranted && (
                    <View style={styles.shushWarningBox}>
                      <Warning size={18} color="#FF9F0A" weight="fill" />
                      <View style={{ flex: 1, marginHorizontal: 8 }}>
                        <Text style={styles.shushWarningTitle}>Time-Sensitive Alert Needed</Text>
                        <Text style={styles.shushWarningSub}>
                          Tier 3 line closures cannot break silence without Time-Sensitive permission.
                        </Text>
                      </View>
                      <Pressable
                        style={styles.shushEnableBtn}
                        onPress={async () => {
                          const ok = await LiveActivityService.requestTimeSensitivePermission();
                          if (!ok) {
                            Linking.openSettings().catch(() => {});
                          }
                        }}
                      >
                        <Text style={styles.shushEnableBtnText}>Enable</Text>
                      </Pressable>
                    </View>
                  )}

                  {/* 1-Tap 5-second Demo (Section 19) */}
                  <Pressable
                    style={({ pressed }) => [
                      styles.shushDemoBtn,
                      pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                    ]}
                    onPress={handleTestShushDemo}
                    disabled={isTestingShush}
                  >
                    <Sparkle size={16} color="#FFFFFF" weight="bold" />
                    <Text style={styles.shushDemoBtnText}>
                      {isTestingShush ? 'Live Activity Preview Running (5s)...' : 'Test Shush Mode (5s Live Activity)'}
                    </Text>
                  </Pressable>
                </>
              )}
            </LiquidGlassView>
          </View>

          {/* ── HUB 1: ALERTS (Protect My Time) ───────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ALERTS</Text>

            <LiquidGlassView
              borderRadius={16}
              style={styles.cardOuter}
              contentStyle={styles.cardInner}
            >
              {/* Master Switch: Disruption Alerts */}
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <View style={styles.labelRow}>
                    <IconBadge
                      icon={<Bell size={18} color="#30D158" weight="fill" />}
                      backgroundColor="rgba(48, 209, 88, 0.18)"
                      borderColor="rgba(48, 209, 88, 0.35)"
                    />
                    <Text style={styles.rowLabel}>Disruption Alerts</Text>
                  </View>
                  <Text style={styles.rowSubtitle}>
                    Alerts for disruptions on your saved lines & stations
                  </Text>
                </View>
                <Switch
                  value={osNotificationsGranted && disruptionAlertsEnabled}
                  onValueChange={handleToggleDisruptionAlerts}
                  trackColor={{ false: '#3A3A3C', true: '#30D158' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Child 1: Severe Disruptions (Dimmed if Master OFF) */}
              <View style={[styles.childRow, !disruptionAlertsEnabled && styles.dimmedRow]}>
                <View style={styles.rowInfo}>
                  <Text style={styles.childLabel}>Severe Disruptions</Text>
                  <Text style={styles.rowSubtitle}>Closures, suspensions, and major delays</Text>
                </View>
                <Switch
                  disabled={!disruptionAlertsEnabled}
                  value={severeAlertsEnabled}
                  onValueChange={setSevereAlertsEnabled}
                  trackColor={{ false: '#3A3A3C', true: '#DC3545' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Child 2: Minor Delays (Dimmed if Master OFF) */}
              <View style={[styles.childRow, !disruptionAlertsEnabled && styles.dimmedRow]}>
                <View style={styles.rowInfo}>
                  <Text style={styles.childLabel}>Minor Delays</Text>
                  <Text style={styles.rowSubtitle}>Part-closures, reduced service, and delays</Text>
                </View>
                <Switch
                  disabled={!disruptionAlertsEnabled}
                  value={minorAlertsEnabled}
                  onValueChange={setMinorAlertsEnabled}
                  trackColor={{ false: '#3A3A3C', true: '#FFA500' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.divider} />

              {/* Alert Hours (Allowed Window) */}
              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={() => setShowAlertHoursSheet(true)}
                accessibilityRole="button"
                accessibilityLabel={
                  alertHoursMode === '24h'
                    ? 'Alert hours: 24/7 Always on'
                    : `Alert hours, current window: ${alertWindowStart} to ${alertWindowEnd}`
                }
                accessibilityHint="Opens sheet to adjust notification hours"
              >
                <View style={styles.rowInfo}>
                  <View style={styles.labelRow}>
                    <IconBadge
                      icon={<Clock size={18} color="#5E5CE6" weight="bold" />}
                      backgroundColor="rgba(94, 92, 230, 0.18)"
                      borderColor="rgba(94, 92, 230, 0.35)"
                    />
                    <Text style={styles.rowLabel}>Alert hours</Text>
                  </View>
                  <Text style={styles.rowSubtitle}>
                    {alertHoursMode === '24h'
                      ? '24/7 (Always on)'
                      : `${alertWindowStart} – ${alertWindowEnd}${severeBypassAlertHours ? ' · Severe always on' : ' · Strict'}`}
                  </Text>
                </View>
                <CaretRight size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>

              <View style={styles.divider} />

              {/* Calendar Commute Auto-Detect */}
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <View style={styles.labelRow}>
                    <IconBadge
                      icon={<Clock size={18} color="#0A84FF" weight="bold" />}
                      backgroundColor="rgba(10, 132, 255, 0.18)"
                      borderColor="rgba(10, 132, 255, 0.35)"
                    />
                    <Text style={styles.rowLabel}>Auto-detect commute from calendar</Text>
                  </View>
                  <Text style={styles.rowSubtitle}>
                    Reads event start times to alert you before you travel
                  </Text>
                </View>
                <Switch
                  value={calendarGranted}
                  onValueChange={async (v) => {
                    if (hapticsEnabled) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    }
                    if (v) {
                      const res = await requestPermission('calendar', 'auto_detect');
                      setCalendarGranted(res === 'granted');
                    } else {
                      setCalendarGranted(false);
                    }
                  }}
                  trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </LiquidGlassView>
          </View>

          {/* ── HUB 2: MY COMMUTE (Spatial Intelligence) ──────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MY COMMUTE</Text>

            <LiquidGlassView
              borderRadius={16}
              style={styles.cardOuter}
              contentStyle={styles.cardInner}
            >
              {/* Home & Work Stations Action Row */}
              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={() => setShowFixItSheet(true)}
                accessibilityRole="button"
                accessibilityLabel={`Home and Work Stations, currently ${homeWorkSubtitle}`}
                accessibilityHint="Opens sheet to set your home and work commute stations"
              >
                <View style={styles.rowInfo}>
                  <View style={styles.labelRow}>
                    <IconBadge
                      icon={<MapTrifold size={18} color="#BF5AF2" weight="fill" />}
                      backgroundColor="rgba(175, 82, 222, 0.18)"
                      borderColor="rgba(175, 82, 222, 0.35)"
                    />
                    <Text style={styles.rowLabel}>Home & Work Stations</Text>
                  </View>
                  <Text
                    style={[
                      styles.rowSubtitle,
                      !hasHomeOrWork && { color: '#FFA500', fontFamily: 'SpaceGrotesk_600SemiBold' },
                    ]}
                  >
                    {homeWorkSubtitle}
                  </Text>
                </View>
                <CaretRight size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>

              <View style={styles.divider} />

              {/* Nearby Station Detection (Silent Background Geofencing) */}
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <View style={styles.labelRow}>
                    <IconBadge
                      icon={<MapPin size={18} color="#0A84FF" weight="fill" />}
                      backgroundColor="rgba(10, 132, 255, 0.18)"
                      borderColor="rgba(10, 132, 255, 0.35)"
                    />
                    <Text style={styles.rowLabel}>Nearby Station Detection</Text>
                  </View>
                  <Text
                    style={[
                      styles.rowSubtitle,
                      locationGranted && osLocationAlwaysGranted && hasHomeOrWork && { color: '#30D158' },
                    ]}
                  >
                    {nearbySubtitle}
                  </Text>
                </View>
                <Switch
                  value={locationGranted && osLocationAlwaysGranted && hasHomeOrWork}
                  onValueChange={handleToggleNearbyDetection}
                  trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.divider} />

              {/* Welcome Home Summary (Independent Layer 3 Arrival Event) */}
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <View style={styles.labelRow}>
                    <IconBadge
                      icon={<House size={18} color="#FF9F0A" weight="fill" />}
                      backgroundColor="rgba(255, 159, 10, 0.18)"
                      borderColor="rgba(255, 159, 10, 0.35)"
                    />
                    <Text style={styles.rowLabel}>Welcome Home Summary</Text>
                  </View>
                  <Text style={styles.rowSubtitle}>
                    Notifies upon arrival at your Home station
                  </Text>
                </View>
                <Switch
                  value={arrivalNotificationsEnabled && osNotificationsGranted}
                  onValueChange={handleToggleWelcomeHome}
                  trackColor={{ false: '#3A3A3C', true: '#30D158' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </LiquidGlassView>
          </View>

          {/* ── GENERAL & ACCOUNT ─────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>GENERAL</Text>

            <LiquidGlassView
              borderRadius={16}
              style={styles.cardOuter}
              contentStyle={styles.cardInner}
            >
              {/* Option C Ratchet: TfL Refund Coverage */}
              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={handleTflRowPress}
                accessibilityRole="button"
                accessibilityLabel={`TfL refund coverage, status: ${tflAccountStatus === 'REGISTERED_28_DAY' ? '28-day window active' : '7-day limit'}`}
                accessibilityHint={tflAccountStatus === 'REGISTERED_28_DAY' ? 'Opens official TfL contactless account portal' : 'Opens sheet to unlock 28-day refund protection'}
              >
                <View style={styles.rowInfo}>
                  <View style={styles.labelRow}>
                    <IconBadge
                      icon={
                        <Shield
                          size={18}
                          color={tflAccountStatus === 'REGISTERED_28_DAY' ? '#30D158' : '#00D2FF'}
                          weight="fill"
                        />
                      }
                      backgroundColor={
                        tflAccountStatus === 'REGISTERED_28_DAY'
                          ? 'rgba(48, 209, 88, 0.18)'
                          : 'rgba(0, 152, 212, 0.18)'
                      }
                      borderColor={
                        tflAccountStatus === 'REGISTERED_28_DAY'
                          ? 'rgba(48, 209, 88, 0.35)'
                          : 'rgba(0, 152, 212, 0.35)'
                      }
                    />
                    <Text style={styles.rowLabel}>TfL refund coverage</Text>
                  </View>
                  <Text
                    style={[
                      styles.rowSubtitle,
                      tflAccountStatus === 'REGISTERED_28_DAY' && { color: '#30D158', fontFamily: 'SpaceGrotesk_600SemiBold' },
                    ]}
                  >
                    {tflAccountStatus === 'REGISTERED_28_DAY'
                      ? '28-day window active'
                      : '7-day limit · Tap to unlock 28 days'}
                  </Text>
                </View>
                <CaretRight size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>

              <View style={styles.divider} />

              {/* Haptic Feedback */}
              <View style={styles.row}>
                <View style={styles.rowInfo}>
                  <View style={styles.labelRow}>
                    <IconBadge
                      icon={<Fingerprint size={18} color="#FFFFFF" weight="bold" />}
                      backgroundColor="rgba(255, 255, 255, 0.12)"
                      borderColor="rgba(255, 255, 255, 0.25)"
                    />
                    <Text style={styles.rowLabel}>Haptic Feedback</Text>
                  </View>
                  <Text style={styles.rowSubtitle}>Vibrate on interaction and alerts</Text>
                </View>
                <Switch
                  value={hapticsEnabled}
                  onValueChange={setHapticsEnabled}
                  trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
                  thumbColor="#FFFFFF"
                  accessibilityRole="switch"
                  accessibilityLabel="Haptic Feedback"
                />
              </View>

              <View style={styles.divider} />

              {/* App Version (Tap 5 times to reveal Diagnostics) */}
              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={() => {
                  const next = versionTaps + 1;
                  setVersionTaps(next);
                  if (next >= 5 && !developerUnlocked) {
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    setDeveloperUnlocked(true);
                    setVersionTaps(0);
                    Alert.alert('Developer Menu Unlocked', 'Diagnostics & Sensor Health is now available below.');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="App Version"
              >
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>Version</Text>
                  <Text style={styles.rowSubtitle}>
                    1.0.3 · Powered by TfL Open Data{developerUnlocked ? ' · Dev Unlocked' : ''}
                  </Text>
                </View>
              </Pressable>

              <View style={styles.divider} />

              {/* Privacy Policy */}
              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={() => router.push('/privacy' as any)}
                accessibilityRole="button"
                accessibilityLabel="Privacy Policy"
                accessibilityHint="Opens privacy policy screen"
              >
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>Privacy Policy</Text>
                  <Text style={styles.rowSubtitle}>How we handle your data</Text>
                </View>
                <CaretRight size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>

              <View style={styles.divider} />

              {/* Terms of Service */}
              <Pressable
                style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                onPress={() => router.push('/terms' as any)}
                accessibilityRole="button"
                accessibilityLabel="Terms of Service"
                accessibilityHint="Opens terms of service screen"
              >
                <View style={styles.rowInfo}>
                  <Text style={styles.rowLabel}>Terms of Service</Text>
                  <Text style={styles.rowSubtitle}>App usage terms</Text>
                </View>
                <CaretRight size={18} color="rgba(255,255,255,0.35)" />
              </Pressable>
            </LiquidGlassView>
          </View>

          {/* ── ADVANCED & DIAGNOSTICS (__DEV__ / Preview / Developer Unlocked) ─────── */}
          {(__DEV__ ||
            process.env.NODE_ENV !== 'production' ||
            process.env.EXPO_PUBLIC_BUILD_PROFILE === 'preview' ||
            developerUnlocked) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>ADVANCED</Text>
              <LiquidGlassView
                borderRadius={16}
                style={styles.cardOuter}
                contentStyle={styles.cardInner}
              >
                <Pressable
                  style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
                  onPress={() => setShowDiagnosticsModal(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Diagnostics & Sensor Health"
                  accessibilityHint="Opens sensor health and permissions diagnostics drawer"
                >
                  <View style={styles.rowInfo}>
                    <View style={styles.labelRow}>
                      <IconBadge
                        icon={<Wrench size={18} color="#0A84FF" weight="bold" />}
                        backgroundColor="rgba(10, 132, 255, 0.18)"
                        borderColor="rgba(10, 132, 255, 0.35)"
                      />
                      <Text style={[styles.rowLabel, { color: '#0A84FF' }]}>
                        Diagnostics & Sensor Health
                      </Text>
                    </View>
                    <Text style={styles.rowSubtitle}>
                      CoreLocation health, push simulation, permissions matrix
                    </Text>
                  </View>
                  <CaretRight size={18} color="rgba(255,255,255,0.35)" />
                </Pressable>
              </LiquidGlassView>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ── Modals & Sheets ─────────────────────────────────────────── */}
      <FixItSheet
        visible={showFixItSheet}
        onClose={() => {
          setShowFixItSheet(false);
          // Re-sync geofences whenever Home/Work stations are changed
          void syncGeofencesAsync(useUserPreferencesStore.getState().pinnedStations);
        }}
      />

      <AlertHoursSheet
        visible={showAlertHoursSheet}
        onClose={() => setShowAlertHoursSheet(false)}
      />

      <TfLConnectSheet
        visible={showTflConnectSheet}
        onClose={() => setShowTflConnectSheet(false)}
        onRegistered={() => {
          setTflAccountStatus('REGISTERED_28_DAY');
          setShowTflConnectSheet(false);
        }}
        onUnregistered={() => {
          setTflAccountStatus('UNREGISTERED_7_DAY');
          setShowTflConnectSheet(false);
        }}
      />

      <DiagnosticsModal
        visible={showDiagnosticsModal}
        onClose={() => setShowDiagnosticsModal(false)}
        onResetOnboarding={() => {
          setShowDiagnosticsModal(false);
          Alert.alert(
            'Reset Onboarding',
            'Are you sure? This clears your saved lines and stations.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Reset',
                style: 'destructive',
                onPress: () => {
                  resetOnboarding();
                  router.back();
                },
              },
            ]
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CANVAS_LONDON_NIGHT,
  },
  mainWrapper: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  proWrapper: {
    marginBottom: 20,
  },
  attentionCardOuter: {
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  attentionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
  },
  attentionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  attentionTextWrap: {
    flex: 1,
  },
  attentionTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  attentionSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.70)',
    marginTop: 2,
  },
  attentionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  attentionBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    letterSpacing: 0.8,
    color: 'rgba(255, 255, 255, 0.55)',
    marginBottom: 8,
    marginLeft: 4,
  },
  cardOuter: {
    borderRadius: 16,
    marginBottom: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 6,
  },
  cardInner: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingLeft: 44,
  },
  dimmedRow: {
    opacity: 0.35,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    minHeight: 48,
  },
  actionRowPressed: {
    opacity: 0.65,
  },
  rowInfo: {
    flex: 1,
    marginRight: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconMargin: {
    marginRight: 8,
  },
  rowLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  childLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.90)',
  },
  rowSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.70)',
    marginTop: 3,
    lineHeight: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginLeft: 44,
  },
  shushPickerRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
  },
  shushModeCard: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  shushModeCardActiveLoud: {
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
    borderColor: '#FF9500',
  },
  shushModeCardActiveShush: {
    backgroundColor: 'rgba(191, 90, 242, 0.18)',
    borderColor: '#BF5AF2',
  },
  shushModeCardActiveOff: {
    backgroundColor: 'rgba(142, 142, 147, 0.15)',
    borderColor: '#8E8E93',
  },
  shushModeTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#FFFFFF',
    marginTop: 4,
    textAlign: 'center',
  },
  shushModeDesc: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 13,
  },
  shushSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  shushSubLabel: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 14,
    color: '#FFFFFF',
  },
  shushPillGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  shushPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  shushPillActive: {
    backgroundColor: 'rgba(191, 90, 242, 0.28)',
    borderColor: '#BF5AF2',
  },
  shushPillText: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.70)',
  },
  shushPillTextActive: {
    color: '#FFFFFF',
  },
  surfaceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  surfaceInfoText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    flex: 1,
  },
  shushWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 159, 10, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 159, 10, 0.35)',
    borderRadius: 10,
    padding: 10,
    marginVertical: 8,
  },
  shushWarningTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#FF9F0A',
  },
  shushWarningSub: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    lineHeight: 14,
  },
  shushEnableBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#FF9F0A',
  },
  shushEnableBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    color: '#000000',
  },
  shushDemoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(191, 90, 242, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(191, 90, 242, 0.45)',
    marginVertical: 10,
  },
  shushDemoBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
});