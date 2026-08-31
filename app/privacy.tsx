import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { BlurView } from 'expo-blur';
import Animated from 'react-native-reanimated';
import { GLASS } from '../theme/colors';
import { usePressAnimation } from '../hooks/usePressAnimation';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PrivacyScreen() {
  const { back } = useRouter();
  const backPress = usePressAnimation('back_btn');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <AnimatedPressable
          onPress={back}
          onPressIn={backPress.onPressIn}
          onPressOut={backPress.onPressOut}
          style={[styles.backButton, backPress.animatedStyle]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <CaretLeft size={24} color="rgba(255,255,255,0.80)" />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
          <Text style={styles.lastUpdated}>Last updated: July 2026</Text>

          <Text style={styles.bodyText}>
            This Privacy Policy explains how My Commute collects, uses, and protects your
            information when you use our mobile application.
          </Text>

          <Text style={styles.sectionTitle}>Information We Collect</Text>
          <Text style={styles.bodyText}>
            My Commute collects location data to enable geofencing features that trigger
            commute-related notifications and Live Activities. Location data is processed
            on-device and is not stored on our servers.
          </Text>
          <Text style={styles.bodyText}>
            We do not collect personal identifiers, browsing history, contact information,
            or financial data. Your station preferences and saved lines are stored locally
            on your device.
          </Text>

          <Text style={styles.sectionTitle}>Data Usage</Text>
          <Text style={styles.bodyText}>
            Transport data is fetched from Transport for London’s public API. We do not
            log, cache, or store your queries on our servers. Live Activity updates are
            processed locally using ActivityKit.
          </Text>

          <Text style={styles.sectionTitle}>Third-Party Services</Text>
          <Text style={styles.bodyText}>
            My Commute uses Transport for London’s open data API. Please refer to TfL’s
            privacy policy for information on how they handle data.
          </Text>

          <Text style={styles.sectionTitle}>Contact</Text>
          <Text style={styles.bodyText}>
            If you have questions about this policy, please contact the developer at
            the email address listed on the App Store.
          </Text>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: GLASS.background,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderTopWidth: 1.25,
    borderTopColor: GLASS.borderTop,
    borderBottomColor: GLASS.borderBottom,
    borderLeftColor: GLASS.borderSides,
    borderRightColor: GLASS.borderSides,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: GLASS.shadowColor,
    shadowOffset: GLASS.shadowOffset,
    shadowOpacity: GLASS.shadowOpacity,
    shadowRadius: GLASS.shadowRadius,
    elevation: 6,
  },
  lastUpdated: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.40)',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 20,
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 22,
    marginBottom: 12,
  },
  spacer: {
    height: 40,
  },
});
