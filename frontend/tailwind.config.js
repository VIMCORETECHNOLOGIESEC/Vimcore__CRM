/**
 * `withOpacity`: envuelve un token en `rgb(var(--x) / <alpha-value>)` en vez
 * de `var(--x)` a secas -- patrón estándar shadcn/Tailwind. Tailwind
 * sustituye `<alpha-value>` por la fracción del modificador de opacidad
 * (`bg-primary/10` -> `rgb(var(--primary) / 0.1)`) al momento de build; el
 * navegador resuelve `var(--primary)` en tiempo de ejecución. Esto SOLO
 * funciona si `index.css` define cada variable como canales RGB crudos
 * ("37 99 235"), nunca como hex plano -- ver el comentario de `:root` en
 * `index.css` para el bug que este envoltorio arregla de raíz.
 *
 * @param {string} variableName
 */
function withOpacity(variableName) {
  return `rgb(var(${variableName}) / <alpha-value>)`;
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: withOpacity("--background"),
        foreground: withOpacity("--foreground"),
        card: {
          DEFAULT: withOpacity("--card"),
          foreground: withOpacity("--card-foreground"),
        },
        popover: {
          DEFAULT: withOpacity("--popover"),
          foreground: withOpacity("--popover-foreground"),
        },
        primary: {
          DEFAULT: withOpacity("--primary"),
          foreground: withOpacity("--primary-foreground"),
        },
        secondary: {
          DEFAULT: withOpacity("--secondary"),
          foreground: withOpacity("--secondary-foreground"),
        },
        muted: {
          DEFAULT: withOpacity("--muted"),
          foreground: withOpacity("--muted-foreground"),
        },
        accent: {
          DEFAULT: withOpacity("--accent"),
          foreground: withOpacity("--accent-foreground"),
        },
        destructive: {
          DEFAULT: withOpacity("--destructive"),
          foreground: withOpacity("--destructive-foreground"),
        },
        success: {
          DEFAULT: withOpacity("--success"),
          foreground: withOpacity("--success-foreground"),
        },
        warning: {
          DEFAULT: withOpacity("--warning"),
          foreground: withOpacity("--warning-foreground"),
        },
        border: withOpacity("--border"),
        input: withOpacity("--input"),
        ring: withOpacity("--ring"),
        chart: {
          1: withOpacity("--chart-1"),
          2: withOpacity("--chart-2"),
          3: withOpacity("--chart-3"),
          4: withOpacity("--chart-4"),
          5: withOpacity("--chart-5"),
        },
        sidebar: {
          DEFAULT: withOpacity("--sidebar"),
          foreground: withOpacity("--sidebar-foreground"),
          primary: withOpacity("--sidebar-primary"),
          "primary-foreground": withOpacity("--sidebar-primary-foreground"),
          accent: withOpacity("--sidebar-accent"),
          "accent-foreground": withOpacity("--sidebar-accent-foreground"),
          border: withOpacity("--sidebar-border"),
          ring: withOpacity("--sidebar-ring"),
        },
        // Semáforo del lead (docs/09 §3): nunca decorativo fuera de este uso,
        // siempre acompañado de una etiqueta de texto (docs/07, criterios
        // transversales de calidad).
        semaforo: {
          frio: {
            DEFAULT: withOpacity("--semaforo-frio"),
            foreground: withOpacity("--semaforo-frio-foreground"),
          },
          tibio: {
            DEFAULT: withOpacity("--semaforo-tibio"),
            foreground: withOpacity("--semaforo-tibio-foreground"),
          },
          caliente: {
            DEFAULT: withOpacity("--semaforo-caliente"),
            foreground: withOpacity("--semaforo-caliente-foreground"),
          },
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
