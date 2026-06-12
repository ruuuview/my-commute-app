import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  SafeAreaView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';
import { ProgressDots } from '../../components/ProgressDots';
import { useDeferredPermissionTriggers } from '../../hooks/useDeferredPermissionTriggers';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { playSound } from '../../utils/sound';

export default function PermissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    calendarGranted,
    notificationsGranted,
    completeOnboarding,
  } = useUserPreferencesStore();

  const {
    requestCalendarPermission,
    requestNotificationPermission,
  } = useDeferredPermissionTriggers();

  // Bottom CTA State Transition
  const anyPermissionSelected = calendarGranted || notificationsGranted;
  const ctaOpacity = useSharedValue(1);

  const ctaAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));

  const continueAnim = usePressAnimation('continue_btn');
  const calendarPressAnim = usePressAnimation('continue_btn', calendarGranted);
  const notificationPressAnim = usePressAnimation('continue_btn', notificationsGranted);
  const skipPressAnim = usePressAnimation('skip_btn');

  const activePressAnim = anyPermissionSelected ? continueAnim : skipPressAnim;

  const handleRequestCalendar = async () => {
    if (calendarGranted) return;
    const granted = await requestCalendarPermission();
    if (granted) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSound('confirm');
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleRequestNotifications = async () => {
    if (notificationsGranted) return;
    const granted = await requestNotificationPermission();
    if (granted) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      playSound('confirm');
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleFinish = async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    playSound('push', 0.38);
    completeOnboarding();
    requestAnimationFrame(() => {
      router.replace('/');
    });
  };

  return (
    <View style={styles.root}>
      {/* Option C Linear Gradient Backdrop */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <LinearGradient
          colors={['#070714', '#0A1128', '#001040', '#000810']}
          locations={[0, 0.38, 0.65, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* 3% Photographic Grain Overlay */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>

      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header Zone */}
        <View style={[styles.headerContainer, { paddingTop: insets.top + 4 }]}>
          <Text style={styles.eyebrow} accessibilityLabel="Setup Step 3 of 3">
            SETUP · STEP 3 OF 3
          </Text>
          <View style={{ marginBottom: 12 }}>
            <ProgressDots total={3} current={3} />
          </View>
          <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.2}>
            Get Commute Alerts
          </Text>
        </View>

        {/* Content Zone */}
        <View style={styles.contentContainer}>
          {/* Card 1: Calendar Access (Sequential order mandates calendar first) */}
          <View 
            style={styles.card}
            accessibilityRole="none"
            importantForAccessibility="yes"
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, calendarGranted && styles.iconContainerGranted]}>
                <Ionicons 
                  name="calendar-outline" 
                  size={20} 
                  color={calendarGranted ? '#10B981' : '#FFFFFF'} 
                />
              </View>
              <Text style={styles.cardTitle}>Calendar Integration</Text>
            </View>

            {/* Verbatim Pre-Disclosure Copy (App Store Compliance Block P0) */}
            <Text style={styles.disclosureText}>
              We read departure times alongside your calendar — all on your device. Nothing leaves your phone.
            </Text>

            <Pressable
              onPress={handleRequestCalendar}
              onPressIn={calendarPressAnim.onPressIn}
              onPressOut={calendarPressAnim.onPressOut}
              disabled={calendarGranted}
              accessibilityRole="button"
              accessibilityLabel={calendarGranted ? "Calendar permission granted" : "Allow Calendar Access"}
              style={styles.cardButtonPressable}
            >
              <Animated.View
                style={[
                  styles.cardButton,
                  calendarPressAnim.animatedStyle,
                  calendarGranted ? styles.cardButtonGranted : styles.cardButtonActive
                ]}
              >
                {calendarGranted ? (
                  <View style={styles.buttonContentRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={[styles.cardButtonText, { color: '#10B981' }]}>Calendar Connected</Text>
                  </View>
                ) : (
                  <Text style={[styles.cardButtonText, { color: '#0A0F3C' }]}>Allow Calendar Access</Text>
                )}
              </Animated.View>
            </Pressable>
          </View>

          {/* Card 2: Notifications */}
          <View 
            style={styles.card}
            accessibilityRole="none"
            importantForAccessibility="yes"
          >
            <View style={styles.cardHeader}>
              <View style={[styles.iconContainer, notificationsGranted && styles.iconContainerGranted]}>
                <Ionicons 
                  name="notifications-outline" 
                  size={20} 
                  color={notificationsGranted ? '#10B981' : '#FFFFFF'} 
                />
              </View>
              <Text style={styles.cardTitle}>Smart Alerts</Text>
            </View>
            <Text style={styles.disclosureText}>
              {"We will alert you 15 minutes before your leave-by time so you're never rushed."}
            </Text>

            <Pressable
              onPress={handleRequestNotifications}
              onPressIn={notificationPressAnim.onPressIn}
              onPressOut={notificationPressAnim.onPressOut}
              disabled={notificationsGranted}
              accessibilityRole="button"
              accessibilityLabel={notificationsGranted ? "Notifications enabled" : "Enable Alerts"}
              style={styles.cardButtonPressable}
            >
              <Animated.View
                style={[
                  styles.cardButton,
                  notificationPressAnim.animatedStyle,
                  notificationsGranted ? styles.cardButtonGranted : styles.cardButtonActive
                ]}
              >
                {notificationsGranted ? (
                  <View style={styles.buttonContentRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginRight: 6 }} />
                    <Text style={[styles.cardButtonText, { color: '#10B981' }]}>Alerts Enabled</Text>
                  </View>
                ) : (
                  <Text style={[styles.cardButtonText, { color: '#0A0F3C' }]}>Enable Alerts</Text>
                )}
              </Animated.View>
            </Pressable>
          </View>
        </View>

        {/* Sticky CTA Footer */}
        <View style={styles.footerContainer}>
          <Pressable
            onPress={handleFinish}
            onPressIn={activePressAnim.onPressIn}
            onPressOut={activePressAnim.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={anyPermissionSelected ? "Finish Setup" : "Maybe later"}
            style={styles.ctaPressable}
          >
            <Animated.View
              style={[
                styles.cta,
                activePressAnim.animatedStyle,
                ctaAnimatedStyle,
                anyPermissionSelected ? styles.ctaActive : styles.ctaSkip
              ]}
            >
              <Text
                style={[
                  styles.ctaText,
                  anyPermissionSelected ? { color: '#0A0F3C' } : { color: 'rgba(255, 255, 255, 0.6)' }
                ]}
              >
                {anyPermissionSelected ? 'Finish Setup' : 'Maybe later'}
              </Text>
            </Animated.View>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#070714',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  eyebrow: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#0044EE',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginTop: 2,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
    gap: 16,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerGranted: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
  },
  disclosureText: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.70)',
    lineHeight: 18,
    marginBottom: 14,
  },
  cardButtonPressable: {
    width: '100%',
  },
  cardButton: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  cardButtonGranted: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  cardButtonText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  ctaPressable: {
    width: '100%',
  },
  cta: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaActive: {
    backgroundColor: '#FFFFFF',
  },
  ctaSkip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
});
