import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { registerBackgroundFetchAsync } from '../services/backgroundTask';

export default function TabLayout() {
  useEffect(() => {
    const initBackground = async () => {
      try {
        await registerBackgroundFetchAsync();
      } catch (err) {
        console.error("Register Failed:", err);
      }
    };
    initBackground();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E5E5E7',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
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
