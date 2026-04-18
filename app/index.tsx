import React from 'react';
import { View, StyleSheet } from 'react-native';
import MyCommuteDashboard from '../components/MyCommuteDashboard';
import { FractalGlassTabBar, MY_COMMUTE_TABS } from '../components/FractalGlassTabBar';

export default function Home() {
  return (
    <View style={styles.container}>
      {/* The Main UI */}
      <MyCommuteDashboard />
      
      {/* The Bottom Glass Navigation */}
      <FractalGlassTabBar 
        tabs={MY_COMMUTE_TABS} 
        activeKey="dashboard" 
        onPress={(key) => {
          // This will handle switching tabs later
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