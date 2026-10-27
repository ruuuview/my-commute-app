import React, { useCallback, useEffect, memo } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import { NestableDraggableFlatList, RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { DepartureCard } from './DepartureCard';
import { AppleSwipeableRow } from './AppleSwipeableRow';
import { pressFeedback } from '../utils/pressFeedback';

export interface DashboardGridProps {
  stations: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[];
  onDelete: (id: string) => void;
  /** Called whenever scroll should be enabled/disabled in the parent ScrollView */
  onScrollEnabledChange: (enabled: boolean) => void;
  onStationTap?: (stationId: string, stationName: string) => void;
  onReorderStations?: (data: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[]) => void;
  simultaneousHandlers?: React.RefObject<any>;
  skipEntrance?: boolean;
  onDragActiveChange?: (active: boolean) => void;
}

interface DashboardGridRowProps {
  item: any;
  index: number;
  isActive: boolean;
  drag: () => void;
  totalStations: number;
  onDelete: (id: string) => void;
  onStationTap?: (id: string, name: string) => void;
  onMoveUp?: (index: number) => void;
  onMoveDown?: (index: number) => void;
  onScrollEnabledChange: (enabled: boolean) => void;
}

const DashboardGridRow = memo(function DashboardGridRow({
  item,
  index,
  isActive,
  drag,
  totalStations,
  onDelete,
  onStationTap,
  onMoveUp,
  onMoveDown,
  onScrollEnabledChange,
}: DashboardGridRowProps) {
  const handleDelete = useCallback(() => {
    onDelete(item.id);
  }, [item.id, onDelete]);

  const handleDragWithScrollLock = useCallback(() => {
    onScrollEnabledChange(false);
    drag();
  }, [drag, onScrollEnabledChange]);

  const handleTap = useCallback(
    (stationId: string, stationName: string) => {
      onStationTap?.(stationId, stationName);
    },
    [onStationTap]
  );

  return (
    <AppleSwipeableRow
      onDelete={handleDelete}
      cardRadius={16}
      marginBottom={12}
      disabled={isActive}
      testID={`swipe-departure-${item.id}`}
    >
      <ScaleDecorator activeScale={1.03}>
        <DepartureCard
          stationId={item.id}
          stationName={item.name}
          lines={item.lines}
          onCardTap={handleTap}
          index={index}
          isActive={isActive}
          drag={handleDragWithScrollLock}
          onDelete={onDelete}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          totalStations={totalStations}
        />
      </ScaleDecorator>
    </AppleSwipeableRow>
  );
});

export default function DashboardGrid({
  stations,
  onDelete,
  onScrollEnabledChange,
  onStationTap,
  onReorderStations,
  simultaneousHandlers,
  skipEntrance = false,
  onDragActiveChange,
}: DashboardGridProps) {
  useEffect(() => {
    return () => {
      onScrollEnabledChange(true);
      onDragActiveChange?.(false);
    };
  }, [onScrollEnabledChange, onDragActiveChange]);

  const handleMoveUp = useCallback(
    (currentIndex: number) => {
      if (currentIndex <= 0) return;
      const newData = [...stations];
      const item = newData[currentIndex];
      newData.splice(currentIndex, 1);
      newData.splice(currentIndex - 1, 0, item);
      onReorderStations?.(newData);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      AccessibilityInfo.announceForAccessibility(
        `${item.name} moved up to position ${currentIndex} of ${newData.length}`
      );
    },
    [stations, onReorderStations]
  );

  const handleMoveDown = useCallback(
    (currentIndex: number) => {
      if (currentIndex >= stations.length - 1) return;
      const newData = [...stations];
      const item = newData[currentIndex];
      newData.splice(currentIndex, 1);
      newData.splice(currentIndex + 1, 0, item);
      onReorderStations?.(newData);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      AccessibilityInfo.announceForAccessibility(
        `${item.name} moved down to position ${currentIndex + 2} of ${newData.length}`
      );
    },
    [stations, onReorderStations]
  );

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<any>) => {
      const index = getIndex() ?? stations.findIndex(s => s.id === item.id);
      return (
        <DashboardGridRow
          item={item}
          index={index}
          isActive={isActive}
          drag={drag}
          totalStations={stations.length}
          onDelete={onDelete}
          onStationTap={onStationTap}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onScrollEnabledChange={onScrollEnabledChange}
        />
      );
    },
    [
      stations,
      onDelete,
      onStationTap,
      handleMoveUp,
      handleMoveDown,
      onScrollEnabledChange,
    ]
  );

  if (stations.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} testID="dashboard-grid">
      <NestableDraggableFlatList
        testID="nestable-draggable-stations"
        data={stations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        onDragBegin={() => {
          pressFeedback.cancelAll();
          onScrollEnabledChange(false);
          onDragActiveChange?.(true);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }}
        onRelease={() => {
          onScrollEnabledChange(true);
          onDragActiveChange?.(false);
        }}
        onDragEnd={({ data, from, to }) => {
          onScrollEnabledChange(true);
          onDragActiveChange?.(false);
          onReorderStations?.(data);
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          if (typeof from === 'number' && typeof to === 'number' && data[to]) {
            const cardName = data[to].name || 'Station';
            AccessibilityInfo.announceForAccessibility(
              `${cardName} moved to position ${to + 1} of ${data.length}`
            );
          }
        }}
        onPlaceholderIndexChange={() => {
          Haptics.selectionAsync().catch(() => {});
        }}
        activationDistance={10}
        autoscrollThreshold={80}
        autoscrollSpeed={0}
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
