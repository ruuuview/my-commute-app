/**
 * MY COMMUTE — Jiggle Edit Mode
 * Wiggling cards + red delete badges + drag-to-reorder
 * Gesture-handler + Reanimated implementation
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MAX_ITEMS = 5;
const CARD_HEIGHT = 72;
const CARD_MARGIN = 12;
const ITEM_HEIGHT = CARD_HEIGHT + CARD_MARGIN;

// ─── Types ───────────────────────────────────────────────────────────────────
interface EditableItem {
  id: string;
  label: string;
}

interface JiggleCardProps {
  item: EditableItem;
  index: number;
  isEditMode: boolean;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, newIndex: number) => void;
  totalItems: number;
  renderContent: (item: EditableItem) => React.ReactNode;
}

// ─── JiggleCard ──────────────────────────────────────────────────────────────
export const JiggleCard = ({
  item,
  index,
  isEditMode,
  onDelete,
  onDragStart,
  onDragEnd,
  totalItems,
  renderContent,
}: JiggleCardProps) => {
  const rotation  = useSharedValue(0);
  const scale     = useSharedValue(1);
  const translateY = useSharedValue(0);
  const zIndex    = useSharedValue(0);
  const isDragging = useSharedValue(false);

  // Jiggle animation — each card gets a slightly different phase to look natural
  useEffect(() => {
    if (isEditMode) {
      const phase = (index % 2 === 0) ? 0 : 0.5;
      // Slight delay before starting so they don't all sync
      const delay = index * 40;

      setTimeout(() => {
        rotation.value = withRepeat(
          withSequence(
            withTiming(-1.8, { duration: 100, easing: Easing.linear }),
            withTiming( 1.8, { duration: 100, easing: Easing.linear }),
          ),
          -1,
          true,
        );
      }, delay);
    } else {
      rotation.value = withTiming(0, { duration: 150 });
    }
  }, [isEditMode, index]);

  // Drag gesture — modern Gesture.Pan() API (replaces deprecated useAnimatedGestureHandler)
  const startY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .enabled(isEditMode)
    .onBegin(() => {
      startY.value = translateY.value;
      isDragging.value = true;
      scale.value   = withSpring(1.04, { damping: 15, stiffness: 200 });
      zIndex.value  = 100;
      rotation.value = 0; // Pause jiggle during drag
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Heavy);
      runOnJS(onDragStart)(item.id);
    })
    .onUpdate((event) => {
      translateY.value = startY.value + event.translationY;
    })
    .onEnd((event) => {
      isDragging.value = false;
      scale.value  = withSpring(1.0, { damping: 15, stiffness: 200 });
      zIndex.value = 0;

      const newIndex = Math.max(
        0,
        Math.min(
          totalItems - 1,
          Math.round(index + event.translationY / ITEM_HEIGHT),
        ),
      );

      translateY.value = withSpring(0, { damping: 20, stiffness: 300 });

      // Resume jiggle after drop
      const delay = index * 40;
      runOnJS(setTimeout)(() => {
        rotation.value = withRepeat(
          withSequence(
            withTiming(-1.8, { duration: 100, easing: Easing.linear }),
            withTiming( 1.8, { duration: 100, easing: Easing.linear }),
          ),
          -1,
          true,
        );
      }, delay);

      runOnJS(Haptics.notificationAsync)(Haptics.NotificationFeedbackType.Success);
      runOnJS(onDragEnd)(item.id, newIndex);
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    zIndex: zIndex.value,
  }));

  const deleteBadgeScale = useSharedValue(0);
  useEffect(() => {
    deleteBadgeScale.value = isEditMode
      ? withSpring(1, { damping: 12, stiffness: 200 })
      : withTiming(0, { duration: 100 });
  }, [isEditMode]);

  const deleteBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: deleteBadgeScale.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.cardWrapper, cardStyle]}>
        {/* Red delete badge — top-left corner */}
        <Animated.View style={[styles.deleteBadgeContainer, deleteBadgeStyle]}>
          <TouchableOpacity
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
              onDelete(item.id);
            }}
            style={styles.deleteBadge}
            hitSlop={{ top: 10, left: 10, bottom: 10, right: 10 }}
            accessibilityLabel={`Remove ${item.label}`}
            accessibilityRole="button"
          >
            <Text style={styles.deleteBadgeIcon}>−</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Drag handle — right side, visible in edit mode */}
        {isEditMode && (
          <View style={styles.dragHandle}>
            <View style={styles.dragLine} />
            <View style={styles.dragLine} />
            <View style={styles.dragLine} />
          </View>
        )}

        {/* Card content */}
        <View style={[styles.cardContent, isEditMode && { paddingRight: 40 }]}>
          {renderContent(item)}
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

// ─── EditableList ─────────────────────────────────────────────────────────────
interface EditableListProps {
  items: EditableItem[];
  onReorder: (newOrder: EditableItem[]) => void;
  onDelete: (id: string) => void;
  renderContent: (item: EditableItem) => React.ReactNode;
  onAddPress: () => void;
  addLabel: string;
  listLabel: string;
}

export const EditableList = ({
  items,
  onReorder,
  onDelete,
  renderContent,
  onAddPress,
  addLabel,
  listLabel,
}: EditableListProps) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [localItems, setLocalItems] = useState(items);

  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const atLimit = localItems.length >= MAX_ITEMS;

  const toggleEditMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsEditMode(e => !e);
  };

  const handleDelete = useCallback((id: string) => {
    const next = localItems.filter(i => i.id !== id);
    setLocalItems(next);
    onDelete(id);

    // Exit edit mode if all items gone
    if (next.length === 0) setIsEditMode(false);
  }, [localItems, onDelete]);

  const handleDragStart = useCallback((id: string) => {}, []);

  const handleDragEnd = useCallback((id: string, newIndex: number) => {
    const currentIndex = localItems.findIndex(i => i.id === id);
    if (currentIndex === newIndex) return;

    const next = [...localItems];
    const [moved] = next.splice(currentIndex, 1);
    next.splice(newIndex, 0, moved);

    setLocalItems(next);
    onReorder(next);
  }, [localItems, onReorder]);

  return (
    <View>
      {/* Section header with Edit button */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>{listLabel}</Text>
        {localItems.length > 0 && (
          <TouchableOpacity
            onPress={toggleEditMode}
            style={styles.editButton}
            accessibilityLabel={isEditMode ? 'Done editing' : 'Edit list'}
            accessibilityRole="button"
          >
            <Text style={styles.editButtonText}>
              {isEditMode ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Item list */}
      {localItems.map((item, index) => (
        <JiggleCard
          key={item.id}
          item={item}
          index={index}
          isEditMode={isEditMode}
          onDelete={handleDelete}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          totalItems={localItems.length}
          renderContent={renderContent}
        />
      ))}

      {/* + Add button — hidden at 5-item limit */}
      {!atLimit && (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onAddPress();
          }}
          style={styles.addButton}
          accessibilityLabel={addLabel}
          accessibilityRole="button"
        >
          <Text style={styles.addButtonText}>{addLabel}</Text>
        </TouchableOpacity>
      )}

      {/* At-limit hint */}
      {atLimit && (
        <Text style={styles.limitHint}>
          Maximum {MAX_ITEMS} items. Remove one to add another.
        </Text>
      )}
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 10,
  },
  sectionLabel: {
    fontFamily: 'SpaceGrotesk-Bold',
    fontSize: 12,
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
  },
  editButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.18)',
    minHeight: 44,
    justifyContent: 'center',
  },
  editButtonText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '500',
  },

  cardWrapper: {
    marginBottom: CARD_MARGIN,
    position: 'relative',
  },
  deleteBadgeContainer: {
    position: 'absolute',
    top: -8,
    left: -8,
    zIndex: 10,
  },
  deleteBadge: {
    width: 24,
height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0A0A0A',
  },
  deleteBadgeIcon: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '700',
    lineHeight: 18,
    marginTop: -1,
  },
  dragHandle: {
    position: 'absolute',
    right: 16,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    gap: 3,
    zIndex: 5,
  },
  dragLine: {
    width: 18,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
  },
  cardContent: {
    // inherits card styling from parent component
  },

  addButton: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: CARD_MARGIN,
    minHeight: 44,
    justifyContent: 'center',
  },
  addButtonText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '500',
  },
  limitHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginBottom: 12,
  },
});
