// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import {
  DROP_TINT_END,
  DROP_TINT_START,
  GLASS_IN_END,
  GLASS_IN_START,
  GOO_INSET_RATIO,
  SHADOW_BLUR,
  SHADOW_DY,
} from '../../constants/notification.consts';
import { buildGooMatrix } from '../../core/build-goo-matrix';
import { useDynamicNotifications } from '../../hooks/use-dynamic-notifications';
import type { INotificationGooey } from '../../interfaces/notification-gooey.interface';
import { ramp } from '../../logic/ramp';
import {
  Blur,
  Canvas,
  ColorMatrix,
  Group,
  Paint,
  RoundedRect,
  Shadow,
} from "@shopify/react-native-skia";
import { memo, useMemo } from "react";
import { StyleSheet } from "react-native";
import { interpolateColor, useDerivedValue } from "react-native-reanimated";

const Gooey: React.FC<INotificationGooey> &
  React.FunctionComponent<INotificationGooey> = memo<INotificationGooey>(
  ({
    blur,
    gain,
    threshold,
    islandColor,
    cardColor,
    shadowColor,
  }: INotificationGooey):
    | (React.ReactNode & React.ReactElement & React.JSX.Element)
    | null => {
    const context = useDynamicNotifications();
    const { layout, geometry, tint, dragY } = context;

    const pill = islandColor ?? context.islandColor;
    const body = cardColor ?? context.cardColor;
    const shade = shadowColor ?? context.shadowColor;
    const radius = blur ?? context.blur;

    const matrix = useMemo(
      () =>
        buildGooMatrix({
          gain: gain ?? context.gain,
          threshold: threshold ?? context.threshold,
        }),
      [gain, threshold, context.gain, context.threshold],
    );

    const inset = radius * GOO_INSET_RATIO;
    const islandX = layout.centerX - layout.islandWidth / 2;

    const droplet = useDerivedValue(
      () =>
        interpolateColor(
          tint.value,
          [DROP_TINT_START, DROP_TINT_END],
          [pill, body],
        ),
      [pill, body],
    );

    const x = useDerivedValue(() => geometry.value.x);
    const y = useDerivedValue(() => geometry.value.y);
    const width = useDerivedValue(() => geometry.value.width);
    const height = useDerivedValue(() => geometry.value.height);
    const r = useDerivedValue(() => geometry.value.radius);
    const neckX = useDerivedValue(() => geometry.value.neckX);
    const neckY = useDerivedValue(() => geometry.value.neckY);
    const neckWidth = useDerivedValue(() => geometry.value.neckWidth);
    const neckHeight = useDerivedValue(() => geometry.value.neckHeight);
    const neckRadius = useDerivedValue(() => geometry.value.neckRadius);
    const shadowOpacity = useDerivedValue(() => geometry.value.shadowOpacity);

    const gooOpacity = useDerivedValue(() => {
      'worklet';
      return 1 - ramp(geometry.value.widthRatio, GLASS_IN_START, GLASS_IN_END);
    });

    const dragShift = useDerivedValue(() => [{ translateY: dragY.value }]);

    return (
      <Canvas
        pointerEvents="none"
        style={[styles.canvas, { height: layout.canvasHeight }]}
      >
        <Group opacity={shadowOpacity} transform={dragShift}>
          <RoundedRect
            x={x}
            y={y}
            width={width}
            height={height}
            r={r}
          >
            <Shadow
              dx={0}
              dy={SHADOW_DY}
              blur={SHADOW_BLUR}
              color={shade}
              shadowOnly
            />
          </RoundedRect>
        </Group>

        <Group
          opacity={gooOpacity}
          layer={
            <Paint>
              <Blur blur={radius} />
              <ColorMatrix matrix={matrix} />
            </Paint>
          }
        >
          <RoundedRect
            x={islandX + inset}
            y={layout.islandTop + inset}
            width={layout.islandWidth - inset * 2}
            height={layout.islandHeight - inset * 2}
            r={Math.max(layout.islandRadius - inset, 0)}
            color={pill}
          />
          <RoundedRect
            x={neckX}
            y={neckY}
            width={neckWidth}
            height={neckHeight}
            r={neckRadius}
            color={pill}
          />
          <RoundedRect
            x={x}
            y={y}
            width={width}
            height={height}
            r={r}
            color={droplet}
          />
        </Group>

        <RoundedRect
          x={islandX}
          y={layout.islandTop}
          width={layout.islandWidth}
          height={layout.islandHeight}
          r={layout.islandRadius}
          color={pill}
        />
      </Canvas>
    );
  },
);
Gooey.displayName = 'Gooey';

const styles = StyleSheet.create({
  canvas: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});

export { Gooey };


