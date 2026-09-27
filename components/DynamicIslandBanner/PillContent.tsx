// components/DynamicIslandBanner/PillContent.tsx
// Presentational pill content rendered inside the Dynamic Island (gooey) shell.
// Visual design extracted from the retired components/InAppBanner.tsx:
// dark glass pill (rgba(18,20,26,0.88)), 3px accent bar, SpaceGrotesk
// typography, white semibold title. Zero emoji.
//
// The gooey card behind this (DynamicNotifications) already supplies the blur
// and island styling — this component is just the row content.

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface PillContentProps {
  title: string;
  message: string;
  accent: string;
}

export function PillContent({ title, message, accent }: PillContentProps): React.JSX.Element {
  return (
    <View
      style={styles.pill}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
    >
      <View style={[styles.specularBar, { backgroundColor: accent }]} />
      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 20, 26, 0.88)',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  specularBar: {
    width: 3,
    height: 28,
    borderRadius: 1.5,
    marginRight: 10,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 17,
    color: '#FFFFFF',
  },
  message: {
    fontFamily: 'SpaceGrotesk_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
  },
});
