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

const STATUS_GRADIENTS: Record<
  Severity,
  { colors: readonly [string, string, string, string]; locations: readonly [number, number, number, number] }
> = {
  good: {
    colors: ['#00381B', '#002613', '#051A0E', '#020804'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  minor: {
    colors: ['#3A2300', '#261700', '#140C00', '#060300'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  severe: {
    colors: ['#3A0808', '#260505', '#140303', '#060101'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  suspended: {
    colors: ['#3A0808', '#260505', '#140303', '#060101'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  offline: {
    colors: ['#002257', '#001438', '#070E24', '#02040A'],
    locations: [0, 0.28, 0.65, 1.0],
  },
  unknown: {
    colors: ['#002257', '#001438', '#070E24', '#02040A'],
    locations: [0, 0.28, 0.65, 1.0],
  },
} as const;

const ATMOSPHERIC_BLOOMS: Record<
  Severity,
  { colors: readonly [string, string, string]; locations: readonly [number, number, number] }
> = {
  good: {
    colors: ['rgba(52, 211, 153, 0.12)', 'rgba(16, 185, 129, 0.04)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  minor: {
    colors: ['rgba(245, 158, 11, 0.12)', 'rgba(217, 119, 6, 0.04)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  severe: {
    colors: ['rgba(239, 68, 68, 0.12)', 'rgba(220, 38, 38, 0.04)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  suspended: {
    colors: ['rgba(239, 68, 68, 0.12)', 'rgba(220, 38, 38, 0.04)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  offline: {
    colors: ['rgba(0, 102, 204, 0.12)', 'rgba(0, 51, 128, 0.04)', 'transparent'],
    locations: [0, 0.45, 0.90],
  },
  unknown: {
    colors: ['rgba(0, 102, 204, 0.12)', 'rgba(0, 51, 128, 0.04)', 'transparent'],
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
