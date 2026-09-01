/**
 * Ícono de WhatsApp (logo oficial simplificado) -- componente de
 * presentación puro, sin lógica, sin props. Vive en `whatsapp/` (no en
 * `leads/detalle/LeadDetallePage.tsx`, donde vivía originalmente) para que
 * tanto el botón flotante de esa página como `WhatsAppSinConexion.tsx`
 * (dentro de este mismo módulo) lo reusen sin duplicar el SVG ni crear un
 * ciclo de imports entre `leads/detalle` y `whatsapp`.
 */
export function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-7 fill-current" aria-hidden="true">
      <path d="M20.52 3.48A11.86 11.86 0 0 0 12.08 0C5.53 0 .2 5.33.2 11.88c0 2.1.55 4.15 1.6 5.96L.1 23.8l6.1-1.6a11.87 11.87 0 0 0 5.87 1.54h.01c6.55 0 11.88-5.33 11.88-11.88 0-3.18-1.24-6.16-3.44-8.38Zm-8.44 18.2h-.01a9.85 9.85 0 0 1-5.03-1.38l-.36-.21-3.62.95.97-3.53-.23-.36a9.86 9.86 0 0 1-1.5-5.27C2.3 6.43 6.69 2.04 12.09 2.04a9.8 9.8 0 0 1 6.98 2.9 9.83 9.83 0 0 1 2.89 6.99c0 5.4-4.4 9.8-9.88 9.8Zm5.38-7.35c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.28-.47-2.44-1.5a9.16 9.16 0 0 1-1.69-2.1c-.18-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.31 1.27.5 1.7.64.72.23 1.38.2 1.9.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    </svg>
  );
}
