import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f7ff',
          100: '#e6ebff',
          200: '#c6d2ff',
          300: '#9caeff',
          400: '#6f84ff',
          500: '#4d63f7',
          600: '#3b49db',
          700: '#2f39b1',
          800: '#29338b',
          900: '#252f6d'
        }
      }
    }
  },
  plugins: []
};

export default config;
