// app/onboarding/lines.tsx — Screen 1: Line Selection (v4.6)

import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, useWindowDimensions, Image, Pressable,
} from 'react-native';
import Animated, {
  FadeInDown, FadeIn, useSharedValue, useAnimatedStyle,
  withTiming, Easing, runOnJS, interpolateColor, withRepeat, withSequence, withSpring
} from 'react-native-reanimated';

import * as SplashScreen from 'expo-splash-screen';
import * as Haptics from 'expo-haptics';
import {
  useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_600SemiBold, SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useOnboardingStore } from '../../store/onboardingStore';
import ProgressDots from '../../components/ProgressDots';
import { LinearGradient } from 'expo-linear-gradient';
import { useTapSound } from '../../hooks/useTapSound';
import { playSound } from '../../utils/sound';
import { usePressAnimation } from '../../hooks/usePressAnimation';
import { useLineData } from '../../hooks/useLineData';
import { useLineDataStore } from '../../store/lineDataStore';


import { MASTER_BACKGROUND_GRADIENT, DASHBOARD_OVERLAY_GRADIENT } from '../../theme/colors';



// ─── 14 TfL lines (§1.3 + DLR) ──────────────────────────────────────────────
const TFL_LINES = [
  { id: 'bakerloo',         name: 'Bakerloo',           color: '#B36305' },
  { id: 'central',          name: 'Central',            color: '#E32017' },
  { id: 'circle',           name: 'Circle',             color: '#FFD300' },
  { id: 'district',         name: 'District',           color: '#00782A' },
  { id: 'dlr',              name: 'DLR',                color: '#00AFAD' },
  { id: 'elizabeth',        name: 'Elizabeth',          color: '#6950A1' },
  { id: 'hammersmith-city', name: 'Hammersmith & City', color: '#F3A9BB' },
  { id: 'jubilee',          name: 'Jubilee',            color: '#A0A5A9' },
  { id: 'metropolitan',     name: 'Metropolitan',       color: '#9B0056' },
  { id: 'northern',         name: 'Northern',           color: '#1A1A1A' },
  { id: 'overground',       name: 'Overground',         color: '#EE7C0E' },
  { id: 'piccadilly',       name: 'Piccadilly',         color: '#003688' },
  { id: 'victoria',         name: 'Victoria',           color: '#0098D4' },
  { id: 'waterloo-city',    name: 'Waterloo & City',    color: '#95CDBA' },
];

const hexToRgba = (hex: string, alpha: number) => {
  if (hex.startsWith('rgba')) return hex;
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const MAX     = 5;
const H_PAD   = 16;
const GAP     = 10;

const Pill = React.memo(function Pill({
  line,
  isSelected,
  isAtLimit,
  onToggle,
  pillWidth,
  delay,
  playSelect,
  playDeselect,
  statusSeverity,
  isFetching,
}: {
  line: typeof TFL_LINES[number];
  isSelected: boolean;
  isAtLimit: boolean;
  onToggle: (id: string) => void;
  pillWidth: number;
  delay: number;
  playSelect: () => void;
  playDeselect: () => void;
  statusSeverity?: number;
  isFetching?: boolean;
}) {
  const disabled = !isSelected && isAtLimit;

  const onPress = useCallback(async () => {
    if (!isSelected && isAtLimit) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    if (isSelected) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); // Soft deep Light thud on deselect
      playDeselect();
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); // Assertive Medium thud on select
      playSelect();
    }

    onToggle(line.id);
  }, [isSelected, isAtLimit, line.id, onToggle, playSelect, playDeselect]);

  // Hook handles select/deselect scale spring properties perfectly per task requirements
  const configKey = isSelected ? 'line_deselect' : 'line_select';
  const { onPressIn, onPressOut, animatedStyle } = usePressAnimation(configKey, disabled);

  const isNorthern = line.id === 'northern';
  const bgColor = isSelected
    ? (isNorthern ? '#1A1A1A' : hexToRgba(line.color, 0.18))
    : 'rgba(255, 255, 255, 0.07)';

  // Determine base border color — line brand color only, no status severity routing
  const baseBorderColor = isSelected
    ? (isNorthern 
        ? 'rgba(255, 255, 255, 0.35)' 
        : hexToRgba(line.color, 0.7))
    : 'rgba(255, 255, 255, 0.10)';

  const borderWidth = isSelected ? 1.5 : 1;

  // Accent color — always line brand color, no status severity routing
  const accentColor = line.color;

  const accentOpacity = isSelected ? 0.9 : 0.4;

  const reducedMotion = false; // Force false to override system-level 'Reduce Motion' and ensure click springs execute!

  // Shimmer Border Animation
  const shimmerProgress = useSharedValue(0);
  React.useEffect(() => {
    if (isFetching && isSelected) {
      shimmerProgress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.linear }),
          withTiming(0, { duration: 600, easing: Easing.linear })
        ),
        -1,
        true
      );
    } else {
      shimmerProgress.value = 0;
    }
  }, [isFetching, isSelected, shimmerProgress]);

  const borderAnimatedStyle = useAnimatedStyle(() => {
    if (shimmerProgress.value > 0) {
      return {
        borderColor: interpolateColor(
          shimmerProgress.value,
          [0, 1],
          [baseBorderColor, 'rgba(255, 255, 255, 0.75)']
        ),
      };
    }
    return {
      borderColor: baseBorderColor,
    };
  });
  // Radial Glow Bloom Animation
  const glowProgress = useSharedValue(isSelected ? 1 : 0);
  React.useEffect(() => {
    if (reducedMotion) {
      glowProgress.value = isSelected ? 1 : 0;
      return;
    }
    glowProgress.value = withTiming(isSelected ? 1 : 0, {
      duration: 350,
      easing: Easing.out(Easing.quad),
    });
  }, [isSelected, reducedMotion, glowProgress]);

  const glowStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: 0.8 + 0.2 * glowProgress.value }],
      opacity: 0.12 * glowProgress.value,
    };
  });

  const selectedShadowStyle = isSelected ? {
    shadowColor: line.color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 4,
  } : {};

  return (
    <Animated.View
      entering={reducedMotion ? FadeIn.duration(80) : FadeInDown.delay(delay).springify().damping(15).stiffness(150)}
      style={[{ width: pillWidth }, selectedShadowStyle]}
      importantForAccessibility="yes"
    >
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`${line.name} line`}
        style={{
          borderRadius: 16,
          overflow: 'visible',
          opacity: 1,
        }}
      >
        <Animated.View
          style={[
            animatedStyle,
            borderAnimatedStyle,
            {
              borderRadius: 16,
              overflow: 'hidden',
              borderWidth: borderWidth,
            }
          ]}
        >
          {/* Radial Glow Bloom Backing */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              {
                borderRadius: 16,
                backgroundColor: isNorthern ? '#FFFFFF' : line.color,
              },
              glowStyle,
            ]}
          />
          <View
            style={[
              styles.pillBlur,
              {
                backgroundColor: bgColor,
              },
            ]}
          >
            {/* Left Brand Color Accent */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: '20%',
                width: 3,
                height: '60%',
                backgroundColor: accentColor,
                borderRadius: 2,
                opacity: accentOpacity,
              }}
            />


            <Text
              style={styles.pillText}
              numberOfLines={1}
              allowFontScaling
              maxFontSizeMultiplier={1.3}
              adjustsFontSizeToFit={true}
              minimumFontScale={0.85}
            >
              {line.name}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
});

const getElapsedTime = (timestamp: number) => {
  if (!timestamp) return 'Never';
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
};

const getStatusDetails = (severity: number, statusText: string) => {
  if (severity === 5) {
    return {
      bg: 'rgba(242,160,2,0.15)',
      border: 'rgba(242,160,2,0.4)',
      text: '#F2A002',
      label: 'Minor delays',
    };
  } else if (severity === 9 || severity === 20) {
    const isSuspended = (statusText || '').toLowerCase().includes('suspended') || severity === 20;
    return {
      bg: 'rgba(227,32,23,0.15)',
      border: 'rgba(227,32,23,0.4)',
      text: '#E32017',
      label: isSuspended ? 'Suspended' : 'Severe delays',
    };
  } else {
    return {
      bg: 'rgba(76,175,80,0.15)',
      border: 'rgba(76,175,80,0.4)',
      text: '#4CAF50',
      label: 'Good service',
    };
  }
};

const StatusRow = React.memo(function StatusRow({
  item,
  index,
  lastFetchTime,
}: {
  item: {
    id: string;
    name: string;
    color: string;
    status: string;
    statusSeverity: number;
    reason: string;
  };
  index: number;
  lastFetchTime: number;
}) {
  const reducedMotion = false; // Force false to override system-level 'Reduce Motion' and ensure entering animations play!
  const translateY = useSharedValue(8);
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    if (reducedMotion) {
      translateY.value = 0;
      opacity.value = 1;
      return;
    }
    const delay = index * 60;
    
    translateY.value = withSequence(
      withTiming(8, { duration: 0 }),
      withTiming(8, { duration: delay }),
      withSpring(0, { damping: 15, stiffness: 120 })
    );
    opacity.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(0, { duration: delay }),
      withTiming(1, { duration: 250 })
    );
  }, [index, reducedMotion, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const details = getStatusDetails(item.statusSeverity, item.status);
  
  const [elapsed, setElapsed] = React.useState('Just now');
  React.useEffect(() => {
    setElapsed(getElapsedTime(lastFetchTime));
    const interval = setInterval(() => {
      setElapsed(getElapsedTime(lastFetchTime));
    }, 5000);
    return () => clearInterval(interval);
  }, [lastFetchTime]);

  return (
    <Animated.View style={[styles.statusRow, animatedStyle]}>
      <View style={styles.statusRowHeader}>
        <View style={styles.statusRowLeft}>
          <View style={[styles.lineDot, { backgroundColor: item.color }]} />
          <Text style={styles.lineName}>{item.name}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: details.bg, borderColor: details.border }]}>
          <Text style={[styles.statusBadgeText, { color: details.text }]}>{details.label}</Text>
        </View>
      </View>
      
      {item.reason ? (
        <Text style={styles.statusReason} numberOfLines={3}>
          {item.reason}
        </Text>
      ) : null}
      
      <Text style={styles.statusTime}>
        Last updated: {elapsed}
      </Text>
    </Animated.View>
  );
});

const LiveStatusStrip = React.memo(function LiveStatusStrip({
  selectedLines,
  lineStatuses,
  lastFetchTime,
}: {
  selectedLines: string[];
  lineStatuses: Record<string, any>;
  lastFetchTime: number;
}) {
  const [contentHeight, setContentHeight] = React.useState(0);
  const heightVal = useSharedValue(0);
  const opacityVal = useSharedValue(0);
  const reducedMotion = false; // Force false to override system-level 'Reduce Motion' and ensure status strip slides smoothly!

  React.useEffect(() => {
    const hasSelection = selectedLines.length > 0;
    const targetHeight = hasSelection ? contentHeight : 0;
    const targetOpacity = hasSelection ? 1 : 0;

    if (reducedMotion) {
      heightVal.value = targetHeight;
      opacityVal.value = targetOpacity;
      return;
    }

    heightVal.value = withSpring(targetHeight, { damping: 22, stiffness: 200 });
    opacityVal.value = withSpring(targetOpacity, { damping: 22, stiffness: 200 });
  }, [selectedLines.length, contentHeight, reducedMotion, heightVal, opacityVal]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: heightVal.value,
    opacity: opacityVal.value,
    overflow: 'hidden',
  }));

  if (selectedLines.length === 0) return null;

  const selectedLinesData = selectedLines.map(id => {
    const lineInfo = TFL_LINES.find(l => l.id === id);
    const statusInfo = lineStatuses[id];
    return {
      id,
      name: lineInfo?.name || id,
      color: lineInfo?.color || '#FFFFFF',
      status: statusInfo?.status || 'Good Service',
      statusSeverity: statusInfo?.status_severity ?? 1,
      reason: statusInfo?.reason || '',
    };
  });

  return (
    <Animated.View style={[styles.statusStripContainer, animatedStyle]}>
      <View
        style={styles.statusStripBlur}
      >
        <View
          style={styles.statusStripContent}
          onLayout={(e) => {
            setContentHeight(e.nativeEvent.layout.height);
          }}
        >
          <Text style={styles.statusStripTitle}>LIVE LINE STATUS</Text>
          {selectedLinesData.map((item, index) => (
            <StatusRow
              key={item.id}
              item={item}
              index={index}
              lastFetchTime={lastFetchTime}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
});

const WatchingBadge = React.memo(function WatchingBadge({
  selectedLines,
  lineStatuses,
}: {
  selectedLines: string[];
  lineStatuses: Record<string, any>;
}) {
  const count = selectedLines.length;
  const show = count > 0;
  const reducedMotion = false; // Force false to override system-level 'Reduce Motion' and ensure watching badge springs!

  const heightVal = useSharedValue(0);
  const opacityVal = useSharedValue(0);
  const marginTopVal = useSharedValue(0);

  React.useEffect(() => {
    const targetHeight = show ? 32 : 0;
    const targetOpacity = show ? 1 : 0;
    const targetMargin = show ? 12 : 0;

    if (reducedMotion) {
      heightVal.value = targetHeight;
      opacityVal.value = targetOpacity;
      marginTopVal.value = targetMargin;
      return;
    }

    heightVal.value = withSpring(targetHeight, { damping: 20, stiffness: 180 });
    opacityVal.value = withSpring(targetOpacity, { damping: 20, stiffness: 180 });
    marginTopVal.value = withSpring(targetMargin, { damping: 20, stiffness: 180 });
  }, [show, reducedMotion, heightVal, marginTopVal, opacityVal]);

  const badgeWrapperStyle = useAnimatedStyle(() => ({
    height: heightVal.value,
    opacity: opacityVal.value,
    marginTop: marginTopVal.value,
    overflow: 'hidden',
  }));

  const selectedLinesStatuses = selectedLines.map(id => lineStatuses[id]);
  const totalDisruptions = selectedLinesStatuses.filter(s => s && s.status_severity > 1).length;
  const maxSeverity = selectedLinesStatuses.reduce((max, s) => {
    if (!s) return max;
    return Math.max(max, s.status_severity);
  }, 1);

  let themeColor = '#4CAF50';
  let badgeBg = 'rgba(76, 175, 80, 0.10)';
  let badgeBorder = 'rgba(76, 175, 80, 0.28)';

  if (totalDisruptions > 0) {
    if (maxSeverity === 9 || maxSeverity === 20) {
      themeColor = '#E32017';
      badgeBg = 'rgba(227, 32, 23, 0.10)';
      badgeBorder = 'rgba(227, 32, 23, 0.28)';
    } else {
      themeColor = '#F2A002';
      badgeBg = 'rgba(242, 160, 2, 0.10)';
      badgeBorder = 'rgba(242, 160, 2, 0.28)';
    }
  }

  let labelText = '';
  if (totalDisruptions === 0) {
    if (count <= 2) {
      const names = selectedLines.map(id => TFL_LINES.find(l => l.id === id)?.name || id);
      labelText = `Watching ${names.join(' · ')}`;
    } else {
      labelText = `Watching ${count} lines · All clear`;
    }
  } else {
    labelText = `Watching ${count} line${count > 1 ? 's' : ''} · ${totalDisruptions} disruption${totalDisruptions > 1 ? 's' : ''} detected`;
  }

  const pulseVal = useSharedValue(0.4);
  React.useEffect(() => {
    pulseVal.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [pulseVal]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: pulseVal.value,
  }));

  const animatedBgStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(badgeBg, { duration: 300 }),
      borderColor: withTiming(badgeBorder, { duration: 300 }),
    };
  });

  const animatedTextStyle = useAnimatedStyle(() => {
    return {
      color: withTiming(themeColor, { duration: 300 }),
    };
  });

  const animatedDotStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(themeColor, { duration: 300 }),
    };
  });

  if (count === 0) return null;

  return (
    <Animated.View style={[badgeWrapperStyle]} pointerEvents={show ? 'auto' : 'none'}>
      <Animated.View style={[styles.watchingBadge, animatedBgStyle]}>
        <Animated.View style={[styles.pulseDot, animatedDotStyle, dotStyle]} />
        <Animated.Text style={[styles.watchingBadgeText, animatedTextStyle]} numberOfLines={1}>
          {labelText}
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function LinesScreen() {
  const { push }      = useRouter();
  const insets        = useSafeAreaInsets();
  const { width }     = useWindowDimensions();
  const selectedLines = useOnboardingStore(s => s.selectedLines);
  const toggleLine    = useOnboardingStore(s => s.toggleLine);
  const isAtLimit     = selectedLines.length >= MAX;
  const canContinue   = selectedLines.length > 0;
  const { playSelect, playDeselect } = useTapSound();

  const { fetchAllLines } = useLineData();
  const isLoadingStatuses = useLineDataStore(state => state.isLoading);
  const lineStatuses = useLineDataStore(state => state.lines);
  const lastFetchTime = useLineDataStore(state => state.lastFetchTime);

  // Pre-hydrate TfL statuses on mount
  useEffect(() => {
    fetchAllLines();
  }, [fetchAllLines]);

  const handleToggleLine = useCallback((id: string) => {
    toggleLine(id);
    fetchAllLines(true);
  }, [toggleLine, fetchAllLines]);

  const [subText, setSubText] = React.useState("We're already watching them.");
  const subtitleOpacity = useSharedValue(0.55);
  const reducedMotion = false; // Force false to override system-level 'Reduce Motion' and ensure crossfades and shared-axis slides play!

  useEffect(() => {
    const targetText = selectedLines.length > 0 ? "Live. Right now." : "We're already watching them.";
    if (subText !== targetText) {
      if (reducedMotion) {
        setSubText(targetText);
        return;
      }
      subtitleOpacity.value = withTiming(0, { duration: 120 }, (finished) => {
        if (finished) {
          runOnJS(setSubText)(targetText);
          subtitleOpacity.value = withTiming(0.55, { duration: 120 });
        }
      });
    }
  }, [selectedLines.length, subText, reducedMotion, subtitleOpacity]);

  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync(); }, [fontsLoaded]);

  const pillWidth = (width - H_PAD * 2 - GAP) / 2;

  // Continue CTA capsule scale spring animation
  const continueAnim = usePressAnimation('continue_btn', !canContinue);

  // Shared-axis slide transitions
  const transitionX = useSharedValue(0);
  const transitionOpacity = useSharedValue(1);
  const transitionScale = useSharedValue(1);

  useFocusEffect(
    useCallback(() => {
      const dir = useOnboardingStore.getState().navigationDirection;
      if (dir === 'backward') {
        // Entering backwards: slide in from left with scale-up reveal
        transitionX.value = -width * 0.28;
        transitionOpacity.value = 0;
        transitionScale.value = 0.94;
      } else {
        // Initial mount or reset: instant solid layout
        transitionX.value = 0;
        transitionOpacity.value = 1;
        transitionScale.value = 1;
        return;
      }

      if (reducedMotion) {
        transitionX.value = 0;
        transitionOpacity.value = 1;
        transitionScale.value = 1;
        return;
      }

      transitionX.value = withTiming(0, {
        duration: 320,
        easing: Easing.out(Easing.poly(4)),
      });
      transitionOpacity.value = withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.poly(4)),
      });
      transitionScale.value = withTiming(1.0, {
        duration: 320,
        easing: Easing.out(Easing.poly(4)),
      });
    }, [width, reducedMotion, transitionOpacity, transitionScale, transitionX])
  );

  const slideStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: transitionX.value },
      { scale: transitionScale.value }
    ],
    opacity: transitionOpacity.value,
  }));

  return (
    <View style={styles.root}>
      {/* Layer 4: Base Linear Grid */}
      <LinearGradient
        colors={MASTER_BACKGROUND_GRADIENT.colors}
        locations={MASTER_BACKGROUND_GRADIENT.locations}
        start={MASTER_BACKGROUND_GRADIENT.start}
        end={MASTER_BACKGROUND_GRADIENT.end}
        style={StyleSheet.absoluteFillObject}
      />
      {/* Layer 3: Top-Left Accent (45% Height, diagonal flow) */}
      <LinearGradient
        colors={['#001E5A', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '45%' }}
      />
      {/* Layer 2: Top-Right Bloom (50% Height, diagonal flow) */}
      <LinearGradient
        colors={['#002470', 'transparent']}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, width: '100%', height: '50%' }}
      />
      {/* Layer 1: Top-Center Glow (60% Height, vertical flow) */}
      <LinearGradient
        colors={['#003B8E', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%' }}
      />
      {/* Universal Dashboard Edge Overlay */}
      <LinearGradient
        colors={DASHBOARD_OVERLAY_GRADIENT.colors}
        locations={DASHBOARD_OVERLAY_GRADIENT.locations}
        start={DASHBOARD_OVERLAY_GRADIENT.start}
        end={DASHBOARD_OVERLAY_GRADIENT.end}
        pointerEvents={DASHBOARD_OVERLAY_GRADIENT.pointerEvents}
        style={StyleSheet.absoluteFillObject}
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <Image
          source={require('../../assets/images/grain.png')}
          style={[StyleSheet.absoluteFillObject, { opacity: 0.03 }]}
          resizeMode="repeat"
        />
      </View>
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />


      {/* Status Bar / Notch Padding Spacer */}
      <View style={{ height: insets.top }} />

      {/* Progress dots — pinned below status bar */}
      <Animated.View style={[{ flex: 1 }, slideStyle]}>
        <ProgressDots currentStep={0} totalSteps={2} style={{ paddingTop: 16 }} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.3}>
          {'Which lines\ndo you ride?'}
        </Text>
        <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]} allowFontScaling maxFontSizeMultiplier={1.4}>
          {subText}
        </Animated.Text>
        <WatchingBadge selectedLines={selectedLines} lineStatuses={lineStatuses} />
      </View>

      {/* Grid ScrollView */}
      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom + 130 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pillGrid}>
          {TFL_LINES.map((line, index) => (
            <Pill
              key={line.id}
              line={line}
              isSelected={selectedLines.includes(line.id)}
              isAtLimit={isAtLimit}
              onToggle={handleToggleLine}
              pillWidth={pillWidth}
              delay={index * 35}
              playSelect={playSelect}
              playDeselect={playDeselect}
              statusSeverity={lineStatuses[line.id]?.status_severity}
              isFetching={isLoadingStatuses}
            />
          ))}
        </View>
        <LiveStatusStrip
          selectedLines={selectedLines}
          lineStatuses={lineStatuses}
          lastFetchTime={lastFetchTime}
        />
      </ScrollView>

      </Animated.View>

      {/* Footer Continue CTA - standardized height & arrow badge */}
      <View style={[styles.ctaWrap, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPressIn={continueAnim.onPressIn}
          onPressOut={continueAnim.onPressOut}
          onPress={async () => {
            const store = useOnboardingStore.getState();
            store.setNavigationDirection('forward');
            
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            playSound('push', 0.38); // Forward screen push sound

            if (reducedMotion) {
              push('/onboarding/stations');
              return;
            }

            transitionX.value = withTiming(-width * 0.28, {
              duration: 320,
              easing: Easing.out(Easing.poly(4)),
            });
            transitionScale.value = withTiming(0.94, {
              duration: 320,
              easing: Easing.out(Easing.poly(4)),
            });
            transitionOpacity.value = withTiming(0, {
              duration: 320,
              easing: Easing.out(Easing.poly(4)),
            }, (finished) => {
              if (finished) {
                runOnJS(push)('/onboarding/stations');
              }
            });
          }}
          disabled={!canContinue}
          accessibilityRole="button"
          accessibilityLabel={
            canContinue ? 'Continue to station selection' : 'Select at least one line to continue'
          }
          accessibilityState={{ disabled: !canContinue }}
        >
          <Animated.View
            style={[
              styles.cta,
              continueAnim.animatedStyle,
              {
                backgroundColor: canContinue ? '#FFFFFF' : 'rgba(255,255,255,0.12)',
              },
            ]}
          >
            <View style={styles.ctaContent}>
              <Text style={[
                styles.ctaText,
                { color: canContinue ? '#0A0A0F' : 'rgba(255,255,255,0.35)' },
              ]}>
                Continue
              </Text>
              {canContinue && (
                <View style={styles.arrowBadge}>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </View>
              )}
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: H_PAD,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    letterSpacing: 0.3,
    lineHeight: 38,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_400Regular',
    fontWeight: '400',
    color: 'rgba(255,255,255,0.55)',
  },
  grid: {
    paddingHorizontal: H_PAD,
    flexGrow: 1,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  pillBlur: {
    height: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pillText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'SpaceGrotesk_500Medium',
    color: 'rgba(255,255,255,0.95)',
    marginRight: 6,
  },
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    backgroundColor: 'rgba(13,11,23,0.88)',
  },
  cta: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  arrowBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'SpaceGrotesk_700Bold',
  },
  checkmarkIcon: { marginRight: 14 },
  flex1: { flex: 1 },
  watchingBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
    overflow: 'hidden',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  watchingBadgeText: {
    fontSize: 12,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  statusStripContainer: {
    marginTop: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  statusStripBlur: {
    padding: 16,
  },
  statusStripContent: {
    gap: 12,
  },
  statusStripTitle: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.4)',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  statusRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 6,
  },
  statusRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  lineName: {
    fontSize: 13,
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    fontWeight: '700',
  },
  statusReason: {
    fontSize: 11,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 15,
  },
  statusTime: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk_400Regular',
    color: 'rgba(255, 255, 255, 0.35)',
    marginTop: 2,
  },
});
