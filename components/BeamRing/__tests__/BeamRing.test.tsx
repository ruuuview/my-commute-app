// components/BeamRing/__tests__/BeamRing.test.tsx
// Component tests for BeamRing with the Skia runtime and Reanimated mocked.
//
// NOTE: @testing-library/react-native@14 → render() returns a Promise; every
// render call below is awaited (async tests).

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { hexToLinearRgb } from '../beamPalettes';

const mockMake: jest.Mock = jest.fn(() => ({ __mockEffect: true }));
let mockCapturedShaderProps: any = null;

jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View: RNView } = require('react-native');
  return {
    Canvas: (props: any) =>
      React.createElement(RNView, { ...props, testID: 'mock-skia-canvas' }),
    Fill: (props: any) => React.createElement(RNView, null, props.children),
    Shader: (props: any) => {
      mockCapturedShaderProps = props;
      return null;
    },
    Skia: { RuntimeEffect: { Make: (...args: any[]) => mockMake(...args) } },
  };
});

// Lightweight reanimated stub (component under test only uses these symbols).
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (init: number) => ({ value: init }),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useReducedMotion: () => false,
    withTiming: (target: number) => target,
    withRepeat: (anim: unknown) => anim,
    cancelAnimation: () => {},
    Easing: { linear: (x: number) => x },
  };
});

import BeamRing from '../BeamRing';

const UNIFORM_KEYS = [
  'u_resolution',
  'u_time',
  'u_cornerRadius',
  'u_strength',
  'u_active',
  'u_accent',
  'u_baseRim',
  'u_beamWidth',
  'u_tailTurns',
  'u_bloomRadius',
  'u_frozen',
];

async function renderAndLayout(props: React.ComponentProps<typeof BeamRing>, w = 200, h = 64) {
  const screen = await render(<BeamRing {...props} />);
  fireEvent(screen.getByTestId('beam-ring'), 'layout', {
    nativeEvent: { layout: { width: w, height: h } },
  });
  // RNTL v14 + React 19 flushes the onLayout setState asynchronously.
  await screen.findByTestId('mock-skia-canvas');
  return screen;
}

describe('BeamRing', () => {
  beforeEach(() => {
    mockMake.mockClear();
    mockMake.mockReturnValue({ __mockEffect: true });
    mockCapturedShaderProps = null;
  });

  it('renders no canvas before layout is measured', async () => {
    const screen = await render(<BeamRing cornerRadius={32} />);
    expect(screen.queryByTestId('mock-skia-canvas')).toBeNull();
  });

  it('renders the Skia canvas after layout', async () => {
    const screen = await renderAndLayout({ cornerRadius: 32 });
    expect(screen.getByTestId('mock-skia-canvas')).toBeTruthy();
  });

  it('is pointer-transparent and fills its host', async () => {
    const screen = await render(<BeamRing cornerRadius={32} />);
    const root = screen.getByTestId('beam-ring');
    expect(root.props.pointerEvents).toBe('none');
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ position: 'absolute' })]),
    );
  });

  it('spreads the style prop after the fill style', async () => {
    const screen = await render(<BeamRing cornerRadius={32} style={{ zIndex: 5 }} />);
    const root = screen.getByTestId('beam-ring');
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ zIndex: 5 })]),
    );
  });

  it('compiles the boundary-only shader once per mount', async () => {
    await renderAndLayout({ cornerRadius: 32 });
    expect(mockMake).toHaveBeenCalledTimes(1);
    const src: string = mockMake.mock.calls[0][0];
    expect(src).toContain('vec4 main(vec2 fragCoord)');
    expect(src).toContain('headPoint');
    expect(src).toContain('u_bloomRadius');
    // The chrome body fill was cut: no finish switch, no sheen sweep.
    expect(src).not.toContain('u_finish');
    expect(src).not.toContain('sheen');
  });

  it('passes a complete uniforms record with the default palette', async () => {
    await renderAndLayout({ cornerRadius: 32 });
    const uniforms = mockCapturedShaderProps.uniforms.value;
    for (const key of UNIFORM_KEYS) {
      expect(uniforms[key]).toBeDefined();
    }
    expect(uniforms.u_resolution).toEqual([200, 64]);
    expect(uniforms.u_cornerRadius).toBe(32);
    expect(uniforms.u_strength).toBe(1);
    expect(uniforms.u_active).toBe(1);
    expect(uniforms.u_frozen).toBe(0);
    expect(uniforms.u_accent).toEqual(hexToLinearRgb('#A9BCF2'));
  });

  it('tints the beam with the accent prop', async () => {
    await renderAndLayout({ cornerRadius: 32, accent: '#FF0000' });
    const uniforms = mockCapturedShaderProps.uniforms.value;
    const [r, g, b] = uniforms.u_accent;
    expect(r).toBeCloseTo(1, 5);
    expect(g).toBeCloseTo(0, 5);
    expect(b).toBeCloseTo(0, 5);
  });

  it('falls back to the default accent for invalid hex', async () => {
    await renderAndLayout({ cornerRadius: 32, accent: 'not-a-color' });
    const uniforms = mockCapturedShaderProps.uniforms.value;
    expect(uniforms.u_accent).toEqual(hexToLinearRgb('#A9BCF2'));
  });

  it('freezes to a static rim when reducedMotion is set', async () => {
    await renderAndLayout({ cornerRadius: 32, reducedMotion: true });
    const uniforms = mockCapturedShaderProps.uniforms.value;
    expect(uniforms.u_frozen).toBe(1);
    expect(uniforms.u_time).toBe(0);
  });

  it('scales canvas opacity from the progress shared value', async () => {
    const screen = await render(
      <BeamRing cornerRadius={32} progress={{ value: 0.4 } as any} />,
    );
    const root = screen.getByTestId('beam-ring');
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 0.4 })]),
    );
  });

  it('renders at full opacity without a progress prop', async () => {
    const screen = await render(<BeamRing cornerRadius={32} />);
    const root = screen.getByTestId('beam-ring');
    expect(root.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ opacity: 1 })]),
    );
  });

  it('falls back to a static ring when the shader fails to compile', async () => {
    mockMake.mockReturnValueOnce(null);
    const screen = await render(<BeamRing cornerRadius={32} />);
    fireEvent(screen.getByTestId('beam-ring'), 'layout', {
      nativeEvent: { layout: { width: 200, height: 64 } },
    });
    await screen.findByTestId('beam-ring-fallback');
    expect(screen.queryByTestId('mock-skia-canvas')).toBeNull();
  });
});
