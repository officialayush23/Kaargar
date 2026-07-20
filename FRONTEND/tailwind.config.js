/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontSize: {
        xs:   ['0.8125rem', { lineHeight: '1.3rem' }],   // 13px (was 12px)
        sm:   ['0.9375rem', { lineHeight: '1.4rem' }],    // 15px (was 14px)
        base: ['1.0625rem', { lineHeight: '1.6rem' }],    // 17px (was 16px)
        lg:   ['1.1875rem', { lineHeight: '1.7rem' }],    // 19px (was 18px)
        xl:   ['1.3125rem', { lineHeight: '1.8rem' }],    // 21px (was 20px)
      },
      colors: {
        void:    '#030914',
        deep:    '#050E1C',
        navy:    '#081222',
        surface: '#0C1830',
        azure: { DEFAULT: '#3B82F6', light: '#60A5FA', bright: '#93C5FD', dim: '#1D4ED8' },
        cyan:   { DEFAULT: '#22D3EE', light: '#67E8F9' },
        violet: { DEFAULT: '#7C3AED', light: '#A78BFA' },
        brand:     { DEFAULT: '#3B82F6', hover: '#60A5FA' },
        instant:   '#10B981',
        discovery: '#F59E0B',
        bg: { base: '#030914', surface: '#050E1C', elevated: '#0C1830' },
        border: 'rgba(255,255,255,0.14)',
      },
      fontFamily: {
        syne: ['Syne', 'sans-serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: { '4xl': '72px', '5xl': '96px' },
      animation: {
        'blob':       'blob 22s infinite ease-in-out',
        'blob-slow':  'blob 34s infinite ease-in-out reverse',
        'blob-med':   'blob 28s infinite ease-in-out',
        'float':      'float 6s ease-in-out infinite',
        'float-slow': 'float 10s ease-in-out infinite',
        'glare':      'glare 0.9s ease-out forwards',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'shimmer':    'shimmer 2s infinite',
        'fade-up':    'fade-up 0.45s ease-out forwards',
        'scale-in':   'scale-in 0.25s ease-out forwards',
        'slide-down': 'slide-down 0.3s ease-out forwards',
        'spin-slow':  'spin 3s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        ripple:       'ripple 1.5s ease-out infinite',
      },
      keyframes: {
        blob: {
          '0%,100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%', transform: 'translate(0,0) scale(1)' },
          '33%':     { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%', transform: 'translate(28px,-18px) scale(1.07)' },
          '66%':     { borderRadius: '50% 60% 30% 70% / 30% 40% 70% 50%', transform: 'translate(-18px,14px) scale(0.96)' },
        },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        glare: {
          '0%':   { transform: 'translateX(-130%) skewX(-20deg)', opacity: '0' },
          '20%':  { opacity: '1' },
          '80%':  { opacity: '1' },
          '100%': { transform: 'translateX(290%) skewX(-20deg)', opacity: '0' },
        },
        'glow-pulse': {
          '0%,100%': { boxShadow: '0 0 16px rgba(59,130,246,0.25)' },
          '50%':     { boxShadow: '0 0 40px rgba(59,130,246,0.55)' },
        },
        shimmer:      { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        'fade-up':    { '0%': { opacity: '0', transform: 'translateY(18px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'scale-in':   { '0%': { opacity: '0', transform: 'scale(0.93)' },     '100%': { opacity: '1', transform: 'scale(1)' } },
        'slide-down': { '0%': { opacity: '0', transform: 'translateY(-12px)' },'100%': { opacity: '1', transform: 'translateY(0)' } },
        'pulse-glow': { '0%,100%': { opacity: '0.6', transform: 'scale(1)' }, '50%': { opacity: '1', transform: 'scale(1.05)' } },
        ripple:       { '0%': { transform: 'scale(0)', opacity: '0.6' }, '100%': { transform: 'scale(4)', opacity: '0' } },
      },
      boxShadow: {
        'glass':      '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)',
        'glass-lg':   '0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.22)',
        'azure-glow': '0 0 24px rgba(59,130,246,0.4), 0 0 48px rgba(59,130,246,0.15)',
        'green-glow': '0 0 24px rgba(16,185,129,0.4)',
        'amber-glow': '0 0 24px rgba(245,158,11,0.4)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
