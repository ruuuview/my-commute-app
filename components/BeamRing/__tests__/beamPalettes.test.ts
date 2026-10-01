// components/BeamRing/__tests__/beamPalettes.test.ts
// Pure-math tests for the BeamRing helpers (no Skia runtime needed).

import {
  BASE_RIM,
  BEAM_ACCENT_DEFAULT,
  BEAM_HEAD,
  BEAM_TAIL_VIOLET,
  clampedRadius,
  clampedStrength,
  headArcDistance,
  headPoint,
  hexToLinearRgb,
  hexToRgba,
  isValidHex,
  roundedRectPerimeter,
} from '../beamPalettes';

describe('palette constants', () => {
  it('are valid hex colors', () => {
    for (const c of [BEAM_HEAD, BEAM_ACCENT_DEFAULT, BEAM_TAIL_VIOLET, BASE_RIM]) {
      expect(isValidHex(c)).toBe(true);
    }
  });
  it('head is white-hot, base rim is the faint iridescent tint', () => {
    expect(BEAM_HEAD).toBe('#FFFFFF');
    expect(BASE_RIM).toBe('#DCDEE9');
  });
});

describe('isValidHex', () => {
  it('accepts #RRGGBB only', () => {
    expect(isValidHex('#A9BCF2')).toBe(true);
    expect(isValidHex('#a9bcf2')).toBe(true);
    expect(isValidHex('#FFF')).toBe(false);
    expect(isValidHex('A9BCF2')).toBe(false);
    expect(isValidHex('#GGGGGG')).toBe(false);
    expect(isValidHex('red')).toBe(false);
    expect(isValidHex('')).toBe(false);
  });
});

describe('hexToLinearRgb', () => {
  it('maps white and black exactly', () => {
    expect(hexToLinearRgb('#FFFFFF')).toEqual([1, 1, 1]);
    expect(hexToLinearRgb('#000000')).toEqual([0, 0, 0]);
  });
  it('applies the sRGB transfer curve (50% grey ~ 0.216 linear)', () => {
    const [r, g, b] = hexToLinearRgb('#808080');
    expect(r).toBeCloseTo(0.2159, 3);
    expect(g).toBeCloseTo(0.2159, 3);
    expect(b).toBeCloseTo(0.2159, 3);
  });
  it('preserves channel order for the default accent', () => {
    const [r, g, b] = hexToLinearRgb(BEAM_ACCENT_DEFAULT);
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
    expect(r).toBeGreaterThan(0.3); // luminance-boosted for dark glass
  });
  it('throws on invalid input', () => {
    expect(() => hexToLinearRgb('#FFF')).toThrow();
    expect(() => hexToLinearRgb('nope')).toThrow();
  });
});

describe('hexToRgba', () => {
  it('formats an rgba() string', () => {
    expect(hexToRgba('#A9BCF2', 0.5)).toBe('rgba(169, 188, 242, 0.5)');
  });
  it('clamps alpha to 0..1', () => {
    expect(hexToRgba('#FFFFFF', 7)).toBe('rgba(255, 255, 255, 1)');
    expect(hexToRgba('#FFFFFF', -2)).toBe('rgba(255, 255, 255, 0)');
  });
  it('throws on invalid input', () => {
    expect(() => hexToRgba('#FFF', 1)).toThrow();
  });
});

describe('clampedStrength', () => {
  it('clamps to 0..1 and treats garbage as full', () => {
    expect(clampedStrength(0.4)).toBe(0.4);
    expect(clampedStrength(-2)).toBe(0);
    expect(clampedStrength(7)).toBe(1);
    expect(clampedStrength(NaN)).toBe(1);
  });
});

describe('clampedRadius', () => {
  it('caps the radius so the rounded rect stays valid', () => {
    expect(clampedRadius(999, 200, 64)).toBeCloseTo(31, 10);
    expect(clampedRadius(20, 200, 64)).toBe(20);
    expect(clampedRadius(-5, 200, 64)).toBe(0);
  });
  it('returns 0 for degenerate sizes', () => {
    expect(clampedRadius(20, 0, 64)).toBe(0);
    expect(clampedRadius(20, 200, -3)).toBe(0);
  });
});

describe('roundedRectPerimeter', () => {
  it('matches P = 2*(w-2r) + 2*(h-2r) + 2*pi*r (r clamped like the shader)', () => {
    // w=200 h=64 r=32 -> r clamps to 0.5*64-1 = 31 -> 2*138 + 2*2 + 2*pi*31
    expect(roundedRectPerimeter(200, 64, 32)).toBeCloseTo(276 + 4 + 2 * Math.PI * 31, 10);
    expect(roundedRectPerimeter(200, 100, 20)).toBeCloseTo(
      2 * 160 + 2 * 60 + 2 * Math.PI * 20,
      10,
    );
  });
  it('degenerates to the rect perimeter when r = 0', () => {
    expect(roundedRectPerimeter(200, 64, 0)).toBeCloseTo(528, 10);
  });
});

describe('headPoint', () => {
  const W = 200;
  const H = 100;
  const R = 20;
  const P = roundedRectPerimeter(W, H, R);
  const dist = (a: [number, number], b: [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);

  it('parks at top-center for s = 0', () => {
    const [x, y] = headPoint(0, W, H, R);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(-H / 2, 10);
  });

  it('travels clockwise: small s moves right along the top edge', () => {
    const [x, y] = headPoint(10, W, H, R);
    expect(x).toBeCloseTo(10, 10);
    expect(y).toBeCloseTo(-H / 2, 10);
  });

  it('reaches the rightmost point at a quarter turn', () => {
    const [x] = headPoint(P / 4, W, H, R);
    expect(x).toBeCloseTo(W / 2, 6);
  });

  it('wraps seamlessly: s = P is top-center again', () => {
    const [x, y] = headPoint(P, W, H, R);
    expect(x).toBeCloseTo(0, 6);
    expect(y).toBeCloseTo(-H / 2, 6);
  });

  it('wraps negative arc distances', () => {
    const a = headPoint(-10, W, H, R);
    const b = headPoint(P - 10, W, H, R);
    expect(dist(a, b)).toBeLessThan(1e-6);
  });

  it('is continuous across every segment boundary', () => {
    const lx = W - 2 * R;
    const ly = H - 2 * R;
    const arc = 0.5 * Math.PI * R;
    const bounds: number[] = [];
    let acc = 0;
    for (const len of [0.5 * lx, arc, ly, arc, lx, arc, ly, arc]) {
      acc += len;
      bounds.push(acc);
    }
    for (const b of bounds) {
      const before = headPoint(b - 1e-3, W, H, R);
      const after = headPoint(b + 1e-3, W, H, R);
      expect(dist(before, after)).toBeLessThan(0.01);
    }
  });

  it('walks the full perimeter exactly once (chord sum ~= P)', () => {
    const N = 720;
    let sum = 0;
    let prev = headPoint(0, W, H, R);
    for (let i = 1; i <= N; i++) {
      const p = headPoint((P * i) / N, W, H, R);
      sum += dist(prev, p);
      prev = p;
    }
    expect(sum).toBeCloseTo(P, -1); // within ~5px of P
  });

  it('handles a sharp rect (r = 0)', () => {
    const [x, y] = headPoint(0, 200, 64, 0);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(-32, 10);
    const [x2] = headPoint(50, 200, 64, 0);
    expect(x2).toBeCloseTo(50, 10);
  });
});

describe('headArcDistance', () => {
  const P = roundedRectPerimeter(200, 100, 20);

  it('maps t in [0,1] to one revolution', () => {
    expect(headArcDistance(0, 200, 100, 20)).toBe(0);
    expect(headArcDistance(0.5, 200, 100, 20)).toBeCloseTo(P / 2, 10);
    // t = 1 wraps to 0: seamless with the withRepeat clock.
    expect(headArcDistance(1, 200, 100, 20)).toBe(0);
    expect(headArcDistance(0.999, 200, 100, 20)).toBeCloseTo(0.999 * P, 6);
  });

  it('wraps negative t', () => {
    expect(headArcDistance(-0.25, 200, 100, 20)).toBeCloseTo(0.75 * P, 10);
  });
});
