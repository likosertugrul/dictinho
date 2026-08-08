import { useWindowDimensions } from 'react-native';

/**
 * Layout breakpoints (in px, window width).
 *
 * `useWindowDimensions` re-renders on every resize, so on the web the layout
 * flips back to the phone design the moment the browser window gets narrow —
 * no reload needed. On native the values are just the device size.
 */
export const BREAKPOINTS = {
  /** phone → tablet: wider columns, two-up lists */
  md: 768,
  /** tablet → desktop: side navigation instead of a bottom tab bar */
  lg: 1024,
  /** big desktop: three-up lists */
  xl: 1360,
} as const;

/** Max content widths — long lines are hard to read on a wide monitor. */
export const MAX_W = {
  /** forms, auth, onboarding */
  form: 560,
  /** a single flashcard / drill */
  card: 640,
  /** reading: word detail, articles */
  content: 780,
  /** lists and dashboards that can use a multi-column grid */
  wide: 1120,
} as const;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    /** ≥ 768 — roomier paddings, two-column lists */
    isTablet: width >= BREAKPOINTS.md,
    /** ≥ 1024 — side navigation, desktop chrome */
    isDesktop: width >= BREAKPOINTS.lg,
  };
}

/**
 * Columns for a word grid, capped at `max`. The sidebar eats ~232px on
 * desktop, which is why the three-column step waits until `xl`.
 */
export function useColumns(max = 3) {
  const { width } = useWindowDimensions();
  const cols = width >= BREAKPOINTS.xl ? 3 : width >= BREAKPOINTS.md ? 2 : 1;
  return Math.min(cols, max);
}
