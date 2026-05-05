// app/onboarding/stations.tsx
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TouchableOpacity } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSequence, 
  withSpring, 
  withTiming 
} from 'react-native-reanimated';
import Fuse from 'fuse.js';
import { useUserPreferencesStore } from '../../store/userPreferencesStore';

// Mock data for popular stations
const POPULAR_STATIONS = [
  { id: 'waterloo', name: 'Waterloo' },
  { id: 'londonBridge', name: 'London Bridge' },
  { id: 'victoria', name: 'Victoria' },
  // Add more popular stations as needed
];

// Fuse.js configuration for fuzzy searching
const fuse = new Fuse(POPULAR_STATIONS, {
  keys: ['name'],
  threshold: 0.2,
});

// The Jiggling Pill Component (Reanimated Physics)
const StationPill = ({ station, isSelected, onToggle }) => {
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

    onToggle(station.id);
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
            backgroundColor: '#388E3C',
            borderColor: '#388E3C',
            borderWidth: 1.5,
          }
        ]}
      >
        <Text style={styles.pillText}>
          {station.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

// The Bottom Sheet Component
const StationBottomSheet = ({ visible, onClose, onPin }) => {
  const [selectedRole, setSelectedRole] = useState(null);

  return (
    <Modal 
      animationType="slide" 
      transparent={true} 
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.bottomSheetContainer}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.sheetTitle}>How do you use {selectedRole ? selectedRole : 'Station'}?</Text>
        <View style={styles.roleButtonsContainer}>
          <Pressable 
            onPress={() => setSelectedRole('home')}
            style={[
              styles.roleButton,
              selectedRole === 'home' && styles.selectedRoleButton
            ]}
          >
            <Text style={styles.roleButtonText}>Home</Text>
          </Pressable>
          <Pressable 
            onPress={() => setSelectedRole('work')}
            style={[
              styles.roleButton,
              selectedRole === 'work' && styles.selectedRoleButton
            ]}
          >
            <Text style={styles.roleButtonText}>Work</Text>
          </Pressable>
          <Pressable 
            onPress={() => setSelectedRole('other')}
            style={[
              styles.roleButton,
              selectedRole === 'other' && styles.selectedRoleButton
            ]}
          >
            <Text style={styles.roleButtonText}>Other</Text>
          </Pressable>
        </View>
        <TouchableOpacity 
          onPress={() => {
            if (selectedRole) {
              onPin({ id: selectedRole, name: selectedRole }, selectedRole);
              onClose();
            }
          }}
          style={styles.confirmButton}
        >
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
};

// The Main Screen Grid
export default function StationsScreen() {
  // Zustand Integration
  const selectedLines = useUserPreferencesStore((state) => state.selectedLines);
  const toggleLine = useUserPreferencesStore((state) => state.toggleLine);
  const pinStation = useUserPreferencesStore((state) => state.pinStation);

  const [searchQuery, setSearchQuery] = useState('');
  const [filteredStations, setFilteredStations] = useState([]);
  const [isBottomSheetVisible, setIsBottomSheetVisible] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);

  React.useEffect(() => {
    if (searchQuery) {
      const results = fuse.search(searchQuery);
      setFilteredStations(results.map(result => result.item));
    } else {
      setFilteredStations(POPULAR_STATIONS);
    }
  }, [searchQuery]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Stations</Text>
        <Text style={styles.subtitle}>Add stations you frequently use.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {filteredStations.map((station) => (
          <StationPill 
            key={station.id}
            station={station}
            isSelected={selectedLines.includes(station.id)}
            onToggle={toggleLine}
          />
        ))}
      </ScrollView>

      <TouchableOpacity 
        onPress={() => setIsBottomSheetVisible(true)}
        style={styles.addButton}
      >
        <Text style={styles.addButtonText}>Add Station</Text>
      </TouchableOpacity>

      <StationBottomSheet 
        visible={isBottomSheetVisible} 
        onClose={() => setIsBottomSheetVisible(false)} 
        onPin={(station, role) => {
          pinStation(station, role);
          setIsBottomSheetVisible(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
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
  addButton: {
    position: 'absolute',
    bottom: 24,
    left: 24,
    right: 24,
    backgroundColor: '#388E3C',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bottomSheetContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  closeButton: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  roleButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 24,
  },
  roleButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#388E3C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedRoleButton: {
    backgroundColor: '#388E3C',
    borderColor: '#388E3C',
  },
  roleButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  confirmButton: {
    backgroundColor: '#388E3C',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
