import React, { memo, useCallback, useEffect } from 'react';
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
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import DepartureCard from './DepartureCard';

// ─── Per-card wrapper: stagger entrance + jiggle animation ────────
interface JigglingCardWrapperProps {
  children: React.ReactNode;
  index: number;
  isJiggling: boolean;
  isActive?: boolean;
}

const JigglingCardWrapper = memo(
  ({ children, index, isJiggling, isActive = false }: JigglingCardWrapperProps) => {
    const rotation = useSharedValue(0);
    const entranceY = useSharedValue(16);
    const opacity = useSharedValue(0);
    const reducedMotion = useReducedMotion();

    const isActiveShared = useSharedValue(isActive ? 1 : 0);
    useEffect(() => {
      isActiveShared.value = isActive ? 1 : 0;
    }, [isActive, isActiveShared]);

    // Entrance animation: runs once on mount
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

    // Jiggle params matching iOS feel
    const JIGGLE_DEG = 1.2;
    const JIGGLE_MS = 100;

    // Jiggle loop with support for freezing during drag (isActive)
    useEffect(() => {
      if (reducedMotion) return;

      if (isActive) {
        // Freeze animation during drag
        cancelAnimation(rotation);
        rotation.value = 0;
      } else if (isJiggling) {
        const phase = (index * 37) % 120; // prime offset, smaller range
        rotation.value = withDelay(
          phase,
          withRepeat(
            withSequence(
              withTiming(-JIGGLE_DEG, { duration: JIGGLE_MS, easing: Easing.inOut(Easing.sin) }),
              withTiming(JIGGLE_DEG, { duration: JIGGLE_MS, easing: Easing.inOut(Easing.sin) })
            ),
            -1,
            false
          )
        );
      } else {
        cancelAnimation(rotation);
        rotation.value = withTiming(0, { duration: 150, easing: Easing.out(Easing.ease) });
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isJiggling, isActive, reducedMotion, index]);

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [
        { translateY: entranceY.value },
        { rotate: `${rotation.value}deg` },
        { scale: isActiveShared.value === 1 ? 1.04 : 1 }
      ],
      zIndex: isActiveShared.value === 1 ? 999 : 1,
    }));

    return <Animated.View style={animatedStyle}>{children}</Animated.View>;
  }
);
JigglingCardWrapper.displayName = 'JigglingCardWrapper';

// ─── DashboardGrid ────────────────────────────────────────────────
export interface DashboardGridProps {
  stations: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[];
  /** Driven by isEditing in parent — controls jiggle + edit badges */
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
  /** Called when a station card is tapped — navigates to full-screen StationDetailScreen */
  onStationTap?: (stationId: string, stationName: string) => void;
  /** Triggered when the drag reordering finishes */
  onReorderStations?: (data: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[]) => void;
  simultaneousHandlers?: React.RefObject<any>;
}

export default function DashboardGrid({
  stations,
  isJiggling,
  onExitJiggle,
  onDelete,
  onLongPressCard,
  onScrollEnabledChange,
  selectedLines,
  onStationTap,
  onReorderStations,
  simultaneousHandlers,
}: DashboardGridProps) {
  // ── Card tap handler: navigate to full-screen StationDetailScreen ─
  const handleCardTap = useCallback(
    (stationId: string, stationName: string) => {
      if (isJiggling) return; // Block popup while in jiggle/edit mode
      onStationTap?.(stationId, stationName);
    },
    [isJiggling, onStationTap]
  );

  const renderItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<any>) => {
    const index = getIndex() ?? stations.findIndex(s => s.id === item.id);
    const handleLongPress = () => {
      if (isJiggling) {
        drag();
      } else {
        onLongPressCard();
      }
    };

    return (
      <JigglingCardWrapper index={index} isJiggling={isJiggling} isActive={isActive}>
        <DepartureCard
          stationId={item.id}
          stationName={item.name}
          isEditing={isJiggling}
          onDelete={onDelete}
          onLongPress={handleLongPress}
          onCardTap={handleCardTap}
          selectedLines={selectedLines}
        />
      </JigglingCardWrapper>
    );
  }, [isJiggling, stations, onDelete, onLongPressCard, handleCardTap, selectedLines]);

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

      <DraggableFlatList
        data={stations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragBegin={() => onScrollEnabledChange(false)}
        onDragEnd={({ data }) => {
          onScrollEnabledChange(true);
          onReorderStations?.(data);
        }}
        activationDistance={8}
        dragHitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
        simultaneousHandlers={simultaneousHandlers}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
});
