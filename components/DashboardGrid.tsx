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
  skipEntrance?: boolean;
}

const StaggeredEntranceWrapper = memo(
  ({ children, index, skipEntrance = false }: StaggeredEntranceWrapperProps) => {
    const entranceY = useSharedValue(skipEntrance ? 0 : 16);
    const opacity = useSharedValue(skipEntrance ? 1 : 0);
    const reducedMotion = useReducedMotion();

    // Entrance animation: runs once on mount
    useEffect(() => {
      if (skipEntrance || reducedMotion) {
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
    }, [index, reducedMotion, skipEntrance]);

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
  /** Called when a station card is tapped — navigates to full-screen StationDetailScreen */
  onStationTap?: (stationId: string, stationName: string) => void;
  /** Triggered when the drag reordering finishes */
  onReorderStations?: (data: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[]) => void;
  simultaneousHandlers?: React.RefObject<any>;
  globalJiggle?: SharedValue<number>;
  skipEntrance?: boolean;
}

export default function DashboardGrid({
  stations,
  isJiggling,
  onExitJiggle,
  onDelete,
  onLongPressCard,
  onScrollEnabledChange,
  onStationTap,
  onReorderStations,
  simultaneousHandlers,
  globalJiggle,
  skipEntrance = false,
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
        <StaggeredEntranceWrapper index={index} skipEntrance={skipEntrance}>
          <DepartureCard
            stationId={item.id}
            stationName={item.name}
            isEditing={isJiggling && !isDragging}
            onDelete={onDelete}
            onLongPress={handleLongPress}
            onCardTap={handleCardTap}
            drag={isJiggling ? drag : undefined}
            index={index}
            isActive={isActive}
            globalJiggle={globalJiggle}
          />
        </StaggeredEntranceWrapper>
      </ScaleDecorator>
    );
  }, [isJiggling, isDragging, stations, onDelete, onLongPressCard, handleCardTap, globalJiggle, skipEntrance]);

  if (!isJiggling) {
    return (
      <View style={styles.container} testID="dashboard-grid">
        {stations.map((item, index) => (
          <StaggeredEntranceWrapper key={item.id} index={index} skipEntrance={skipEntrance}>
            <DepartureCard
              stationId={item.id}
              stationName={item.name}
              isEditing={false}
              onDelete={onDelete}
              onLongPress={onLongPressCard}
              onCardTap={handleCardTap}
              index={index}
              globalJiggle={globalJiggle}
            />
          </StaggeredEntranceWrapper>
        ))}
      </View>
    );
  }

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
