import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useUserPreferences } from '@/store/userPreferencesStore';
import VoidBackground from '@/components/VoidBackground';

const TfL_LINES = [
  { id: 'bakerloo', name: 'Bakerloo', color: '#B36305', abbreviation: 'BAK' },
  { id: 'central', name: 'Central', color: '#E32017', abbreviation: 'CEN' },
  { id: 'circle', name: 'Circle', color: '#FFD300', abbreviation: 'CIR' },
  { id: 'district', name: 'District', color: '#00782A', abbreviation: 'DIS' },
  { id: 'hammersmith-city', name: 'Hammersmith & City', color: '#F3A9BB', abbreviation: 'HAM' },
  { id: 'jubilee', name: 'Jubilee', color: '#A0A5A9', abbreviation: 'JUB' },
  { id: 'metropolitan', name: 'Metropolitan', color: '#9B0056', abbreviation: 'MET' },
  { id: 'northern', name: 'Northern', color: '#000000', abbreviation: 'NOR' },
  { id: 'piccadilly', name: 'Piccadilly', color: '#003688', abbreviation: 'PIC' },
  { id: 'victoria', name: 'Victoria', color: '#0098D4', abbreviation: 'VIC' },
  { id: 'waterloo-city', name: 'Waterloo & City', color: '#95CDBA', abbreviation: 'WAT' },
  { id: 'dlr', name: 'DLR', color: '#00A4A7', abbreviation: 'DLR' },
  { id: 'london-overground', name: 'London Overground', color: '#EE7C0E', abbreviation: 'OVG' },
  { id: 'elizabeth', name: 'Elizabeth', color: '#6950A1', abbreviation: 'ELZ' },
];

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function LinesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { selectedLineIds, toggleLine } = useUserPreferences();

  const handleLinePress = (lineId: string) => {
    const isSelected = selectedLineIds.includes(lineId);
    
    if (isSelected) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    
    toggleLine(lineId);
  };

  const isNextEnabled = selectedLineIds.length > 0;

  return (
    <VoidBackground>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Text style={styles.title}>Choose Your Lines</Text>
          
          <View style={styles.grid}>
            {TfL_LINES.map((line, index) => {
              const isSelected = selectedLineIds.includes(line.id);
              
              return (
                <AnimatedTouchable
                  key={line.id}
                  style={[
                    styles.linePill,
                    { backgroundColor: line.color },
                    isSelected && styles.linePillSelected,
                  ]}
                  entering={FadeInDown.delay(index * 35)}
                  onPress={() => handleLinePress(line.id)}
                  accessibilityLabel={`${line.name} line`}
                  accessibilityState={{ selected: isSelected }}
                  accessibilityRole="button"
                >
                  <Text 
                    style={[
                      styles.lineAbbreviation,
                      isSelected && styles.lineAbbreviationSelected,
                    ]}
                    allowFontScaling={false}
                  >
                    {line.abbreviation}
                  </Text>
                </AnimatedTouchable>
              );
            })}
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[
              styles.nextButton,
              isNextEnabled && styles.nextButtonEnabled,
            ]}
            onPress={() => router.push('/onboarding/stations' as any)}
            disabled={!isNextEnabled}
            accessibilityLabel="Continue to station selection"
            accessibilityRole="button"
          >
            <Text style={[
              styles.nextButtonText,
              isNextEnabled && styles.nextButtonTextEnabled,
            ]}>
              Next
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </VoidBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 32,
    letterSpacing: -0.5,
    color: '#FFFFFF',
    marginBottom: 32,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  linePill: {
    minWidth: 72,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  linePillSelected: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  lineAbbreviation: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  lineAbbreviationSelected: {
    opacity: 0.9,
  },
  footer: {
    padding: 20,
    paddingTop: 16,
  },
  nextButton: {
    backgroundColor: '#333333',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nextButtonEnabled: {
    backgroundColor: '#FFFFFF',
  },
  nextButtonText: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 18,
    color: '#999999',
    letterSpacing: -0.5,
  },
  nextButtonTextEnabled: {
    color: '#000000',
  },
});