import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { registerBackgroundFetchAsync } from '../services/backgroundTask';
import * as SplashScreen from 'expo-splash-screen';
import { 
  useFonts, 
  SpaceGrotesk_400Regular, 
  SpaceGrotesk_700Bold 
} from '@expo-google-fonts/space-grotesk';

// Keep the splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    const initBackground = async () => {
      try {
        // Background fetch only works in standalone/production builds
        if (!__DEV__) {
          await registerBackgroundFetchAsync();
        }
      } catch (err) {
        console.warn("Register Failed:", err); // warn not error
      }
    };
    initBackground();
  }, []);

  // Hide splash screen once fonts are ready
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          display: 'none',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="(lineStack)" options={{ href: null }} />
      <Tabs.Screen name="stationDetail" options={{ href: null }} />
      <Tabs.Screen name="AddManageModal" options={{ href: null }} />
      <Tabs.Screen name="apiTest" options={{ href: null }} />
      <Tabs.Screen name="journeyPlanner" options={{ href: null }} />
    </Tabs>
  );
}