// Vendored from rit3zh/expo-dynamic-notifications @ 5de059a (MIT License). Imports rewritten from @/ alias to relative paths.
import {
  DROP_TINT_END,
  DROP_TINT_START,
  GOO_INSET_RATIO,
  SHADOW_BLUR,
  SHADOW_DY,
} from '../../constants/notification.consts';
import { buildGooMatrix } from '../../core/build-goo-matrix';
import { clamp } from '../../logic/clamp.default';
import { useDynamicNotifications } from '../../hooks/use-dynamic-notifications';
import { useNotificationGeometry } from '../../hooks/use-notification-geometry';
import type { INotificationGooey } from '../../interfaces/notification-gooey.interface';
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
    const { layout, drop, expand, tint, reveal } = context;

    const geometry = useNotificationGeometry({ drop, expand, layout });

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

    // Hybrid crossfade: the goo group below is pure transition chrome (the
    // persistent island is drawn separately). As the card reveals, the opaque
    // Skia card fades out while the true dark-glass card in <Content> fades
    // in on the same `reveal` value — the two can never desync.
    const gooOpacity = useDerivedValue(
      () => 1 - clamp(reveal.value, 0, 1),
      [reveal],
    );

    // Design spec (theme/colors.ts GLASS): zero shadows behind cards. The
    // shadow belongs to the morph transition only — it fades with the goo.
    const restingShadowOpacity = useDerivedValue(
      () => geometry.shadowOpacity.value * (1 - clamp(reveal.value, 0, 1)),
      [geometry.shadowOpacity, reveal],
    );

    return (
      <Canvas
        pointerEvents="none"
        style={[styles.canvas, { height: layout.canvasHeight }]}
      >
        <Group opacity={restingShadowOpacity}>
          <RoundedRect
            x={geometry.x}
            y={geometry.y}
            width={geometry.width}
            height={geometry.height}
            r={geometry.radius}
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

        <Group opacity={gooOpacity}>
        <Group
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
            x={geometry.neckX}
            y={geometry.neckY}
            width={geometry.neckWidth}
            height={geometry.neckHeight}
            r={geometry.neckRadius}
            color={pill}
          />
          <RoundedRect
            x={geometry.x}
            y={geometry.y}
            width={geometry.width}
            height={geometry.height}
            r={geometry.radius}
            color={droplet}
          />
        </Group>
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
