// components/refunds/SolariFlapTile.tsx
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface SolariFlapTileProps {
  char: string;
  isDot?: boolean;
}

export const SolariFlapTile = memo(function SolariFlapTile({
  char,
  isDot = false,
}: SolariFlapTileProps) {
  if (isDot) {
    return (
      <View style={styles.dotContainer}>
        <View style={styles.dotHingeLine} />
        <Text style={styles.dotText}>.</Text>
      </View>
    );
  }

  return (
    <View style={styles.tileContainer}>
      {/* Upper Flap */}
      <View style={styles.upperFlap}>
        <LinearGradient
          colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.00)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <View style={styles.charWrapTop}>
          <Text style={styles.flapChar}>{char}</Text>
        </View>
      </View>

      {/* Horizontal Mechanical Hinge Slit */}
      <View style={styles.hingeGroove} />

      {/* Left & Right Mechanical Hinge Rivets */}
      <View style={styles.leftRivet} />
      <View style={styles.rightRivet} />

      {/* Lower Flap */}
      <View style={styles.lowerFlap}>
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.35)', 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.hingeShadow}
          pointerEvents="none"
        />
        <View style={styles.charWrapBottom}>
          <Text style={styles.flapChar}>{char}</Text>
        </View>
      </View>
    </View>
  );
});

SolariFlapTile.displayName = 'SolariFlapTile';

const TILE_WIDTH = 34;
const TILE_HEIGHT = 48;
const HALF_HEIGHT = TILE_HEIGHT / 2;

const styles = StyleSheet.create({
  tileContainer: {
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#0B0E17',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.50,
    shadowRadius: 5,
    elevation: 4,
  },
  upperFlap: {
    width: '100%',
    height: HALF_HEIGHT,
    backgroundColor: '#111624',
    overflow: 'hidden',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  lowerFlap: {
    width: '100%',
    height: HALF_HEIGHT,
    backgroundColor: '#0A0D15',
    overflow: 'hidden',
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  charWrapTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  charWrapBottom: {
    position: 'absolute',
    top: -HALF_HEIGHT,
    left: 0,
    right: 0,
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flapChar: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 26,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  hingeGroove: {
    position: 'absolute',
    top: HALF_HEIGHT - 0.5,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 10,
  },
  hingeShadow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    zIndex: 5,
  },
  leftRivet: {
    position: 'absolute',
    top: HALF_HEIGHT - 2,
    left: 0,
    width: 2,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 11,
    borderTopRightRadius: 1,
    borderBottomRightRadius: 1,
  },
  rightRivet: {
    position: 'absolute',
    top: HALF_HEIGHT - 2,
    right: 0,
    width: 2,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 11,
    borderTopLeftRadius: 1,
    borderBottomLeftRadius: 1,
  },
  dotContainer: {
    width: 14,
    height: TILE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
    position: 'relative',
  },
  dotHingeLine: {
    position: 'absolute',
    top: HALF_HEIGHT - 0.5,
    left: 2,
    right: 2,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  dotText: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 26,
    color: '#FFFFFF',
    lineHeight: 26,
  },
});
