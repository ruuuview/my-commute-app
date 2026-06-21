import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
  Modal,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { LINE_SHORT_NAMES } from '../data/lineMetadata';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LineStatusModalProps {
  visible: boolean;
  line: {
    id: string;
    name: string;
    color: string;
    status: string;
    reason?: string;
    updated_at?: string;
  } | null;
  onClose: () => void;
}

const PERSONALITY_POOL = [
  "Don't jinx it.",
  "Nothing to see here. Genuinely. Go enjoy that.",
  "All quiet. Suspiciously quiet.",
  "I've got nothing. Which is the whole point.",
  "Boring is the best thing I can be right now.",
];

const getStatusColors = (status: string) => {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('good')) {
    return { bg: 'rgba(48, 209, 88, 0.15)', border: 'rgba(48, 209, 88, 0.25)', text: '#30D158' };
  }
  if (normalized.includes('minor') || normalized.includes('delay')) {
    if (normalized.includes('severe')) {
      return { bg: 'rgba(255, 59, 48, 0.15)', border: 'rgba(255, 59, 48, 0.25)', text: '#FF3B30' };
    }
    return { bg: 'rgba(255, 159, 10, 0.15)', border: 'rgba(255, 159, 10, 0.25)', text: '#FF9F0A' };
  }
  return { bg: 'rgba(255, 59, 48, 0.15)', border: 'rgba(255, 59, 48, 0.25)', text: '#FF3B30' };
};

export function LineStatusModal({ visible, line, onClose }: LineStatusModalProps) {
  const [shouldRender, setShouldRender] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(320);
  const [randomCopy, setRandomCopy] = useState('');

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible && line) {
      const idx = Math.floor(Math.random() * PERSONALITY_POOL.length);
      setRandomCopy(PERSONALITY_POOL[idx]);
      setShouldRender(true);
    } else if (!visible) {
      backdropOpacity.value = withTiming(0, { duration: 300 });
      translateY.value = withTiming(sheetHeight, {
        duration: 400,
        easing: Easing.bezier(0.25, 1.0, 0.5, 1.0),
      }, (finished) => {
        if (finished) {
          runOnJS(setShouldRender)(false);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, line]);

  const onLayout = (event: any) => {
    const h = event.nativeEvent.layout.height;
    setSheetHeight(h);
    if (visible) {
      translateY.value = withTiming(0, {
        duration: 600,
        easing: Easing.bezier(0.25, 1.0, 0.5, 1.0),
      });
      backdropOpacity.value = withTiming(1, { duration: 400 });
    }
  };

  const onGestureEvent = (event: any) => {
    if (event.nativeEvent.translationY > 0) {
      translateY.value = event.nativeEvent.translationY;
    }
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      const { translationY, velocityY } = event.nativeEvent;
      if (translationY > 100 || velocityY > 500) {
        backdropOpacity.value = withTiming(0, { duration: 300 });
        translateY.value = withTiming(sheetHeight, {
          duration: 400,
          easing: Easing.bezier(0.25, 1.0, 0.5, 1.0),
        }, (finished) => {
          if (finished) {
            runOnJS(onClose)();
          }
        });
      } else {
        translateY.value = withTiming(0, {
          duration: 300,
          easing: Easing.out(Easing.ease),
        });
      }
    }
  };

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const isDisrupted = useMemo(() => {
    if (!line) return false;
    const normalized = line.status.toLowerCase();
    return !normalized.includes('good') && !normalized.includes('normal');
  }, [line]);

  const statusColors = useMemo(() => {
    return getStatusColors(line?.status || '');
  }, [line?.status]);

  const dataFreshness = useMemo(() => {
    if (!line || !line.updated_at) {
      return { badgeColor: '#6B7280', label: 'Feed delayed', timeText: 'No timestamp' };
    }
    const updatedTime = new Date(line.updated_at).getTime();
    const ageMins = Math.max(0, Math.floor((Date.now() - updatedTime) / 60000));

    if (ageMins < 5) {
      return {
        badgeColor: '#D14343',
        label: 'LIVE',
        timeText: ageMins === 0 ? 'just now' : `${ageMins}m ago`,
      };
    } else if (ageMins <= 10) {
      return {
        badgeColor: '#FF9F0A',
        label: 'Updating...',
        timeText: `${ageMins}m ago`,
      };
    } else {
      return {
        badgeColor: '#6B7280',
        label: 'Feed delayed',
        timeText: `${ageMins}m ago`,
      };
    }
  }, [line]);

  if (!shouldRender || !line) return null;

  return (
    <Modal
      visible={shouldRender}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Dimmed Backdrop */}
        <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        {/* Bottom Sheet Content */}
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View
            style={[styles.sheet, animatedSheetStyle, { maxHeight: SCREEN_HEIGHT * 0.65 }]}
            onLayout={onLayout}
          >
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
            
            {/* Top Drag Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Hero Row */}
            <View style={styles.heroRow}>
              <View style={[styles.identityChip, { backgroundColor: line.color }]} />
              <Text style={styles.lineName} numberOfLines={1}>
                {LINE_SHORT_NAMES[line.id] || line.name}
              </Text>
              <View style={styles.spacer} />
              <View style={[styles.statusPill, { backgroundColor: statusColors.bg, borderColor: statusColors.border }]}>
                <Text style={[styles.statusPillText, { color: statusColors.text }]}>
                  {line.status}
                </Text>
              </View>
            </View>

            {/* Content Body */}
            <View style={styles.bodyContainer}>
              {isDisrupted ? (
                <View style={styles.disruptedBody}>
                  <ScrollView
                    style={styles.reasonScroll}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    <Text style={styles.reasonText}>
                      {line.reason || `${line.name}: Service is currently disrupted.`}
                    </Text>
                  </ScrollView>

                  {/* Trust Footer */}
                  <View style={styles.footer}>
                    <View style={[styles.trustBadge, { backgroundColor: dataFreshness.badgeColor }]}>
                      <Text style={styles.trustBadgeLabel}>{dataFreshness.label}</Text>
                    </View>
                    <Text style={styles.relativeTimeText}>{dataFreshness.timeText}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.goodServiceBody}>
                  <Text style={styles.goodServiceText}>{randomCopy}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        </PanGestureHandler>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Platform.OS === 'android' ? 'rgba(20, 20, 28, 0.95)' : 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderBottomWidth: 0,
    overflow: 'hidden',
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  handleContainer: {
    width: '100%',
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  identityChip: {
    width: 4,
    height: 48,
    borderRadius: 2,
    marginRight: 14,
  },
  lineName: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
    flex: 1,
    marginRight: 12,
  },
  spacer: {
    flex: 0,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  bodyContainer: {
    paddingHorizontal: 20,
  },
  disruptedBody: {
    width: '100%',
  },
  reasonScroll: {
    maxHeight: SCREEN_HEIGHT * 0.35,
    marginBottom: 20,
  },
  reasonText: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 22,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  trustBadge: {
    borderRadius: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginRight: 8,
  },
  trustBadgeLabel: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 10,
    color: '#FFFFFF',
  },
  relativeTimeText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  goodServiceBody: {
    paddingVertical: 12,
    marginBottom: 12,
  },
  goodServiceText: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 22,
  },
});
