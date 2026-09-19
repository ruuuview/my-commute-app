import { Platform } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

export { GlassView };

let available = false;
try {
  if (Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function') {
    available = isLiquidGlassAvailable();
  }
} catch {
  available = false;
}

export const isNativeGlassAvailable = available;
