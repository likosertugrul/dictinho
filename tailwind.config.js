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
          white: '#FAF8F3',
          yellow: '#F4C542',
          mint: '#CFE6C9',
          blush: '#F2D6CE',
          sky: '#BFE3F2',
        },
        // Canvas ink (src/components/ink) — not UI surfaces
        inks: {
          ink: '#141414',
          coral: '#F5654E',
          blue: '#2B5FA8',
          green: '#2F6F4E',
          plum: '#7A3E7E',
        },
      },
      borderRadius: {
        card: '24px',
      },
    },
  },
  plugins: [],
};
