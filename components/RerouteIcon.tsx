import React, { memo } from 'react';
import { Image, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import Svg, { Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

export interface RerouteIconProps {
  size?: number;
  color?: string;
  weight?: SymbolViewProps['weight'];
  variant?: 'vector' | 'tile';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const REROUTE_TILE_IMAGE = require('../assets/images/reroute_lumina_icon.jpg');

export const RerouteIcon = memo(function RerouteIcon({
  size = 20,
  color = '#38BDF8',
  weight = 'semibold',
  variant = 'vector',
  style,
  testID = 'reroute-signpost-icon',
}: RerouteIconProps) {
  if (variant === 'tile') {
    return (
      <View
        style={[
          styles.container,
          styles.tileContainer,
          { width: size, height: size, borderRadius: Math.round(size * 0.22) },
          style,
        ]}
        testID={testID}
      >
        <Image
          source={REROUTE_TILE_IMAGE}
          style={{ width: size, height: size, borderRadius: Math.round(size * 0.22) }}
          resizeMode="cover"
        />
      </View>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.container, { width: size, height: size }, style]} testID={testID}>
        <SymbolView
          name="signpost.right.and.left.fill"
          size={size}
          tintColor={color}
          weight={weight}
          fallback={<BespokeCurvedTransitSplitSvg size={size} color={color} />}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size }, style]} testID={testID}>
      <BespokeCurvedTransitSplitSvg size={size} color={color} />
    </View>
  );
});

RerouteIcon.displayName = 'RerouteIcon';

/**
 * Geometric SVG matching the EXACT curved transit split concept from the generated Lumina photo:
 * - Central spine pointing upward
 * - Left corridor peeling out smoothly with terminal arrow head
 * - Right corridor peeling out smoothly with terminal arrow head
 */
function BespokeCurvedTransitSplitSvg({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Defs>
        <LinearGradient id="neonGlow" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="1" />
          <Stop offset="1" stopColor="#00F2FE" stopOpacity="0.8" />
        </LinearGradient>
      </Defs>

      {/* Central Titanium Pillar with Pointed Tip */}
      <Path
        d="M24 4L28 9V44H20V9L24 4Z"
        fill={color}
        fillOpacity="0.35"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Left Smooth Curved Transit Corridor */}
      <Path
        d="M24 24C17 24 13 21 13 15V13H15L15 11L6 14L15 17L15 15H11C11 23 16 26 24 26V24Z"
        fill="url(#neonGlow)"
        stroke={color}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />

      {/* Right Smooth Curved Transit Corridor */}
      <Path
        d="M24 28C31 28 35 31 35 37V39H33L33 41L42 38L33 35L33 37H37C37 29 32 26 24 26V28Z"
        fill="url(#neonGlow)"
        stroke={color}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  tileContainer: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: '#0A0D14',
  },
});

export default RerouteIcon;
