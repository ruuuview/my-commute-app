// app/station-detail.tsx
// Expo Router file-based route for StationDetailScreen
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import StationDetailScreen from '../components/StationDetailScreen';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

export default function StationDetailRoute() {
  const { stationId, stationName } = useLocalSearchParams<{
    stationId: string;
    stationName: string;
  }>();
  const selectedLines = useUserPreferencesStore(s => s.selectedLines);

  if (!stationId || !stationName) {
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
