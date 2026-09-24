import React, { memo, useCallback, useEffect } from 'react';
import { View, StyleSheet, AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { NestableDraggableFlatList, RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import DepartureCard from './DepartureCard';
import { AppleSwipeableRow } from './AppleSwipeableRow';
import { useLiveReducedMotion } from '../hooks/useJiggle';
import { pressFeedback } from '../utils/pressFeedback';

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
    const reducedMotion = useLiveReducedMotion();

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
    }, []);

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
  onDelete: (id: string) => void;
  /** Called whenever scroll should be enabled/disabled in the parent ScrollView */
  onScrollEnabledChange: (enabled: boolean) => void;
  /** Called when a station card is tapped — navigates to full-screen StationDetailScreen */
  onStationTap?: (stationId: string, stationName: string) => void;
  /** Triggered when the drag reordering finishes */
  onReorderStations?: (data: { id: string; name: string; lines: string[]; zone: number; role: 'home' | 'work' | 'other' }[]) => void;
  simultaneousHandlers?: React.RefObject<any>;
  skipEntrance?: boolean;
}

export default function DashboardGrid({
  stations,
  onDelete,
  onScrollEnabledChange,
  onStationTap,
  onReorderStations,
  simultaneousHandlers,
  skipEntrance = false,
}: DashboardGridProps) {
  // ── Unmount safety cleanup: unconditionally unlock scroll ─────────
  useEffect(() => {
    return () => {
      onScrollEnabledChange(true);
    };
  }, [onScrollEnabledChange]);

  // ── VoiceOver / Accessibility non-gesture reorder handlers ────────
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

  // ── Card tap handler: navigate to full-screen StationDetailScreen ─
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
        <StaggeredEntranceWrapper index={index} skipEntrance={skipEntrance}>
          <AppleSwipeableRow
            onDelete={() => onDelete(item.id)}
            cardRadius={16}
            marginBottom={12}
            disabled={isActive}
            testID={`swipe-departure-${item.id}`}
          >
            <ScaleDecorator activeScale={1.03}>
              <DepartureCard
                stationId={item.id}
                stationName={item.name}
                onCardTap={handleCardTap}
                index={index}
                isActive={isActive}
                drag={handleDragWithScrollLock}
                onDelete={onDelete}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                totalStations={stations.length}
              />
            </ScaleDecorator>
          </AppleSwipeableRow>
        </StaggeredEntranceWrapper>
      );
    },
    [
      stations,
      onDelete,
      handleMoveUp,
      handleMoveDown,
      handleCardTap,
      onScrollEnabledChange,
      skipEntrance,
    ]
  );

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
