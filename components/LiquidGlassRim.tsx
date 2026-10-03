import React, { useEffect } from 'react';
import { PixelRatio, Platform, StyleSheet, View } from 'react-native';
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';
import {
  Easing,
  cancelAnimation,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useLiveReducedMotion } from '../hooks/useReducedMotion';

/**
 * Crash-Proof Measured Dual-Lobe Continuous SkSL Shader:
 * - 100% Strict SkSL Compliance (0-indexed constant loops, zero negative indices, NaN guards)
 * - Pure Worklet Thread Animation (no cross-thread JS callbacks inside useAnimatedReaction)
 * - True arc-length geometry (arcPos) with synchronized dual-lobe opposite propagation
 * - Long-path burst curve + spectral dispersion caustics
 */
const SKSL_SOURCE = `
uniform float2 u_size;
uniform float  u_radius;
uniform float  u_rim;      // px, pixel-snapped
uniform float  u_time;     // continuous time in lifetime units; <0 = rest
uniform float  u_fade;     // 0..1
uniform float  u_originX;  // 0..1 across the width, bottom edge

const float PI    = 3.14159265;
const float PAIR  = 0.711;     // spawn spacing (lifetime units)
const float END   = 1.17;      // lifetime incl. residue
const float CYCLE = 2.844;     // PAIR * 4 (seamless repeating cycle)

float sdBox(float2 p, float2 b, float r) {
  float2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

// Clockwise arc length from bottom-centre along the rim centreline
float arcPos(float2 p, float sx, float sy, float rc, float L) {
  float q = 0.5 * PI * rc;
  float s;
  if (p.y >= sy) {
    if (p.x > sx) {
      float2 v = p - float2(sx, sy);
      s = sx + atan(v.x, v.y) * rc;
    } else if (p.x < -sx) {
      float2 v = p - float2(-sx, sy);
      s = L - sx - atan(-v.x, v.y) * rc;
    } else {
      s = p.x;
    }
  } else if (p.y <= -sy) {
    if (p.x > sx) {
      float2 v = p - float2(sx, -sy);
      s = sx + q + 2.0 * sy + atan(-v.y, v.x) * rc;
    } else if (p.x < -sx) {
      float2 v = p - float2(-sx, -sy);
      s = 3.0 * sx + 2.0 * q + 2.0 * sy + atan(-v.x, -v.y) * rc;
    } else {
      s = 2.0 * sx + 2.0 * q + 2.0 * sy - p.x;
    }
  } else if (p.x > 0.0) {
    s = sx + q + (sy - p.y);
  } else {
    s = 3.0 * sx + 3.0 * q + 2.0 * sy + (p.y + sy);
  }
  return s - L * floor(s / L);
}

float wrapd(float x, float L) { return x - L * floor(x / L + 0.5); }

// long-path lobe: slow drift, then burst
float eL(float t) {
  float x = clamp((t - 0.708) / (0.989 - 0.708), 0.0, 1.0);
  return 0.423 * t + 0.577 * x * x * (3.0 - 2.0 * x);
}

void addLobe(float s, float c, float w, float amp, float sp, float live, float L,
             inout float glint, inout float specW, inout float3 specC) {
  float x = wrapd(s - c, L) / max(0.5 * w, 0.001);
  float g = exp(-2.0 * x * x) * live;
  glint = max(glint, g * amp);
  float3 hue = 0.5 + 0.5 * cos(6.2831853 * (x * 0.35 + 0.15 + float3(0.0, 0.33, 0.67)));
  specW += g * sp;
  specC += hue * g * sp;
}

half4 main(float2 xy) {
  float2 p  = xy - u_size * 0.5;
  float2 hs = u_size * 0.5 - 0.5;
  float  r  = min(u_radius, min(hs.x, hs.y));
  float  d  = sdBox(p, hs, r);
  float cover = (1.0 - smoothstep(-0.5, 0.5, d))
              * smoothstep(-u_rim - 0.5, -u_rim + 0.5, d);
  if (cover <= 0.0) return half4(0.0);

  // rim centreline geometry
  float hc = u_rim * 0.5;
  float2 hsC = hs - hc;
  float rc = max(r - hc, 0.5);
  float sx = max(hsC.x - rc, 0.0);
  float sy = max(hsC.y - rc, 0.0);
  float L  = max(4.0 * (sx + sy) + 2.0 * PI * rc, 1.0);
  float s  = arcPos(p, sx, sy, rc, L);

  // origin (bottom edge) and meeting point (end of right cap, top-right shoulder)
  float off = min((0.5 - u_originX) * u_size.x, sx);
  float sO  = L - off;
  float sM  = sx + PI * rc + 2.0 * sy;
  float dR  = off + sM;     // clockwise path length
  float dL  = L - dR;       // counter-clockwise path length

  float glint = 0.0;
  float specW = 0.0;
  float3 specC = float3(0.0);

  // Strict 0-indexed loop for 100% SkSL compiler stability
  if (u_time >= 0.0) {
    float t_base = mod(u_time, CYCLE);
    for (int k = 0; k < 6; k++) {
      float kf = float(k) - 1.0;
      float t = t_base - PAIR * kf;
      if (t < 0.0) t += CYCLE;
      if (t > END) continue;
      float tc   = clamp(t, 0.0, 1.0);
      float live = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(1.0, END, t));
      float bump = smoothstep(0.72, 0.84, tc) * (1.0 - 0.55 * smoothstep(0.9, 1.0, tc));
      float late = smoothstep(0.55, 1.0, tc);
      float meet = smoothstep(1.0, 1.06, t);
      float sR = sO + dR * pow(tc, 1.15);
      float sL = sO - dL * eL(tc);
      float wR = mix(0.026 + 0.06 * late, 0.02, meet);
      float wL = mix(0.03 + 0.16 * bump, 0.02, meet);
      addLobe(s, sR, wR * L, 0.80 + 0.20 * late, 0.30 + 0.45 * late, live, L, glint, specW, specC);
      addLobe(s, sL, wL * L, 0.85 + 0.15 * bump, 0.30 + 0.70 * bump, live, L, glint, specW, specC);
    }
  }

  // static chrome base: fixed light from top-right
  float2 q = abs(p) - hs + r;
  float2 n;
  float lenQ = length(q);
  if (q.x > 0.0 && q.y > 0.0 && lenQ > 0.0001) {
    n = sign(p) * (q / lenQ);
  } else if (q.x > q.y) {
    n = float2(sign(p.x), 0.0);
  } else {
    n = float2(0.0, sign(p.y));
  }
  float lt = smoothstep(-0.6, 0.9, dot(n, normalize(float2(0.5, -0.85))));
  float3 steel  = float3(0.70, 0.75, 0.85); // Lustrous platinum-glass catch-light
  float3 silver = float3(0.96, 0.98, 1.00); // Specular reflection top
  float3 col = mix(steel, silver, lt);

  col = mix(col, float3(1.0, 1.0, 1.0), clamp(glint, 0.0, 1.0) * 0.95);
  float sw = clamp(specW, 0.0, 1.0);
  col = mix(col, specC / max(specW, 0.001), sw * 0.95);
  col = clamp(col, 0.0, 1.0);

  // Dynamic glass rim alpha: gated to activate only after the card settles
  float fadeProgress = smoothstep(0.85, 1.0, clamp(u_fade, 0.0, 1.0));
  float rimAlpha = mix(0.35, 1.0, clamp(glint * 1.5 + sw, 0.0, 1.0));
  float a = cover * fadeProgress * rimAlpha;
  return half4(half3(col * a), half(a));
}
`;

let FX: ReturnType<typeof Skia.RuntimeEffect.Make> = null;
if (Platform.OS !== 'web' && Skia?.RuntimeEffect?.Make) {
  try {
    FX = Skia.RuntimeEffect.Make(SKSL_SOURCE);
  } catch (e) {
    console.error('[LiquidGlassRim] Shader compilation error:', e);
  }
}

const CYCLE = 2.844;

export interface LiquidGlassRimProps {
  width: number;
  height: number;
  radius: number;
  /** 0 -> 1 reveal from the notification timeline */
  reveal?: SharedValue<number>;
  /** hairline, logical px */
  rimWidth?: number;
  /** seconds for one lobe travel cycle */
  lifetime?: number;
  /** origin position across bottom edge, 0..1 */
  originX?: number;
}

export function LiquidGlassRim({
  width,
  height,
  radius,
  reveal,
  rimWidth = 1.75,
  lifetime = 2.4, // Slower, elegant motion
  originX = 0.35,
}: LiquidGlassRimProps): React.JSX.Element | null {
  const reduce = useLiveReducedMotion();
  const t = useSharedValue(0);
  const rim = PixelRatio.roundToNearestPixel(rimWidth);

  // Mount-time animation start
  useEffect(() => {
    if (reduce) {
      t.value = -1;
      return;
    }
    cancelAnimation(t);
    t.value = 0;
    t.value = withRepeat(
      withTiming(CYCLE, {
        duration: CYCLE * lifetime * 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
    return () => {
      cancelAnimation(t);
    };
  }, [reduce, lifetime, t]);

  // Re-align on reveal without calling cross-thread JS functions
  useAnimatedReaction(
    () => (reveal ? reveal.value : 1),
    (v, prev) => {
      'worklet';
      const p = prev ?? 0;
      if (v >= 0.7 && p < 0.7 && !reduce) {
        cancelAnimation(t);
        t.value = 0;
        t.value = withRepeat(
          withTiming(CYCLE, {
            duration: CYCLE * lifetime * 1000,
            easing: Easing.linear,
          }),
          -1,
          false
        );
      }
    },
    [reduce, lifetime]
  );

  const uniforms = useDerivedValue(() => {
    const w = width > 0 ? width : 396;
    const h = height > 0 ? height : 74;
    const rad = Math.min(radius > 0 ? radius : 26, h / 2);
    const fadeVal = reveal ? reveal.value : 1;
    const safeFade = isNaN(fadeVal) ? 1 : Math.min(Math.max(fadeVal, 0), 1);
    const timeVal = isNaN(t.value) ? 0 : t.value;

    return {
      u_size: [w, h],
      u_radius: rad,
      u_rim: rim > 0 ? rim : 2,
      u_time: timeVal,
      u_fade: safeFade,
      u_originX: originX,
    };
  });

  if (!FX) return null;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { width, height }]}
    >
      <Canvas style={{ width, height }} pointerEvents="none">
        <Fill>
          <Shader source={FX} uniforms={uniforms} />
        </Fill>
      </Canvas>
    </View>
  );
}

export default LiquidGlassRim;
