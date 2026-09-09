// app/lines.tsx
// Deep link target for widget tap: mycommute://lines
// Opens directly to the Manage Lines modal over the dashboard.
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import CommuteDashboard from '../components/MyCommuteDashboard';
import { ManageLinesModal } from '../components/ManageLinesModal';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { getOnboardingRedirectPath } from '../utils/onboardingRouting';

export default function LinesRoute() {
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(true);

  const hasCompletedOnboarding = useUserPreferencesStore(
    (state) => state.hasCompletedOnboarding
  );
  const onboardingStep = useUserPreferencesStore(
    (state) => state.onboardingStep
  );

  // If onboarding hasn't completed, route back to the appropriate onboarding step
  if (!hasCompletedOnboarding) {
    router.replace(getOnboardingRedirectPath(onboardingStep) as any);
    return null;
  }

  const handleClose = () => {
    setModalVisible(false);
    router.replace('/(tabs)');
  };

  return (
    <View style={s.container}>
      <StatusBar style="light" />
      <CommuteDashboard />
      <ManageLinesModal
        visible={modalVisible}
        onClose={handleClose}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
});
