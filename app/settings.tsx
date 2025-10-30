import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { ProStatusCard } from '../components/ProStatusCard';
import Constants from 'expo-constants';

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
const BACKEND_URL = Constants.expoConfig?.extra?.BACKEND_URL || 'http://localhost:8001';

export default function SettingsScreen() {
  const router = useRouter();
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
      
      // TODO: Sync with backend API when device token is registered
      // await syncNotificationSettingsToBackend(newSettings);
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

  const handleUpgradeToPro = () => {
    Alert.alert(
      'Upgrade to Pro - £7.99',
      'Get lifetime access with a one-time payment. No subscriptions, ever.\n\n✅ Unlimited lines & stations\n✅ All features unlocked\n✅ No ads\n\n(Payment integration coming soon)',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade Now - £7.99',
          onPress: async () => {
            try {
              // TODO: Integrate Stripe payment here
              const upgradedPrefs = {
                ...userPrefs,
                is_pro: true,
              };
              setUserPrefs(upgradedPrefs);
              await AsyncStorage.setItem('user_preferences', JSON.stringify(upgradedPrefs));
              Alert.alert('Welcome to Pro! 🎉', 'All features unlocked. Enjoy unlimited access!');
            } catch (error) {
              console.error('Error upgrading to Pro:', error);
              Alert.alert('Error', 'Failed to upgrade. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch((err) => console.error('Error opening link:', err));
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@mycommute.app?subject=Support Request').catch((err) =>
      Alert.alert('Error', 'Could not open email client')
    );
  };

  const trialDaysRemaining = userPrefs.trial_start_date 
    ? getTrialDaysRemaining(userPrefs.trial_start_date)
    : 0;

  // Check if user is currently on an active trial
  const isTrialActive = userPrefs.trial_activated && 
                       userPrefs.trial_start_date && 
                       trialDaysRemaining > 0;

  // Determine effective plan status
  const effectivePlan = userPrefs.is_pro ? 'PRO' : (isTrialActive ? 'PRO (TRIAL)' : 'BASIC');
  const planDescription = userPrefs.is_pro 
    ? 'Unlimited lines & stations' 
    : (isTrialActive ? `${trialDaysRemaining} days remaining` : '3 items maximum');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        
        {/* Upgrade to Pro Button - Only show if not Pro AND trial not active */}
        {!userPrefs.is_pro && !isTrialActive && (
          <TouchableOpacity style={styles.upgradeCard} onPress={handleUpgradeToPro}>
            <View style={styles.upgradeIconContainer}>
              <Ionicons name="star" size={24} color="#FFFFFF" />
            </View>
            <View style={styles.upgradeTextContainer}>
              <Text style={styles.upgradeTitle}>Upgrade to Pro</Text>
              <Text style={styles.upgradeSubtitle}>One-time payment · Lifetime access</Text>
            </View>
            <Text style={styles.upgradePrice}>£7.99</Text>
          </TouchableOpacity>
        )}

        {/* ✅ PHASE 2: New Smart Pro Status Card - Shows only ONE relevant status */}
        <ProStatusCard 
          isPro={userPrefs.is_pro}
          trialDaysRemaining={userPrefs.trial_start_date ? getTrialDaysRemaining(userPrefs.trial_start_date) : 0}
          onUpgrade={handleUpgradeToPro}
        />

        {/* Notifications Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Notification Preferences</Text>
            <TouchableOpacity onPress={showQuietHoursInfo}>
              <Ionicons name="information-circle-outline" size={20} color="#666" />
            </TouchableOpacity>
          </View>
          
          {isLoadingSettings ? (
            <View style={styles.settingCard}>
              <Text style={styles.loadingText}>Loading settings...</Text>
            </View>
          ) : (
            <View style={styles.settingCard}>
              {/* Master Toggle */}
              <View style={styles.settingRow}>
                <View style={styles.settingInfo}>
                  <View style={styles.settingLabelRow}>
                    <Ionicons name="notifications" size={20} color="#007AFF" style={{ marginRight: 8 }} />
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

                  {/* Alert Type: Severe Delays */}
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <Ionicons name="alert-circle" size={18} color="#DC3545" style={{ marginRight: 8 }} />
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

                  {/* Alert Type: Minor Delays */}
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <Ionicons name="warning" size={18} color="#FFA500" style={{ marginRight: 8 }} />
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

                  {/* Quiet Hours */}
                  <TouchableOpacity 
                    style={styles.settingRow} 
                    onPress={handleEditQuietHours}
                    activeOpacity={0.7}
                  >
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <Ionicons name="time" size={18} color="#666" style={{ marginRight: 8 }} />
                        <Text style={styles.settingLabel}>Notification Hours</Text>
                      </View>
                      <Text style={styles.settingDescription}>
                        {notificationSettings.time_window_start} - {notificationSettings.time_window_end}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
                  </TouchableOpacity>

                  <View style={styles.divider} />

                  {/* Push Notification Status */}
                  <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                      <View style={styles.settingLabelRow}>
                        <Ionicons name="phone-portrait" size={18} color="#666" style={{ marginRight: 8 }} />
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

          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#007AFF" />
            <Text style={styles.infoText}>
              Notifications will only alert you about lines and stations you've saved to your dashboard.
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
                <Text style={styles.aboutValue}>1.0.0</Text>
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

        {/* DEVELOPER: Trial Testing Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧪 Trial Testing (Developer)</Text>
          
          <TouchableOpacity 
            style={styles.testButton}
            onPress={async () => {
              // Simulate first launch by removing user preferences
              await AsyncStorage.removeItem('user_preferences');
              Alert.alert('✅ Reset Complete', 'App data cleared. Close and reopen the app to see Welcome Modal.', [
                { text: 'OK' }
              ]);
            }}
          >
            <Text style={styles.testButtonText}>Test 1: First Launch (Welcome Modal)</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.testButton}
            onPress={async () => {
              const prefs = {
                saved_lines: ['central', 'victoria'],
                saved_stations: ['940GZZLUOXC'],
                is_pro: false,
                trial_activated: true,
                trial_start_date: new Date(Date.now() - (38 * 24 * 60 * 60 * 1000)).toISOString(),
                seven_day_warning_dismissed: false,
                welcome_modal_shown: true,
              };
              await AsyncStorage.setItem('user_preferences', JSON.stringify(prefs));
              Alert.alert('✅ Setup Complete', 'Close and reopen the app to see 7-Day Warning.', [
                { text: 'OK' }
              ]);
            }}
          >
            <Text style={styles.testButtonText}>Test 2: 7-Day Warning Banner</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.testButton}
            onPress={async () => {
              const prefs = {
                saved_lines: ['central'],
                saved_stations: ['940GZZLUOXC'],
                is_pro: false,
                trial_activated: true,
                trial_start_date: new Date().toISOString(),
                in_trial_prompt_shown: false,
                welcome_modal_shown: true,
              };
              await AsyncStorage.setItem('user_preferences', JSON.stringify(prefs));
              Alert.alert('✅ Setup Complete', 'Close and reopen the app to see In-Trial Prompt.', [
                { text: 'OK' }
              ]);
            }}
          >
            <Text style={styles.testButtonText}>Test 3: In-Trial Feature Prompt</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.testButton}
            onPress={async () => {
              const prefs = {
                saved_lines: ['central', 'victoria', 'elizabeth', 'northern'],
                saved_stations: ['940GZZLUOXC', '940GZZLUKSX'],
                is_pro: false,
                trial_activated: true,
                trial_start_date: new Date(Date.now() - (46 * 24 * 60 * 60 * 1000)).toISOString(),
                trial_expired_modal_shown: false,
                welcome_modal_shown: true,
              };
              await AsyncStorage.setItem('user_preferences', JSON.stringify(prefs));
              Alert.alert('✅ Setup Complete', 'Close and reopen the app to see Trial Expired Modal.', [
                { text: 'OK' }
              ]);
            }}
          >
            <Text style={styles.testButtonText}>Test 4: Trial Expired Modal</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.testButton, styles.resetButton]}
            onPress={async () => {
              const prefs = {
                saved_lines: ['central', 'victoria'],
                saved_stations: ['940GZZLUOXC', '940GZZLUKSX'],
                is_pro: true, // Back to Pro
                trial_activated: true,
                trial_start_date: new Date().toISOString(),
              };
              await AsyncStorage.setItem('user_preferences', JSON.stringify(prefs));
              Alert.alert('✅ Reset to Pro', 'You are now Pro again. Close and reopen the app.', [
                { text: 'OK' }
              ]);
            }}
          >
            <Text style={[styles.testButtonText, { color: '#fff' }]}>Reset to Pro Status</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  // Upgrade Card
  upgradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  upgradeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  upgradeTextContainer: {
    flex: 1,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  upgradeSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  upgradePrice: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Section
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
  // Setting Card
  settingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  // Info Card
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
  // Status Card
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  // About Card
  aboutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
  // Developer Test Buttons
  testButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  testButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
    textAlign: 'center',
  },
  resetButton: {
    backgroundColor: '#D32F2F',
    borderColor: '#D32F2F',
  },
});
