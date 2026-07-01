// app/station-detail.tsx
// Expo Router file-based route for StationDetailScreen
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import StationDetailScreen from '../components/StationDetailScreen';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

export default function StationDetailRoute() {
  const router = useRouter();
  const { stationId, stationName } = useLocalSearchParams<{
    stationId: string;
    stationName: string;
  }>();
  const selectedLines = useUserPreferencesStore(s => s.selectedLines);

  const missingParams = !stationId || !stationName;

  useEffect(() => {
    if (missingParams) {
      router.back();
    }
  }, [missingParams, router]);

  if (missingParams) {
    return (
      <View style={s.errorContainer}>
        <Stack.Screen options={{ headerShown: false }} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, animation: 'slide_from_right' }} />
      <StationDetailScreen
        stationId={stationId}
        stationName={stationName}
        selectedLines={selectedLines}
      />
    </>
  );
}

const s = StyleSheet.create({
  errorContainer: { flex: 1, backgroundColor: '#0A0A0F' },
});
