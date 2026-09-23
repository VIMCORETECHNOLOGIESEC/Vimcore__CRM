import "./landing.css";
import {
  ArrowRight,
  BarChart3,
  Bot,
  ChevronRight,
  CircleDot,
  Clock3,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { type MouseEvent, useRef, useState } from "react";
import { getAuthLoginUrl } from "@/api/httpClient";
import { CrmScrollShowcase } from "./CrmScrollShowcase";
import { ContactSection } from "./ContactSection";

const navigation = [
  { label: "Inicio", href: "#inicio" },
  { label: "Servicios", href: "#servicios" },
  { label: "Resultados", href: "#resultados" },
  { label: "Contacto", href: "#contacto" },
];


function Brand() {
  return (
    <a className="landing-brand" href="#inicio" aria-label="Vimcore CRM, inicio">
      <span className="landing-brand-mark"><img src="/landing/vimcore-isotipo-blue.png" alt="" /></span>
      <span className="landing-brand-name"><span className="landing-brand-v">V</span><span className="landing-brand-crm">CRM</span></span>
    </a>
  );
}

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pageRef = useRef<HTMLElement>(null);
  const loginUrl = getAuthLoginUrl();

  const scrollToHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.history.replaceState(null, "", "#inicio");
    window.scrollTo({ top: 0, behavior: "smooth" });
    pageRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <main id="inicio" ref={pageRef} className="landing-page">
      <header className="landing-header">
        <Brand />
        <nav className="landing-nav" aria-label="Navegación principal">
          {navigation.map((item) => <a key={item.href} href={item.href} onClick={item.href === "#inicio" ? scrollToHome : undefined}>{item.label}</a>)}
        </nav>
        <a className="landing-primary-action landing-navbar-action landing-glow-action" href={loginUrl}>Ingresar a Vimcore CRM <ArrowRight size={15} /></a>
        <button className="landing-menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menú" aria-expanded={menuOpen}>
          {menuOpen ? <X /> : <Menu />}
        </button>
        {menuOpen ? <nav className="landing-mobile-nav" aria-label="Navegación móvil">{navigation.map((item) => <a key={item.href} href={item.href} onClick={(event) => { if (item.href === "#inicio") scrollToHome(event); setMenuOpen(false); }}>{item.label}</a>)}<a href={loginUrl}>Ingresar</a></nav> : null}
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow"><Sparkles size={15} /> CRM comercial para equipos que avanzan</p>
          <h1>Convierte cada contacto en una <em>oportunidad clara.</em></h1>
          <p className="landing-intro">Vimcore reúne a tu equipo, tus campañas y tus seguimientos en un solo lugar para que ningún lead se quede esperando.</p>
          <div className="landing-actions">
            <a className="landing-primary-action" href={loginUrl}>Entrar a Vimcore <ArrowRight size={18} /></a>
            <a className="landing-secondary-action" href="#servicios">Conocer el producto <ChevronRight size={18} /></a>
          </div>
          <div className="landing-trust"><ShieldCheck size={18} /><span>Tu operación comercial, ordenada y protegida.</span></div>
        </div>
        <div className="landing-hero-visual"><div className="landing-hero-logo-surface"><img className="landing-hero-logo" src="/landing/vimcore-logotipo-blue.png" alt="Logotipo de Vimcore CRM" /></div></div>
      </section>

      <CrmScrollShowcase />



      <section id="proceso" className="landing-process">
        <div className="landing-process-copy"><p className="landing-eyebrow">CÓMO TE AYUDA VIMCORE</p><h2>Todo lo que tu equipo necesita<br />para vender mejor.</h2><p>Vimcore transforma el trabajo comercial diario en un proceso claro: menos tareas manuales, más seguimiento y mejores decisiones.</p><a href={loginUrl}>Conocer Vimcore <ArrowRight size={17} /></a></div>
        <ol className="landing-steps">
          <li><span>01</span><div><CircleDot size={20} /><h3>Ordena tus oportunidades</h3><p>Reúne cada lead y negocio en un solo lugar para que nadie se quede sin respuesta.</p></div></li>
          <li><span>02</span><div><Clock3 size={20} /><h3>Impulsa cada seguimiento</h3><p>Define tareas, responsables y próximos pasos para mantener el ritmo comercial.</p></div></li>
          <li><span>03</span><div><Bot size={20} /><h3>Reduce tareas repetitivas</h3><p>Automatiza acciones de rutina para que tu equipo invierta tiempo donde genera valor.</p></div></li>
          <li><span>04</span><div><UsersRound size={20} /><h3>Mantén al equipo alineado</h3><p>Comparte responsables, avances y prioridades para que todos trabajen en la misma dirección.</p></div></li>
          <li><span>05</span><div><BarChart3 size={20} /><h3>Decide con claridad</h3><p>Convierte la actividad del equipo en señales concretas para crecer con intención.</p></div></li>
        </ol>
      </section>

      <section id="resultados" className="landing-quote"><MessageCircle size={26} /><blockquote>“Cuando todos ven el mismo camino, el equipo deja de perseguir información y empieza a construir resultados.”</blockquote><p>VIMCORE CRM · OPERACIÓN COMERCIAL</p></section>

      <ContactSection loginUrl={loginUrl} />

      <footer className="landing-footer"><Brand /><p>© {new Date().getFullYear()} Vimcore CRM. Gestión comercial con intención.</p><a href="#inicio">Volver arriba ↑</a></footer>
    </main>
  );
}