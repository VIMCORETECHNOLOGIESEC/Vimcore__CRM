import { Building2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/funcionalidades/autenticacion/auth-context";
import { useConfiguracionEmpresa } from "@/funcionalidades/configuracion-empresa/useConfiguracionEmpresa";
import { useVistaEmpresa } from "@/funcionalidades/empresa-apariencia/useVistaEmpresa";
import { resolveMarcaCompleta } from "@/lib/color-marca";
import { WelcomeSplashLoader } from "@/temas/variante-empresarial/WelcomeSplashLoader";

/**
 * Duración de la cortina de salida -- mismo total que `AppBoot.tsx`
 * (`SPLASH_SOSTENIDO_MS + SPLASH_FADE_MS` = 1500ms), declarada acá de forma
 * independiente, mismo criterio que `EmpresaDetallePage.tsx::
 * DURACION_TRANSICION_VISTA_VIVA_MS` (no hay una constante compartida
 * exportada, solo el mismo valor total para que la sensación de todas las
 * transiciones "Ver en vivo"/"Salir" sea consistente).
 */
const DURACION_TRANSICION_SALIDA_MS = 1500;

/**
 * Botón flotante "salir de vista de empresa" -- visible solo cuando hay una
 * `empresaVistaId` activa Y la sesión es holding-wide (el filtro de empresa
 * puntual no existe para una sesión `company`, que ya está acotada a la
 * suya). `GestorEmpresasPage.tsx` ("Ver detalles") ya navega hoy a
 * `/usuarios?empresaId=X`, así que este botón limpia esa vista de verdad --
 * no es un placeholder inerte.
 *
 * Consume `useVistaEmpresa()` (fuente de verdad compartida con
 * `EmpresaDetallePage`/`UsuariosPage`/`BridgesPage`, ver ese hook) en vez de
 * leer el query param directo -- mismo comportamiento observable que la
 * versión anterior de este componente (ambos implementados sobre
 * `useSearchParams`), ahora centralizado en un solo lugar.
 *
 * "Salir" ahora es una transición, no un corte seco (mismo criterio que
 * `EmpresaDetallePage.tsx::handleVerEnVivo`, la operación inversa): al hacer
 * clic se captura `empresaVistaId` ANTES de llamar a `salirDeEmpresa()`
 * (que lo limpia de la URL) -- la captura vive en el cierre (closure) de
 * `handleClick`, no en un estado de React aparte, porque `salirDeEmpresa()`
 * dispara un re-render que pondría `empresaVistaId` en `null` antes de que
 * el timeout de abajo pudiera leerlo. Se muestra la cortina de bienvenida
 * con la marca del HOLDING (nunca la de la empresa que se está dejando de
 * mirar -- `resolveEstilosMarca`/`resolveMarcaCompleta` con `user`/
 * `configuracionHolding`, la misma fuente que usa `AppLayout.tsx` fuera de
 * una vista de empresa), y recién al cabo de
 * `DURACION_TRANSICION_SALIDA_MS` navega a `/empresas/:empresaId` (detalle
 * de la empresa que se estaba mirando), igual que la cortina de
 * `LoginPage.tsx`: nunca un salto brusco, la navegación ocurre con la
 * pantalla totalmente cubierta.
 */
export function SalirVistaEmpresaButton() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { empresaVistaId, salirDeEmpresa } = useVistaEmpresa();
  const { data: configuracionHolding } = useConfiguracionEmpresa();
  const [saliendoActivo, setSaliendoActivo] = useState(false);
  const timeoutsRef = useRef<number[]>([]);

  // Cancela el timer de la cortina si el componente se desmonta antes de
  // que dispare -- mismo criterio que `EmpresaDetallePage.tsx`.
  useEffect(
    () => () => {
      for (const id of timeoutsRef.current) {
        window.clearTimeout(id);
      }
    },
    [],
  );

  // `saliendoActivo` mantiene la cortina visible aunque `empresaVistaId` ya
  // se haya limpiado de la URL (justo lo que pasa apenas se llama a
  // `salirDeEmpresa()` en `handleClick`, abajo) -- sin este flag, el guard
  // de abajo ocultaría todo (botón Y cortina) en el instante mismo del
  // clic, antes de que la cortina llegue a mostrarse.
  if ((!empresaVistaId && !saliendoActivo) || user?.sessionScope !== "holding") {
    return null;
  }

  function handleClick() {
    // Captura ANTES de `salirDeEmpresa()` -- ver el docblock de arriba.
    const empresaVistaIdCapturada = empresaVistaId;
    if (!empresaVistaIdCapturada) {
      return;
    }
    salirDeEmpresa();
    setSaliendoActivo(true);
    const idNavegar = window.setTimeout(() => {
      navigate(`/empresas/${empresaVistaIdCapturada}`);
      // Resetea la cortina una vez completada la navegación -- sin esto
      // `saliendoActivo` quedaba en `true` para siempre (este componente
      // vive en `AppLayout`, no se desmonta entre rutas), pegando la
      // cortina "Saliendo de la vista de empresa…" en cualquier uso real
      // del botón.
      setSaliendoActivo(false);
    }, DURACION_TRANSICION_SALIDA_MS);
    timeoutsRef.current.push(idNavegar);
  }

  if (saliendoActivo) {
    const marcaSplash = resolveMarcaCompleta(user, configuracionHolding);
    return (
      <div className="tema-empresarial">
        <WelcomeSplashLoader
          contexto={marcaSplash.nombre}
          mensaje="Saliendo de la vista de empresa…"
          visible
          style={
            {
              "--marca-color-1": marcaSplash["--marca-color-1"],
              "--marca-color-2": marcaSplash["--marca-color-2"],
            } as CSSProperties
          }
        />
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={handleClick}
      className="fixed bottom-4 right-4 z-50 gap-2 shadow-lg"
    >
      <Building2 className="size-4" aria-hidden="true" />
      Salir de vista de empresa
    </Button>
  );
}
