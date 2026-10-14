import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Platform, View, type LayoutChangeEvent, type PointerEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import {
  INK_H,
  INK_W,
  compactStroke,
  dotsPath,
  gridPath,
  ruleGuides,
  strokePath,
  type InkStroke,
} from '@/components/ink/strokes';
import type { Rule } from '@/lib/paper';

export type InkTool = 'pen' | 'eraser';

interface Props {
  strokes: InkStroke[];
  /** Pad height in virtual units — INK_H for a page, INK_LINE_H for one line. */
  vh?: number;
  /** Ruling drawn under the ink. Omit for a plain surface (thumbnails). */
  rule?: Rule | null;
  /** Omit to render read-only (thumbnails, the collapsed card row). */
  edit?: {
    tool: InkTool;
    color: string;
    width: number;
    onAddStroke: (stroke: InkStroke) => void;
    onErase: (x: number, y: number, radius: number) => void;
    /** Fires on pen-down/pen-up so the parent can freeze its ScrollView. */
    onDrawingChange?: (drawing: boolean) => void;
  };
}

/** Erase radius in virtual units — roughly a fingertip on a 10" tablet. */
const ERASER_RADIUS = 26;

/** Below this distance a move is pen jitter, not a new point. */
const MIN_STEP = 1.5;

const GUIDE_COLOR = '#141414';

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
 * The writing surface: the ruling, the saved strokes, and the stroke currently
 * under the pen. The sheet's own colour is set by the caller's wrapper.
 *
 * Pointer events (not the responder system) carry `pointerType`, `pressure`
 * and the stylus buttons, which is the whole reason a stylus feels like a
 * stylus here. They behave the same on Android and on web, where
 * react-native-web forwards them straight to the DOM.
 */
export function InkCanvas({ strokes, vh = INK_H, rule = null, edit }: Props) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The live stroke lives in a ref and repaints on an animation frame. Held in
  // state instead, a 120Hz pen would queue a React render per sample.
  const live = useRef<InkStroke | null>(null);
  const [, repaint] = useReducer((n: number) => n + 1, 0);
  const frame = useRef<number | null>(null);
  const schedule = useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      repaint();
    });
  }, []);

  // Palm rejection: once a real pen has touched the screen we stop believing
  // finger input, so a hand resting on the tablet cannot draw. Until then
  // touch draws normally, for anyone without a stylus.
  const penSeen = useRef(false);
  const activePointer = useRef<number | null>(null);
  // Whether *this* stroke erases, decided at pen-down. The button can be let
  // go mid-stroke; switching behaviour half-way would be unpredictable.
  const erasingStroke = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const container = useRef<View>(null);
  const overlay = useRef<View>(null);

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
  const editable = edit != null;
  useEffect(() => {
    if (Platform.OS !== 'web' || !editable) return;
    const node = overlay.current as unknown as DomNode | null;
    if (!node?.addEventListener) return;

    const prevent = (e: Event) => e.preventDefault();
    // Single touches are already handled by `touch-action`; cancelling those
    // here could interrupt the pointer stream mid-stroke.
    const preventPinch = (e: Event) => {
      const touches = (e as unknown as { touches?: { length: number } }).touches;
      if (touches && touches.length > 1) e.preventDefault();
    };

    const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
    for (const type of gestures) node.addEventListener(type, prevent, { passive: false });
    node.addEventListener('dblclick', prevent, { passive: false });
    node.addEventListener('touchmove', preventPinch, { passive: false });

    return () => {
      for (const type of gestures) node.removeEventListener(type, prevent);
      node.removeEventListener('dblclick', prevent);
      node.removeEventListener('touchmove', preventPinch);
    };
  }, [editable]);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
    // Only needed if a platform leaves offsetX empty (see toVirtual).
    container.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
  }, []);

  const scale = size.width > 0 ? INK_W / size.width : 0;

  /** Event coordinates → virtual drawing space. */
  const toVirtual = (e: PointerEvent): [number, number] => {
    const n = e.nativeEvent;
    const localX = Number.isFinite(n.offsetX) ? n.offsetX : n.pageX - origin.current.x;
    const localY = Number.isFinite(n.offsetY) ? n.offsetY : n.pageY - origin.current.y;
    return [localX * scale, localY * scale];
  };

  /** A pen reports real pressure; everything else draws at full width. */
  const pressureOf = (e: PointerEvent): number => {
    const n = e.nativeEvent;
    if (n.pointerType !== 'pen') return 1;
    return n.pressure > 0 ? n.pressure : 0.5;
  };

  /** True when this pointer should be ignored (palm, or a second finger). */
  const rejects = (e: PointerEvent): boolean => {
    const n = e.nativeEvent;
    if (n.pointerType === 'pen') {
      penSeen.current = true;
      return false;
    }
    return penSeen.current && n.pointerType === 'touch';
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!edit || scale === 0 || rejects(e)) return;
    if (activePointer.current != null) return;
    activePointer.current = e.nativeEvent.pointerId;
    erasingStroke.current = edit.tool === 'eraser' || penWantsEraser(e);

    const [x, y] = toVirtual(e);
    if (erasingStroke.current) {
      edit.onErase(x, y, ERASER_RADIUS);
    } else {
      live.current = { c: edit.color, w: edit.width, p: [[x, y, pressureOf(e)]] };
      schedule();
    }
    edit.onDrawingChange?.(true);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!edit || activePointer.current !== e.nativeEvent.pointerId) return;
    const [x, y] = toVirtual(e);

    if (erasingStroke.current) {
      edit.onErase(x, y, ERASER_RADIUS);
      return;
    }
    const stroke = live.current;
    if (!stroke) return;
    const last = stroke.p[stroke.p.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) < MIN_STEP) return;
    stroke.p.push([x, y, pressureOf(e)]);
    schedule();
  };

  const finish = (e: PointerEvent, keep: boolean) => {
    if (!edit || activePointer.current !== e.nativeEvent.pointerId) return;
    activePointer.current = null;
    erasingStroke.current = false;
    const stroke = live.current;
    live.current = null;
    if (keep && stroke && stroke.p.length > 0) edit.onAddStroke(compactStroke(stroke));
    schedule();
    edit.onDrawingChange?.(false);
  };

  const liveStroke = live.current;
  const { baselines, midlines } = useMemo(() => ruleGuides(vh), [vh]);
  // Grid and dots are one path each; built here so a repaint mid-stroke does
  // not rebuild a 200-dot string.
  const grid = useMemo(() => (rule === 'grid' ? gridPath(vh) : ''), [rule, vh]);
  const dots = useMemo(() => (rule === 'dots' ? dotsPath(vh) : ''), [rule, vh]);

  return (
    <View ref={container} onLayout={onLayout} style={{ aspectRatio: INK_W / vh, width: '100%' }}>
      <Svg viewBox={`0 0 ${INK_W} ${vh}`} width="100%" height="100%" pointerEvents="none">
        {rule === 'lines' &&
          baselines.map((y) => (
            <Line
              key={`rule-${y}`}
              x1={36}
              y1={y}
              x2={INK_W - 36}
              y2={y}
              stroke={GUIDE_COLOR}
              strokeOpacity={0.16}
              strokeWidth={2}
            />
          ))}
        {rule === 'lines' &&
          midlines.map((y) => (
            <Line
              key={`mid-${y}`}
              x1={36}
              y1={y}
              x2={INK_W - 36}
              y2={y}
              stroke={GUIDE_COLOR}
              strokeOpacity={0.07}
              strokeWidth={2}
              strokeDasharray="10 14"
            />
          ))}
        {rule === 'grid' && grid !== '' && (
          <Path d={grid} stroke={GUIDE_COLOR} strokeOpacity={0.1} strokeWidth={1.6} fill="none" />
        )}
        {rule === 'dots' && dots !== '' && (
          <Path d={dots} fill={GUIDE_COLOR} fillOpacity={0.22} />
        )}
        {strokes.map((stroke, i) => (
          <Path key={i} d={strokePath(stroke)} fill={stroke.c} />
        ))}
        {liveStroke && <Path d={strokePath(liveStroke)} fill={liveStroke.c} />}
      </Svg>

      {/*
        The pointer target is this overlay, never a path inside the SVG, so
        `offsetX` is always measured against the drawing's own box. It also
        claims the touch responder, which stops the parent ScrollView from
        panning away mid-letter.
      */}
      {edit && (
        <View
          ref={overlay}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => finish(e, true)}
          // Keep the ink on cancel. iOS Safari fires pointercancel far more
          // readily than Android does (a system gesture taking over, its own
          // palm detection), and silently dropping the stroke the user just
          // drew is worse than keeping a slightly short one.
          onPointerCancel={(e) => finish(e, true)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          style={[
            { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
            // Web only: `touchAction` stops the browser scrolling instead of
            // drawing, and `userSelect` stops a drag from highlighting the
            // card's text mid-letter.
            Platform.OS === 'web'
              ? ({
                  touchAction: 'none',
                  userSelect: 'none',
                  // iOS Safari honours only the prefixed forms, and without
                  // the callout a long press pops up its own menu mid-stroke.
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                  cursor: 'crosshair',
                } as object)
              : null,
          ]}
        />
      )}
    </View>
  );
}
