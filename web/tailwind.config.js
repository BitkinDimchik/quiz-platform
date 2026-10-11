/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Figtree', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
      },
      colors: {
        paper: '#F4EDE3',
        ink: {
          DEFAULT: '#1B2744',
          muted: '#5A6478',
        },
        buzzer: {
          DEFAULT: '#FF6A2C',
          dark: '#E25518',
          light: '#FFC14A',
        },
        live: '#2A9D8F',
      },
      borderRadius: {
        DEFAULT: '16px',
      },
    },
  },
  plugins: [],
};
