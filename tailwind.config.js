/** @type {import('tailwindcss').Config} */
// SYNC: color/radius values mirror src/theme/tokens.ts (single source of truth
// for runtime code). Update both files together.
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: '#141414',
        surface: '#1E1E1E',
        surfaceAlt: '#232323',
        primary: '#F5654E',
        textHi: '#FFFFFF',
        textLo: '#A0A0A0',
        border: '#2C2C2C',
        pastel: {
          cream: '#F3ECDD',
          yellow: '#F4C542',
          mint: '#CFE6C9',
          blush: '#F2D6CE',
          sky: '#BFE3F2',
        },
      },
      borderRadius: {
        card: '24px',
      },
    },
  },
  plugins: [],
};
