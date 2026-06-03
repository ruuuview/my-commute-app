// components/DisruptionTicker.tsx — Screen 1: Disruption Marquee Ticker (v4.6)
import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text, useWindowDimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
  cancelAnimation,
  withDelay,
  withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { playSound } from '../utils/sound';
import { LINE_COLORS } from '../constants/lineColors';

let lastDisruptionPlayTime = 0;

interface TflStatusResponse {
  id: string;
  name: string;
  lineStatuses: {
    statusSeverity: number;
    statusSeverityDescription: string;
  }[];
}



interface TickerLineItem {
  id: string;
  name: string;
  color: string;
  status: string;
  isDisrupted: boolean;
}

// ─── Smart Staggered Loading Dot (exactly 3 layout points) ─────────────────────
function LoadingDot({ index }: { index: number }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(0.6, { duration: 600 }),
          withTiming(0.3, { duration: 600 })
        ),
        -1,
        true
      )
    );
    return () => cancelAnimation(opacity);
  }, [index, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.loadingDot, animStyle]} />;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function DisruptionTicker() {
  const { width: systemWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [lineItems, setLineItems] = useState<TickerLineItem[]>([]);

  const [containerWidth, setContainerWidth] = useState(systemWidth);
  const [contentWidth, setContentWidth] = useState(0);

  const translateX = useSharedValue(0);

  useEffect(() => {
    let active = true;

    const fetchStatus = async () => {
      try {
        const res = await fetch(
          'https://api.tfl.gov.uk/Line/Mode/tube,elizabeth-line,dlr,overground/Status'
        );
        if (!res.ok) return;

        const data: TflStatusResponse[] = await res.json();
        if (!active) return;

        const items: TickerLineItem[] = data.map((line) => {
          const statusDesc = line.lineStatuses[0]?.statusSeverityDescription || 'Good Service';
          const isDisrupted = line.lineStatuses.some((status) => status.statusSeverity !== 10);
          return {
            id: line.id,
            name: line.name,
            color: LINE_COLORS[line.id] || '#888',
            status: statusDesc,
            isDisrupted,
          };
        });

        setLineItems(items);
        setLoading(false);

        const hasDisruption = items.some((line) => line.isDisrupted);
        if (hasDisruption) {
          const now = Date.now();
          if (now - lastDisruptionPlayTime > 60000) {
            lastDisruptionPlayTime = now;
            try {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              playSound('disruption');
            } catch (e) {
              console.log('Error playing disruption audio/haptic:', e);
            }
          }
        }
      } catch {
        console.log('Ticker fetch offline');
        if (active) {
          setLineItems([
            { id: 'offline', name: 'OFFLINE', color: 'rgba(255,255,255,0.4)', status: 'STANDBY ACTIVE', isDisrupted: false }
          ]);
          setLoading(false);
        }
      }
    };

    fetchStatus();
    return () => {
      active = false;
    };
  }, []);

  const startScrolling = useCallback((cWidth: number, parentWidth: number) => {
    if (cWidth <= 0 || parentWidth <= 0) return;
    if (reducedMotion) {
      translateX.value = 0;
      return;
    }
    cancelAnimation(translateX);

    translateX.value = parentWidth;

    translateX.value = withRepeat(
      withTiming(-cWidth, {
        duration: (cWidth + parentWidth) * 15,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [reducedMotion, translateX]);

  const handleParentLayout = (e: any) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== containerWidth) {
      setContainerWidth(w);
    }
  };

  const handleContentLayout = (e: any) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== contentWidth) {
      setContentWidth(w);
    }
  };

  useEffect(() => {
    if (contentWidth > 0 && containerWidth > 0) {
      startScrolling(contentWidth, containerWidth);
    }
    return () => cancelAnimation(translateX);
  }, [contentWidth, containerWidth, lineItems, startScrolling]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.container} onLayout={handleParentLayout}>
      {loading ? (
        /* Staggered Placeholder Dots (Exactly 3 layout points) */
        <View style={styles.loadingDotsContainer}>
          {[0, 1, 2].map((i) => (
            <LoadingDot key={i} index={i} />
          ))}
        </View>
      ) : (
        /* Looping Reanimated Marquee */
        <View style={styles.marqueeWrap}>
          <Animated.View style={[styles.scrollRow, animatedStyle]}>
            <Text
              onLayout={handleContentLayout}
              style={styles.tickerText}
              numberOfLines={1}
            >
              {lineItems.map((line, idx) => (
                <Text key={line.id}>
                  {idx > 0 && <Text style={styles.bullet}> · </Text>}
                  <Text
                    style={{
                      color: line.isDisrupted ? (line.id === 'northern' ? '#FFFFFF' : line.color) : 'rgba(255, 255, 255, 0.5)',
                      fontWeight: line.isDisrupted ? 'bold' : 'normal',
                    }}
                  >
                    {line.name.toUpperCase()}: {line.status.toUpperCase()}
                  </Text>
                </Text>
              ))}
            </Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 24,
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  marqueeWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'absolute',
  },
  tickerText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 0.8,
  },
  bullet: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
});
