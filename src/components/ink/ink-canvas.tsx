import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { InkSurface } from '@/components/ink/ink-surface';
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
import { ERASER_RADIUS, type EditConfig } from '@/components/ink/types';
import type { Rule } from '@/lib/paper';

export type { InkTool } from '@/components/ink/types';

interface Props {
  strokes: InkStroke[];
  /** Pad height in virtual units — INK_H for a page, INK_LINE_H for one line. */
  vh?: number;
  /** Ruling drawn under the ink. Omit for a plain surface (thumbnails). */
  rule?: Rule | null;
  /** Omit to render read-only (thumbnails, the collapsed card row). */
  edit?: EditConfig;
}

/** Below this distance a move is pen jitter, not a new point. */
const MIN_STEP = 1.5;

const GUIDE_COLOR = '#141414';

/**
 * The writing surface: the ruling, the saved strokes, and the stroke currently
 * under the pen. The sheet's own colour is set by the caller's wrapper.
 *
 * This file is the engine — three calls (begin / extend / end) and the SVG.
 * Input comes from whichever adapter the platform resolves `ink-surface` to:
 * pointer events on the web, gesture-handler's stylus data on native.
 */
export function InkCanvas({ strokes, vh = INK_H, rule = null, edit }: Props) {
  const [, setSize] = useState({ width: 0, height: 0 });

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

  // Whether *this* stroke erases, decided at pen-down. A stylus button can be
  // let go mid-stroke; switching behaviour half-way would be unpredictable.
  const erasingStroke = useRef(false);
  // True once a real stylus has touched the screen, so a resting palm stops
  // drawing. Until then touch draws normally, for anyone without a stylus.
  const penSeen = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const container = useRef<View>(null);

  // Live inputs the adapters read. `edit` is a fresh object on every render
  // and the canvas repaints once per frame while drawing, so the adapters must
  // not close over it.
  const editRef = useRef<EditConfig | undefined>(edit);
  editRef.current = edit;
  const scaleRef = useRef(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
    scaleRef.current = width > 0 ? INK_W / width : 0;
    // Only needed if a platform leaves offsetX empty (see the web adapter).
    container.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
  }, []);

  const begin = useCallback(
    (x: number, y: number, pressure: number, erase: boolean) => {
      const cfg = editRef.current;
      if (!cfg) return;
      erasingStroke.current = erase;
      if (erase) {
        cfg.onErase(x, y, ERASER_RADIUS);
      } else {
        live.current = { c: cfg.color, w: cfg.width, p: [[x, y, pressure]] };
        schedule();
      }
      cfg.onDrawingChange?.(true);
    },
    [schedule],
  );

  const extend = useCallback(
    (x: number, y: number, pressure: number) => {
      const cfg = editRef.current;
      if (!cfg) return;
      if (erasingStroke.current) {
        cfg.onErase(x, y, ERASER_RADIUS);
        return;
      }
      const stroke = live.current;
      if (!stroke) return;
      const last = stroke.p[stroke.p.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < MIN_STEP) return;
      stroke.p.push([x, y, pressure]);
      schedule();
    },
    [schedule],
  );

  const end = useCallback(
    (keep: boolean) => {
      const cfg = editRef.current;
      erasingStroke.current = false;
      const stroke = live.current;
      live.current = null;
      if (keep && cfg && stroke && stroke.p.length > 0) cfg.onAddStroke(compactStroke(stroke));
      schedule();
      cfg?.onDrawingChange?.(false);
    },
    [schedule],
  );

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
        {rule === 'dots' && dots !== '' && <Path d={dots} fill={GUIDE_COLOR} fillOpacity={0.22} />}
        {strokes.map((stroke, i) => (
          <Path key={i} d={strokePath(stroke)} fill={stroke.c} />
        ))}
        {liveStroke && <Path d={strokePath(liveStroke)} fill={liveStroke.c} />}
      </Svg>

      {/*
        The input target is an overlay above the SVG, never a path inside it,
        so on the web `offsetX` is always measured against the drawing's box.
      */}
      {edit && (
        <InkSurface
          begin={begin}
          extend={extend}
          end={end}
          editRef={editRef}
          scaleRef={scaleRef}
          originRef={origin}
          penSeenRef={penSeen}
        />
      )}
    </View>
  );
}
