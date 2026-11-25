import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './shared/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3b6ea8',
          dark: '#2c5282',
          light: '#ebf2fa',
          border: '#d3e0ef',
        },
        surface: '#ffffff',
        background: '#f3f4f6',
        // khung giống CMS: dải tài khoản + thanh menu
        utility: { DEFAULT: '#11151d', muted: '#b8c0cc' },
        nav: { DEFAULT: '#1a202c', muted: '#c9d0da' },
        border: {
          DEFAULT: '#d9dde4',
          light: '#eceef2',
        },
        text: {
          primary: '#1a202c',
          secondary: '#3f4a5a',
          muted: '#5b6678',
          disabled: '#94a3b8',
          subtle: '#9ca3af',
        },
        danger: {
          DEFAULT: '#dc2626',
          light: '#fef2f2',
          border: '#fecaca',
        },
        success: {
          DEFAULT: '#16a34a',
          light: '#dcfce7',
        },
      },
      fontFamily: {
        sans: ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
        nav: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
        'card-lg': '14px',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06), 0 4px 14px rgba(0,0,0,0.05)',
        'card-sm': '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
        btn: '0 2px 8px rgba(59,110,168,0.3)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
