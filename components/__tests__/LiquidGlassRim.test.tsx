import React from 'react';
import { render } from '@testing-library/react-native';
import { LiquidGlassRim } from '../LiquidGlassRim';

jest.mock('@shopify/react-native-skia', () => {
  const ReactActual = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  return {
    Canvas: (props: any) =>
      ReactActual.createElement(RNView, { ...props, testID: 'mock-skia-canvas' }, props.children),
    Fill: (props: any) => ReactActual.createElement(RNView, null, props.children),
    Shader: (props: any) => ReactActual.createElement(RNView, { testID: 'mock-shader' }),
    ColorShader: () => null,
    useClock: () => ({ value: 1000 }),
    Skia: { RuntimeEffect: { Make: jest.fn(() => ({ __mockEffect: true })) } },
  };
});

jest.mock('react-native-reanimated', () => {
  const { View: RNView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RNView },
    useSharedValue: (init: number) => ({ value: init }),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedStyle: (fn: () => unknown) => fn(),
    useAnimatedReaction: jest.fn(),
    cancelAnimation: jest.fn(),
    withDelay: (_d: number, a: unknown) => a,
    withRepeat: (a: unknown) => a,
    withTiming: (to: unknown) => to,
    Easing: {
      inOut: (fn: unknown) => fn,
      sin: (t: number) => t,
      linear: (t: number) => t,
    },
  };
});

describe('LiquidGlassRim', () => {
  it('renders Skia canvas and shader without throwing', async () => {
    const mockReveal = { value: 1 };
    const screen = await render(
      <LiquidGlassRim
        width={280}
        height={64}
        radius={32}
        reveal={mockReveal as any}
        rimWidth={7}
      />
    );
    expect(screen.toJSON()).toBeTruthy();
  });
});

