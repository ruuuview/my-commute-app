import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
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
      {/* Journey Planner - Hidden for MVP, will be enabled in V2 */}
      {/* <Tabs.Screen
        name="journeyPlanner"
        options={{
          title: 'Plan Journey',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="map" size={size} color={color} />
          ),
        }}
      /> */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="(lineStack)"
        options={{
          href: null, // Hide from tabs - this is a stack navigator for lineDetail
        }}
      />
      <Tabs.Screen
        name="stationDetail"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="AddManageModal"
        options={{
          href: null, // Hide from tabs
        }}
      />
      <Tabs.Screen
        name="apiTest"
        options={{
          href: null, // Hide from tabs - Debug screen only
        }}
      />
      <Tabs.Screen
        name="journeyPlanner"
        options={{
          href: null, // Hidden for MVP - Will be enabled in V2
        }}
      />
    </Tabs>
  );
}
