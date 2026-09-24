// components/DashboardGradient.tsx
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import type { Severity } from './MyCommuteDashboard';

export const STATUS_GRADIENTS: Record<
  Severity,
  { colors: readonly [string, string, string, string]; locations: readonly [number, number, number, number] }
> = {
  good: {
    colors: ['#004D25', '#002E16', '#07170B', '#020603'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  minor: {
    colors: ['#603600', '#3A2100', '#180D02', '#060300'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  severe: {
    colors: ['#7A1414', '#480A0A', '#1C0404', '#050101'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  suspended: {
    colors: ['#500A0A', '#300505', '#140202', '#040101'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  offline: {
    colors: ['#003380', '#001C52', '#070E24', '#02040A'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  unknown: {
    colors: ['#003380', '#001C52', '#070E24', '#02040A'],
    locations: [0, 0.28, 0.65, 1.0],
  },
} as const;

export const ATMOSPHERIC_BLOOMS: Record<
  Severity,
  { colors: readonly [string, string, string]; locations: readonly [number, number, number] }
> = {
  good: {
    colors: ['rgba(16, 185, 129, 0.24)', 'rgba(5, 150, 105, 0.08)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  minor: {
    colors: ['rgba(245, 158, 11, 0.24)', 'rgba(217, 119, 6, 0.08)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  severe: {
    colors: ['rgba(239, 68, 68, 0.24)', 'rgba(185, 28, 28, 0.08)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  suspended: {
    colors: ['rgba(185, 28, 28, 0.20)', 'rgba(127, 29, 29, 0.06)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  offline: {
    colors: ['rgba(0, 102, 204, 0.24)', 'rgba(0, 51, 128, 0.08)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  unknown: {
    colors: ['rgba(0, 102, 204, 0.24)', 'rgba(0, 51, 128, 0.08)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
} as const;

interface Props {
  severity: Severity;
  children?: React.ReactNode;
}

export function DashboardGradient({ severity, children }: Props) {
  const reducedMotion = useReducedMotion();
  const initialSeverity: Severity = STATUS_GRADIENTS[severity] ? severity : 'good';
  const prevSeverityRef = useRef<Severity>(initialSeverity);
  const crossfadeOpacity = useSharedValue(0);

  // [bottom layer (outgoing), top layer (incoming)]
  const [layers, setLayers] = useState<[Severity, Severity]>([initialSeverity, initialSeverity]);

  const onTransitionComplete = React.useCallback(
    (resolved: Severity) => {
      setLayers([resolved, resolved]);
      crossfadeOpacity.value = 0;
      prevSeverityRef.current = resolved;
    },
    [crossfadeOpacity]
  );

  useEffect(() => {
    // Normalise and handle fallback
    const resolvedSeverity: Severity = STATUS_GRADIENTS[severity] ? severity : 'good';

    if (resolvedSeverity === prevSeverityRef.current) return;

    if (prevSeverityRef.current === 'unknown' || reducedMotion) {
      setLayers([resolvedSeverity, resolvedSeverity]);
      prevSeverityRef.current = resolvedSeverity;
      return;
    }

    const newLayers: [Severity, Severity] = [prevSeverityRef.current, resolvedSeverity];
    setLayers(newLayers);
    crossfadeOpacity.value = 0;
    crossfadeOpacity.value = withTiming(1, { duration: 500 }, (finished) => {
      if (finished) {
        runOnJS(onTransitionComplete)(resolvedSeverity);
      }
    });
  }, [severity, reducedMotion, crossfadeOpacity, onTransitionComplete]);

  const topLayerStyle = useAnimatedStyle(() => ({
    opacity: crossfadeOpacity.value,
  }));

  const bottomGrad = STATUS_GRADIENTS[layers[0]] || STATUS_GRADIENTS.unknown;
  const bottomBloom = ATMOSPHERIC_BLOOMS[layers[0]] || ATMOSPHERIC_BLOOMS.unknown;

  const topGrad = STATUS_GRADIENTS[layers[1]] || STATUS_GRADIENTS.unknown;
  const topBloom = ATMOSPHERIC_BLOOMS[layers[1]] || ATMOSPHERIC_BLOOMS.unknown;

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      {/* Bottom layer — current / outgoing base flow + bloom */}
      <LinearGradient
        colors={bottomGrad.colors}
        locations={bottomGrad.locations}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <LinearGradient
        colors={bottomBloom.colors}
        locations={bottomBloom.locations}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.7 }}
      />

      {/* Top layer — incoming base flow + bloom (cross-fades over 500ms) */}
      <Animated.View style={[StyleSheet.absoluteFillObject, topLayerStyle]}>
        <LinearGradient
          colors={topGrad.colors}
          locations={topGrad.locations}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
        <LinearGradient
          colors={topBloom.colors}
          locations={topBloom.locations}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.7 }}
        />
      </Animated.View>

      {children}
    </View>
  );
}

export default DashboardGradient;
