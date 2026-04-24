import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: '#FAF8F4',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#1A1815',
          muted: '#6B6660',
          soft: '#908A82',
        },
        rule: '#E8E3DB',
        ruleSoft: '#F0ECE5',
        forest: {
          DEFAULT: '#1F3A2E',
          soft: '#E8EEE8',
          ink: '#12241C',
        },
        rust: '#8B4A1F',
        claret: '#7A2233',
        amber: {
          DEFAULT: '#B8860B',
          soft: '#F5E9C8',
          ink: '#5C420B',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        tightest: '-0.04em',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(26, 24, 21, 0.04)',
        lift: '0 8px 24px -8px rgba(26, 24, 21, 0.12)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
