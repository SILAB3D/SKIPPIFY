/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // Paleta de marca: la misma esmeralda/teal sobre pizarra que ya usaba la
        // app, pero nombrada para que deje de repartirse en literales sueltos.
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b'
        },
        ink: {
          900: '#050b14',
          800: '#0b1220',
          700: '#0d1b2a'
        }
      },
      // Tailwind sólo trae la escala de 5 en 5: estos pasos intermedios los usan
      // los tintes de las tarjetas, donde 10 se queda corto y 20 ya pesa.
      opacity: {
        12: '0.12',
        14: '0.14',
        16: '0.16',
        18: '0.18',
        22: '0.22'
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI Variable', 'Segoe UI', 'system-ui', '-apple-system', 'Roboto', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.045) inset, 0 20px 45px -30px rgba(0,0,0,0.95)',
        glow: '0 0 0 1px rgba(52,211,153,0.22), 0 18px 44px -22px rgba(16,185,129,0.55)'
      },
      keyframes: {
        'sk-rise': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'sk-pulse-ring': {
          '0%': { opacity: '0.55', transform: 'scale(0.9)' },
          '100%': { opacity: '0', transform: 'scale(1.35)' }
        }
      },
      animation: {
        'sk-rise': 'sk-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both',
        'sk-pulse-ring': 'sk-pulse-ring 2.4s ease-out infinite'
      }
    }
  },
  plugins: []
}
