import React, { memo, useCallback, useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  useReducedMotion,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { NestableDraggableFlatList, RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import DepartureCard from './DepartureCard';

// ─── Per-card wrapper: stagger entrance animation ──────────────────
interface StaggeredEntranceWrapperProps {
  children: React.ReactNode;
  index: number;
}

const StaggeredEntranceWrapper = memo(
  ({ children, index }: StaggeredEntranceWrapperProps) => {
    const entranceY = useSharedValue(16);
    const opacity = useSharedValue(0);
    const reducedMotion = useReducedMotion();

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

    const animatedStyle = useAnimatedStyle(() => ({
      opacity: opacity.value,
      transform: [
        { translateY: entranceY.value },
      ],
    }));

    return <Animated.View style={animatedStyle}>{children}</Animated.View>;
  }
);
StaggeredEntranceWrapper.displayName = 'StaggeredEntranceWrapper';

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
  globalJiggle?: SharedValue<number>;
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
  globalJiggle,
}: DashboardGridProps) {
  const [isDragging, setIsDragging] = useState(false);

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
      <ScaleDecorator>
        <StaggeredEntranceWrapper index={index}>
          <DepartureCard
            stationId={item.id}
            stationName={item.name}
            isEditing={isJiggling && !isDragging}
            onDelete={onDelete}
            onLongPress={handleLongPress}
            onCardTap={handleCardTap}
            selectedLines={selectedLines}
            drag={isJiggling ? drag : undefined}
            index={index}
            isActive={isActive}
            globalJiggle={globalJiggle}
          />
        </StaggeredEntranceWrapper>
      </ScaleDecorator>
    );
  }, [isJiggling, isDragging, stations, onDelete, onLongPressCard, handleCardTap, selectedLines, globalJiggle]);

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

      <NestableDraggableFlatList
        data={stations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragBegin={() => {
          setIsDragging(true);
          onScrollEnabledChange(false);
        }}
        onDragEnd={({ data }) => {
          setIsDragging(false);
          onScrollEnabledChange(true);
          onReorderStations?.(data);
        }}
        activationDistance={8}
        dragHitSlop={{ top: 0, bottom: 0, left: 0, right: 0 }}
        simultaneousHandlers={simultaneousHandlers}
        scrollEnabled={false}
        initialNumToRender={8}
        windowSize={11}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={50}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
  },
});
