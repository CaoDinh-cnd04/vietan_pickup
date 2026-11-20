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
          DEFAULT: '#2563eb',
          dark: '#1d4ed8',
          light: '#eff6ff',
          border: '#bfdbfe',
        },
        surface: '#ffffff',
        background: '#f8fafc',
        border: {
          DEFAULT: '#e2e8f0',
          light: '#f1f5f9',
        },
        text: {
          primary: '#0f172a',
          secondary: '#374151',
          muted: '#64748b',
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
        sans: ['Montserrat','system-ui', 'sans-serif'],
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
        btn: '0 2px 8px rgba(37,99,235,0.3)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
