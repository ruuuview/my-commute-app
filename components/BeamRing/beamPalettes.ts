// components/BeamRing/beamPalettes.ts
// Pure (Skia-free) helpers for BeamRing: palette constants sampled from the
// reference video, hex conversion, and the arc-length head math mirrored in
// beamRing.sksl.ts. Kept dependency-free so jest can test the math without
// the Skia runtime.

// ---- palette (grounded in the reference video frames) ----
/** White-hot beam head: brightness 1.0, ~zero saturation. */
export const BEAM_HEAD = '#FFFFFF';
/** Cool blue beam mid (hue ~222 deg), the default accent. */
export const BEAM_ACCENT_DEFAULT = '#A9BCF2';
/** Violet-blue tail tint. */
export const BEAM_TAIL_VIOLET = '#8B9BF0';
/** Faint iridescent static base rim. */
export const BASE_RIM = '#DCDEE9';

// ---- taste defaults ----
/** Seconds per beam revolution. */
export const BEAM_DURATION_DEFAULT = 2.4;
/** Ring band half-width, px. */
export const BEAM_WIDTH_DEFAULT = 2.5;
/** Comet tail length, in turns (~90 degrees of arc). */
export const TAIL_TURNS_DEFAULT = 0.25;
/** Inward bleed radius, px. */
export const BLOOM_RADIUS_DEFAULT = 14;

export type RGB = [number, number, number];
export type XY = [number, number];

export function isValidHex(hex: string): boolean {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex);
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** sRGB hex -> linear RGB triple (what SkSL vec3 uniforms expect). */
export function hexToLinearRgb(hex: string): RGB {
  if (!isValidHex(hex)) throw new Error(`Invalid hex color: ${hex}`);
  const ch = (i: number) => srgbToLinear(parseInt(hex.slice(i, i + 2), 16) / 255);
  return [ch(1), ch(3), ch(5)];
}

/** sRGB hex + alpha -> rgba() CSS string (for the static fallback ring). */
export function hexToRgba(hex: string, alpha: number): string {
  if (!isValidHex(hex)) throw new Error(`Invalid hex color: ${hex}`);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Clamps a strength prop to 0..1, treating garbage as full strength. */
export function clampedStrength(s: number): number {
  if (!Number.isFinite(s)) return 1;
  return Math.min(1, Math.max(0, s));
}

/** Clamps a corner radius so the rounded rect stays valid for w/h. */
export function clampedRadius(r: number, w: number, h: number): number {
  if (!(w > 0) || !(h > 0)) return 0;
  if (!Number.isFinite(r)) return 0;
  return Math.min(Math.max(r, 0), 0.5 * Math.min(w, h) - 1);
}

/**
 * Rounded-rect perimeter. Mirrors the P computation in beamRing.sksl.ts:
 * P = 2*(w-2r) + 2*(h-2r) + 2*pi*r.
 */
export function roundedRectPerimeter(w: number, h: number, r: number): number {
  const rc = clampedRadius(r, w, h);
  return 2 * (w - 2 * rc) + 2 * (h - 2 * rc) + 2 * Math.PI * rc;
}

/**
 * Head position for arc distance s (px) along the rounded-rect perimeter, in
 * centered coords (y-down). s = 0 is top-center; travel is clockwise.
 * Mirrors headPoint() in beamRing.sksl.ts (same segment order/formulas).
 */
export function headPoint(s: number, w: number, h: number, r: number): XY {
  const rc = clampedRadius(r, w, h);
  const x = 0.5 * w;
  const y = 0.5 * h;
  const lx = w - 2 * rc;
  const ly = h - 2 * rc;
  const arc = 0.5 * Math.PI * rc;
  const P = roundedRectPerimeter(w, h, r);
  if (!(P > 0)) return [0, -y];

  const segs: Array<{ len: number; at: (t: number) => XY }> = [
    { len: 0.5 * lx, at: (t) => [t, -y] },
    {
      len: arc,
      at: (t) => {
        const th = -Math.PI / 2 + t / rc;
        return [x - rc + rc * Math.cos(th), -y + rc + rc * Math.sin(th)];
      },
    },
    { len: ly, at: (t) => [x, -y + rc + t] },
    {
      len: arc,
      at: (t) => {
        const th = t / rc;
        return [x - rc + rc * Math.cos(th), y - rc + rc * Math.sin(th)];
      },
    },
    { len: lx, at: (t) => [x - rc - t, y] },
    {
      len: arc,
      at: (t) => {
        const th = Math.PI / 2 + t / rc;
        return [-x + rc + rc * Math.cos(th), y - rc + rc * Math.sin(th)];
      },
    },
    { len: ly, at: (t) => [-x, y - rc - t] },
    {
      len: arc,
      at: (t) => {
        const th = Math.PI + t / rc;
        return [-x + rc + rc * Math.cos(th), -y + rc + rc * Math.sin(th)];
      },
    },
    { len: 0.5 * lx, at: (t) => [-x + rc + t, -y] },
  ];

  let d = ((s % P) + P) % P;
  for (const seg of segs) {
    if (seg.len <= 0) continue;
    if (d <= seg.len) return seg.at(d);
    d -= seg.len;
  }
  const last = segs[segs.length - 1];
  return last.at(last.len);
}

/**
 * Arc distance of the beam head for clock t in [0,1]. One full t cycle is
 * exactly one revolution, so the withRepeat wrap is seamless by construction.
 */
export function headArcDistance(t: number, w: number, h: number, r: number): number {
  const P = roundedRectPerimeter(w, h, r);
  if (!(P > 0)) return 0;
  const f = ((t % 1) + 1) % 1;
  return f * P;
}
