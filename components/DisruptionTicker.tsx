import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  useReducedMotion,
  cancelAnimation,
} from 'react-native-reanimated';

// ─── TfL Line interface ──────────────────────────────────────────────────────
interface TflStatusResponse {
  id: string;
  name: string;
  lineStatuses: Array<{
    statusSeverity: number;
    statusSeverityDescription: string;
  }>;
}

// ─── Design Tokens ────────────────────────────────────────────────────────────
const TEXT_SECONDARY = 'rgba(255,255,255,0.5)';
const SEARCH_BORDER  = 'rgba(255,255,255,0.12)';

export default function DisruptionTicker() {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [tickerText, setTickerText] = useState(
    'WATCHING ALL 14 LINES IN REAL-TIME · LIVE COMMUTE MONITORING · NO LOAD DELAYS · '
  );
  const [hasDisruptions, setHasDisruptions] = useState(false);

  // Reanimated horizontal scroll position
  const translateX = useSharedValue(0);
  const textWidthRef = useRef<number>(0);
  const [isAnimationStarted, setIsAnimationStarted] = useState(false);

  // 1. Fetch live TfL disruptions on mount
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

        // Parse lines that are NOT running normally (severity !== 10)
        const disrupted = data.filter((line) =>
          line.lineStatuses.some((status) => status.statusSeverity !== 10)
        );

        if (disrupted.length > 0) {
          const textSegments = disrupted.map((line) => {
            const worstStatus = line.lineStatuses[0]?.statusSeverityDescription || 'Delays';
            return `${line.name.toUpperCase()}: ${worstStatus.toUpperCase()}`;
          });
          setTickerText('⚠️ ' + textSegments.join(' · ') + ' · ');
          setHasDisruptions(true);
        } else {
          setTickerText('✅ ALL LINES RUNNING NORMALLY · NO COMMUTE DELAYS · ');
          setHasDisruptions(false);
        }
      } catch (err) {
        // Silent fail: stay on premium static skeleton marquee
        console.log('Ticker fetch ignored (network offline/timeout)');
      }
    };

    // 300ms small delay to let page mount transitions finish smoothly before network fetch
    const t = setTimeout(fetchStatus, 300);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, []);

  // 2. Continuous Marquee Scrolling logic
  const startScrolling = (textWidth: number) => {
    if (reducedMotion) {
      translateX.value = 0;
      return;
    }
    cancelAnimation(translateX);
    translateX.value = 0;

    // Loop marquee continuously from right (0) to left (-textWidth)
    translateX.value = withRepeat(
      withTiming(-textWidth, {
        duration: textWidth * 35, // Speed factor: 35ms per pixel
        easing: Easing.linear,
      }),
      -1, // Infinite repeat
      false // Do not reverse, loop back to start
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

  // Trigger scroll rebuild on text change
  useEffect(() => {
    if (textWidthRef.current > 0) {
      startScrolling(textWidthRef.current);
    }
  }, [tickerText]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Render static marquee text if reducedMotion is active
  if (reducedMotion) {
    return (
      <View style={styles.container}>
        <Text style={[styles.tickerText, hasDisruptions && styles.disruptedText]}>
          {tickerText.substring(0, 100)}...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.marqueeWrap}>
        <Animated.View style={[styles.scrollRow, animatedStyle]}>
          {/* Row 1 */}
          <Text
            onLayout={handleTextLayout}
            style={[styles.tickerText, hasDisruptions && styles.disruptedText]}
          >
            {tickerText}
          </Text>
          {/* Row 2 (duplicates for seamless looping) */}
          {isAnimationStarted && (
            <Text style={[styles.tickerText, hasDisruptions && styles.disruptedText]}>
              {tickerText}
            </Text>
          )}
          {isAnimationStarted && (
            <Text style={[styles.tickerText, hasDisruptions && styles.disruptedText]}>
              {tickerText}
            </Text>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderBottomWidth: 1,
    borderBottomColor: SEARCH_BORDER,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  marqueeWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  scrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tickerText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    color: TEXT_SECONDARY,
    letterSpacing: 1.5,
  },
  disruptedText: {
    color: '#F2A002', // Premium amber disruption warnings
  },
});
