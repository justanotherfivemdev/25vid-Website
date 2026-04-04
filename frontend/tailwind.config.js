/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html"
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		fontFamily: {
  			heading: ['Share Tech', 'Oswald', 'sans-serif'],
  			body: ['Inter', 'Roboto', 'sans-serif'],
  			mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
  			condensed: ['Oswald', 'Barlow Condensed', 'sans-serif'],
  		},
  		colors: {
  			// 25th Infantry Division "Tropic Lightning" — Gold, Black & Dark palette
  			'tropic': {
  				red: '#ff3333',
  				gold: '#c9a227',
  				'red-dark': '#cc0000',
  				'red-light': '#ff5555',
  				'gold-dark': '#8F701A',
  				'gold-light': '#e8c547',
  				olive: '#556B2F',
  				'olive-light': '#738C43',
  			},
  			'hud': {
  				blue: '#00aaff',
  				'blue-dark': '#0088cc',
  			},
  			'mil': {
  				'bg-deep': '#050a0e',
  				'bg-panel': '#0c1117',
  				'bg-elevated': '#111a24',
  				'bg-surface': '#080d12',
  				'bg-card': '#0a1018',
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			},
  			'pulse-glow': {
  				'0%, 100%': { boxShadow: '0 0 8px rgba(201, 162, 39, 0.3)' },
  				'50%': { boxShadow: '0 0 20px rgba(201, 162, 39, 0.6)' }
  			},
  			'pulse-gold': {
  				'0%, 100%': { boxShadow: '0 0 8px rgba(201, 162, 39, 0.3)' },
  				'50%': { boxShadow: '0 0 20px rgba(201, 162, 39, 0.6)' }
  			},
  			'scan-line': {
  				'0%': { transform: 'translateY(-100%)' },
  				'100%': { transform: 'translateY(100vh)' }
  			},
  			'flicker': {
  				'0%, 97%, 100%': { opacity: '1' },
  				'98%': { opacity: '0.8' },
  				'99%': { opacity: '0.95' }
  			},
  			'typewriter-cursor': {
  				'0%, 100%': { borderColor: '#e8c547' },
  				'50%': { borderColor: 'transparent' }
  			},
  			'slide-up-fade': {
  				from: { opacity: '0', transform: 'translateY(20px)' },
  				to: { opacity: '1', transform: 'translateY(0)' }
  			},
  			'glow-pulse': {
  				'0%, 100%': { opacity: '0.4' },
  				'50%': { opacity: '0.8' }
  			},
  			'radar-sweep': {
  				from: { transform: 'rotate(0deg)' },
  				to: { transform: 'rotate(360deg)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
  			'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
  			'scan-line': 'scan-line 8s linear infinite',
  			'flicker': 'flicker 4s steps(1) infinite',
  			'typewriter-cursor': 'typewriter-cursor 1s steps(1) infinite',
  			'slide-up-fade': 'slide-up-fade 0.5s ease-out',
  			'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
  			'radar-sweep': 'radar-sweep 4s linear infinite',
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
