import React, { memo, useCallback, useEffect } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import { NestableDraggableFlatList, RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import DepartureCard from './DepartureCard';
import SwipeableRow from './SwipeableRow';
import { pressFeedback } from '../utils/pressFeedback';

export interface DashboardGridProps {
  stations: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[];
  onDelete: (id: string) => void;
  onLongPressCard?: () => void;
  onScrollEnabledChange: (enabled: boolean) => void;
  onStationTap?: (stationId: string, stationName: string) => void;
  onReorderStations?: (data: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[]) => void;
  simultaneousHandlers?: React.RefObject<any>;
  skipEntrance?: boolean;
}

export default function DashboardGrid({
  stations,
  onDelete,
  onLongPressCard,
  onScrollEnabledChange,
  onStationTap,
  onReorderStations,
  simultaneousHandlers,
}: DashboardGridProps) {
  useEffect(() => {
    return () => {
      onScrollEnabledChange(true);
    };
  }, [onScrollEnabledChange]);

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

  const handleCardTap = useCallback(
    (stationId: string, stationName: string) => {
      onStationTap?.(stationId, stationName);
    },
    [onStationTap]
  );

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<any>) => {
      const index = getIndex() ?? stations.findIndex(s => s.id === item.id);

      const handleDragWithScrollLock = () => {
        onScrollEnabledChange(false);
        drag();
      };

      return (
        <ScaleDecorator activeScale={1.03}>
          <SwipeableRow
            id={item.id}
            name={item.name}
            onDelete={onDelete}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
            isDragging={isActive}
            borderRadius={16}
            marginBottom={12}
            testID={`swipeable-station-${item.id}`}
          >
            <DepartureCard
              stationId={item.id}
              stationName={item.name}
              onLongPress={onLongPressCard}
              onCardTap={handleCardTap}
              index={index}
              isActive={isActive}
              drag={handleDragWithScrollLock}
              totalStations={stations.length}
            />
          </SwipeableRow>
        </ScaleDecorator>
      );
    },
    [
      stations,
      onDelete,
      handleMoveUp,
      handleMoveDown,
      onLongPressCard,
      handleCardTap,
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
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }}
        onRelease={() => {
          onScrollEnabledChange(true);
        }}
        onDragEnd={({ data, from, to }) => {
          onScrollEnabledChange(true);
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
