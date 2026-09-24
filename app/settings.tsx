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
  Fingerprint, MapTrifold, MapPin, Shield,
  WarningCircle, Wrench, Warning,
  BellSlash, Sparkle
} from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { LiveActivityService } from '../services/LiveActivityService';
import { track } from '../services/analyticsService';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as ExpoLocation from 'expo-location';
import * as Calendar from 'expo-calendar';
import { useShallow } from 'zustand/react/shallow';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { requestPermission, usePermissionOrchestrator } from '../store/permissionOrchestrator';
import { syncGeofencesAsync } from '../services/backgroundTask';
import { scheduleCalendarCommuteAlerts, cancelCalendarCommuteAlerts } from '../services/calendarScheduler';
import { ProStatusCard } from '../components/ProStatusCard';
import { FixItSheet } from '../components/FixItSheet';
import { AlertHoursSheet } from '../components/AlertHoursSheet';
import { DiagnosticsModal } from '../components/DiagnosticsModal';
import { LiquidGlassView } from '../components/LiquidGlassView';
import { SegmentedGlassControl } from '../components/SegmentedGlassControl';
import TfLConnectSheet from '../components/refunds/TfLConnectSheet';
import { SETTINGS_BACKGROUND_GRADIENT, CANVAS_LONDON_NIGHT, PREMIUM_BUTTON } from '../theme/colors';

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

  // ── Store Selectors (Zustand + MMKV) ──────────────────────────────
  const {
    hapticsEnabled,
    setHapticsEnabled,
    locationGranted,
    setLocationGranted,
    calendarGranted,
    setCalendarGranted,
    tflAccountStatus,
    setTflAccountStatus,
    completedJourneys,
    pinnedStations,
    resetOnboarding,
    alertHoursMode,
    alertWindowStart,
    alertWindowEnd,
    severeBypassAlertHours,
    setSevereBypassAlertHours,
    shushPreferences,
    setAlertDeliveryMode,
    setTimeSensitiveStatus,
  } = useUserPreferencesStore(
    useShallow((s) => ({
      hapticsEnabled: s.hapticsEnabled,
      setHapticsEnabled: s.setHapticsEnabled,
      locationGranted: s.locationGranted,
      setLocationGranted: s.setLocationGranted,
      calendarGranted: s.calendarGranted,
      setCalendarGranted: s.setCalendarGranted,
      tflAccountStatus: s.tflAccountStatus,
      setTflAccountStatus: s.setTflAccountStatus,
      completedJourneys: s.completedJourneys,
      pinnedStations: s.pinnedStations || [],
      resetOnboarding: s.resetOnboarding,
      alertHoursMode: s.alertHoursMode || (s.alertWindowStart === '00:00' && s.alertWindowEnd === '23:59' ? '24h' : 'custom'),
      alertWindowStart: s.alertWindowStart || '06:00',
      alertWindowEnd: s.alertWindowEnd || '22:00',
      severeBypassAlertHours: s.severeBypassAlertHours !== false,
      setSevereBypassAlertHours: s.setSevereBypassAlertHours,
      shushPreferences: s.shushPreferences,
      setAlertDeliveryMode: s.setAlertDeliveryMode,
      setTimeSensitiveStatus: s.setTimeSensitiveStatus,
    }))
  );

  // ── Shush Mode & Time Sensitive Status ───────────────────────────
  useEffect(() => {
    void (async () => {
      const status = await LiveActivityService.getTimeSensitiveStatus();
      setTimeSensitiveStatus(status);
    })();
  }, [setTimeSensitiveStatus]);

  const handleSelectDeliveryMode = useCallback(
    async (mode: 'loud' | 'shush' | 'off') => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      }
      setAlertDeliveryMode(mode);
      if (mode === 'shush') {
        track('shush_mode_enabled');
        const status = await LiveActivityService.getTimeSensitiveStatus();
        setTimeSensitiveStatus(status);
        if (status === 'disabled') {
          await LiveActivityService.requestTimeSensitivePermission();
          const refreshed = await LiveActivityService.getTimeSensitiveStatus();
          setTimeSensitiveStatus(refreshed);
        }
      } else {
        track('shush_mode_disabled', { newMode: mode });
      }
    },
    [hapticsEnabled, setAlertDeliveryMode, setTimeSensitiveStatus]
  );

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
  const [liveActivityAuth, setLiveActivityAuth] = useState<{ supported: boolean; enabled: boolean }>({
    supported: true,
    enabled: true,
  });

  const checkLiveActivityAuth = useCallback(async () => {
    try {
      const info = await LiveActivityService.getActivityAuthorizationInfo();
      setLiveActivityAuth(info);
    } catch {
      setLiveActivityAuth({ supported: false, enabled: false });
    }
  }, []);

  const checkOsPermissions = useCallback(async () => {
    try {
      void checkLiveActivityAuth();
      const notif = await Notifications.getPermissionsAsync();
      const isGranted = Boolean(
        notif.granted ||
        notif.status === 'granted' ||
        (notif.ios && (notif.ios.status === 2 || notif.ios.status === 3 || notif.ios.allowsAlert))
      );
      setOsNotificationsGranted(isGranted);
      setOsNotifCanAskAgain(notif.canAskAgain);
      setOsNotifStatus(notif.status);
      if (isGranted) {
        usePermissionOrchestrator.getState().recordDecision('notifications', 'granted');
      }

      const locBg = await ExpoLocation.getBackgroundPermissionsAsync();
      const isLocGranted = Boolean(locBg.granted || locBg.status === 'granted');
      setOsLocationAlwaysGranted(isLocGranted);
      if (isLocGranted) {
        usePermissionOrchestrator.getState().recordDecision('locationAlways', 'granted');
      }

      // Sync native Calendar permission status
      try {
        const cal = await Calendar.getCalendarPermissionsAsync();
        const isCalGranted = cal.status === Calendar.PermissionStatus.GRANTED;
        const currentCalStore = useUserPreferencesStore.getState().calendarGranted;
        if (!isCalGranted && currentCalStore) {
          setCalendarGranted(false);
          void cancelCalendarCommuteAlerts();
        } else if (isCalGranted && currentCalStore) {
          void scheduleCalendarCommuteAlerts();
        }
      } catch (calErr) {
        console.warn('[Settings] Error checking calendar permissions:', calErr);
      }
    } catch (e) {
      console.warn('[Settings] Error checking OS permissions:', e);
    }
  }, [setCalendarGranted, checkLiveActivityAuth]);

  const handleRequestNotificationPermission = useCallback(async () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    try {
      const res = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      const granted = Boolean(
        res.granted ||
        res.status === 'granted' ||
        (res.ios && (res.ios.status === 2 || res.ios.status === 3 || res.ios.allowsAlert))
      );
      setOsNotificationsGranted(granted);
      setOsNotifStatus(res.status);
      setOsNotifCanAskAgain(res.canAskAgain);
      if (granted) {
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
    void checkLiveActivityAuth();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void checkOsPermissions();
        void checkLiveActivityAuth();
        void (async () => {
          const status = await LiveActivityService.getTimeSensitiveStatus();
          setTimeSensitiveStatus(status);
        })();
      }
    });
    return () => sub.remove();
  }, [checkOsPermissions, checkLiveActivityAuth, setTimeSensitiveStatus]);

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
    // Priority 1: Notifications (OS truth alone decides delivery. Relevant whenever delivery mode is not off)
    if (shushPreferences.alertDeliveryMode !== 'off' && !osNotificationsGranted) {
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
    shushPreferences.alertDeliveryMode,
    osNotificationsGranted,
    osNotifStatus,
    osNotifCanAskAgain,
    handleRequestNotificationPermission,
    locationGranted,
    osLocationAlwaysGranted,
    hasHomeOrWork,
  ]);

  // ── Toggle Handlers ───────────────────────────────────────────────
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
          <Pressable 
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Back to dashboard"
            accessibilityRole="button"
            testID="settings-back-button"
          >
            <CaretLeft size={18} color="rgba(255, 255, 255, 0.85)" weight="regular" />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 34 }} />
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
              {/* Delivery Mode 3-Way Segmented Glass Control */}
              <SegmentedGlassControl
                currentMode={shushPreferences.alertDeliveryMode}
                onSelectMode={handleSelectDeliveryMode}
                hapticsEnabled={hapticsEnabled}
              />

              <View style={styles.divider} />

              {/* ── Intent × Capability Delivery Truth Table (7 Rows) ── */}

              {/* Row 1: Standard + Notifications Granted → Zero warning, positive confirmation */}
              {shushPreferences.alertDeliveryMode === 'loud' && osNotificationsGranted && (
                <View style={styles.surfaceInfoRow} testID="truth-table-row-1">
                  <Bell size={15} color="#0A84FF" weight="fill" />
                  <Text style={styles.surfaceInfoText}>
                    Alerts appear as banners with sound during disruptions.
                  </Text>
                </View>
              )}

              {/* Row 2: Standard + Notifications Undetermined → Prominent Card with [Enable] */}
              {shushPreferences.alertDeliveryMode === 'loud' && !osNotificationsGranted && (osNotifStatus === Notifications.PermissionStatus.UNDETERMINED || (osNotifCanAskAgain && osNotifStatus !== Notifications.PermissionStatus.DENIED)) && (
                <View style={styles.prominentWarningCard} testID="truth-table-row-2">
                  <View style={styles.prominentCardHeader}>
                    <IconBadge
                      icon={<Bell size={18} color="#0A84FF" weight="fill" />}
                      backgroundColor="rgba(10, 132, 255, 0.18)"
                      borderColor="rgba(10, 132, 255, 0.35)"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prominentCardTitle}>Enable Line Disruption Banners</Text>
                      <Text style={styles.prominentCardDesc}>
                        Enable push notifications to receive line disruption banners on your lock screen.
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    style={styles.prominentEnableBtn}
                    onPress={handleRequestNotificationPermission}
                    accessibilityRole="button"
                    accessibilityLabel="Enable push notifications"
                  >
                    <Text style={styles.prominentEnableBtnText}>Enable</Text>
                  </Pressable>
                </View>
              )}

              {/* Row 3: Standard + Notifications Denied → Quiet Slate Line with [Settings] */}
              {shushPreferences.alertDeliveryMode === 'loud' && !osNotificationsGranted && (osNotifStatus === Notifications.PermissionStatus.DENIED || !osNotifCanAskAgain) && (
                <View style={styles.quietSlateRow} testID="truth-table-row-3">
                  <WarningCircle size={15} color="#8E8E93" weight="regular" />
                  <Text style={styles.quietSlateText}>
                    Notifications disabled in iOS Settings. Lock screen banners cannot be delivered.
                  </Text>
                  <Pressable
                    style={styles.inlineSettingsBtn}
                    onPress={() => Linking.openSettings().catch(() => {})}
                    accessibilityRole="button"
                    accessibilityLabel="Open iOS Settings"
                  >
                    <Text style={styles.inlineSettingsBtnText}>Settings</Text>
                  </Pressable>
                </View>
              )}

              {/* Row 4: Ambient + Live Activities Supported & Enabled → Zero warning */}
              {shushPreferences.alertDeliveryMode === 'shush' && liveActivityAuth.supported && liveActivityAuth.enabled && (
                <View style={styles.surfaceInfoRow} testID="truth-table-row-4">
                  <Sparkle size={15} color="#5E5CE6" weight="fill" />
                  <Text style={styles.surfaceInfoText}>
                    Silent updates visible on Dynamic Island & Lock Screen.
                  </Text>
                </View>
              )}

              {/* Row 5: Ambient + Live Activities Supported & Disabled → Quiet Slate Line with [Settings] */}
              {shushPreferences.alertDeliveryMode === 'shush' && liveActivityAuth.supported && !liveActivityAuth.enabled && (
                <View style={styles.quietSlateRow} testID="truth-table-row-5">
                  <WarningCircle size={15} color="#8E8E93" weight="regular" />
                  <Text style={styles.quietSlateText}>
                    Live Activities disabled in iOS Settings. Lock screen widget cannot update.
                  </Text>
                  <Pressable
                    style={styles.inlineSettingsBtn}
                    onPress={() => Linking.openSettings().catch(() => {})}
                    accessibilityRole="button"
                    accessibilityLabel="Open iOS Settings"
                  >
                    <Text style={styles.inlineSettingsBtnText}>Settings</Text>
                  </Pressable>
                </View>
              )}

              {/* Row 6: Muted → Zero warning banner */}
              {shushPreferences.alertDeliveryMode === 'off' && (
                <View style={styles.surfaceInfoRow} testID="truth-table-row-6">
                  <BellSlash size={15} color="#8E8E93" weight="fill" />
                  <Text style={styles.surfaceInfoText}>
                    No alerts. Check status manually in-app.
                  </Text>
                </View>
              )}

              {/* Row 7: Ambient + Live Activities Unsupported → Quiet Slate Line (No action button) */}
              {shushPreferences.alertDeliveryMode === 'shush' && !liveActivityAuth.supported && (
                <View style={styles.quietSlateRow} testID="truth-table-row-7">
                  <WarningCircle size={15} color="#8E8E93" weight="regular" />
                  <Text style={styles.quietSlateText}>
                    Live Activities require iOS 16.1 or later. Ambient mode is unavailable on this device.
                  </Text>
                </View>
              )}

              {/* Time-Sensitive Permission Soft Nag (Tri-state: only renders if capability exists in binary and is user-disabled) */}
              {shushPreferences.alertDeliveryMode === 'shush' && shushPreferences.timeSensitiveStatus === 'disabled' && (
                <View style={styles.shushWarningBox}>
                  <Warning size={18} color="#FF9F0A" weight="fill" />
                  <View style={{ flex: 1, marginHorizontal: 8 }}>
                    <Text style={styles.shushWarningTitle}>Urgent Closure Alerts</Text>
                    <Text style={styles.shushWarningSub}>
                      Allow urgent closure alerts so you&apos;re notified when a Tube line is suspended.
                    </Text>
                  </View>
                  <Pressable
                    style={styles.shushEnableBtn}
                    onPress={async () => {
                      await LiveActivityService.requestTimeSensitivePermission();
                      const refreshed = await LiveActivityService.getTimeSensitiveStatus();
                      setTimeSensitiveStatus(refreshed);
                      if (refreshed === 'disabled') {
                        Linking.openSettings().catch(() => {});
                      }
                    }}
                  >
                    <Text style={styles.shushEnableBtnText}>Allow</Text>
                  </Pressable>
                </View>
              )}
            </LiquidGlassView>
          </View>

          {/* ── HUB 1: ALERTS (Protect My Time) ───────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ALERTS</Text>

            {shushPreferences.alertDeliveryMode === 'off' ? (
              <LiquidGlassView
                borderRadius={16}
                style={styles.cardOuter}
                contentStyle={styles.cardInner}
              >
                <View style={styles.collapsedOffRow}>
                  <IconBadge
                    icon={<BellSlash size={18} color="#8E8E93" weight="fill" />}
                    backgroundColor="rgba(142, 142, 147, 0.18)"
                    borderColor="rgba(142, 142, 147, 0.35)"
                  />
                  <View style={styles.rowInfo}>
                    <Text style={styles.collapsedOffTitle}>All notifications paused</Text>
                    <Text style={styles.collapsedOffSubtitle}>
                      Tap Standard or Ambient above to configure alerts
                    </Text>
                  </View>
                </View>
              </LiquidGlassView>
            ) : (
              <LiquidGlassView
                borderRadius={16}
                style={styles.cardOuter}
                contentStyle={styles.cardInner}
              >
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

                {/* Severe Suspension Bypass */}
                <View style={styles.row}>
                  <View style={styles.rowInfo}>
                    <View style={styles.labelRow}>
                      <IconBadge
                        icon={<WarningCircle size={18} color="#FF453A" weight="bold" />}
                        backgroundColor="rgba(255, 69, 58, 0.18)"
                        borderColor="rgba(255, 69, 58, 0.35)"
                      />
                      <Text style={styles.rowLabel}>Severe Suspension Bypass</Text>
                    </View>
                    <Text style={styles.rowSubtitle}>
                      Always notify immediately for suspensions, even outside alert hours
                    </Text>
                  </View>
                  <Switch
                    value={severeBypassAlertHours}
                    onValueChange={(val) => {
                      if (hapticsEnabled) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      }
                      setSevereBypassAlertHours(val);
                    }}
                    trackColor={{ false: '#3A3A3C', true: '#FF453A' }}
                    thumbColor="#FFFFFF"
                  />
                </View>

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
                      {calendarGranted
                        ? 'Leave-by alerts active for upcoming 24h events'
                        : 'Reads event start times to alert you before you travel'}
                    </Text>
                  </View>
                  <Switch
                    value={calendarGranted}
                    onValueChange={async (v) => {
                      if (hapticsEnabled) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      }
                      if (v) {
                        const res = await requestPermission('calendar', 'settings_toggle');
                        if (res === 'granted') {
                          setCalendarGranted(true);
                          void scheduleCalendarCommuteAlerts();
                        } else {
                          setCalendarGranted(false);
                          Alert.alert(
                            'Calendar Access Needed',
                            'To scan your schedule and calculate exact leave-by times for your commutes, allow Calendar access in iOS Settings.',
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
                            ]
                          );
                        }
                      } else {
                        setCalendarGranted(false);
                        void cancelCalendarCommuteAlerts();
                      }
                    }}
                    trackColor={{ false: '#3A3A3C', true: '#007AFF' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </LiquidGlassView>
            )}
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
                      icon={<MapTrifold size={18} color="#0A84FF" weight="fill" />}
                      backgroundColor="rgba(10, 132, 255, 0.18)"
                      borderColor="rgba(10, 132, 255, 0.35)"
                    />
                    <Text style={styles.rowLabel}>Home & Work Stations</Text>
                  </View>
                  <Text
                    style={[
                      styles.rowSubtitle,
                      !hasHomeOrWork && { color: 'rgba(255, 255, 255, 0.50)', fontFamily: 'SpaceGrotesk_400Regular' },
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
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
    borderTopColor: PREMIUM_BUTTON.borderTopColor,
    borderBottomColor: PREMIUM_BUTTON.borderBottomColor,
    backgroundColor: PREMIUM_BUTTON.background,
    shadowColor: PREMIUM_BUTTON.shadowColor,
    shadowOffset: PREMIUM_BUTTON.shadowOffset,
    shadowOpacity: PREMIUM_BUTTON.shadowOpacity,
    shadowRadius: PREMIUM_BUTTON.shadowRadius,
    elevation: PREMIUM_BUTTON.elevation,
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
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
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
  collapsedOffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  collapsedOffTitle: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  collapsedOffSubtitle: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.50)',
    marginTop: 2,
    lineHeight: 16,
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
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  shushModeCardActiveLoud: {
    backgroundColor: 'rgba(10, 132, 255, 0.14)',
    borderColor: '#0A84FF',
  },
  shushModeCardActiveShush: {
    backgroundColor: 'rgba(94, 92, 230, 0.16)',
    borderColor: '#5E5CE6',
  },
  shushModeCardActiveOff: {
    backgroundColor: 'rgba(142, 142, 147, 0.14)',
    borderColor: 'rgba(142, 142, 147, 0.40)',
  },
  shushModeTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12.5,
    color: '#FFFFFF',
    marginTop: 6,
    textAlign: 'center',
  },
  shushModeDesc: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.60)',
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 13,
  },
  surfaceInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  surfaceInfoText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    flex: 1,
    lineHeight: 16,
  },
  deliveryTruthWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  inlineFixBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 69, 58, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255, 69, 58, 0.40)',
  },
  inlineFixBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    color: '#FF453A',
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
  prominentWarningCard: {
    backgroundColor: 'rgba(10, 132, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(10, 132, 255, 0.28)',
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    gap: 10,
  },
  prominentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prominentCardTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  prominentCardDesc: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
    lineHeight: 16,
  },
  prominentEnableBtn: {
    backgroundColor: '#0A84FF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  prominentEnableBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: '#FFFFFF',
  },
  quietSlateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(142, 142, 147, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(142, 142, 147, 0.20)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginVertical: 10,
    gap: 8,
  },
  quietSlateText: {
    flex: 1,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.80)',
    lineHeight: 16,
  },
  inlineSettingsBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
  },
  inlineSettingsBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
});