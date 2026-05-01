import React from 'react';
import { View, StyleSheet } from 'react-native';
import MyCommuteDashboard from '../components/MyCommuteDashboard';
import { FractalGlassTabBar, MY_COMMUTE_TABS } from '../components/FractalGlassTabBar';
import { useRouter } from 'expo-router';

export default function Home() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* The Main UI — modal is now self-contained inside MyCommuteDashboard */}
      <MyCommuteDashboard />
      
      {/* The Bottom Glass Navigation */}
      <FractalGlassTabBar 
        tabs={MY_COMMUTE_TABS} 
        activeKey="dashboard" 
        onPress={(key) => {
          console.log("Tab pressed:", key);
        }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
});