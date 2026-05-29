import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ProStatusCard } from '../components/ProStatusCard';


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
const TRIAL_DURATION_DAYS = 45;
export default function SettingsScreen() {
  const { back } = useRouter();
  const insets = useSafeAreaInsets();
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

  const getTrialDaysRemaining = (startDate: string): number => {
    const start = new Date(startDate);
    const now = new Date();
    const diffTime = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, TRIAL_DURATION_DAYS - diffDays);
  };

  const trialDaysRemaining = userPrefs.trial_start_date 
    ? getTrialDaysRemaining(userPrefs.trial_start_date)
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable 
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]} 
          onPress={() => back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={28} color="#000" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
        
        {/* Smart Pro Status Card */}
        <ProStatusCard 
          isPro={userPrefs.is_pro}
          trialDaysRemaining={trialDaysRemaining}
          onUpgrade={() => Alert.alert('Coming Soon', 'Pro features and upgrades will be available in a future update.')}
        />

        {/* Notifications Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Notification Preferences</Text>
            <Pressable onPress={showQuietHoursInfo}>
              <Ionicons name="information-circle-outline" size={20} color="#666" />
            </Pressable>
          </View>
          
          {isLoadingSettings ? (
            <View style={styles.settingCard}>
              <Text style={styles.loadingText}>Loading settings…</Text>
            </View>
          ) : (
            <View style={styles.settingCard}>
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <View style={styles.settingLabelRow}>
                    <Ionicons name="notifications" size={20} color="#007AFF" style={styles.iconMargin} />
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
                        <Ionicons name="alert-circle" size={18} color="#DC3545" style={styles.iconMargin} />
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
                        <Ionicons name="warning" size={18} color="#FFA500" style={styles.iconMargin} />
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

                  <Pressable 
                    style={styles.settingRow} 
                    onPress={handleEditQuietHours}
                  >
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <Ionicons name="time" size={18} color="#666" style={styles.iconMargin} />
                        <Text style={styles.settingLabel}>Notification Hours</Text>
                      </View>
                      <Text style={styles.settingDescription}>
                        {notificationSettings.time_window_start} - {notificationSettings.time_window_end}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                  </Pressable>

                  <View style={styles.divider} />

                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <Ionicons name="phone-portrait" size={18} color="#666" style={styles.iconMargin} />
                        <Text style={styles.settingLabel}>Device Notifications</Text>
                      </View>
                      <Text style={[styles.settingDescription, { color: '#FFA500' }]}>
                        ⏳ Coming soon - iOS push notifications
                      </Text>
                    </View>
                  </View>
                </>
              )}
            </View>
          )}

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#007AFF" />
            <Text style={styles.infoText}>
              Notifications will only alert you about lines and stations you&apos;ve saved to your dashboard.
            </Text>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          
          <View style={styles.aboutCard}>
            <View style={styles.aboutRow}>
              <Ionicons name="information-circle-outline" size={24} color="#666" />
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>App Version</Text>
                <Text style={styles.aboutValue}>1.0.3</Text>
              </View>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.aboutRow}>
              <Ionicons name="subway-outline" size={24} color="#666" />
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>Transport Data</Text>
                <Text style={styles.aboutValue}>Powered by TfL</Text>
              </View>
            </View>
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
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
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
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
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
    color: '#333',
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingVertical: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#D0E6FF',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginLeft: 12,
    lineHeight: 20,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
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
    color: '#333',
    marginBottom: 4,
  },
  statusDescription: {
    fontSize: 14,
    color: '#666',
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
  trialLabel: {
    fontSize: 14,
    color: '#666',
  },
  trialDays: {
    fontSize: 14,
    fontWeight: '600',
    color: '#28a745',
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  aboutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
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
    color: '#666',
    marginBottom: 4,
  },
  aboutValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  iconMargin: { marginRight: 8 },
  spacer40: { height: 40 },
});