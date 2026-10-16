import { useEffect, useRef } from 'react';
import { View, type PointerEvent } from 'react-native';

import type { InkSurfaceProps } from '@/components/ink/types';

/** Just enough of the DOM to attach web-only listeners, no `any`. */
interface DomNode {
  addEventListener(type: string, handler: (e: Event) => void, options?: object): void;
  removeEventListener(type: string, handler: (e: Event) => void): void;
}

/**
 * A pen asking to erase by hardware rather than by the toolbar: a USI/Wacom
 * eraser end arrives as a pen with the eraser button (`buttons & 32`, or
 * `button === 5`), and a Samsung S Pen held with its side button down arrives
 * with the barrel bit (`buttons & 2`). `pointerType` stays `'pen'` in both
 * cases — the spec has no separate eraser type — so the buttons are the only
 * signal. Fingers and mice never erase this way.
 */
function penWantsEraser(e: PointerEvent): boolean {
  const n = e.nativeEvent;
  if (n.pointerType !== 'pen') return false;
  const buttons = typeof n.buttons === 'number' ? n.buttons : 0;
  const button = typeof n.button === 'number' ? n.button : -1;
  return (buttons & 32) !== 0 || (buttons & 2) !== 0 || button === 5 || button === 2;
}

/**
 * Web input: W3C pointer events, which carry `pointerType`, `pressure` and
 * the stylus buttons.
 */
export function InkSurface({
  begin,
  extend,
  end,
  editRef,
  scaleRef,
  originRef,
  penSeenRef,
}: InkSurfaceProps) {
  const node = useRef<View>(null);
  const activePointer = useRef<number | null>(null);

  /** Event coordinates → virtual drawing space. */
  const toVirtual = (e: PointerEvent): [number, number] => {
    const n = e.nativeEvent;
    const scale = scaleRef.current ?? 0;
    const origin = originRef.current ?? { x: 0, y: 0 };
    const localX = Number.isFinite(n.offsetX) ? n.offsetX : n.pageX - origin.x;
    const localY = Number.isFinite(n.offsetY) ? n.offsetY : n.pageY - origin.y;
    return [localX * scale, localY * scale];
  };

  /** A pen reports real pressure; everything else draws at full width. */
  const pressureOf = (e: PointerEvent): number => {
    const n = e.nativeEvent;
    if (n.pointerType !== 'pen') return 1;
    return n.pressure > 0 ? n.pressure : 0.5;
  };

  const onPointerDown = (e: PointerEvent) => {
    const cfg = editRef.current;
    if (!cfg || !scaleRef.current) return;
    const n = e.nativeEvent;
    if (n.pointerType === 'pen') penSeenRef.current = true;
    // Once a stylus has been used, a bare touch is a resting palm.
    else if (penSeenRef.current && n.pointerType === 'touch') return;
    if (activePointer.current != null) return;

    activePointer.current = n.pointerId;
    const [x, y] = toVirtual(e);
    begin(x, y, pressureOf(e), cfg.tool === 'eraser' || penWantsEraser(e));
  };

  const onPointerMove = (e: PointerEvent) => {
    if (activePointer.current !== e.nativeEvent.pointerId) return;
    const [x, y] = toVirtual(e);
    extend(x, y, pressureOf(e));
  };

  // Keep the ink on cancel too. iOS Safari fires pointercancel far more
  // readily than Android does, and silently dropping the stroke the user just
  // drew is worse than keeping a slightly short one.
  const finish = (e: PointerEvent) => {
    if (activePointer.current !== e.nativeEvent.pointerId) return;
    activePointer.current = null;
    end(true);
  };

  /**
   * iPad Safari ignores `touch-action: none` for its own pinch-zoom and
   * double-tap zoom, so writing with a palm on the glass zooms the page
   * instead of drawing. Those gestures are only cancellable through the
   * WebKit-specific `gesture*` events and a multi-touch `touchmove`, which
   * React Native's prop surface does not expose — hence the DOM listeners.
   *
   * Scoped to the drawing surface on purpose: pinch-to-zoom keeps working
   * everywhere else in the app.
   */
  useEffect(() => {
    const el = node.current as unknown as DomNode | null;
    if (!el?.addEventListener) return;

    const prevent = (e: Event) => e.preventDefault();
    // Single touches are already handled by `touch-action`; cancelling those
    // here could interrupt the pointer stream mid-stroke.
    const preventPinch = (e: Event) => {
      const touches = (e as unknown as { touches?: { length: number } }).touches;
      if (touches && touches.length > 1) e.preventDefault();
    };

    const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
    for (const type of gestures) el.addEventListener(type, prevent, { passive: false });
    el.addEventListener('dblclick', prevent, { passive: false });
    el.addEventListener('touchmove', preventPinch, { passive: false });

    return () => {
      for (const type of gestures) el.removeEventListener(type, prevent);
      el.removeEventListener('dblclick', prevent);
      el.removeEventListener('touchmove', preventPinch);
    };
  }, []);

  return (
    <View
      ref={node}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      style={[
        { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
        // `touchAction` stops the browser scrolling instead of drawing, and
        // `userSelect` stops a drag from highlighting the card's text
        // mid-letter. iOS Safari honours only the prefixed forms, and without
        // the callout a long press pops up its own menu mid-stroke.
        {
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
          cursor: 'crosshair',
        } as object,
      ]}
    />
  );
}
