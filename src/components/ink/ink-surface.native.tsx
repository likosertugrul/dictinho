import { useMemo } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { InkSurfaceProps } from '@/components/ink/types';

/** Some drivers report 0 for a resting stylus; treat that as a light touch. */
function clampPressure(pressure: number): number {
  if (!Number.isFinite(pressure) || pressure <= 0) return 0.5;
  return pressure > 1 ? 1 : pressure;
}

/**
 * Native input: gesture-handler's pan gesture and its `stylusData`.
 *
 * React Native's own pointer events are not an option here. On iOS they sit
 * behind `RCTDispatchW3CPointerEvents`, which defaults to NO (see
 * react-native/React/Base/RCTConstants.m), so `onPointerDown` never fires at
 * all — that is why handwriting did nothing in the iPhone build.
 * gesture-handler implements stylus data natively on both platforms
 * (apple/RNGHStylusData.m, android/.../StylusData.kt), so pressure survives.
 *
 * What it cannot give us is the stylus button state, so the S Pen's
 * side-button eraser is web-only; in the apps the toolbar's eraser is the way.
 */
export function InkSurface({ begin, extend, end, editRef, scaleRef, penSeenRef }: InkSurfaceProps) {
  const pan = useMemo(
    () =>
      Gesture.Pan()
        // A dot is a legitimate mark, so the gesture must start on contact
        // rather than after a drag threshold.
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        // The callbacks touch React refs, so they cannot run on the UI thread
        // as worklets.
        .runOnJS(true)
        .onBegin((e) => {
          const cfg = editRef.current;
          const scale = scaleRef.current ?? 0;
          if (!cfg || scale === 0) return;
          const stylus = e.stylusData;
          if (stylus) penSeenRef.current = true;
          // Once a stylus has been used, a bare finger is a resting palm.
          else if (penSeenRef.current) return;
          begin(
            e.x * scale,
            e.y * scale,
            stylus ? clampPressure(stylus.pressure) : 1,
            cfg.tool === 'eraser',
          );
        })
        .onUpdate((e) => {
          const scale = scaleRef.current ?? 0;
          if (scale === 0) return;
          const stylus = e.stylusData;
          if (!stylus && penSeenRef.current) return;
          extend(e.x * scale, e.y * scale, stylus ? clampPressure(stylus.pressure) : 1);
        })
        .onFinalize(() => end(true)),
    [begin, extend, end, editRef, scaleRef, penSeenRef],
  );

  return (
    <GestureDetector gesture={pan}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
    </GestureDetector>
  );
}
