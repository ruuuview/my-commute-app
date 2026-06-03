import { Stack } from 'expo-router';
import { Platform } from 'react-native';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0A0F' },
        animation: Platform.OS === 'ios' ? 'ios' : 'slide_from_right',
      }}
    />
  );
}
