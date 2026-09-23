import { useEffect, useRef, useState } from "react";

const screens = [
  {
    eyebrow: "01 · CONTROL TOTAL",
    title: "Todo tu negocio comercial, claro desde el primer vistazo.",
    description: "El panel reúne las señales que importan para que tu equipo sepa dónde actuar ahora.",
    benefits: ["Mide conversión y ventas en tiempo real", "Detecta etapas que necesitan atención", "Prioriza el trabajo del día"],
    image: "/landing/crm-dashboard.png",
    alt: "Panel comercial de Vimcore CRM con indicadores, embudo y actividad reciente",
  },
  {
    eyebrow: "02 · LEADS ORGANIZADOS",
    title: "Cada lead en su lugar. Ninguna oportunidad se pierde.",
    description: "Centraliza los contactos que llegan de tus campañas, ordénalos y dales seguimiento con intención.",
    benefits: ["Filtra por fuente, etapa y responsable", "Identifica el interés de cada contacto", "Convierte conversaciones en clientes"],
    image: "/landing/crm-leads.png",
    alt: "Gestión de leads de Vimcore CRM con filtros, etapas y responsables",
  },
  {
    eyebrow: "03 · CONTEXTO REAL",
    title: "Cada lead tiene una historia, no una fila más.",
    description: "Conversaciones, tareas, reuniones y datos de contacto reunidos donde tu equipo los necesita.",
    benefits: ["Consulta todo el contexto antes de contactar", "Define la siguiente acción sin perder tiempo", "Mantén el seguimiento siempre actualizado"],
    image: "/landing/crm-lead-detail.png",
    alt: "Detalle de lead de Vimcore CRM con actividad, tareas y próxima reunión",
  },
  {
    eyebrow: "04 · PIPELINE VIVO",
    title: "Impulsa oportunidades hasta el cierre.",
    description: "Mantén el pipeline visible, detecta bloqueos y acompaña cada negocio en su siguiente paso.",
    benefits: ["Visualiza el avance por cada etapa", "Encuentra negocios detenidos a tiempo", "Proyecta resultados con confianza"],
    image: "/landing/crm-pipeline.png",
    alt: "Pipeline de oportunidades de Vimcore CRM organizado por etapas",
  },
  {
    eyebrow: "05 · RITMO DEL EQUIPO",
    title: "Tu agenda comercial trabajando contigo, no contra ti.",
    description: "Llamadas, reuniones y seguimientos sincronizados para que cada conversación ocurra en el momento correcto.",
    benefits: ["Organiza cada tarea y reunión", "Cumple seguimientos sin depender de la memoria", "Mantén a todo el equipo alineado"],
    image: "/landing/crm-activities.png",
    alt: "Centro de actividades de Vimcore CRM con agenda, calendario y tareas",
  },
] as const;

export function CrmScrollShowcase() {
  const [activeScreen, setActiveScreen] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleStep = entries
          .filter((entry) => entry.isIntersecting)
          .sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];

        if (visibleStep) setActiveScreen(Number(visibleStep.target.getAttribute("data-screen")));
      },
      { threshold: [0.45, 0.65], rootMargin: "-15% 0px -25%" },
    );

    stepRefs.current.forEach((step) => step && observer.observe(step));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="servicios" className="landing-showcase" aria-label="Recorrido por Vimcore CRM">
      <div className="landing-showcase-sticky">
        <div className="landing-showcase-frame">
          {screens.map((screen, index) => (
            <img
              key={screen.image}
              className={index === activeScreen ? "is-active" : ""}
              src={screen.image}
              alt={screen.alt}
              aria-hidden={index !== activeScreen}
            />
          ))}
        </div>
        <div className="landing-showcase-progress" aria-hidden="true">
          {screens.map((screen, index) => <span className={index === activeScreen ? "is-active" : ""} key={screen.image} />)}
        </div>
      </div>
      <div className="landing-showcase-steps">
        {screens.map((screen, index) => (
          <article
            className={index === activeScreen ? "is-active" : ""}
            data-screen={index}
            key={screen.image}
            ref={(element) => { stepRefs.current[index] = element; }}
          >
            <p>{screen.eyebrow}</p>
            <h2>{screen.title}</h2>
            <span>{screen.description}</span>
            <ul aria-label={`Beneficios de ${screen.title}`}>
              {screen.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}