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
import { requestPermission } from '../store/permissionOrchestrator';
import { usePressAnimation } from '../hooks/usePressAnimation';
import { playSound } from '../utils/sound';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface StationItem {
  id: string;
  name: string;
  role: 'home' | 'work' | 'other';
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export const FixItSheet: React.FC<Props> = ({ visible, onClose }) => {
  const insets = useSafeAreaInsets();
  const setStationRole = useUserPreferencesStore(s => s.setStationRole);
  const stations = useUserPreferencesStore(s => s.pinnedStations || []);
  const donePress = usePressAnimation('continue_btn');

  // Snapshot of roles so local toggling is instant via setStationRole (which already persists)
  const hasChanged = useSharedValue(false);
  const [changed, setChanged] = useState(false);

  // Track if user actually changed anything vs just "looks right"
  const handleChipPress = useCallback((stationId: string, role: 'home' | 'work') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playSound('select', 0.45).catch(() => {});
    setStationRole(stationId, role);
    hasChanged.value = true;
    // Use a micro-task to let the store update before reading
    requestAnimationFrame(() => {
      setChanged(true);
    });
    // Feature-triggered While-Using ask (plan Permission 1): the user just
    // confirmed a station as home/work. Cheap ask → native dialog, no primer.
    void requestPermission('locationWhenInUse', 'set_station_role', { primer: false });
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
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

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
          <AnimatedPressable
            onPress={onClose}
            onPressIn={donePress.onPressIn}
            onPressOut={donePress.onPressOut}
            style={[
              styles.doneBtn,
              donePress.animatedStyle,
            ]}
          >
            <Text style={styles.doneBtnText}>
              {changed ? 'Done' : 'Looks right'}
            </Text>
          </AnimatedPressable>
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

  const homeOpacityStyle = useAnimatedStyle(() => ({ opacity: homeOpacity.value }));
  const workOpacityStyle = useAnimatedStyle(() => ({ opacity: workOpacity.value }));

  const homePress = usePressAnimation('chip');
  const workPress = usePressAnimation('chip');

  return (
    <View style={ss.row}>
      <Text style={ss.name}>{station.name}</Text>
      <View style={ss.chipRow}>
        <AnimatedPressable
          onPress={() => onChipPress(station.id, 'home')}
          onPressIn={homePress.onPressIn}
          onPressOut={homePress.onPressOut}
          style={[ss.chip, isHome && ss.chipActive, homeOpacityStyle, homePress.animatedStyle]}
        >
          <Text style={[ss.chipText, isHome && ss.chipTextActive]}>Home</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => onChipPress(station.id, 'work')}
          onPressIn={workPress.onPressIn}
          onPressOut={workPress.onPressOut}
          style={[ss.chip, isWork && ss.chipActive, workOpacityStyle, workPress.animatedStyle]}
        >
          <Text style={[ss.chipText, isWork && ss.chipTextActive]}>Work</Text>
        </AnimatedPressable>
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
    // Bug #8 fix: flexGrow:0 pinned the ScrollView to content height, so
    // content taller than maxHeight:'70%' clipped instead of scrolling.
    flexGrow: 1,
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
