import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '1rem',
  		screens: {
  			sm: '640px',
  			md: '768px',
  			lg: '1024px',
  			xl: '1280px'
  		}
  	},
  	extend: {
  		colors: {
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			// Amarelo institucional dos módulos públicos (Leilões etc.).
  			// Hex canônico #F5E62B — mesmo valor usado nos bg-[#F5E62B] literais.
  			'institutional-yellow': '#F5E62B',
  			zhiq: {
  				teal: 'hsl(var(--zhiq-teal))',
  				green: 'hsl(var(--zhiq-green))',
  				gold: 'hsl(var(--zhiq-gold))',
  				navy: 'hsl(var(--zhiq-navy))',
  				'navy-light': 'hsl(var(--zhiq-navy-light))'
  			},
			// Canais RGB (245 230 43 = #F5E62B exato); <alpha-value> habilita /NN
			'institutional-yellow': 'rgb(var(--institutional-yellow) / <alpha-value>)',
			green: {
				DEFAULT: '#00a300',
				50: '#e6f6e6',
				100: '#cceecc',
				200: '#99dd99',
				300: '#66cc66',
				400: '#1fc81f',
				500: '#00a300',
				600: '#008f00',
				700: '#007a00',
				800: '#006100',
				900: '#004a00',
				950: '#003300'
			},
			emerald: {
				DEFAULT: '#00a300',
				50: '#e6f6e6',
				100: '#cceecc',
				200: '#99dd99',
				300: '#66cc66',
				400: '#1fc81f',
				500: '#00a300',
				600: '#008f00',
				700: '#007a00',
				800: '#006100',
				900: '#004a00',
				950: '#003300'
			},
			success: {
				DEFAULT: 'hsl(var(--success))',
				foreground: 'hsl(var(--success-foreground))'
			},
			warning: {
				DEFAULT: 'hsl(var(--warning))',
				foreground: 'hsl(var(--warning-foreground))'
			},
			info: {
				DEFAULT: 'hsl(var(--info))',
				foreground: 'hsl(var(--info-foreground))'
			},
			motoboy: {
				DEFAULT: 'hsl(var(--motoboy))',
				foreground: 'hsl(var(--motoboy-foreground))',
				hover: 'hsl(var(--motoboy-hover))',
				light: 'hsl(var(--motoboy-light))',
				header: 'hsl(var(--motoboy-header))',
				'header-foreground': 'hsl(var(--motoboy-header-foreground))',
				surface: 'hsl(var(--motoboy-surface))'
			},
			merchant: {
				DEFAULT: 'hsl(var(--merchant))',
				foreground: 'hsl(var(--merchant-foreground))',
				hover: 'hsl(var(--merchant-hover))',
				light: 'hsl(var(--merchant-light))'
			},
			footer: {
				DEFAULT: 'hsl(var(--footer-bg))',
				foreground: 'hsl(var(--footer-foreground))',
				hover: 'hsl(var(--footer-hover))',
				border: 'hsl(var(--footer-border))'
			},
			'footer-motoboy': {
				DEFAULT: 'hsl(var(--footer-motoboy-bg))',
				foreground: 'hsl(var(--footer-motoboy-foreground))',
				hover: 'hsl(var(--footer-motoboy-hover))',
				border: 'hsl(var(--footer-motoboy-border))'
			},
			'footer-mototaxi': {
				DEFAULT: 'hsl(var(--footer-mototaxi-bg))',
				foreground: 'hsl(var(--footer-mototaxi-foreground))',
				hover: 'hsl(var(--footer-mototaxi-hover))',
				border: 'hsl(var(--footer-mototaxi-border))'
			},
			'footer-driver': {
				DEFAULT: 'hsl(var(--footer-driver-bg))',
				foreground: 'hsl(var(--footer-driver-foreground))',
				hover: 'hsl(var(--footer-driver-hover))',
				border: 'hsl(var(--footer-driver-border))'
			},
			'footer-merchant': {
				DEFAULT: 'hsl(var(--footer-merchant-bg))',
				foreground: 'hsl(var(--footer-merchant-foreground))',
				hover: 'hsl(var(--footer-merchant-hover))',
				border: 'hsl(var(--footer-merchant-border))'
			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'fade-in': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(10px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'scale-in': {
  				from: {
  					opacity: '0',
  					transform: 'scale(0.95)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'scale(1)'
  				}
  			},
  			'pulse-glow': {
  				'0%, 100%': {
  					boxShadow: '0 0 20px hsl(var(--zhiq-teal) / 0.3)'
  				},
  				'50%': {
  					boxShadow: '0 0 40px hsl(var(--zhiq-teal) / 0.5)'
  				}
  			},
		'shimmer': {
				'0%': {
					transform: 'translateX(-100%)'
				},
				'100%': {
					transform: 'translateX(100%)'
				}
			},
			'progress-indeterminate': {
				'0%': {
					transform: 'translateX(-100%) scaleX(0.4)'
				},
				'50%': {
					transform: 'translateX(0%) scaleX(0.6)'
				},
				'100%': {
					transform: 'translateX(100%) scaleX(0.4)'
				}
			}
		},
		animation: {
			'accordion-down': 'accordion-down 0.2s ease-out',
			'accordion-up': 'accordion-up 0.2s ease-out',
			'fade-in': 'fade-in 0.3s ease-out',
			'scale-in': 'scale-in 0.2s ease-out',
			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
			'shimmer': 'shimmer 2s linear infinite',
			'progress-indeterminate': 'progress-indeterminate 1.2s ease-in-out infinite'
		},
  		fontFamily: {
  			sans: [
  				'DM Sans',
  				'ui-sans-serif',
  				'system-ui',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'Roboto',
  				'Helvetica Neue',
  				'Arial',
  				'Noto Sans',
  				'sans-serif'
  			],
  			serif: [
  				'Crimson Pro',
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			],
  			mono: [
  				'SF Mono',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			]
  		},
  		boxShadow: {
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		}
  	}
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
