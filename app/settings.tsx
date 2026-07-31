import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  CaretLeft, Bell, Info, WarningCircle, Warning, Clock, CaretRight,
  DeviceMobile, Fingerprint, House, MapTrifold, MapPin, Train, Shield,
  FileText, ArrowsClockwise 
} from 'phosphor-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ProStatusCard } from '../components/ProStatusCard';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { requestPermission, usePermissionOrchestrator } from '../store/permissionOrchestrator';
import * as Notifications from 'expo-notifications';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, cancelAnimation } from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { playSound } from '../utils/sound';
import { BlurView } from 'expo-blur';
import { GLASS, PREMIUM_BUTTON } from '../theme/colors';
import { FixItSheet } from '../components/FixItSheet';

interface UserPreferences {
  saved_lines: string[];
  saved_stations: string[];
  is_pro: boolean;
  trial_start_date?: string;
  trial_activated?: boolean;
  trial_expired_modal_shown?: boolean;
  frozen_lines?: string[];
  frozen_stations?: string[];
}

interface NotificationSettings {
  enabled: boolean;
  alert_on_minor: boolean;
  alert_on_severe: boolean;
  time_window_start: string; // HH:MM format
  time_window_end: string;   // HH:MM format
}
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const alwaysEntry = usePermissionOrchestrator((s) => s.permissions.locationAlways);
  const nudgeDismissedAt = usePermissionOrchestrator((s) => s.settingsNudgeDismissedAt);
  const dismissSettingsNudge = usePermissionOrchestrator((s) => s.dismissSettingsNudge);
  // #13 silent degrade: Always declined ≥2 times → persistent non-dialog nudge.
  const showAlwaysNudge =
    alwaysEntry.decision === 'denied' &&
    alwaysEntry.askCount >= 2 &&
    !nudgeDismissedAt;
  const [showFixItSheet, setShowFixItSheet] = useState(false);
  const {
    resetOnboarding,
    hapticsEnabled,
    setHapticsEnabled,
    locationGranted,
    arrivalNotificationsEnabled,
    setArrivalNotificationsEnabled,
    labelsConfirmed,
    completedJourneys,
  } = useUserPreferencesStore();

  const [isGranted, setIsGranted] = useState(false);
  const [showBack, setShowBack] = useState(false);
  const flipRotation = useSharedValue(0);
  const flipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctaPressAnim = usePressAnimation('continue_btn', false);
  const backAnim = usePressAnimation('back_btn', false);
  const resetPressAnim = usePressAnimation('station_row', false);
  const hoursPressAnim = usePressAnimation('station_row', false);

  const MAX_TRIAL_COMMUTES = 10;
  const trialCommutesRemaining = Math.max(0, MAX_TRIAL_COMMUTES - (completedJourneys || 0));

  useEffect(() => {
    checkPermissionsStatus();
    return () => {
      if (flipTimeoutRef.current) {
        clearTimeout(flipTimeoutRef.current);
      }
      cancelAnimation(flipRotation);
    };
  }, [flipRotation]);

  const checkPermissionsStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setIsGranted(status === 'granted');
  };

  const handleGrantNotifications = async () => {
    try {
      const decision = await requestPermission('notifications', 'settings_toggle');
      
      if (decision === 'granted') {
        if (hapticsEnabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        playSound('select', 0.45);
        setShowBack(true);
        flipRotation.value = withTiming(180, { duration: 600 });
        
        flipTimeoutRef.current = setTimeout(() => {
          flipRotation.value = withTiming(0, { duration: 600 }, (finished) => {
            if (finished) {
              runOnJS(resolveToEnabled)();
            }
          });
        }, 3000);
      } else {
        Alert.alert(
          'Permission Denied',
          'Please enable notification permissions in iOS Settings to receive alerts.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Go to Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    } catch (error) {
      console.error('Permission request failed:', error);
    }
  };

  const resolveToEnabled = () => {
    setIsGranted(true);
    setShowBack(false);
  };

  const handleToggleOff = () => {
    Alert.alert(
      'Disable Alerts',
      'To disable live disruption alerts, please turn off notifications in iOS Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Go to Settings', onPress: () => Linking.openSettings() }
      ]
    );
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateY: `${flipRotation.value}deg` }
      ],
      backfaceVisibility: 'hidden',
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotateY: `${flipRotation.value + 180}deg` }
      ],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    };
  });

  const [userPrefs, setUserPrefs] = useState<UserPreferences>({
    saved_lines: [],
    saved_stations: [],
    is_pro: false,
    trial_activated: false,
    frozen_lines: [],
    frozen_stations: [],
  });
  
  // Notification Settings State
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    enabled: true,
    alert_on_minor: true,
    alert_on_severe: true,
    time_window_start: '06:00',
    time_window_end: '22:00',
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  useEffect(() => {
    loadUserPreferences();
    loadNotificationSettings();
  }, []);

  const loadUserPreferences = async () => {
    try {
      const savedPrefs = await AsyncStorage.getItem('user_preferences');
      if (savedPrefs) {
        setUserPrefs(JSON.parse(savedPrefs));
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const loadNotificationSettings = async () => {
    try {
      setIsLoadingSettings(true);
      const savedSettings = await AsyncStorage.getItem('notification_settings');
      if (savedSettings) {
        setNotificationSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error('Error loading notification settings:', error);
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const saveNotificationSettings = async (newSettings: NotificationSettings) => {
    try {
      setNotificationSettings(newSettings);
      await AsyncStorage.setItem('notification_settings', JSON.stringify(newSettings));
    } catch (error) {
      console.error('Error saving notification settings:', error);
      Alert.alert('Error', 'Failed to save notification settings. Please try again.');
    }
  };

  const handleToggleNotifications = (value: boolean) => {
    saveNotificationSettings({ ...notificationSettings, enabled: value });
  };

  const handleToggleMinorAlerts = (value: boolean) => {
    saveNotificationSettings({ ...notificationSettings, alert_on_minor: value });
  };

  const handleToggleSevereAlerts = (value: boolean) => {
    saveNotificationSettings({ ...notificationSettings, alert_on_severe: value });
  };

  const showQuietHoursInfo = () => {
    Alert.alert(
      'Quiet Hours',
      'Set the hours when you want to receive notifications. Outside these hours, all notifications will be silenced.',
      [{ text: 'Got it' }]
    );
  };

  const handleEditQuietHours = () => {
    Alert.alert(
      'Quiet Hours',
      'Notification hours are currently set to:\n\n' +
      `Start: ${notificationSettings.time_window_start}\n` +
      `End: ${notificationSettings.time_window_end}\n\n` +
      '(Time picker UI coming in next update)',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        
        {/* Frosted Push Notification Setup / Enabled Card */}
        <View style={styles.cardContainer}>
          {!isGranted ? (
            <View style={{ height: 190 }}>
              {/* Front Side Card */}
              <Animated.View style={[styles.frontCard, frontAnimatedStyle]}>
                <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
                <View style={styles.cardHeaderRow}>
                  <Bell size={24} color="#30D158" />
                  <Text style={styles.cardHeaderTitle}>{"The Central line doesn't text you when it's cooked. We do."}</Text>
                </View>
                <Text style={styles.cardBodyText}>
                  Get live disruption alerts and leave-by reminders, straight to your lock screen.
                </Text>
                <Animated.View style={ctaPressAnim.animatedStyle}>
                  <Pressable
                    style={styles.ctaButton}
                    onPress={handleGrantNotifications}
                    onPressIn={ctaPressAnim.onPressIn}
                    onPressOut={ctaPressAnim.onPressOut}
                    accessibilityRole="button"
                    accessibilityLabel="Enable notifications"
                  >
                    <Text style={styles.ctaButtonText}>Hit me with it</Text>
                  </Pressable>
                </Animated.View>
              </Animated.View>
              
              {/* Back Side (Tutorial Video) */}
              <Animated.View style={[styles.backCard, backAnimatedStyle]} pointerEvents={showBack ? 'auto' : 'none'}>
                <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
                <View style={styles.tutorialContainer}>
                  <Image
                    source={require('../assets/widget_tutorial.gif')}
                    style={styles.tutorialGif}
                    contentFit="contain"
                  />
                  <Text style={styles.tutorialText}>Drag the widget to your Home Screen</Text>
                </View>
              </Animated.View>
            </View>
          ) : (
            <View style={styles.enabledCard}>
                <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
                <View style={styles.enabledRow}>
                  <View style={styles.enabledInfo}>
                    <Text style={styles.enabledTitle}>Live Disruption Alerts</Text>
                    <Text style={styles.enabledDescription}>Enabled & Monitoring</Text>
                  </View>
                <Switch
                  value={true}
                  onValueChange={handleToggleOff}
                  trackColor={{ false: '#D1D5DB', true: '#28A745' }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          )}
        </View>

        {/* Smart Pro Status Card */}
        <ProStatusCard 
          isPro={userPrefs.is_pro}
          trialCommutesRemaining={trialCommutesRemaining}
          onUpgrade={() => Alert.alert('Coming Soon', 'Pro features and upgrades will be available in a future update.')}
        />

        {/* Notifications Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Notification Preferences</Text>
            <Pressable onPress={showQuietHoursInfo}>
              <Info size={20} color="rgba(255,255,255,0.45)" />
            </Pressable>
          </View>
          
          {isLoadingSettings ? (
            <View style={styles.settingCard}>
              <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
              <Text style={styles.loadingText}>Loading settings…</Text>
            </View>
          ) : (
            <View style={styles.settingCard}>
              <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <View style={styles.settingLabelRow}>
                    <Bell size={20} color="#30D158" style={styles.iconMargin} />
                    <Text style={styles.settingLabel}>Enable Notifications</Text>
                  </View>
                  <Text style={styles.settingDescription}>
                    Get real-time alerts for service disruptions
                  </Text>
                </View>
                <Switch
                  value={notificationSettings.enabled}
                  onValueChange={handleToggleNotifications}
                  trackColor={{ false: '#D1D5DB', true: '#007AFF' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {notificationSettings.enabled && (
                <>
                  <View style={styles.divider} />

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <WarningCircle size={18} color="#DC3545" style={styles.iconMargin} />
                        <Text style={styles.settingLabel}>Severe Delays</Text>
                      </View>
                      <Text style={styles.settingDescription}>
                        Major disruptions and suspensions
                      </Text>
                    </View>
                    <Switch
                      value={notificationSettings.alert_on_severe}
                      onValueChange={handleToggleSevereAlerts}
                      trackColor={{ false: '#D1D5DB', true: '#DC3545' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <Warning size={18} color="#FFA500" style={styles.iconMargin} />
                        <Text style={styles.settingLabel}>Minor Delays</Text>
                      </View>
                      <Text style={styles.settingDescription}>
                        Moderate disruptions and reduced service
                      </Text>
                    </View>
                    <Switch
                      value={notificationSettings.alert_on_minor}
                      onValueChange={handleToggleMinorAlerts}
                      trackColor={{ false: '#D1D5DB', true: '#FFA500' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>

                  <View style={styles.divider} />

                  <Animated.View style={hoursPressAnim.animatedStyle}>
                    <Pressable 
                      style={styles.settingRow} 
                      onPress={handleEditQuietHours}
                      onPressIn={hoursPressAnim.onPressIn}
                      onPressOut={hoursPressAnim.onPressOut}
                    >
                      <View style={styles.settingInfo}>
                        <View style={styles.settingLabelRow}>
                          <Clock size={18} color="rgba(255,255,255,0.45)" style={styles.iconMargin} />
                          <Text style={styles.settingLabel}>Notification Hours</Text>
                        </View>
                        <Text style={styles.settingDescription}>
                          {notificationSettings.time_window_start} - {notificationSettings.time_window_end}
                        </Text>
                      </View>
                      <CaretRight size={20} color="rgba(255,255,255,0.30)" />
                    </Pressable>
                  </Animated.View>

                  <View style={styles.divider} />

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <DeviceMobile size={18} color="rgba(255,255,255,0.45)" style={styles.iconMargin} />
                        <Text style={styles.settingLabel}>Device Notifications</Text>
                      </View>
                      <Text style={[styles.settingDescription, { color: '#FFA500' }]}>
                        ⏳ Coming soon - iOS push notifications
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <Fingerprint size={18} color="rgba(255,255,255,0.45)" style={styles.iconMargin} />
                        <Text style={styles.settingLabel}>Haptic Feedback</Text>
                      </View>
                      <Text style={styles.settingDescription}>
                        Vibrate on interaction and alerts
                      </Text>
                    </View>
                    <Switch
                      value={hapticsEnabled}
                      onValueChange={setHapticsEnabled}
                      trackColor={{ false: '#D1D5DB', true: '#007AFF' }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </>
              )}
            </View>
          )}

          {/* Arrival Notifications */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>ARRIVAL</Text>
            <View style={styles.sectionContent}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <View style={styles.settingLabelRow}>
                    <House size={18} color="rgba(255,255,255,0.45)" style={styles.iconMargin} />
                    <Text style={styles.settingLabel}>Welcome Home</Text>
                  </View>
                  <Text style={styles.settingDescription}>
                    Get a notification when you arrive home
                  </Text>
                </View>
                <Switch
                  value={arrivalNotificationsEnabled}
                  onValueChange={setArrivalNotificationsEnabled}
                  trackColor={{ false: '#D1D5DB', true: '#007AFF' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              <View style={styles.divider} />

              <Animated.View style={hoursPressAnim.animatedStyle}>
                <Pressable 
                  style={styles.settingRow} 
                  onPress={() => setShowFixItSheet(true)}
                >
                  <View style={styles.settingInfo}>
                    <View style={styles.settingLabelRow}>
                      <MapTrifold size={18} color="rgba(255,255,255,0.45)" style={styles.iconMargin} />
                      <Text style={styles.settingLabel}>Home & Work</Text>
                    </View>
                    <Text style={styles.settingDescription}>
                      {labelsConfirmed ? 'Angel is home' : 'Set your home and work stations'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.30)" />
                </Pressable>
              </Animated.View>
            </View>
          </View>

          <FixItSheet visible={showFixItSheet} onClose={() => setShowFixItSheet(false)} />

          <View style={styles.infoCard}>
            <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Info size={24} color="rgba(255,255,255,0.45)" />
            <Text style={styles.infoText}>
              Notifications will only alert you about lines and stations you&apos;ve saved to your dashboard.
            </Text>
          </View>
        </View>

        {/* Location & Geofencing Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location & Geofencing</Text>
          {showAlwaysNudge && (
            <View style={styles.nudgeBanner}>
              <View style={styles.nudgeTextWrap}>
                <Text style={styles.nudgeTitle}>Refund Radar works in the background</Text>
                <Text style={styles.nudgeBody}>
                  We track your journey while you use the app. Enable “Always” in iOS Settings to
                  catch delays automatically, even when the app is closed.
                </Text>
              </View>
              <Pressable onPress={dismissSettingsNudge} style={styles.nudgeDismiss} hitSlop={10}>
                <Text style={styles.nudgeDismissText}>✕</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.settingCard}>
            <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <View style={styles.settingLabelRow}>
                  <MapPin size={20} color="#007AFF" style={styles.iconMargin} />
                  <Text style={styles.settingLabel}>Station Geofencing</Text>
                </View>
                <Text style={styles.settingDescription}>
                  Trigger live commute tracking when approaching pinned stations
                </Text>
              </View>
              <Switch
                value={locationGranted}
                onValueChange={async (value) => {
                  if (value) {
                    const decision = await requestPermission('locationAlways', 'settings_toggle');
                    if (decision !== 'granted') {
                      Alert.alert(
                        'Location Permission Required',
                        'Please enable Always-On Location permissions in iOS Settings to use geofencing.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Go to Settings', onPress: () => Linking.openSettings() }
                        ]
                      );
                    }
                  } else {
                    Alert.alert(
                      'Disable Geofencing',
                      'To fully disable location access, please turn off location permissions in iOS Settings.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Go to Settings', onPress: () => Linking.openSettings() }
                      ]
                    );
                  }
                }}
                trackColor={{ false: '#D1D5DB', true: '#007AFF' }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          
          <View style={styles.aboutCard}>
            <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={styles.aboutRow}>
              <Info size={24} color="rgba(255,255,255,0.45)" />
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>App Version</Text>
                <Text style={styles.aboutValue}>1.0.3</Text>
              </View>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.aboutRow}>
              <Train size={24} color="rgba(255,255,255,0.45)" />
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>Transport Data</Text>
                <Text style={styles.aboutValue}>Powered by TfL</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Legal Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>

          <View style={styles.aboutCard}>
            <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Animated.View style={resetPressAnim.animatedStyle}>
              <Pressable
                style={styles.aboutRow}
                onPress={() => { (router as any).push('/privacy'); }}
                onPressIn={resetPressAnim.onPressIn}
                onPressOut={resetPressAnim.onPressOut}
              >
                <Shield size={24} color="rgba(255,255,255,0.45)" />
                <View style={styles.aboutInfo}>
                  <Text style={styles.aboutLabel}>Privacy Policy</Text>
                  <Text style={styles.settingDescription}>How we handle your data</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.30)" />
              </Pressable>
            </Animated.View>

            <View style={styles.divider} />

            <Animated.View style={resetPressAnim.animatedStyle}>
              <Pressable
                style={styles.aboutRow}
                onPress={() => { (router as any).push('/terms'); }}
                onPressIn={resetPressAnim.onPressIn}
                onPressOut={resetPressAnim.onPressOut}
              >
                <FileText size={24} color="rgba(255,255,255,0.45)" />
                <View style={styles.aboutInfo}>
                  <Text style={styles.aboutLabel}>Terms of Service</Text>
                  <Text style={styles.settingDescription}>App usage terms</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.30)" />
              </Pressable>
            </Animated.View>
          </View>
        </View>

        {/* Debug Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Options</Text>
          <View style={styles.aboutCard}>
            <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
            <Animated.View style={resetPressAnim.animatedStyle}>
              <Pressable
                style={styles.aboutRow}
                onPress={() => {
                  Alert.alert(
                    'Reset Onboarding',
                    'Are you sure you want to reset onboarding? This will clear your saved lines and stations.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Reset',
                        style: 'destructive',
                        onPress: () => {
                          resetOnboarding();
                          router.back();
                        }
                      }
                    ]
                  );
                }}
                onPressIn={resetPressAnim.onPressIn}
                onPressOut={resetPressAnim.onPressOut}
              >
                <ArrowsClockwise size={24} color="#DC3545" />
                <View style={styles.aboutInfo}>
                  <Text style={[styles.aboutLabel, { color: '#DC3545', fontWeight: '600' }]}>Reset Onboarding</Text>
                  <Text style={styles.settingDescription}>Start the setup flow from the beginning</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.30)" />
              </Pressable>
            </Animated.View>
          </View>
        </View>

        <View style={styles.spacer40} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  nudgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 179, 0, 0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 179, 0, 0.35)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 10,
  },
  nudgeTextWrap: {
    flex: 1,
    gap: 3,
  },
  nudgeTitle: {
    color: '#FFD60A',
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
  },
  nudgeBody: {
    color: 'rgba(255, 255, 255, 0.70)',
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  nudgeDismiss: {
    padding: 4,
  },
  nudgeDismissText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionContainer: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionContent: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingCard: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  settingDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    paddingVertical: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: GLASS.background,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderSide,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginLeft: 12,
    lineHeight: 20,
  },
  statusCard: {
    backgroundColor: GLASS.background,
    borderRadius: 12,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statusDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  planBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  proBadge: {
    backgroundColor: '#007AFF',
  },
  basicBadge: {
    backgroundColor: '#F0F0F0',
  },
  planBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  proText: {
    color: '#FFFFFF',
  },
  basicText: {
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  aboutCard: {
    backgroundColor: GLASS.background,
    borderRadius: 12,
    padding: 16,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  aboutInfo: {
    marginLeft: 16,
    flex: 1,
  },
  aboutLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 4,
  },
  aboutValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  iconMargin: { marginRight: 8 },
  spacer40: { height: 40 },
  cardContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  frontCard: {
    backgroundColor: GLASS.background,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderSide,
    overflow: 'hidden',
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 3,
    height: 190,
    justifyContent: 'space-between',
  },
  backCard: {
    backgroundColor: GLASS.background,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderSide,
    overflow: 'hidden',
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 3,
    height: 190,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 8,
    flex: 1,
  },
  cardBodyText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 18,
    marginBottom: 12,
  },
  ctaButton: {
    backgroundColor: PREMIUM_BUTTON.background,
    borderRadius: 20,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: PREMIUM_BUTTON.borderWidth,
    borderColor: PREMIUM_BUTTON.borderColor,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  tutorialContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorialGif: {
    width: '100%',
    height: 120,
    borderRadius: 8,
  },
  tutorialText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 8,
    textAlign: 'center',
  },
  enabledCard: {
    backgroundColor: GLASS.background,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderSide,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 2,
  },
  enabledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  enabledInfo: {
    flex: 1,
  },
  enabledTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  enabledDescription: {
    fontSize: 14,
    color: '#30D158',
    fontWeight: '600',
    marginTop: 2,
  },
});