// app/index.tsx
import React from 'react';
import { Redirect } from 'expo-router';
import useUserPreferencesStore from '../store/userPreferencesStore';

const Home = () => {
  const hasCompletedOnboarding = useUserPreferencesStore((state) => state.hasCompletedOnboarding);

  return (
    <>{hasCompletedOnboarding ? <Redirect href="/(tabs)" /> : <Redirect href="/splash" />}</>
  );
};

export default Home;
