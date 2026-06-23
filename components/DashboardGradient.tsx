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

const STATUS_GRADIENTS: Record<Severity, readonly [string, string]> = {
  good: ['#0d5c2e', '#000000'],
  minor: ['#7a4a00', '#000000'],
  severe: ['#7a0e0e', '#000000'],
  suspended: ['#5c0a0a', '#000000'],
  offline: ['#1a1a2e', '#000000'],
  unknown: ['#1a1a2e', '#000000'],
} as const;

interface Props {
  severity: Severity;
  children?: React.ReactNode;
}

export function DashboardGradient({ severity, children }: Props) {
  const reducedMotion = useReducedMotion();
  const prevSeverityRef = useRef<Severity>('unknown');
  const crossfadeOpacity = useSharedValue(0);

  // [bottom layer (outgoing), top layer (incoming)]
  const [layers, setLayers] = useState<[Severity, Severity]>(['unknown', 'unknown']);

  const onTransitionComplete = (resolved: Severity) => {
    setLayers([resolved, resolved]);
    crossfadeOpacity.value = 0;
    prevSeverityRef.current = resolved;
  };

  useEffect(() => {
    // Normalise and handle fallback
    const resolvedSeverity: Severity = STATUS_GRADIENTS[severity] ? severity : 'unknown';
    
    if (resolvedSeverity === prevSeverityRef.current) return;

    const newLayers: [Severity, Severity] = [prevSeverityRef.current, resolvedSeverity];
    setLayers(newLayers);
    if (reducedMotion) {
      setLayers([resolvedSeverity, resolvedSeverity]);
      prevSeverityRef.current = resolvedSeverity;
    } else {
      crossfadeOpacity.value = 0;
      crossfadeOpacity.value = withTiming(1, { duration: 800 }, (finished) => {
        if (finished) {
          runOnJS(onTransitionComplete)(resolvedSeverity);
        }
      });
    }
  }, [severity, reducedMotion, crossfadeOpacity]);

  const topLayerStyle = useAnimatedStyle(() => ({
    opacity: crossfadeOpacity.value,
  }));

  return (
    <View
      style={StyleSheet.absoluteFillObject}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden={true}
      importantForAccessibility="no-hide-descendants"
    >
      {/* Bottom layer — current / outgoing gradient */}
      <LinearGradient
        colors={STATUS_GRADIENTS[layers[0]] || STATUS_GRADIENTS.unknown}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Top layer — incoming gradient, cross-fades in over 800ms */}
      <Animated.View style={[StyleSheet.absoluteFillObject, topLayerStyle]}>
        <LinearGradient
          colors={STATUS_GRADIENTS[layers[1]] || STATUS_GRADIENTS.unknown}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      </Animated.View>

      {children}
    </View>
  );
}

export default DashboardGradient;
