// components/BeamRing/index.ts
export { default } from './BeamRing';
export type { BeamRingProps } from './BeamRing';
export {
  BASE_RIM,
  BEAM_ACCENT_DEFAULT,
  BEAM_DURATION_DEFAULT,
  BEAM_HEAD,
  BEAM_TAIL_VIOLET,
  BEAM_WIDTH_DEFAULT,
  BLOOM_RADIUS_DEFAULT,
  TAIL_TURNS_DEFAULT,
  clampedRadius,
  clampedStrength,
  headArcDistance,
  headPoint,
  hexToLinearRgb,
  hexToRgba,
  isValidHex,
  roundedRectPerimeter,
} from './beamPalettes';
export type { RGB, XY } from './beamPalettes';
export { BEAM_RING_SKSOURCE, compileBeamRing } from './beamRing.sksl';
