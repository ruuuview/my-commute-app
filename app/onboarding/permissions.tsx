// app/onboarding/permissions.tsx — Screen 3: Permissions (v1)
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  useReducedMotion,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useNavigation } from 'expo-router';
import { useShallow } from 'zustand/react/shallow';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { OnboardingGradient } from '../../components/OnboardingGradient';
import { ProgressDots } from '../../components/ProgressDots';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { BlurView } from 'expo-blur';
import * as Calendar from 'expo-calendar';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { useDeferredPermissionTriggers } from '../../hooks/useDeferredPermissionTriggers';

export default function PermissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const reducedMotion = useReducedMotion();

  const {
    calendarGranted,
    notificationsGranted,
    locationGranted,
    setCalendarGranted,
    setNotificationsGranted,
    setLocationGranted,
    completeOnboarding,
  } = useUserPreferencesStore(
    useShallow((s) => ({
      calendarGranted: s.calendarGranted,
      notificationsGranted: s.notificationsGranted,
      locationGranted: s.locationGranted,
      setCalendarGranted: s.setCalendarGranted,
      setNotificationsGranted: s.setNotificationsGranted,
      setLocationGranted: s.setLocationGranted,
      completeOnboarding: s.completeOnboarding,
    }))
  );

  const {
    requestCalendarPermission,
    requestNotificationPermission,
    requestLocationPermission,
  } = useDeferredPermissionTriggers();

  // Sync actual system permissions on mount
  useEffect(() => {
    let active = true;
    const checkSystemPermissions = async () => {
      try {
        const calRes = await Calendar.getCalendarPermissionsAsync();
        const notifRes = await Notifications.getPermissionsAsync();
        const locRes = await Location.getForegroundPermissionsAsync();

        if (active) {
          setCalendarGranted(calRes.status === Calendar.PermissionStatus.GRANTED);
          setNotificationsGranted(notifRes.status === 'granted');
          setLocationGranted(locRes.status === 'granted');
        }
      } catch (e) {
        console.log('Error checking system permissions:', e);
      }
    };
    checkSystemPermissions();
    return () => {
      active = false;
    };
  }, [setCalendarGranted, setNotificationsGranted, setLocationGranted]);

  const handleRequestCalendar = async () => {
    if (calendarGranted) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('select', 0.45);
    const granted = await requestCalendarPermission();
    if (granted) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSound('confirm');
    }
  };

  const handleRequestLocation = async () => {
    if (locationGranted) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('select', 0.45);
    const granted = await requestLocationPermission();
    if (granted) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSound('confirm');
    }
  };

  const handleRequestNotifications = async () => {
    if (notificationsGranted) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('select', 0.45);
    const granted = await requestNotificationPermission();
    if (granted) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSound('confirm');
    }
  };

  const executeGrandReveal = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSound('confirm');

    // Complete onboarding state
    completeOnboarding();

    // Reset parent navigation stack to main dashboard tabs
    const parentNav = navigation.getParent();
    if (parentNav) {
      (parentNav as any).reset({
        index: 0,
        routes: [{ name: '(tabs)' }],
      });
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('pop', 0.32);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/onboarding/stations');
    }
  };

  const backAnim = usePressAnimation('back_btn');
  const ctaBtnAnim = usePressAnimation('continue_btn');

  return (
    <View style={styles.root}>
      <OnboardingGradient />

      {/* Grain Overlay */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>

      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />

      <View style={styles.flex1}>
        {/* Navigation header fixed crown area */}
        <View style={[styles.navHeader, { paddingTop: insets.top + 4 }]}>
          <Pressable
            onPress={handleBack}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            style={({ pressed }) => [
              styles.backButtonPressable,
              pressed && styles.backButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Animated.View style={[styles.navHeaderBtn, backAnim.animatedStyle]}>
              <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
              <Text style={styles.navBackText}>Stations</Text>
            </Animated.View>
          </Pressable>
        </View>

        {/* Title Header Container */}
        <View style={styles.headerContainer}>
          <Text style={styles.eyebrow}>SETUP · STEP 3 OF 3</Text>
          <View style={{ marginBottom: 6 }}>
            <ProgressDots total={3} current={3} />
          </View>
          <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.2} numberOfLines={2}>
            Unlock Superpowers
          </Text>
        </View>

        {/* Permission Cards List */}
        <ScrollView
          style={styles.flex1}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Card 1: Calendar */}
          <Pressable
            onPress={handleRequestCalendar}
            disabled={calendarGranted}
            style={styles.cardContainer}
          >
            <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={styles.cardContent}>
              <View style={[styles.iconFrame, calendarGranted && styles.iconFrameGranted]}>
                <Ionicons
                  name={calendarGranted ? "checkmark-circle" : "calendar-outline"}
                  size={22}
                  color={calendarGranted ? "#28A745" : "#FFFFFF"}
                />
              </View>
              <View style={styles.textFrame}>
                <Text style={styles.cardTitle}>Calendar Integration</Text>
                <Text style={styles.cardDisclosure}>
                  We read departure times alongside your calendar — all on your device. Nothing leaves your phone.
                </Text>
              </View>
              <View style={styles.statusFrame}>
                {calendarGranted ? (
                  <Text style={styles.statusTextGranted}>Active</Text>
                ) : (
                  <View style={styles.actionBtn}>
                    <Text style={styles.actionBtnText}>Allow</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>

          {/* Card 2: Location */}
          <Pressable
            onPress={handleRequestLocation}
            disabled={locationGranted}
            style={styles.cardContainer}
          >
            <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={styles.cardContent}>
              <View style={[styles.iconFrame, locationGranted && styles.iconFrameGranted]}>
                <Ionicons
                  name={locationGranted ? "checkmark-circle" : "location-outline"}
                  size={22}
                  color={locationGranted ? "#28A745" : "#FFFFFF"}
                />
              </View>
              <View style={styles.textFrame}>
                <Text style={styles.cardTitle}>Location Access</Text>
                <Text style={styles.cardDisclosure}>
                  We run background updates near your commute stations to automatically trigger Live Activities. Only used while traveling.
                </Text>
              </View>
              <View style={styles.statusFrame}>
                {locationGranted ? (
                  <Text style={styles.statusTextGranted}>Active</Text>
                ) : (
                  <View style={styles.actionBtn}>
                    <Text style={styles.actionBtnText}>Allow</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>

          {/* Card 3: Notifications */}
          <Pressable
            onPress={handleRequestNotifications}
            disabled={notificationsGranted}
            style={styles.cardContainer}
          >
            <BlurView intensity={35} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View style={styles.cardContent}>
              <View style={[styles.iconFrame, notificationsGranted && styles.iconFrameGranted]}>
                <Ionicons
                  name={notificationsGranted ? "checkmark-circle" : "notifications-outline"}
                  size={22}
                  color={notificationsGranted ? "#28A745" : "#FFFFFF"}
                />
              </View>
              <View style={styles.textFrame}>
                <Text style={styles.cardTitle}>Smart Alerts</Text>
                <Text style={styles.cardDisclosure}>
                  Get leave-by alerts and real-time transit disruption warnings before your commute begins.
                </Text>
              </View>
              <View style={styles.statusFrame}>
                {notificationsGranted ? (
                  <Text style={styles.statusTextGranted}>Active</Text>
                ) : (
                  <View style={styles.actionBtn}>
                    <Text style={styles.actionBtnText}>Allow</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        </ScrollView>

        {/* Bottom Sticky CTA Footer */}
        <View style={[styles.ctaStickyFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Pressable
            onPress={executeGrandReveal}
            onPressIn={ctaBtnAnim.onPressIn}
            onPressOut={ctaBtnAnim.onPressOut}
            style={styles.ctaPressable}
          >
            <Animated.View style={[styles.ctaButton, ctaBtnAnim.animatedStyle]}>
              <Text style={styles.ctaButtonText}>Finish Setup</Text>
            </Animated.View>
          </Pressable>

          <Pressable onPress={executeGrandReveal} style={styles.skipPressable}>
            <Text style={styles.skipText}>Maybe later</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  flex1: {
    flex: 1,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  navHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBackText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.70)',
    marginLeft: 4,
  },
  backButtonPressable: {
    opacity: 1,
  },
  backButtonPressed: {
    opacity: 0.7,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  eyebrow: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255,255,255,0.30)',
    letterSpacing: 1.8,
  },
  title: {
    fontSize: 32,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 150,
    gap: 12,
  },
  cardContainer: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    position: 'relative',
  },
  cardContent: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    gap: 12,
  },
  iconFrame: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  iconFrameGranted: {
    backgroundColor: 'rgba(40, 167, 69, 0.12)',
    borderColor: 'rgba(40, 167, 69, 0.35)',
  },
  textFrame: {
    flex: 1,
  },
  cardTitle: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  cardDisclosure: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 16,
  },
  statusFrame: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    minWidth: 56,
  },
  statusTextGranted: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#28A745',
  },
  actionBtn: {
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    color: '#07103a',
  },
  ctaStickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: 'transparent',
  },
  ctaPressable: {
    width: '100%',
  },
  ctaButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontSize: 15,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#07103a',
  },
  skipPressable: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  skipText: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.45)',
  },
});
