// components/BeamRing/beamRing.sksl.ts
// SkSL source for BeamRing: a boundary-only traveling beam shader.
//
// The canvas draws ONLY the ring — the core is fully transparent, so the
// host card's own body (dark glass, solid white, …) shows through untouched.
// This keeps the ring composable: same shader, any swappable core.
//
// Geometry: the beam head travels the rounded-rect perimeter at CONSTANT
// ARC-LENGTH speed (parameterized by arc distance, not angle — an angular
// parameterization would make the beam rush along the straight edges and
// linger on the corner caps). s = 0 is top-center, travel is clockwise,
// and u_time in [0,1] maps to exactly one revolution, so the
// withRepeat(withTiming(1, …)) clock wraps seamlessly.
//
// Uniform drivers:
// - u_time is a Reanimated DerivedValue in [0,1]; one full cycle = 2.4s.
// - u_frozen collapses the comet to a static specular catch-light parked at
//   the top (reduced-motion path).

import { Skia, SkRuntimeEffect } from '@shopify/react-native-skia';

export const BEAM_RING_SKSOURCE = `
// ---- uniforms ----
uniform vec2  u_resolution;   // canvas size, px
uniform float u_time;         // 0..1, exactly one beam revolution per cycle
uniform float u_cornerRadius; // ring corner radius, px
uniform float u_strength;     // 0..1 overall intensity
uniform float u_active;       // 0..1 play/pause fade
uniform vec3  u_accent;       // beam accent color, linear RGB
uniform vec3  u_baseRim;      // faint static base rim color, linear RGB
uniform float u_beamWidth;    // ring band half-width, px
uniform float u_tailTurns;    // comet tail length, in turns (0..1)
uniform float u_bloomRadius;  // inward bleed radius, px (host clips outward)
uniform float u_frozen;       // 1 = reduced motion: static specular rim

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// Head position for arc distance s (px) along the rounded-rect perimeter.
// s = 0 is top-center; travel is clockwise in y-down screen coords.
// Segment order: top-right-half, TR corner, right edge, BR corner,
// bottom edge, BL corner, left edge, TL corner, top-left-half.
vec2 headPoint(float s, float w, float h, float r) {
  float x = 0.5 * w;
  float y = 0.5 * h;
  float lx = w - 2.0 * r;
  float ly = h - 2.0 * r;
  float arc = 1.5707963 * r; // quarter-arc length
  float s0 = 0.0;
  float seg = 0.5 * lx; // top edge, right half: (0,-y) -> (x-r,-y)
  if (s < s0 + seg) { return vec2(s - s0, -y); }
  s0 += seg; // TR corner: theta -pi/2 -> 0
  if (s < s0 + arc) { float th = -1.5707963 + (s - s0) / r; return vec2(x - r + r * cos(th), -y + r + r * sin(th)); }
  s0 += arc; // right edge: (x,-y+r) -> (x,y-r)
  if (s < s0 + ly) { return vec2(x, -y + r + (s - s0)); }
  s0 += ly; // BR corner: theta 0 -> pi/2
  if (s < s0 + arc) { float th = (s - s0) / r; return vec2(x - r + r * cos(th), y - r + r * sin(th)); }
  s0 += arc; // bottom edge: (x-r,y) -> (-x+r,y)
  if (s < s0 + lx) { return vec2(x - r - (s - s0), y); }
  s0 += lx; // BL corner: theta pi/2 -> pi
  if (s < s0 + arc) { float th = 1.5707963 + (s - s0) / r; return vec2(-x + r + r * cos(th), y - r + r * sin(th)); }
  s0 += arc; // left edge: (-x,y-r) -> (-x,-y+r)
  if (s < s0 + ly) { return vec2(-x, y - r - (s - s0)); }
  s0 += ly; // TL corner: theta pi -> 3pi/2 (advance by the LEFT EDGE length)
  if (s < s0 + arc) { float th = 3.1415927 + (s - s0) / r; return vec2(-x + r + r * cos(th), -y + r + r * sin(th)); }
  s0 += arc; // top edge, left half: (-x+r,-y) -> (0,-y)
  return vec2(-x + r + (s - s0), -y);
}

vec4 main(vec2 fragCoord) {
  vec2 res = u_resolution;
  float w = res.x;
  float h = res.y;
  float r = min(u_cornerRadius, 0.5 * min(w, h) - 1.0);
  r = max(r, 0.0);

  vec2 fp = fragCoord - 0.5 * res; // centered, y-down, px
  float d = sdRoundBox(fp, vec2(0.5 * w, 0.5 * h), r); // < 0 inside

  float aa = 1.5;
  float beamW = u_beamWidth;
  float ring = 1.0 - smoothstep(beamW - aa, beamW + aa, abs(d));
  // Inward bleed only: the host card has overflow:hidden, so outward glow
  // would be clipped anyway. u_bloomRadius stays a uniform so a future
  // sibling-mount can add outward bloom without a shader rewrite.
  float inner = (1.0 - smoothstep(beamW, beamW + u_bloomRadius, -d)) * step(d, 0.0);

  float beamI = 0.0;
  vec3 beamCol = u_accent;

  // Skip the comet math for fragments nowhere near the ring.
  if (ring + inner > 0.003) {
    if (u_frozen > 0.5) {
      // Reduced motion: static specular catch-light parked at the top.
      float dd = length(fp - vec2(0.0, -0.5 * h));
      beamI = exp(-pow(dd / (beamW * 3.0), 2.0)) * 0.55;
      beamCol = mix(u_baseRim, vec3(1.0), 0.65);
    } else {
      float P = 2.0 * (w - 2.0 * r) + 2.0 * (h - 2.0 * r) + 6.2831853 * r;
      float sHead = fract(u_time) * P;
      vec2 hp = headPoint(sHead, w, h, r);
      float sigC = beamW * 1.6;
      float core = exp(-pow(length(fp - hp) / sigC, 2.0));
      // Comet tail: sample points behind the head along the travel path.
      float tailLen = u_tailTurns * P;
      float tail = 0.0;
      float wsum = 0.0;
      for (int k = 1; k <= 10; k++) {
        float fk = float(k) / 10.0;
        float sk = mod(sHead - fk * tailLen, P);
        vec2 tp = headPoint(sk, w, h, r);
        float wgt = 1.0 - fk;
        float sig = beamW * (2.0 + 2.0 * fk);
        tail += wgt * exp(-pow(length(fp - tp) / sig, 2.0));
        wsum += wgt;
      }
      tail /= wsum;
      float tailW = clamp(tail * 1.2, 0.0, 1.0) * (1.0 - core);
      beamI = clamp(core + tail * 0.9, 0.0, 1.0);
      // White-hot head -> accent mid -> violet-shifted tail.
      vec3 violet = u_accent * vec3(0.82, 0.84, 1.12);
      beamCol = mix(mix(u_accent, violet, tailW), vec3(1.0), pow(core, 2.0) * 0.9);
    }
  }

  float k = u_strength * u_active;
  float ringA = ring * beamI * k;
  float baseA = ring * 0.30 * k; // faint persistent iridescent rim
  float bleedA = beamI * inner * 0.45 * k;

  vec3 col = beamCol * ringA + u_baseRim * baseA + u_accent * bleedA;
  float a = clamp(ringA + baseA + bleedA, 0.0, 1.0);
  return vec4(col, a); // premultiplied
}
`;

/**
 * Compiles the beam-ring shader. Returns null when Skia is unavailable or the
 * source fails to compile, so the component can fall back to a static ring
 * instead of rendering broken.
 */
export function compileBeamRing(): SkRuntimeEffect | null {
  try {
    return Skia.RuntimeEffect.Make(BEAM_RING_SKSOURCE);
  } catch {
    return null;
  }
}
