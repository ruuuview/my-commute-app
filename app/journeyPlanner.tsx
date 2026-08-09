import React from 'react';
import { Redirect } from 'expo-router';

export default function JourneyPlannerScreen() {
  // Redirect to main tabs index route
  return <Redirect href="/(tabs)" />;
}
