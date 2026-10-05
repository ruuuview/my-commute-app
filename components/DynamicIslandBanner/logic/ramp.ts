// frontend/components/DynamicIslandBanner/logic/ramp.ts
import { clamp } from './clamp.default';

export function ramp(v: number, a: number, b: number): number {
  'worklet';
  if (b === a) return v >= a ? 1 : 0;
  return clamp((v - a) / (b - a), 0, 1);
}
