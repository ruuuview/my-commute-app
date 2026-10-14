import React, { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export interface ShushIconProps {
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Authentic Apple 🤫 Emoji Icon component for Shush Mode.
 * Renders the native shushing face emoji with natural font metrics (zero clipping).
 */
export const ShushIcon = memo(function ShushIcon({
  size = 18,
  color,
  style,
  testID = 'shush-vector-icon',
}: ShushIconProps) {
  const isDimmed = color === 'rgba(255, 255, 255, 0.45)';

  return (
    <View
      style={[
        styles.container,
        {
          minWidth: size,
          minHeight: size,
          opacity: isDimmed ? 0.45 : 1,
        },
        style,
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.emoji,
          {
            fontSize: size,
          },
        ]}
      >
        🤫
      </Text>
    </View>
  );
});

ShushIcon.displayName = 'ShushIcon';

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  emoji: {
    textAlign: 'center',
    includeFontPadding: false,
    overflow: 'visible',
  },
});

export default ShushIcon;
