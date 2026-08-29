import { zodResolver } from "@hookform/resolvers/zod";
import { Image as ImageIcon } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router";
import { loginBodySchema } from "schemas";
import { z } from "zod";
import { getErrorMessage } from "@/api/httpClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONFIGURACION_EMPRESA_DEFAULT,
  fetchConfiguracionEmpresaApi,
  type ConfiguracionEmpresa,
} from "@/funcionalidades/configuracion-empresa/configuracion-empresa.api";
// Tema visual "Propuesta B -- Consejo directivo" (indigo), aprobado como
// línea gráfica del login (ver docs/09-linea-grafica-frontend.md). El CSS
// está scopeado bajo `.tema-empresarial` (ver ese archivo): importarlo acá
// no afecta a ninguna otra pantalla, solo pinta dentro del elemento raíz de
// esta página que lleva esa clase.
import "@/temas/variante-empresarial/tema-empresarial.css";
import { WelcomeSplashLoader } from "@/temas/variante-empresarial/WelcomeSplashLoader";
import { useAuth } from "./authContext";
import { getLandingRoute } from "./permissions";

type LoginFormValues = z.infer<typeof loginBodySchema>;

interface LocationState {
  /** Ruta a la que intentaba entrar antes de que `ProtectedRoute` lo mandara a login. */
  desde?: string;
}

/**
 * Duración de la transición de opacidad del splash (`.welcome-splash` en
 * `tema-empresarial.css`: 600ms + 120ms de delay de la marca interna) --
 * hay que esperar a que termine de aparecer antes de navegar, si no la
 * redirección corta la animación de entrada a mitad de camino.
 */
const SPLASH_FADE_MS = 800;
/**
 * Sostenido breve del splash ya 100% opaco antes de navegar -- no hace
 * falta un sostenido largo como en la demo (`FlujoIntegracionDemo.tsx`,
 * pensada como transición de boot desde cero): acá ya hubo latencia real de
 * red durante el submit, alcanza con un respiro corto para que la cortina
 * se lea como intencional y no como un parpadeo.
 */
const SPLASH_SOSTENIDO_MS = 600;

/**
 * Tope de espera por `GET /configuracion-empresa` antes de mostrar la
 * cortina de bienvenida con el nombre por defecto -- ese endpoint es
 * puramente cosmético para esta pantalla (el login en sí ya se resolvió vía
 * `login()`), así que nunca debe demorar ni romper el flujo de acceso. Por
 * debajo de `SPLASH_FADE_MS + SPLASH_SOSTENIDO_MS` a propósito, para no
 * alargar perceptiblemente la transición si el backend está lento.
 */
const CONFIGURACION_EMPRESA_TIMEOUT_MS = 1200;

/**
 * Trae la configuración de marca vigente con `fallback` a los defaults del
 * tema empresarial (`CONFIGURACION_EMPRESA_DEFAULT`, mismos valores que ya
 * usa el backend si nunca se configuró nada) ante cualquier falla de red o
 * demora -- nunca deja sin resolver la promesa ni propaga el error hacia
 * `onSubmit`, que ya completó el login real antes de llamar acá.
 */
async function obtenerConfiguracionEmpresaConFallback(): Promise<ConfiguracionEmpresa> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(
      () => reject(new Error("configuracion_empresa_timeout")),
      CONFIGURACION_EMPRESA_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([fetchConfiguracionEmpresaApi(), timeout]);
  } catch {
    return CONFIGURACION_EMPRESA_DEFAULT;
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

/** Pantalla de inicio de sesión (F2, docs/07). */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [splashActivo, setSplashActivo] = useState(false);
  const [splashVisible, setSplashVisible] = useState(false);
  // Nombre/colores de marca reales para la cortina de bienvenida (gap ya
  // identificado, ver INTEGRACION-BACKEND-GAP previo) -- arranca con los
  // defaults y se reemplaza por la configuración real justo antes de
  // mostrar la cortina, ver `onSubmit`.
  const [configuracionMarca, setConfiguracionMarca] =
    useState<ConfiguracionEmpresa>(CONFIGURACION_EMPRESA_DEFAULT);
  // Timeouts de la cortina de bienvenida -- se limpian si el componente se
  // desmonta antes de disparar (navegación externa, cambio de ruta, etc.).
  const timeoutsRef = useRef<number[]>([]);

  // Cancela cualquier timer/rAF de la cortina de bienvenida pendiente si el
  // componente se desmonta antes de que dispare (ej. el usuario navega
  // fuera del login por otra vía mientras el splash está en curso).
  useEffect(
    () => () => {
      for (const id of timeoutsRef.current) {
        window.clearTimeout(id);
        window.cancelAnimationFrame(id);
      }
    },
    [],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginBodySchema) });

  const onSubmit = handleSubmit(async (valores) => {
    setErrorEnvio(null);
    try {
      const usuario = await login(valores.correo, valores.password);
      // Si `ProtectedRoute` mandó al usuario a login por intentar entrar a
      // una ruta específica, vuelve ahí; si no, va a la landing de su rol.
      const desde = (location.state as LocationState | null)?.desde;
      const destino = desde ?? getLandingRoute(usuario.rol);

      // Nombre/colores reales de la empresa para la cortina -- con
      // fallback a los defaults si el endpoint falla o demora (ver
      // `obtenerConfiguracionEmpresaConFallback`). El login ya se completó
      // arriba: esta llamada es cosmética y nunca lo bloquea ni lo revierte.
      const configuracion = await obtenerConfiguracionEmpresaConFallback();
      setConfiguracionMarca(configuracion);

      // Cortina de bienvenida (`WelcomeSplashLoader`, tema empresarial):
      // cubre la pantalla -> se sostiene brevemente ya 100% opaca -> recién
      // ahí se navega. La redirección ocurre con la cortina totalmente
      // cubierta, así que el usuario nunca ve el "salto" entre el
      // formulario y la pantalla destino (mismo criterio que la demo
      // integrada, `FlujoIntegracionDemo.tsx`) -- sin necesidad de un
      // fade-out propio acá, porque al navegar este componente (y la
      // cortina con él) se desmonta.
      setSplashActivo(true);
      const idAparecer = window.requestAnimationFrame(() => setSplashVisible(true));
      const idNavegar = window.setTimeout(() => {
        navigate(destino, { replace: true });
      }, SPLASH_FADE_MS + SPLASH_SOSTENIDO_MS);
      timeoutsRef.current.push(idAparecer, idNavegar);
    } catch (error) {
      setErrorEnvio(getErrorMessage(error));
    }
  });

  return (
    <div className="tema-empresarial patron-papel flex min-h-screen w-full flex-col lg:flex-row">
      {/*
        React 19 hoista automáticamente <link> renderizados en cualquier
        parte del árbol hacia <head> -- mismo patrón que
        `FlujoIntegracionDemo.tsx`/`StyleguidePage.tsx` para cargar las
        fuentes de esta variante.
      */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Source+Sans+3:wght@400;500;600;700&display=swap"
      />

      <div className="chrome-gradiente chrome-sombra-derecha hidden shrink-0 flex-col items-center justify-center gap-6 px-10 py-16 lg:flex lg:w-2/5">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#F5F3EE]/35 px-10 py-12">
          <ImageIcon className="size-9 text-[#F5F3EE]/60" aria-hidden="true" />
          <p className="max-w-[16rem] text-center text-sm leading-relaxed text-[#F5F3EE]/70">
            Isotipo del holding
            <br />
            <span className="text-xs opacity-80">(personalizable por empresa)</span>
          </p>
        </div>
        <p className="headline text-lg font-semibold tracking-wide !text-[var(--papel)]">
          CRM Embudo de Leads
        </p>
      </div>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="login-card w-full max-w-sm px-9 py-12">
          <h1 className="headline mb-8 text-xl font-semibold !text-[var(--indigo)]">
            Iniciar sesión
          </h1>

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            {errorEnvio ? (
              <Alert variant="destructive">
                <AlertTitle>No se pudo iniciar sesión</AlertTitle>
                <AlertDescription>{errorEnvio}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="correo" className="login-label">
                Correo electrónico
              </Label>
              <Input
                id="correo"
                type="email"
                autoComplete="username"
                aria-invalid={errors.correo ? "true" : undefined}
                aria-describedby={errors.correo ? "correo-error" : undefined}
                disabled={isSubmitting}
                className="login-input"
                {...register("correo")}
              />
              {errors.correo ? (
                <p id="correo-error" className="text-sm text-destructive">
                  {errors.correo.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="login-label">
                Contraseña
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={errors.password ? "true" : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                disabled={isSubmitting}
                className="login-input"
                {...register("password")}
              />
              {errors.password ? (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="login-boton-primario mt-3 text-white hover:opacity-90"
            >
              {isSubmitting ? "Ingresando…" : "Iniciar sesión"}
            </Button>
          </form>
        </div>
      </main>

      {splashActivo ? (
        <WelcomeSplashLoader
          contexto={configuracionMarca.nombre}
          mensaje="Preparando tu panel…"
          visible={splashVisible}
          style={
            {
              "--marca-color-1": configuracionMarca.colorPrimario,
              "--marca-color-2": configuracionMarca.colorSecundario,
            } as CSSProperties
          }
        />
      ) : null}
    </div>
  );
}
