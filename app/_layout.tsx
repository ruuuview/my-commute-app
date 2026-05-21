// app/_layout.tsx

import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

// Prevent native splash from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function Layout() {
  const _hasHydrated = useUserPreferencesStore((state) => state._hasHydrated);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // Both MMKV hydration AND font loading must complete before the
  // navigator mounts. Providers stay alive throughout.
  const isReady = _hasHydrated && fontsLoaded;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0F' }}>
      <SafeAreaProvider>
        {isReady ? <Stack screenOptions={{ headerShown: false }} /> : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
