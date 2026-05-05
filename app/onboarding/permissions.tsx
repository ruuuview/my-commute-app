// app/onboarding/permissions.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import * as Haptics from 'expo-haptics';

const PermissionsScreen = () => {
  const completeOnboarding = useUserPreferencesStore((state) => state.completeOnboarding);
  const notificationsGranted = useUserPreferencesStore((state) => state.notificationsGranted);

  const handleEnableAlerts = async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      // Simulate permission request (replace with actual implementation)
      completeOnboarding();
    } catch (error) {
      console.error('Failed to enable alerts:', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Get alerts that matter to you.</Text>
      <TouchableOpacity 
        onPress={handleEnableAlerts}
        style={styles.enableAlertsButton}
      >
        <Text style={styles.enableAlertsButtonText}>Enable Alerts</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 30,
  },
  enableAlertsButton: {
    backgroundColor: '#388E3C',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enableAlertsButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default PermissionsScreen;
