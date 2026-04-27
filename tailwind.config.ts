import type { Config } from 'tailwindcss';

// Design tokens — single source of truth.
// Spacing: rely on Tailwind's 4px base (1=4, 2=8, 3=12, 4=16, 6=24, 8=32, 12=48, 16=64).
// Color: forest green is the only brand accent.
// Borders: one value (rule). RuleSoft is reserved for hover backgrounds.
// Text: three colors only — ink (primary), ink-muted, ink-soft (faint).
// Radii: 8px on cards/inputs/buttons, 12px on modals, 999px on pills.
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        cream: '#FAFAF8',     // page background (off-white, not pure white)
        surface: '#FFFFFF',   // cards, sidebar, modals

        // Text — three values only
        ink: {
          DEFAULT: '#0F1714', // primary
          muted: '#6B6F6A',   // secondary / labels
          soft: '#A0A39E',    // faint / hints / micro
        },

        // Borders — one value across the app
        rule: '#EAEAE6',
        ruleSoft: '#F4F4F0',  // hover backgrounds only

        // Brand accent — used only on primary buttons, active nav,
        // links, key data points. Nowhere else.
        forest: {
          DEFAULT: '#1F3A2E',
          soft: '#E8EEE8',
          ink: '#12241C',
        },

        // Status colors — sparingly. Distinct from forest brand.
        success: {
          DEFAULT: '#2F7D4F',
          soft: '#E6F1EA',
          ink: '#1A4A2F',
        },
        amber: {
          DEFAULT: '#B8860B',
          soft: '#F5E9C8',
          ink: '#5C420B',
        },
        claret: '#7A2233',
        rust: '#8B4A1F',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],     // 11px
        xs:   ['0.75rem',   { lineHeight: '1rem' }],      // 12px
        sm:   ['0.875rem',  { lineHeight: '1.5' }],       // 14px / 1.5 (body)
        base: ['1rem',      { lineHeight: '1.5' }],       // 16px
        lg:   ['1.125rem',  { lineHeight: '1.5' }],       // 18px
        xl:   ['1.25rem',   { lineHeight: '1.4' }],       // 20px
        '2xl':['1.5rem',    { lineHeight: '1.25' }],      // 24px H1
        '3xl':['1.75rem',   { lineHeight: '1.2' }],       // 28px
        '4xl':['2rem',      { lineHeight: '1.15' }],      // 32px
        '5xl':['2.5rem',    { lineHeight: '1.05' }],      // 40px display
        '6xl':['3rem',      { lineHeight: '1.05' }],      // 48px
      },
      letterSpacing: {
        tight: '-0.01em',
        tighter: '-0.02em',   // headings (per spec)
        tightest: '-0.04em',  // legacy display utility
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '8px',   // cards/inputs/buttons
        md: '8px',
        lg: '12px',       // modals
        xl: '12px',
        full: '9999px',   // pills
      },
      boxShadow: {
        // No shadow on cards by default. Modals get one soft shadow.
        card: 'none',
        lift: '0 12px 32px -12px rgba(15, 23, 20, 0.18)',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'palette-in': 'paletteIn 180ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        paletteIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      transitionDuration: {
        '100': '100ms',
        '150': '150ms',
        '180': '180ms',
      },
    },
  },
  plugins: [],
};

export default config;
