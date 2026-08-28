import { Image as ImageIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginScreenDemoProps {
  /** Disparado tras el "envío" simulado (sin red, sin validación de credenciales). */
  onIniciarSesion: () => void;
}

/** Buffer de la simulación de envío -- sin backend, ningún request real. */
const DEMO_LOGIN_ENVIO_MS = 700;

/**
 * Login premium split-screen de la demo integrada (Propuesta B -- Consejo
 * directivo). Pantalla NUEVA, no existe una versión de producción de esto --
 * el login real (`funcionalidades/autenticacion/LoginPage.tsx`) sigue siendo
 * la única pantalla de login funcional del proyecto; esta es exclusivamente
 * para `FlujoIntegracionDemo.tsx` (dev-only).
 *
 * Segunda pasada de diseño (2026-08-27, feedback de que el sello/wordmark
 * "no tenía sentido" como contenido fijo del panel de marca -- ese panel es
 * POR EMPRESA, no de "Arcano Motos" en particular):
 * - Panel izquierdo: gradiente diagonal (135deg, esquina sup. izq. a inf.
 *   der.) de `--marca-color-1`/`--marca-color-2` (`tema-empresarial.css`) --
 *   las dos variables pensadas para sobreescribirse por holding, no
 *   `Arcano Motos` hardcodeado. En vez del sello/wordmark fijo, un
 *   placeholder de imagen (recuadro punteado + ícono) indicando dónde va el
 *   logo del holding cuando este login se integre de verdad.
 * - Ambos bloques (panel de marca + card del form) flotan sobre un patrón de
 *   fondo compartido (`.patron-papel`, retícula fina que extiende el
 *   motivo `.ledger-divider` ya establecido -- reutilizado tal cual en
 *   `AppShellDemo.tsx`) -- la separación entre bloques
 *   ahora es por sombra/profundidad (`.chrome-gradiente .chrome-sombra-derecha` proyecta sombra
 *   hacia la derecha), no por un borde/línea recta entre dos colores planos.
 * - El formulario ahora vive dentro de una card real con elevación propia
 *   (`.login-card`), no flotando directo sobre el fondo.
 *
 * Tercera pasada (2026-08-28, con research de por medio -- ver
 * `.chrome-gradiente`/`.chrome-solido` en `tema-empresarial.css` para el
 * criterio completo): el panel de marca (acá) SIGUE con el gradiente
 * diagonal -- es un momento "hero" de una sola pantalla, sin navegación
 * que escanear, exactamente donde la investigación dice que el gradiente
 * construye marca sin costo de usabilidad (a diferencia del chrome
 * funcional del shell, revertido a sólido). Se refinaron inputs
 * (`.login-input`: borde más liviano, más alto, foco de dos capas
 * borde+glow) y labels (`.login-label`: caption tracked, no el texto
 * genérico) para un objetivo "moderno, limpio, ejecutivo, artístico y
 * liviano" -- más aire, menos peso visual. El botón primario
 * (`.login-boton-primario`) pasó de `--indigo` sólido a un gradiente
 * tenue: un botón SÍ es el tipo de elemento puntual y acotado donde el
 * research recomienda gradiente, a diferencia de una superficie de
 * navegación completa.
 *
 * Mismos campos que el login real (correo + contraseña, sin SSO/2FA/
 * "recordarme" -- fuera del alcance actual del proyecto), mismos primitivos
 * `@/components/ui/*` (Label/Input/Button), sin Zod/react-hook-form: es un
 * mock sin backend, cualquier valor no vacío en ambos campos "funciona".
 */
export function LoginScreenDemo({ onIniciarSesion }: LoginScreenDemoProps) {
  const [enviando, setEnviando] = useState(false);

  const onSubmit = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    window.setTimeout(() => {
      onIniciarSesion();
    }, DEMO_LOGIN_ENVIO_MS);
  };

  return (
    <div className="patron-papel flex min-h-screen w-full flex-col lg:flex-row">
      <div className="chrome-gradiente chrome-sombra-derecha hidden shrink-0 flex-col items-center justify-center gap-6 px-10 py-16 lg:flex lg:w-2/5">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#F5F3EE]/35 px-10 py-12">
          <ImageIcon className="size-9 text-[#F5F3EE]/60" aria-hidden="true" />
          <p className="max-w-[16rem] text-center text-sm leading-relaxed text-[#F5F3EE]/70">
            Isotipo del holding
            <br />
            <span className="text-xs opacity-80">(personalizable por empresa)</span>
          </p>
        </div>
        {/*
          Nombre de LA HERRAMIENTA (este CRM), no de la empresa que inicia
          sesión -- por eso vive separado del placeholder de arriba, no
          adentro: el isotipo de arriba es lo que cambia por holding, esto de
          acá es fijo, la identidad del producto en sí.
        */}
        <p className="headline text-lg font-semibold tracking-wide !text-[var(--papel)]">
          CRM Embudo de Leads
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="login-card w-full max-w-sm px-9 py-12">
          <h1 className="headline mb-8 text-xl font-semibold !text-[var(--indigo)]">
            Iniciar sesión
          </h1>

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="demo-correo" className="login-label">
                Correo electrónico
              </Label>
              <Input
                id="demo-correo"
                type="email"
                autoComplete="username"
                required
                disabled={enviando}
                className="login-input"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="demo-password" className="login-label">
                Contraseña
              </Label>
              <Input
                id="demo-password"
                type="password"
                autoComplete="current-password"
                required
                disabled={enviando}
                className="login-input"
              />
            </div>

            <Button
              type="submit"
              disabled={enviando}
              className="login-boton-primario mt-3 text-white hover:opacity-90"
            >
              {enviando ? "Ingresando…" : "Iniciar sesión"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
