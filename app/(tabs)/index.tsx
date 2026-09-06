// app/(tabs)/index.tsx
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import CommuteDashboard from '../../components/MyCommuteDashboard';

export default function DashboardIndex() {
  return (
    <>
      <StatusBar style="light" />
      <CommuteDashboard />
    </>
  );
}
