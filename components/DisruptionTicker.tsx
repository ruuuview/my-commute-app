// components/DisruptionTicker.tsx — Screen 1: Disruption Marquee Ticker (v4.6)

import React, { useEffect, useState, useRef } from 'react';
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

interface TflStatusResponse {
  id: string;
  name: string;
  lineStatuses: Array<{
    statusSeverity: number;
    statusSeverityDescription: string;
  }>;
}

const LINE_COLORS: Record<string, string> = {
  bakerloo: '#B36305', central: '#E32017', circle: '#FFD300', district: '#00782A',
  dlr: '#00AFAD', elizabeth: 'rgb(106, 16, 153)', 'hammersmith-city': '#F3A9BB',
  jubilee: '#A0A5A9', metropolitan: '#9B0056', northern: '#FFFFFF', // High-contrast readable white on midnight dark canvas
  overground: '#EE7C0E', piccadilly: '#003688', victoria: '#0098D4',
  'waterloo-city': '#95CDBA',
};

interface TickerLineItem {
  id: string;
  name: string;
  color: string;
  status: string;
  isDisrupted: boolean;
}

// ─── Smart Staggered Loading Dot ─────────────────────────────────────────────
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
  }, [index]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.loadingDot, animStyle]} />;
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function DisruptionTicker() {
  const { width: containerWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [lineItems, setLineItems] = useState<TickerLineItem[]>([]);

  const translateX = useSharedValue(0);
  const textWidthRef = useRef<number>(0);
  const [isAnimationStarted, setIsAnimationStarted] = useState(false);

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
      } catch (err) {
        console.log('Ticker fetch offline');
        // Fallback placeholder data if offline
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

  const startScrolling = (textWidth: number) => {
    if (reducedMotion) {
      translateX.value = 0;
      return;
    }
    cancelAnimation(translateX);
    
    // Start marquee completely offscreen to the right and scroll past container and text width
    translateX.value = containerWidth;

    translateX.value = withRepeat(
      withTiming(-textWidth, {
        duration: (textWidth + containerWidth) * 15, // Responsive 15ms speed per pixel
        easing: Easing.linear,
      }),
      -1,
      false
    );
  };

  const handleTextLayout = (e: any) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== textWidthRef.current) {
      textWidthRef.current = w;
      setIsAnimationStarted(true);
      startScrolling(w);
    }
  };

  useEffect(() => {
    if (textWidthRef.current > 0) {
      startScrolling(textWidthRef.current);
    }
  }, [lineItems, containerWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={styles.container}>
      {loading ? (
        /* Staggered Placeholder Dots */
        <View style={styles.loadingDotsContainer}>
          {[0, 1, 2, 3, 4].map((i) => (
            <LoadingDot key={i} index={i} />
          ))}
        </View>
      ) : (
        /* Looping Reanimated Marquee */
        <View style={styles.marqueeWrap}>
          <Animated.View style={[styles.scrollRow, animatedStyle]}>
            <Text
              onLayout={handleTextLayout}
              style={styles.tickerText}
              numberOfLines={1}
            >
              {lineItems.map((line, idx) => (
                <React.Fragment key={line.id}>
                  {idx > 0 && <Text style={styles.bullet}> · </Text>}
                  <Text
                    style={{
                      color: line.isDisrupted ? line.color : 'rgba(255,255,255,0.5)',
                      fontWeight: line.isDisrupted ? 'bold' : 'normal',
                    }}
                  >
                    {line.name.toUpperCase()}: {line.status.toUpperCase()}
                  </Text>
                </React.Fragment>
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
    color: 'rgba(255,255,255,0.3)',
  },
});
