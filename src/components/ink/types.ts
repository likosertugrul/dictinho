// Shared types for the handwriting canvas and its two input adapters.
//
// The adapters live in platform files (ink-surface.web.tsx /
// ink-surface.native.tsx) so Metro never bundles gesture-handler into the web
// build — the web path uses pointer events and has no use for it.

import type { RefObject } from 'react';

import type { InkStroke } from '@/components/ink/strokes';

export type InkTool = 'pen' | 'eraser';

export interface EditConfig {
  tool: InkTool;
  color: string;
  width: number;
  onAddStroke: (stroke: InkStroke) => void;
  onErase: (x: number, y: number, radius: number) => void;
  /** Fires on pen-down/pen-up so the parent can freeze its ScrollView. */
  onDrawingChange?: (drawing: boolean) => void;
}

/** Erase radius in virtual units — roughly a fingertip on a 10" tablet. */
export const ERASER_RADIUS = 26;

/**
 * What an input adapter gets: the three engine calls, plus the live values it
 * must read without re-rendering (`edit` is a fresh object every render, and
 * the canvas repaints once per frame while drawing).
 */
export interface InkSurfaceProps {
  begin: (x: number, y: number, pressure: number, erase: boolean) => void;
  extend: (x: number, y: number, pressure: number) => void;
  end: (keep: boolean) => void;
  editRef: RefObject<EditConfig | undefined>;
  /** Virtual units per layout pixel. */
  scaleRef: RefObject<number>;
  /** Canvas position in the window — the fallback when offsetX is missing. */
  originRef: RefObject<{ x: number; y: number }>;
  /** True once a real stylus has touched the screen (drives palm rejection). */
  penSeenRef: RefObject<boolean>;
}
