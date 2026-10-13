// Stroke model and geometry for handwritten notes.
//
// Strokes are stored as vectors in a fixed virtual space (INK_W × INK_H) and
// drawn through an SVG viewBox, so a note written on a 10" tablet renders
// correctly in a 120px thumbnail on a phone. Nothing here touches React or
// react-native-svg — it is plain math, so it can be unit-tested and reused by
// the notebook pages later.

/** Virtual drawing space. Every stored coordinate lives in these units. */
export const INK_W = 1000;
export const INK_H = 520;

/**
 * Height of a one-line pad — answering a flashcard needs a single word, not a
 * page. Same horizontal scale, so strokes stay comparable across both.
 */
export const INK_LINE_H = 260;

/**
 * A notebook sheet, close to A4's proportions. Taller than it is wide, because
 * a page of notes runs down the page — the editor scales the whole sheet to
 * fit the screen rather than offering zoom and pan.
 */
export const INK_PAGE_H = 1400;

/** `[x, y, pressure]` — pressure is 0‥1, and exactly 1 for non-pen input. */
export type InkPoint = [number, number, number];

/** One pen-down to pen-up line. `c` = colour, `w` = nominal width. */
export interface InkStroke {
  c: string;
  w: number;
  p: InkPoint[];
}

/** What a row's `strokes` column holds. */
export interface InkDrawing {
  width: number;
  height: number;
  strokes: InkStroke[];
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** One decimal is ~0.1 virtual units — far below what a pen can resolve. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Read strokes back from jsonb without trusting the shape. A note that was
 * somehow corrupted should come back as a blank pad, never crash the card.
 */
export function parseStrokes(value: unknown): InkStroke[] {
  if (!Array.isArray(value)) return [];
  const out: InkStroke[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Partial<InkStroke>;
    if (!Array.isArray(s.p) || typeof s.c !== 'string' || typeof s.w !== 'number') continue;
    const points: InkPoint[] = [];
    for (const pt of s.p) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const [x, y, pressure] = pt as number[];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push([x, y, Number.isFinite(pressure) ? clamp01(pressure!) : 1]);
    }
    if (points.length > 0) out.push({ c: s.c, w: s.w, p: points });
  }
  return out;
}

/** Distance from `pt` to the segment `a`–`b`. */
function perpDistance(pt: InkPoint, a: InkPoint, b: InkPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(pt[0] - a[0], pt[1] - a[1]);
  let t = ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy));
}

/**
 * Ramer–Douglas–Peucker. A pen at 120Hz produces far more points than the
 * shape needs; dropping the redundant ones keeps the saved note small and the
 * SVG path cheap to re-render. Kept points are the originals, so pressure
 * survives untouched. Iterative on purpose — a long stroke would blow the
 * stack in the recursive form.
 */
export function simplify(points: InkPoint[], tolerance = 0.8): InkPoint[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    let farthest = -1;
    let maxDistance = 0;
    for (let i = from + 1; i < to; i++) {
      const d = perpDistance(points[i], points[from], points[to]);
      if (d > maxDistance) {
        maxDistance = d;
        farthest = i;
      }
    }
    if (maxDistance > tolerance && farthest > 0) {
      keep[farthest] = 1;
      stack.push([from, farthest], [farthest, to]);
    }
  }
  const out: InkPoint[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i] === 1) out.push(points[i]);
  return out;
}

/** Simplify and round a freshly drawn stroke for storage. */
export function compactStroke(stroke: InkStroke): InkStroke {
  return {
    ...stroke,
    p: simplify(stroke.p).map(([x, y, pressure]): InkPoint => [r1(x), r1(y), Math.round(pressure * 100) / 100]),
  };
}

/** Half-width at a point: light pressure thins the line without hair-lining it. */
function radiusAt(stroke: InkStroke, pressure: number): number {
  return (stroke.w / 2) * (0.45 + 0.55 * clamp01(pressure));
}

/** Quadratic curve through the midpoints — smooths the polyline's corners. */
function smoothSide(side: [number, number][]): string {
  let d = `${r1(side[0][0])} ${r1(side[0][1])}`;
  for (let i = 1; i < side.length - 1; i++) {
    const mx = (side[i][0] + side[i + 1][0]) / 2;
    const my = (side[i][1] + side[i + 1][1]) / 2;
    d += ` Q ${r1(side[i][0])} ${r1(side[i][1])} ${r1(mx)} ${r1(my)}`;
  }
  const last = side[side.length - 1];
  return `${d} L ${r1(last[0])} ${r1(last[1])}`;
}

/**
 * The stroke as a single filled SVG path: up one side of the centre line and
 * back down the other. One `<Path>` per stroke keeps the SVG tree small, and
 * a filled outline is what makes pressure visible at all — a stroked path can
 * only have one width for its whole length.
 */
export function strokePath(stroke: InkStroke): string {
  const points = stroke.p;
  if (points.length === 0) return '';

  // A tap is a dot, drawn as two half-circle arcs.
  if (points.length === 1) {
    const [x, y, pressure] = points[0];
    const radius = Math.max(radiusAt(stroke, pressure), stroke.w * 0.3);
    return (
      `M ${r1(x - radius)} ${r1(y)} ` +
      `a ${r1(radius)} ${r1(radius)} 0 1 0 ${r1(radius * 2)} 0 ` +
      `a ${r1(radius)} ${r1(radius)} 0 1 0 ${r1(-radius * 2)} 0 Z`
    );
  }

  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    // Direction from the neighbours, so the normal follows the curve.
    const prev = points[i > 0 ? i - 1 : 0];
    const next = points[i < points.length - 1 ? i + 1 : points.length - 1];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    const radius = radiusAt(stroke, points[i][2]);
    left.push([points[i][0] + nx * radius, points[i][1] + ny * radius]);
    right.push([points[i][0] - nx * radius, points[i][1] - ny * radius]);
  }
  right.reverse();
  return `M ${smoothSide(left)} L ${smoothSide(right)} Z`;
}

/**
 * Ruled-paper geometry: a baseline every 160 units with a dashed x-height line
 * above it. Derived from the sheet height so one-line pads and full pages use
 * the same spacing instead of hard-coded positions.
 */
export function ruleGuides(vh: number): { baselines: number[]; midlines: number[] } {
  const baselines: number[] = [];
  for (let y = 170; y <= vh - 20; y += 160) baselines.push(y);
  return { baselines, midlines: baselines.map((y) => y - 50) };
}

const MARGIN = 36;

/** Squared paper as one path — a single SVG node instead of ~30 lines. */
export function gridPath(vh: number, step = 80): string {
  const x1 = INK_W - MARGIN;
  const yTop = 40;
  const yBottom = vh - 40;
  let d = '';
  for (let x = MARGIN; x <= x1 + 0.5; x += step) d += `M ${r1(x)} ${yTop} L ${r1(x)} ${r1(yBottom)} `;
  for (let y = yTop; y <= yBottom + 0.5; y += step) d += `M ${MARGIN} ${r1(y)} L ${r1(x1)} ${r1(y)} `;
  return d.trim();
}

/** Dotted paper, also one path: a tiny two-arc circle per intersection. */
export function dotsPath(vh: number, step = 80, radius = 2.6): string {
  const x1 = INK_W - MARGIN;
  const yBottom = vh - 40;
  const r = r1(radius);
  let d = '';
  for (let x = MARGIN; x <= x1 + 0.5; x += step) {
    for (let y = 40; y <= yBottom + 0.5; y += step) {
      d +=
        `M ${r1(x - radius)} ${r1(y)} ` +
        `a ${r} ${r} 0 1 0 ${r1(radius * 2)} 0 ` +
        `a ${r} ${r} 0 1 0 ${r1(-radius * 2)} 0 Z `;
    }
  }
  return d.trim();
}

/** Strokes left after rubbing out everything within `radius` of a point. */
export function eraseAt(strokes: InkStroke[], x: number, y: number, radius: number): InkStroke[] {
  const rSq = radius * radius;
  return strokes.filter((stroke) =>
    !stroke.p.some((pt) => {
      const dx = pt[0] - x;
      const dy = pt[1] - y;
      return dx * dx + dy * dy <= rSq;
    }),
  );
}
