/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dd: {
          bg: '#15110f',
          panel: '#241e1b',
          panel2: '#2f2723',
          border: '#463b34',
          accent: '#8b2b2b',
          accent2: '#a83737',
          positive: '#5b8a5b',
          warn: '#b8893b',
          text: '#ece3d8',
          muted: '#9c9088',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
