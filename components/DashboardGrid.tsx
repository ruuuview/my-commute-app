/**
 * DashboardGrid.tsx
 * ─────────────────────────────────────────────────────────────────
 * Renders the pinned station DepartureCards with:
 *  • Staggered entrance animation (translateY + opacity)
 *  • Per-card jiggle in edit/jiggle mode (±1 deg, alternating phase)
 *  • Clean exit: rotation and translateX snap back to 0 via withSpring
 *  • Background Pressable that dismisses jiggle mode
 *  • StationDetailModal triggered by card tap via measureInWindow
 * ─────────────────────────────────────────────────────────────────
 */

import React, { useRef, useState, useEffect, useCallback, memo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  cancelAnimation,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import DepartureCard from './DepartureCard';
import StationDetailModal from './StationDetailModal';

// ─── Types ────────────────────────────────────────────────────────
interface SelectedStation {
  id: string;
  name: string;
  pageY: number;
  cardHeight: number;
}

// ─── Per-card wrapper: stagger entrance + jiggle animation ────────
interface JigglingCardWrapperProps {
  children: React.ReactNode;
  index: number;
  isJiggling: boolean;
}

const JigglingCardWrapper = memo(
  ({ children, index, isJiggling }: JigglingCardWrapperProps) => {
    const rotation = useSharedValue(0);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const entranceY = useSharedValue(16);
    const opacity = useSharedValue(0);
    const reducedMotion = useReducedMotion();

    // Bridge JS booleans → shared values for safe worklet reads
    const isJigglingShared = useSharedValue(isJiggling ? 1 : 0);
    useEffect(() => {
      isJigglingShared.value = isJiggling ? 1 : 0;
    }, [isJiggling, isJigglingShared]);

    // ── Entrance animation: runs once on mount ──────────────────
    useEffect(() => {
      if (reducedMotion) {
        entranceY.value = 0;
        opacity.value = 1;
        return;
      }
      const delay = 120 + index * 60;
      entranceY.value = withDelay(
        delay,
        withSpring(0, { damping: 22, stiffness: 200 })
      );
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 320, easing: Easing.out(Easing.poly(4)) })
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, reducedMotion]);

    // ── Jiggle: ±1.5deg rotation, ±0.5 translate, staggered phase ──
    useEffect(() => {
      if (reducedMotion) return;

      if (isJiggling) {
        const phase = (index * 23) % 150;
        rotation.value = withDelay(
          phase,
          withRepeat(
            withSequence(
              withTiming(-1.5, { duration: 90, easing: Easing.inOut(Easing.sin) }),
              withTiming(1.5, { duration: 90, easing: Easing.inOut(Easing.sin) })
            ),
            -1,
            false
          )
        );
        translateX.value = withDelay(
          phase,
          withRepeat(
            withSequence(
              withTiming(0.5, { duration: 90, easing: Easing.inOut(Easing.sin) }),
              withTiming(-0.5, { duration: 90, easing: Easing.inOut(Easing.sin) })
            ),
            -1,
            false
          )
        );
        translateY.value = withDelay(
          phase,
          withRepeat(
            withSequence(
              withTiming(-0.5, { duration: 90, easing: Easing.inOut(Easing.sin) }),
              withTiming(0.5, { duration: 90, easing: Easing.inOut(Easing.sin) })
            ),
            -1,
            false
          )
        );
      } else {
        // BUG FIX: cancel BEFORE withSpring reset to prevent corrupted end state
        cancelAnimation(rotation);
        cancelAnimation(translateX);
        cancelAnimation(translateY);
        rotation.value = withSpring(0, { damping: 24, stiffness: 320 });
        translateX.value = withSpring(0, { damping: 24, stiffness: 320 });
        translateY.value = withSpring(0, { damping: 24, stiffness: 320 });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isJiggling, reducedMotion, index]);

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [
        { translateY: entranceY.value },
        { rotate: `${rotation.value}deg` },
        { translateX: translateX.value },
        { translateY: translateY.value },
      ],
    }));

    return <Animated.View style={animatedStyle}>{children}</Animated.View>;
  }
);
JigglingCardWrapper.displayName = 'JigglingCardWrapper';

// ─── DashboardGrid ────────────────────────────────────────────────
export interface DashboardGridProps {
  stations: { id: string; name: string }[];
  /** Driven by isEditing in parent — controls both jiggle + edit badges */
  isJiggling: boolean;
  /** Called when background tap should exit jiggle mode */
  onExitJiggle: () => void;
  onDelete: (id: string) => void;
  /** Called on long-press of any card to enter jiggle mode */
  onLongPressCard: () => void;
  /** Called whenever scroll should be enabled/disabled in the parent ScrollView */
  onScrollEnabledChange: (enabled: boolean) => void;
  /** User's pinned line IDs for modal filtering */
  selectedLines?: string[];
}

export default function DashboardGrid({
  stations,
  isJiggling,
  onExitJiggle,
  onDelete,
  onLongPressCard,
  onScrollEnabledChange,
  selectedLines,
}: DashboardGridProps) {
  const [selectedStation, setSelectedStation] = useState<SelectedStation | null>(null);
  // Stable ref map: station.id → measured View ref
  const cardRefsMap = useRef<Record<string, View | null>>({});

  // Disable parent scroll while popup is open
  useEffect(() => {
    onScrollEnabledChange(selectedStation === null);
  }, [selectedStation, onScrollEnabledChange]);

  // ── Card tap handler: measure position then show popup ────────
  const handleCardTap = useCallback(
    (stationId: string, stationName: string) => {
      if (isJiggling) return; // Block popup while in jiggle/edit mode
      const ref = cardRefsMap.current[stationId];
      if (!ref) return;
      ref.measureInWindow((x, y, width, height) => {
        setSelectedStation({ id: stationId, name: stationName, pageY: y, cardHeight: height });
      });
    },
    [isJiggling]
  );

  const handleDismiss = useCallback(() => setSelectedStation(null), []);

  return (
    <View style={styles.container} testID="dashboard-grid">
      {/* Background dismiss layer — absoluteFill behind cards, catches inter-card taps */}
      {isJiggling && (
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onExitJiggle}
          testID="jiggle-dismiss-bg"
        />
      )}

      {stations.map((station, index) => (
        <View
          key={station.id}
          ref={r => { cardRefsMap.current[station.id] = r; }}
          collapsable={false}
          testID={`card-wrapper-${station.id}`}
        >
          <JigglingCardWrapper index={index} isJiggling={isJiggling}>
            <DepartureCard
              stationId={station.id}
              stationName={station.name}
              isEditing={isJiggling}
              onDelete={onDelete}
              onLongPress={onLongPressCard}
              onCardTap={handleCardTap}
              selectedLines={selectedLines}
            />
          </JigglingCardWrapper>
        </View>
      ))}

      {/* Popup — rendered here, floats over everything via Modal */}
      {selectedStation && (
        <StationDetailModal
          stationId={selectedStation.id}
          stationName={selectedStation.name}
          anchorPageY={selectedStation.pageY}
          anchorCardHeight={selectedStation.cardHeight}
          onDismiss={handleDismiss}
          selectedLines={selectedLines}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
});
