import React, { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

export interface PillContentProps {
  title: string;
  message: string;
  accent: string;
}

export function PillContent({ title, message, accent }: PillContentProps): React.JSX.Element {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${message}`);
  }, [title, message]);

  // Extract short line code for the station drawer style pill badge
  const shortLine = title.replace(/\s+(line|overground)$/i, '');

  return (
    <View
      style={styles.pill}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
    >
      {/* Station Drawer Style Line Tag */}
      <View
        style={[
          styles.pillBadge,
          {
            borderColor: accent,
            backgroundColor: `${accent}22`,
          },
        ]}
      >
        <View style={[styles.pillBar, { backgroundColor: accent }]} />
        <Text style={[styles.pillBadgeText, { color: '#FFFFFF' }]}>
          {shortLine}
        </Text>
      </View>

      <View style={styles.textBlock}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.message} numberOfLines={1}>
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
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 12,
    gap: 4,
  },
  pillBar: {
    width: 2.5,
    height: 10,
    borderRadius: 1,
  },
  pillBadgeText: {
    fontSize: 10,
    fontFamily: 'SpaceGrotesk_700Bold',
    letterSpacing: 0.2,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontFamily: 'SpaceGrotesk_700Bold',
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  message: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
  },
});

export default PillContent;
