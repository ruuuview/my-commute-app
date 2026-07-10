/**
 * FixItSheet.tsx
 * ─────────────────────────────────────────────────────────────────
 * Bottom half-sheet: chip selection for Home/Work labels.
 * Auto-swap with animation when a role is taken.
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  FadeInDown,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferencesStore } from '../store/userPreferencesStore';

interface StationItem {
  id: string;
  name: string;
  role: 'home' | 'work' | 'other';
}

interface Props {
  visible: boolean;
  stations: StationItem[];
  onDone: () => void;
  onCancel: () => void;
}

export const FixItSheet: React.FC<Props> = ({ visible, stations, onDone, onCancel }) => {
  const insets = useSafeAreaInsets();
  const setStationRole = useUserPreferencesStore(s => s.setStationRole);

  // Snapshot of roles so local toggling is instant via setStationRole (which already persists)
  const hasChanged = useSharedValue(false);
  const [changed, setChanged] = useState(false);

  // Track if user actually changed anything vs just "looks right"
  const handleChipPress = useCallback((stationId: string, role: 'home' | 'work') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStationRole(stationId, role);
    hasChanged.value = true;
    // Use a micro-task to let the store update before reading
    requestAnimationFrame(() => {
      setChanged(true);
    });
  }, [setStationRole, hasChanged]);

  // Reset state when sheet opens
  useEffect(() => {
    if (visible) {
      hasChanged.value = false;
      setChanged(false);
    }
  }, [visible, hasChanged]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />

        <Animated.View
          entering={FadeInDown.duration(300)}
          style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}
        >
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />

          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Title */}
          <Text style={styles.title}>Your stations</Text>

          {/* Station rows */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {stations.map((station) => (
              <StationRow
                key={station.id}
                station={station}
                onChipPress={handleChipPress}
              />
            ))}
          </ScrollView>

          {/* Button */}
          <Pressable
            onPress={onDone}
            style={({ pressed }) => [
              styles.doneBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.doneBtnText}>
              {changed ? 'Done' : 'Looks right'}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ─── Individual station row with Home/Work chips ───────────────────

const StationRow: React.FC<{
  station: StationItem;
  onChipPress: (id: string, role: 'home' | 'work') => void;
}> = React.memo(({ station, onChipPress }) => {
  // Read roles directly from store for live syncing
  const currentHome = useUserPreferencesStore(
    s => s.pinnedStations.find(x => x.role === 'home')
  );
  const currentWork = useUserPreferencesStore(
    s => s.pinnedStations.find(x => x.role === 'work')
  );

  const isHome = currentHome?.id === station.id;
  const isWork = currentWork?.id === station.id;

  // Animated opacity for deselected chip
  const homeOpacity = useSharedValue(isHome ? 1 : 0.5);
  const workOpacity = useSharedValue(isWork ? 1 : 0.5);

  useEffect(() => {
    homeOpacity.value = withSpring(isHome ? 1 : 0.5);
  }, [isHome, homeOpacity]);

  useEffect(() => {
    workOpacity.value = withSpring(isWork ? 1 : 0.5);
  }, [isWork, workOpacity]);

  const homeStyle = useAnimatedStyle(() => ({ opacity: homeOpacity.value }));
  const workStyle = useAnimatedStyle(() => ({ opacity: workOpacity.value }));

  return (
    <View style={ss.row}>
      <Text style={ss.name}>{station.name}</Text>
      <View style={ss.chipRow}>
        <Animated.View style={homeStyle}>
          <Pressable
            onPress={() => onChipPress(station.id, 'home')}
            style={[ss.chip, isHome && ss.chipActive]}
          >
            <Text style={[ss.chipText, isHome && ss.chipTextActive]}>Home</Text>
          </Pressable>
        </Animated.View>
        <Animated.View style={workStyle}>
          <Pressable
            onPress={() => onChipPress(station.id, 'work')}
            style={[ss.chip, isWork && ss.chipActive]}
          >
            <Text style={[ss.chipText, isWork && ss.chipTextActive]}>Work</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
});
StationRow.displayName = 'StationRow';

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'relative',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '70%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 18,
  },
  list: {
    flexGrow: 0,
    marginBottom: 16,
  },
  doneBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 26,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  doneBtnText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 16,
    color: 'rgba(255,255,255,0.90)',
  },
});

const ss = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  name: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  chipText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.60)',
  },
  chipTextActive: {
    color: '#07103a',
  },
});
