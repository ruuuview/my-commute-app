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
import { MASTER_CANVAS } from '../theme/colors';
import type { Severity } from './MyCommuteDashboard';

const STATUS_GRADIENTS: Record<Severity, readonly [string, string, string]> = {
  good: MASTER_CANVAS.DASHBOARD_GOOD,
  minor: MASTER_CANVAS.DASHBOARD_MINOR,
  severe: MASTER_CANVAS.DASHBOARD_SEVERE,
  suspended: MASTER_CANVAS.DASHBOARD_SEVERE,
  offline: MASTER_CANVAS.DASHBOARD_OFFLINE,
  unknown: MASTER_CANVAS.DASHBOARD_OFFLINE,
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

  const onTransitionComplete = React.useCallback((resolved: Severity) => {
    setLayers([resolved, resolved]);
    crossfadeOpacity.value = 0;
    prevSeverityRef.current = resolved;
  }, [crossfadeOpacity]);

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
