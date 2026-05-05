// app/onboarding/lines.tsx
import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSequence, 
  withSpring, 
  withTiming 
} from 'react-native-reanimated';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';

// 1. Official TfL Colors mapped out
const TFL_LINES = [
  { id: 'bakerloo', name: 'Bakerloo', color: '#B26300' },
  { id: 'central', name: 'Central', color: '#DC241F' },
  { id: 'circle', name: 'Circle', color: '#FFD329', textColor: '#000' },
  { id: 'district', name: 'District', color: '#007D32' },
  { id: 'jubilee', name: 'Jubilee', color: '#A1A5A7', textColor: '#000' },
  { id: 'northern', name: 'Northern', color: '#000000', border: '#333333' }, // Northern line needs a border on #050505
  { id: 'piccadilly', name: 'Piccadilly', color: '#0019A8' },
  { id: 'victoria', name: 'Victoria', color: '#0098D4' },
  { id: 'waterloo', name: 'Waterloo & City', color: '#93CEBA', textColor: '#000' },
];

// 2. The Jiggling Pill Component (Reanimated Physics)
const LinePill = ({ line, isSelected, onToggle }) => {
  const scale = useSharedValue(1);
  const rotation = useSharedValue(0);

  const handlePress = () => {
    // The Jiggle Physics
    scale.value = withSequence(
      withTiming(0.9, { duration: 50 }),
      withSpring(1.05, { damping: 5, stiffness: 200 }),
      withSpring(1)
    );
    
    rotation.value = withSequence(
      withTiming(-2, { duration: 50 }),
      withSpring(2, { damping: 2, stiffness: 400 }),
      withSpring(0)
    );

    onToggle(line.id);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` }
    ],
    opacity: isSelected ? 1 : 0.4, // Cinematic dimming for unselected
  }));

  return (
    <Animated.View style={[animatedStyle, styles.pillWrapper]}>
      <Pressable 
        onPress={handlePress}
        style={[
          styles.pill,
          { 
            backgroundColor: line.color,
            borderColor: line.border || line.color,
            borderWidth: line.border ? 1.5 : 0,
          }
        ]}
      >
        <Text style={[
          styles.pillText, 
          { color: line.textColor || '#FFFFFF' }
        ]}>
          {line.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

// 3. The Main Screen Grid
export default function LinesScreen() {
  // 4. Zustand Integration
  const selectedLines = useUserPreferencesStore((state) => state.selectedLines);
  const toggleLine = useUserPreferencesStore((state) => state.toggleLine);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Routes</Text>
        <Text style={styles.subtitle}>Tap the lines you commute on.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {TFL_LINES.map((line) => (
          <LinePill 
            key={line.id}
            line={line}
            isSelected={selectedLines.includes(line.id)}
            onToggle={toggleLine}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505', // Your exact architecture background
    paddingTop: 60,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#A1A1AA',
    marginTop: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
    paddingBottom: 100,
  },
  pillWrapper: {
    marginBottom: 4,
  },
  pill: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  pillText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
