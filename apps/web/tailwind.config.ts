import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary = warm charcoal "ink" (buttons, pills, dark text) — the
        // reference uses near-black filled controls with white text.
        brand: {
          50: '#F5F3EF',
          100: '#E9E5DE',
          200: '#D6D0C6',
          300: '#B3ABA0',
          400: '#6E6A63',
          500: '#2C2A28',
          600: '#211F1D',
          700: '#2C2A28',
          800: '#1B1A18',
          900: '#121110',
        },
        // Accent = golden amber (logo, active nav, highlights, key figures).
        gold: {
          50: '#FDF7E7',
          100: '#FAECC4',
          200: '#F5D888',
          300: '#EFC455',
          400: '#EAB02E',
          500: '#E0A019',
          600: '#BE8410',
          700: '#96680E',
          800: '#6B4B0E',
        },
        cream: {
          DEFAULT: '#F6F4EE',
          100: '#FBFAF6',
          200: '#EFEBE1',
        },
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.15rem',
      },
    },
  },
  plugins: [],
};

export default config;
