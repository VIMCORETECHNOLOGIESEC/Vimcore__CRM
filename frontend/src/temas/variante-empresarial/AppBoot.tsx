import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { CONFIGURACION_EMPRESA_DEFAULT } from "@/funcionalidades/configuracion-empresa/configuracion-empresa.api";
import "./tema-empresarial.css";
import { WelcomeSplashLoader } from "./WelcomeSplashLoader";

/**
 * Duración del fade de opacidad de `.welcome-splash`/`.welcome-splash-marca`
 * (`tema-empresarial.css`: 600ms / 650ms + 120ms de delay = 770ms real) --
 * mismo valor que ya usan `LoginPage.tsx`/`FlujoIntegracionDemo.tsx`, para no
 * introducir una tercera duración de fade distinta sobre el mismo CSS.
 */
const SPLASH_FADE_MS = 800;
/**
 * Sostenido antes de empezar a desvanecer -- elegido para que
 * `SPLASH_SOSTENIDO_MS + SPLASH_FADE_MS` sea EXACTAMENTE 1500ms (spec: "1.5s
 * antes del login"), a diferencia del sostenido largo de
 * `FlujoIntegracionDemo.tsx` (2200ms, pensado como demo navegable, no como
 * boot real): acá no hay ninguna red que esperar -- ni sesión, ni `GET
 * /configuracion-empresa` (requiere auth, no aplica antes de login) -- el
 * splash es puramente cosmético, así que no necesita sostenerse tanto.
 */
const SPLASH_SOSTENIDO_MS = 700;

/**
 * Envoltorio de arranque de PRODUCCIÓN (a diferencia de `SelloBootLoader`,
 * usado solo dentro de `StyleguidePage.tsx` -- dev-only, `import.meta.env.DEV`):
 * cubre `<App/>` con la cortina de bienvenida (`WelcomeSplashLoader`) durante
 * 1500ms fijos antes de revelarlo. Mismo criterio "cortina" de
 * `FlujoIntegracionDemo.tsx` -- `children` (`<App/>`) queda SIEMPRE montado
 * detrás desde el primer render, así que nunca hay un pop cuando la cortina
 * se desvanece: revela algo que ya está asentado, no algo que recién se monta.
 *
 * Contenido de marca: SIEMPRE el default de la instancia
 * (`CONFIGURACION_EMPRESA_DEFAULT`, mismos valores que usa `LoginPage.tsx`
 * como fallback) -- todavía no hay sesión en este punto (nadie logueado
 * todavía), así que `GET /configuracion-empresa` (requiere
 * `requireAuthentication`) no aplica acá. Sin ningún fetch nuevo para esta
 * pantalla.
 *
 * El wrapper `.tema-empresarial` envuelve SOLO la cortina, nunca a
 * `children` -- esa clase define `color`/`font-family` heredables
 * (`tema-empresarial.css`) que, si envolviera `children`, filtrarían
 * indefinidamente al resto de la app: la cortina se desmonta a los 1500ms,
 * pero `<App/>` queda montado para siempre.
 */
export function AppBoot({ children }: { children: ReactNode }) {
  const [bootActivo, setBootActivo] = useState(true);
  const [bootVisible, setBootVisible] = useState(false);

  useEffect(() => {
    const idAparecer = requestAnimationFrame(() => setBootVisible(true));
    const idOcultar = window.setTimeout(() => setBootVisible(false), SPLASH_SOSTENIDO_MS);
    const idDesmontar = window.setTimeout(
      () => setBootActivo(false),
      SPLASH_SOSTENIDO_MS + SPLASH_FADE_MS,
    );

    return () => {
      cancelAnimationFrame(idAparecer);
      window.clearTimeout(idOcultar);
      window.clearTimeout(idDesmontar);
    };
    // Una sola vez al montar -- este boot no reacciona a ningún evento del
    // usuario, a diferencia de la cortina de `FlujoIntegracionDemo.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {children}
      {bootActivo ? (
        <div className="tema-empresarial">
          {/*
            React 19 hoista automáticamente <link> renderizados en cualquier
            parte del árbol hacia <head> -- mismo patrón que
            `LoginPage.tsx`/`FlujoIntegracionDemo.tsx` para cargar las fuentes
            de esta variante.
          */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Source+Sans+3:wght@400;500;600;700&display=swap"
          />
          <WelcomeSplashLoader
            contexto={CONFIGURACION_EMPRESA_DEFAULT.nombre}
            mensaje="Cargando…"
            visible={bootVisible}
            style={
              {
                "--marca-color-1": CONFIGURACION_EMPRESA_DEFAULT.colorPrimario,
                "--marca-color-2": CONFIGURACION_EMPRESA_DEFAULT.colorSecundario,
              } as CSSProperties
            }
          />
        </div>
      ) : null}
    </>
  );
}
