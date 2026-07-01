import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserPreferencesStore } from '../store/userPreferencesStore';
import { LineCard } from './LineCard';
import { LINE_COLORS } from '../constants/lineColors';
import { SCREEN_PADDING, COLUMN_GAP, ONBOARDING_CARD_HEIGHT } from '../constants/layout';



const MAX_LINES = 5;

const SHEET_HEIGHT_RATIO = 0.78;

const OVERGROUND_BRANCH_IDS = ['liberty', 'lioness', 'mildmay', 'suffragette', 'weaver', 'windrush'];

const TFL_LINES = [
  { id: 'bakerloo',         name: 'Bakerloo',           color: LINE_COLORS.bakerloo },
  { id: 'central',          name: 'Central',            color: LINE_COLORS.central },
  { id: 'circle',           name: 'Circle',             color: LINE_COLORS.circle },
  { id: 'district',         name: 'District',           color: LINE_COLORS.district },
  { id: 'dlr',              name: 'DLR',                color: LINE_COLORS.dlr },
  { id: 'elizabeth',        name: 'Elizabeth',          color: LINE_COLORS.elizabeth },
  { id: 'hammersmith-city', name: 'Hammersmith & City', color: LINE_COLORS['hammersmith-city'] },
  { id: 'jubilee',          name: 'Jubilee',            color: LINE_COLORS.jubilee },
  { id: 'metropolitan',     name: 'Metropolitan',       color: LINE_COLORS.metropolitan },
  { id: 'northern',         name: 'Northern',           color: LINE_COLORS.northern },
  { id: 'overground',       name: 'Overground',         color: LINE_COLORS.overground },
  { id: 'piccadilly',       name: 'Piccadilly',         color: LINE_COLORS.piccadilly },
  { id: 'victoria',         name: 'Victoria',           color: LINE_COLORS.victoria },
  { id: 'waterloo-city',    name: 'Waterloo & City',    color: LINE_COLORS['waterloo-city'] },
];

type StatusType = 'good' | 'minor' | 'severe' | 'suspended' | 'closure' | 'loading' | 'error';

// Aligned with TfL Unified API Severity Specifications
const getLineStatus = (severity: number, desc: string) => {
  const d = desc.toLowerCase();
  if (severity === 10 || severity === 18)       return { statusType: 'good' as const,      label: desc || 'Good service' };
  if (severity === 9 || severity === 14 || severity === 19) return { statusType: 'minor' as const, label: desc || 'Minor delays' };
  if (severity === 6 || severity === 7 || severity === 8 || severity === 17) return { statusType: 'severe' as const, label: desc || 'Severe delays' };
  if (severity === 0 || severity === 1 || severity === 2 || severity === 3 || severity === 4 || severity === 5 || severity === 11 || severity === 16 || severity === 20) return { statusType: 'suspended' as const, label: desc || 'Suspended' };
  
  if (d.includes('closure') || d.includes('closed') || d.includes('suspend')) return { statusType: 'suspended' as const, label: desc };
  if (d.includes('severe')) return { statusType: 'severe' as const, label: desc };
  if (d.includes('delay')) return { statusType: 'minor' as const, label: desc };
  return { statusType: 'minor' as const, label: desc || 'Minor delays' };
};

interface ManageLinesModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ManageLinesModal({ visible, onClose }: ManageLinesModalProps) {
  const insets = useSafeAreaInsets();
  const { width, height: screenHeight } = useWindowDimensions();

  const selectedLines = useUserPreferencesStore(s => s.selectedLines);
  const toggleLine = useUserPreferencesStore(s => s.toggleLine);

  const [apiStatuses, setApiStatuses] = useState<Record<string, { severity: number; description: string }>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [maxLinesToast, setMaxLinesToast] = useState(false);

  const maxLinesShakeTranslationX = useSharedValue(0);

  const sheetHeight = screenHeight * SHEET_HEIGHT_RATIO;
  const cardWidth = (width - SCREEN_PADDING * 2 - COLUMN_GAP) / 2;

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoadingStatuses(true);
    const fetchStatuses = async () => {
      try {
        const res = await fetch('https://api.tfl.gov.uk/Line/Mode/tube,dlr,overground,elizabeth-line/Status');
        if (!res.ok) throw new Error('Failed to fetch TfL status');
        const data = await res.json();
        if (!active) return;

        const mapped: Record<string, { severity: number; description: string }> = {};
        data.forEach((line: any) => {
          const sev = line.lineStatuses?.[0]?.statusSeverity ?? 10;
          const desc = line.lineStatuses?.[0]?.statusSeverityDescription ?? 'Good Service';
          mapped[line.id] = { severity: sev, description: desc };
        });
        setApiStatuses(mapped);
        setLoadingStatuses(false);
      } catch (err) {
        console.log('Error fetching manage lines statuses:', err);
        if (active) {
          setLoadingStatuses(false);
        }
      }
    };
    fetchStatuses();
    return () => {
      active = false;
    };
  }, [visible]);

  // Ported from app/onboarding/lines.tsx
  const triggerMaxLinesShake = useCallback(() => {
    maxLinesShakeTranslationX.value = withSequence(
      withTiming(-8, { duration: 60, easing: Easing.linear }),
      withTiming(8, { duration: 60, easing: Easing.linear }),
      withTiming(-6, { duration: 60, easing: Easing.linear }),
      withTiming(6, { duration: 60, easing: Easing.linear }),
      withTiming(0, { duration: 60, easing: Easing.linear })
    );
  }, [maxLinesShakeTranslationX]);

  const maxLinesShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: maxLinesShakeTranslationX.value }],
  }));

  const resolveLineStatus = (lineId: string): { statusType: StatusType; statusLabel: string } => {
    let statusType: StatusType = 'loading';
    let statusLabel = 'Loading status...';

    if (!loadingStatuses) {
      if (lineId === 'overground') {
        let worstSeverity = 10;
        let worstDescription = 'Good Service';
        let foundAny = false;

        OVERGROUND_BRANCH_IDS.forEach(branchId => {
          if (apiStatuses[branchId]) {
            foundAny = true;
            const statusData = apiStatuses[branchId];
            const getRank = (s: number) => {
              if (s === 10 || s === 18) return 0;
              if (s === 9 || s === 14 || s === 19) return 1;
              if (s === 6 || s === 7 || s === 8 || s === 17) return 2;
              return 3;
            };
            if (getRank(statusData.severity) > getRank(worstSeverity)) {
              worstSeverity = statusData.severity;
              worstDescription = statusData.description;
            }
          }
        });

        if (foundAny) {
          const resolved = getLineStatus(worstSeverity, worstDescription);
          statusType = resolved.statusType;
          statusLabel = resolved.label;
        } else {
          statusType = 'error';
          statusLabel = 'Status unknown';
        }
      } else if (apiStatuses[lineId]) {
        const statusData = apiStatuses[lineId];
        const resolved = getLineStatus(statusData.severity, statusData.description);
        statusType = resolved.statusType;
        statusLabel = resolved.label;
      } else {
        statusType = 'error';
        statusLabel = 'Status unknown';
      }
    }
    return { statusType, statusLabel };
  };

  const handleToggleLine = useCallback(
    async (id: string) => {
      const isSelected = selectedLines.includes(id);
      if (!isSelected && selectedLines.length >= MAX_LINES) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        triggerMaxLinesShake();
        setMaxLinesToast(true);
        setTimeout(() => setMaxLinesToast(false), 1500);
        return;
      }
      // Saves immediately — store persists via MMKV
      toggleLine(id);
    },
    [selectedLines, toggleLine, triggerMaxLinesShake]
  );

  const renderItem = ({ item }: { item: typeof TFL_LINES[0] }) => {
    const isSelected = selectedLines.includes(item.id);
    const { statusType, statusLabel } = resolveLineStatus(item.id);
    return (
      <View style={{ width: cardWidth, height: ONBOARDING_CARD_HEIGHT }}>
        <LineCard
          line={item}
          selected={isSelected}
          onPress={() => handleToggleLine(item.id)}
          statusType={statusType}
          statusLabel={statusLabel}
          cardHeight={ONBOARDING_CARD_HEIGHT}
        />
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      presentationStyle="overFullScreen"
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Transparent dismissible backdrop — covers the area above the sheet */}
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss manage lines"
        />

        {/* Bottom sheet — 78% of screen height */}
        <BlurView
          intensity={80}
          tint="dark"
          style={[styles.sheet, { height: sheetHeight }]}
        >
          {/* Drag handle */}
          <View style={styles.dragHandleWrap}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              Manage lines
              {selectedLines.length > 0 && (
                <Text style={styles.counterInline}> · {selectedLines.length} of {MAX_LINES}</Text>
              )}
            </Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.donePill, pressed && { opacity: 0.65 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Done, close manage lines"
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>

          {/* Max lines toast */}
          {maxLinesToast && (
            <Animated.View style={[styles.maxLinesToast, maxLinesShakeStyle]}>
              <Text style={styles.maxLinesToastText}>Maximum 5 lines</Text>
            </Animated.View>
          )}

          {/* 2-column line grid */}
          <FlatList
            data={TFL_LINES}
            renderItem={renderItem}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={{ gap: COLUMN_GAP }}
            ItemSeparatorComponent={() => <View style={{ height: COLUMN_GAP }} />}
            initialNumToRender={14}
            scrollEnabled={true}
            contentContainerStyle={[
              styles.listContainer,
              { paddingBottom: insets.bottom + 24 },
            ]}
            showsVerticalScrollIndicator={false}
          />
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: Platform.OS === 'android' ? '#0E0E14' : 'rgba(255, 255, 255, 0.08)',
  },
  dragHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_PADDING,
    paddingBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.8,
  },
  counterInline: {
    fontSize: 22,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255, 255, 255, 0.6)',
    letterSpacing: -0.8,
  },
  // Frosted tint pill — matches dashboard Edit button spec
  donePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  doneText: {
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: 'rgba(255, 255, 255, 0.80)',
  },
  listContainer: {
    paddingHorizontal: SCREEN_PADDING,
    paddingTop: 4,
  },
  maxLinesToast: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    marginHorizontal: SCREEN_PADDING,
    alignSelf: 'flex-start',
  },
  maxLinesToastText: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: '#DC2626',
  },
});
