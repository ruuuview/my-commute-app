import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { GLASS } from '../theme/colors';

export default function TermsScreen() {
  const { back } = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Pressable onPress={back} style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.80)" />
        </Pressable>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <BlurView intensity={GLASS.blurIntensity} tint="dark" style={StyleSheet.absoluteFillObject} />
          <Text style={styles.lastUpdated}>Last updated: July 2026</Text>

          <Text style={styles.bodyText}>
            By using My Commute, you agree to these terms. If you do not agree, do not
            use the application.
          </Text>

          <Text style={styles.sectionTitle}>Use of Service</Text>
          <Text style={styles.bodyText}>
            My Commute is provided as a convenience tool for viewing London transport
            information. It relies on Transport for London's open data API and is not
            affiliated with or endorsed by TfL.
          </Text>
          <Text style={styles.bodyText}>
            You may use the app for personal, non-commercial purposes. You may not
            reproduce, distribute, or create derivative works from the app or its data
            without prior written consent.
          </Text>

          <Text style={styles.sectionTitle}>Disclaimer</Text>
          <Text style={styles.bodyText}>
            Transport information is provided "as is" without any warranty. My Commute
            makes no guarantees about the accuracy, reliability, or availability of
            transport data. Always check official TfL sources for critical travel
            decisions.
          </Text>

          <Text style={styles.sectionTitle}>Limitation of Liability</Text>
          <Text style={styles.bodyText}>
            My Commute shall not be liable for any damages arising from the use or
            inability to use the app, including but not limited to missed trains,
            delayed journeys, or travel disruptions.
          </Text>

          <Text style={styles.sectionTitle}>Changes</Text>
          <Text style={styles.bodyText}>
            These terms may be updated at any time. Continued use of the app after
            changes constitutes acceptance of the new terms.
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS.borderSide,
    overflow: 'hidden',
    marginTop: 8,
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
