// app/onboarding/permissions.tsx - Screen 3: Permissions & Personalization
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

import VoidBackground, { VOID_ROOT_COLOR } from '../../components/VoidBackground';
import BouncyPressable from '../../components/BouncyPressable';
import ProgressDots from '../../components/ProgressDots';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';

const { width } = Dimensions.get('window');
const H_PAD = 16;

const TFL_LINES = {
  'bakerloo': 'Bakerloo',
  'central': 'Central',
  'circle': 'Circle',
  'district': 'District',
  'dlr': 'DLR',
  'elizabeth': 'Elizabeth',
  'hammersmith-city': 'Hammersmith & City',
  'jubilee': 'Jubilee',
  'metropolitan': 'Metropolitan',
  'northern': 'Northern',
  'overground': 'Overground',
  'piccadilly': 'Piccadilly',
  'victoria': 'Victoria',
  'waterloo-city': 'Waterloo & City',
};

export default function PermissionsScreen() {
  const { replace } = useRouter();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold,
  });

  const [step, setStep] = useState<1 | 2>(1);

  const {
    selectedLines,
    pinnedStations,
    setCalendarGranted,
    setNotificationsGranted,
    completeOnboarding
  } = useUserPreferencesStore();

  const handleCalendar = async () => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status === 'granted') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCalendarGranted(true);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setCalendarGranted(false);
      }
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setCalendarGranted(false);
    }
    setStep(2);
  };

  const finish = async () => {
    completeOnboarding();
    // Replaced with router.replace to hit _layout guard, which handles Grand Reveal
    replace('/');
  };

  const handleNotifications = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setNotificationsGranted(true);
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setNotificationsGranted(false);
      }
    } catch (e) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setNotificationsGranted(false);
    }
    finish();
  };

  const handleSkip = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1) {
      setStep(2);
    } else {
      finish();
    }
  };

  if (!fontsLoaded) return null;

  const mockLineId = selectedLines.length > 0 ? selectedLines[0] : 'jubilee';
  const mockLineName = TFL_LINES[mockLineId as keyof typeof TFL_LINES] || 'Jubilee';
  const mockStationName = pinnedStations.length > 0 ? pinnedStations[0].name : 'your station';

  return (
    <View style={[styles.root, { backgroundColor: VOID_ROOT_COLOR }]}>
      <VoidBackground />
      <ProgressDots currentStep={2} totalSteps={3} style={{ paddingTop: insets.top + 16 }} />

      <View style={styles.content}>
        {step === 1 && (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
            <View style={styles.iconWrap}>
              <Ionicons name="calendar-outline" size={48} color="#FFF" />
            </View>
            <Text style={styles.title}>Sync your schedule</Text>
            <Text style={styles.body}>
              We read departure times alongside your calendar — all on your device. Nothing leaves your phone.
            </Text>
          </Animated.View>
        )}

        {step === 2 && (
          <Animated.View entering={FadeInDown.springify()} style={styles.stepContainer}>
            <Text style={styles.title}>Enable alerts</Text>
            <Text style={styles.body}>
              We'll only notify you if a disruption affects your commute right before an event.
            </Text>

            {/* Mockup Notification Card using Fractal Glass styling */}
            <View style={styles.mockupContainer}>
              <BlurView tint="light" intensity={30} style={styles.mockupCard}>
                <View style={styles.mockHeader}>
                  <Ionicons name="warning" size={16} color="#FF9F0A" />
                  <Text style={styles.mockHeaderTxt}>MY COMMUTE</Text>
                  <Text style={styles.mockTime}>now</Text>
                </View>
                <Text style={styles.mockTitle}>Severe Delays on {mockLineName}</Text>
                <Text style={styles.mockBody}>
                  Affects your route through {mockStationName} to upcoming event. Tap to see alternatives.
                </Text>
              </BlurView>
            </View>
          </Animated.View>
        )}
      </View>

      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <BouncyPressable
          onPress={step === 1 ? handleCalendar : handleNotifications}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnTxt}>
            {step === 1 ? 'Allow Calendar Access' : 'Enable Alerts'}
          </Text>
        </BouncyPressable>

        <BouncyPressable onPress={handleSkip} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnTxt}>Maybe later</Text>
        </BouncyPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: H_PAD,
    justifyContent: 'center',
    paddingBottom: 100,
  },
  stepContainer: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 32,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255,255,255,0.60)',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  legalBody: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.40)',
    textAlign: 'center',
    marginTop: 16,
  },
  mockupContainer: {
    width: '100%',
    paddingHorizontal: 8,
    marginTop: 20,
  },
  mockupCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.40)',
    overflow: 'hidden',
  },
  mockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mockHeaderTxt: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 6,
    flex: 1,
    fontFamily: 'SpaceGrotesk_500Medium',
  },
  mockTime: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'SpaceGrotesk_400Regular',
  },
  mockTitle: {
    fontSize: 16,
    color: '#FFF',
    fontFamily: 'SpaceGrotesk_700Bold',
    marginBottom: 4,
  },
  mockBody: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontFamily: 'SpaceGrotesk_400Regular',
    lineHeight: 20,
  },
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    backgroundColor: 'rgba(13,11,23,0.88)',
  },
  primaryBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryBtnTxt: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#0A0A0F',
  },
  secondaryBtn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnTxt: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.6)',
  },
});
