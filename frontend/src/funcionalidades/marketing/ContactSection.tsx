import { ArrowRight, MessageCircle, Send, Sparkles } from "lucide-react";

type ContactSectionProps = {
  loginUrl: string;
};

export function ContactSection({ loginUrl }: ContactSectionProps) {
  return (
    <section id="contacto" className="landing-contact" aria-labelledby="contacto-titulo">
      <div className="landing-contact-copy">
        <p className="landing-eyebrow"><Sparkles size={15} /> HABLEMOS DE TU EQUIPO</p>
        <h2 id="contacto-titulo">Una mejor operación comercial <em>empieza con una conversación.</em></h2>
        <p>Cuéntanos qué está frenando a tu equipo. En Vimcore te ayudamos a convertir el desorden comercial en un proceso claro y accionable.</p>
        <a className="landing-contact-action" href={loginUrl}>Ingresar a Vimcore CRM <ArrowRight size={18} /></a>
      </div>
      <form className="landing-contact-card" aria-label="Formulario de contacto">
        <div className="landing-contact-card-icon"><MessageCircle size={22} /></div>
        <p>Conversemos sobre tu equipo</p>
        <label>Nombre completo o razón social<input name="nombre" type="text" autoComplete="name" placeholder="Escribe tu nombre o empresa" /></label>
        <label>Correo electrónico<input name="correo" type="email" autoComplete="email" placeholder="tu@empresa.com" /></label>
        <label>Teléfono<input name="telefono" type="tel" autoComplete="tel" placeholder="Ingresa tu teléfono" /></label>
        <label className="landing-contact-terms"><input name="terminos" type="checkbox" required /><span>Acepto los términos y condiciones.</span></label>
        <div className="landing-contact-actions">
          <button type="submit" className="landing-contact-submit"><Send size={16} />Enviar</button>
          <button type="button" className="landing-contact-whatsapp"><MessageCircle size={16} />WhatsApp</button>
        </div>
      </form>
    </section>
  );
}