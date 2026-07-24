// Dictinho design tokens — derived from docs/design-reference.png
// SYNC: tailwind.config.js mirrors these values for className usage.
// Dark-first design; a light set can be added later behind the same shape.

export const colors = {
  bg: '#141414',
  surface: '#1E1E1E',
  surfaceAlt: '#232323',
  primary: '#F5654E',
  onPrimary: '#FFFFFF',
  textHi: '#FFFFFF',
  textLo: '#A0A0A0',
  border: '#2C2C2C',
  // Pastel category-card palette (black text on top: onPastel)
  pastel: {
    cream: '#F3ECDD',
    yellow: '#F4C542',
    mint: '#CFE6C9',
    blush: '#F2D6CE',
    sky: '#BFE3F2',
  },
  onPastel: '#141414',
} as const;

export const radius = {
  sm: 12,
  md: 20,
  card: 24,
  pill: 999,
} as const;

/** 4pt grid */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  caption: { fontSize: 13, fontWeight: '400' },
} as const;

export type PastelColor = keyof typeof colors.pastel;
