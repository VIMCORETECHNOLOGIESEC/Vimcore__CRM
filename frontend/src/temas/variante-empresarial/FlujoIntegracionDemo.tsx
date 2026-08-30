import { useEffect, useState } from "react";
import { AppShellDemo } from "./AppShellDemo";
import { LoginScreenDemo } from "./LoginScreenDemo";
import "./tema-empresarial.css";
import { WelcomeSplashLoader } from "./WelcomeSplashLoader";

/**
 * Mock funcional que encadena TODOS los elementos ya aprobados de la
 * "Propuesta B -- Consejo directivo" en un flujo de demo real: splash de
 * bienvenida -> login premium -> transición de carga -> shell de la app
 * (sidebar+header índigo con la tabla de leads real). Solo visual/front,
 * datos quemados en el código -- sin backend, sin auth real. Existe para
 * ver la integración completa antes de portar el tema al desarrollo final.
 *
 * Ruta dev-only (`/temas/empresarial/demo`, ver `router.tsx`), fuera de
 * `ProtectedRoute`/`AppLayout` y de `layouts/navigation.ts` a propósito --
 * mismo criterio que `StyleguidePage.tsx`.
 *
 * Arquitectura "cortina" (2026-08-28, segunda pasada -- feedback de que el
 * traspaso boot -> login se sentía "tosco"): la versión anterior montaba
 * `LoginScreenDemo`/`AppShellDemo` RECIÉN cuando el splash ya había
 * terminado de desvanecerse (`estado === "login" ? <LoginScreenDemo /> :
 * null`, gateado por la misma máquina de estados que el splash) -- la
 * pantalla siguiente aparecía de golpe, sin ninguna transición propia,
 * justo el "pop" reportado. Acá la ESCENA de fondo (`login`/`app`) vive
 * SIEMPRE montada -- el splash es pura cortina superpuesta (`position:
 * fixed`, ver `WelcomeSplashLoader.tsx`): cubre, y solo mientras está 100%
 * opaca cambia la escena de atrás (invisible para el usuario, nunca se ve
 * el swap), se sostiene, y se desvanece revelando una pantalla que ya
 * estaba ahí y asentada -- nunca una que recién se monta.
 */
type Escena = "login" | "app";

/**
 * Debe ser >= la transición CSS más larga que dispara `visible=false` en
 * `.welcome-splash`/`.welcome-splash-marca` (`tema-empresarial.css`: 650ms +
 * 120ms de delay = 770ms) -- si es menor, la cortina se desmonta o vuelve a
 * cubrir a mitad de la animación de salida/entrada y se ve el mismo corte
 * brusco que se está corrigiendo acá.
 */
const SPLASH_FADE_MS = 800;
/** Sostenido del splash inicial (boot) -- primera carga de la app. */
const SPLASH_SOSTENIDO_BOOT_MS = 2200;
/** Sostenido de la transición login -> app -- más corto que el boot: ya no es la primera carga, alcanza con un respiro breve. */
const SPLASH_SOSTENIDO_TRANSICION_MS = 1400;

export function FlujoIntegracionDemo() {
  const [escena, setEscena] = useState<Escena>("login");
  const [splashActivo, setSplashActivo] = useState(true);
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashMensaje, setSplashMensaje] = useState("Cargando Arcano Motos…");

  // Cortina inicial (boot), una sola vez al montar: aparece -> se sostiene
  // -> se desvanece, revelando el login que ya está montado detrás (abajo,
  // fuera de este efecto -- `escena` arranca en `"login"` desde el primer
  // render).
  useEffect(() => {
    const idAparecer = requestAnimationFrame(() => setSplashVisible(true));
    const idOcultar = window.setTimeout(() => setSplashVisible(false), SPLASH_SOSTENIDO_BOOT_MS);
    const idDesmontar = window.setTimeout(
      () => setSplashActivo(false),
      SPLASH_SOSTENIDO_BOOT_MS + SPLASH_FADE_MS,
    );

    return () => {
      cancelAnimationFrame(idAparecer);
      window.clearTimeout(idOcultar);
      window.clearTimeout(idDesmontar);
    };
    // Solo el montaje inicial -- las transiciones disparadas por el usuario
    // (login -> app, reiniciar) usan `dispararCortina` más abajo, no este
    // efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Cortina genérica reutilizada por "iniciar sesión" y "reiniciar demo":
   * cubre -> cuando ya está 100% opaca cambia `escena` (invisible para el
   * usuario) -> se sostiene -> se desvanece revelando la escena nueva ya
   * asentada.
   */
  const dispararCortina = (siguienteEscena: Escena, mensaje: string, sostenidoMs: number) => {
    setSplashMensaje(mensaje);
    setSplashActivo(true);
    requestAnimationFrame(() => setSplashVisible(true));

    window.setTimeout(() => setEscena(siguienteEscena), SPLASH_FADE_MS);
    window.setTimeout(() => setSplashVisible(false), SPLASH_FADE_MS + sostenidoMs);
    window.setTimeout(() => setSplashActivo(false), SPLASH_FADE_MS + sostenidoMs + SPLASH_FADE_MS);
  };

  return (
    <div className="tema-empresarial h-screen w-full overflow-hidden">
      {/*
        React 19 hoista automáticamente <link>/<meta>/<title> renderizados en
        cualquier parte del árbol hacia <head> -- mismo patrón que
        `StyleguidePage.tsx` para cargar las fuentes de esta variante.
      */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Source+Sans+3:wght@400;500;600;700&display=swap"
      />

      {/* Escena de fondo: siempre montada, la cortina de arriba es lo único que aparece/desaparece. */}
      {escena === "login" ? (
        <LoginScreenDemo
          onIniciarSesion={() =>
            dispararCortina("app", "Preparando tu panel…", SPLASH_SOSTENIDO_TRANSICION_MS)
          }
        />
      ) : (
        <AppShellDemo
          onReiniciar={() =>
            dispararCortina("login", "Cargando Arcano Motos…", SPLASH_SOSTENIDO_BOOT_MS)
          }
        />
      )}

      {splashActivo ? (
        <WelcomeSplashLoader contexto="Arcano Motos" mensaje={splashMensaje} visible={splashVisible} />
      ) : null}
    </div>
  );
}
