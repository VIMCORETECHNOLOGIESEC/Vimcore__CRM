import { afterAll, describe, expect, it } from "vitest";
import { resolveRangoFechas } from "../src/lib/rango-fechas.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma } from "../src/lib/prisma.js";
import type { MetricasQuery } from "../src/schemas/metricas.schema.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";
import {
  getEmbudo,
  getPorAsesor,
  getPorCampania,
  getPorEtapa,
  getPorRedSocial,
  getRedSocialXSemaforo,
  getResumen,
} from "../src/services/metricas.service.js";
import { EMPRESA_BOOTSTRAP_ID } from "./fixtures/empresa.js";

let contador = 0;

function marcador(): string {
  contador += 1;
  return `metrica-${Date.now()}-${contador}`;
}

async function crearUsuario(rol: "ADMINISTRADOR" | "SUPERVISOR" | "ASESOR" | "VENDEDOR"): Promise<UsuarioAcceso> {
  contador += 1;
  const usuario = await prisma.usuario.create({
    data: {
      nombre: `Usuario MS ${contador}`,
      correo: `usuario-ms-${contador}-${Date.now()}@integracion.test`,
      passwordHash: await hashPassword("clave-de-prueba-123456"),
      rol,
      activo: true,
    },
  });
  // Bloque C (D2): Admin/Supervisor holding-wide (empresaId null), Asesor/
  // Vendedor acotados a la empresa bootstrap (misma empresa que `crearLead`
  // de abajo) — este archivo no ejercita aislamiento cross-empresa (eso vive
  // en `metricas.access.test.ts`).
  const empresaId = rol === "ADMINISTRADOR" || rol === "SUPERVISOR" ? null : EMPRESA_BOOTSTRAP_ID;
  return { id: usuario.id, rol: usuario.rol, empresaId };
}

interface LeadOverrides {
  etapa?: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";
  semaforo?: "ROJO" | "AMARILLO" | "VERDE" | null;
  asesorId?: string | null;
  vendedorId?: string | null;
  redSocial?: "FACEBOOK" | "INSTAGRAM" | "X" | "LINKEDIN" | "GOOGLE_FORMS" | null;
  ingresadoEn?: Date;
  cerradoEn?: Date | null;
  campania?: string;
}

async function crearLead(overrides: LeadOverrides = {}): Promise<{ id: string }> {
  contador += 1;
  const cliente = await prisma.cliente.create({
    data: { nombre: `Cliente MS ${contador}`, telefonoValido: false },
  });
  const lead = await prisma.lead.create({
    data: {
      clienteId: cliente.id,
      origen: "NUEVO",
      etapa: overrides.etapa ?? "NUEVO",
      semaforo: overrides.semaforo ?? null,
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      redSocial: overrides.redSocial ?? null,
      ingresadoEn: overrides.ingresadoEn ?? new Date(),
      cerradoEn: overrides.cerradoEn ?? null,
      payloadOriginal: overrides.campania ? { nombreCampania: overrides.campania } : undefined,
      empresaId: EMPRESA_BOOTSTRAP_ID,
    },
  });
  return { id: lead.id };
}

async function crearEvento(
  leadId: string,
  tipo: "ASIGNACION" | "CAMBIO_ETAPA",
  ocurridoEn: Date,
  extra: { etapaAnterior?: "NUEVO" | "CONTACTADO" | "CITA"; etapaNueva?: "CONTACTADO" | "CITA" | "VENTA" } = {},
): Promise<void> {
  await prisma.leadEvento.create({
    data: { leadId, tipo, ocurridoEn, etapaAnterior: extra.etapaAnterior, etapaNueva: extra.etapaNueva },
  });
}

function query(overrides: Partial<MetricasQuery> = {}): MetricasQuery {
  return { rango: "30d", ...overrides };
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("services/metricas.service — alcance por rol (docs/08 §1)", () => {
  it("un asesor consultando /resumen recibe solo datos de su cartera", async () => {
    const asesorA = await crearUsuario("ASESOR");
    const asesorB = await crearUsuario("ASESOR");
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: asesorB.id });
    await crearLead(); // sin asignar

    const resumen = await getResumen(asesorA, query());
    expect(resumen.totalIngresados.actual).toBe(2);
  });

  it("un administrador ve todos los leads del período", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    await crearLead({ campania: cam });
    await crearLead({ campania: cam });
    await crearLead({ campania: cam });

    const resumen = await getResumen(admin, query({ campania: cam }));
    expect(resumen.totalIngresados.actual).toBe(3);
  });

  it("responsableId enviado por un asesor es ignorado — sigue viendo solo lo suyo", async () => {
    const asesorA = await crearUsuario("ASESOR");
    const otroAsesor = await crearUsuario("ASESOR");
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: otroAsesor.id });
    await crearLead({ asesorId: otroAsesor.id });

    const resumen = await getResumen(asesorA, query({ responsableId: otroAsesor.id }));
    expect(resumen.totalIngresados.actual).toBe(1);
  });
});

describe("services/metricas.service — getResumen: criterio de fecha (docs/08 §2.3)", () => {
  it("un lead ingresado en el período anterior pero cerrado en el actual cuenta en el cierre correcto, no en el ingreso", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    const desde = new Date("2026-06-10T00:00:00.000Z");
    const hasta = new Date("2026-06-20T00:00:00.000Z");
    const { anteriorDesde, anteriorHasta } = resolveRangoFechas("personalizado", new Date(), desde, hasta);
    const ingresoAnterior = new Date(anteriorDesde.getTime() + 1000);
    const cierreActual = new Date(desde.getTime() + 1000);

    await crearLead({
      campania: cam,
      etapa: "VENTA",
      ingresadoEn: ingresoAnterior,
      cerradoEn: cierreActual,
    });

    const resumen = await getResumen(admin, query({ rango: "personalizado", desde, hasta, campania: cam }));
    expect(resumen.totalIngresados.actual).toBe(0);
    expect(resumen.totalIngresados.anterior).toBe(1);
    expect(resumen.cerrados.total.actual).toBe(1);
    expect(resumen.cerrados.venta.actual).toBe(1);
  });
});

describe("services/metricas.service — getResumen: comparativa (docs/08 §4)", () => {
  it("período anterior con >=10 leads devuelve variacionPorcentual numérico", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    const desde = new Date("2026-05-10T00:00:00.000Z");
    const hasta = new Date("2026-05-20T00:00:00.000Z");
    const { anteriorDesde, anteriorHasta } = resolveRangoFechas("personalizado", new Date(), desde, hasta);

    for (let i = 0; i < 10; i += 1) {
      await crearLead({ campania: cam, ingresadoEn: new Date(anteriorDesde.getTime() + 1000 * i) });
    }
    for (let i = 0; i < 5; i += 1) {
      await crearLead({ campania: cam, ingresadoEn: new Date(desde.getTime() + 1000 * i) });
    }

    const resumen = await getResumen(admin, query({ rango: "personalizado", desde, hasta, campania: cam }));
    expect(resumen.totalIngresados.actual).toBe(5);
    expect(resumen.totalIngresados.anterior).toBe(10);
    expect(resumen.totalIngresados.variacionPorcentual).toBe(-50);
  });

  it("período anterior con <10 leads omite el porcentaje (null)", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    const desde = new Date("2026-04-10T00:00:00.000Z");
    const hasta = new Date("2026-04-20T00:00:00.000Z");
    const { anteriorDesde } = resolveRangoFechas("personalizado", new Date(), desde, hasta);

    for (let i = 0; i < 3; i += 1) {
      await crearLead({ campania: cam, ingresadoEn: new Date(anteriorDesde.getTime() + 1000 * i) });
    }
    for (let i = 0; i < 5; i += 1) {
      await crearLead({ campania: cam, ingresadoEn: new Date(desde.getTime() + 1000 * i) });
    }

    const resumen = await getResumen(admin, query({ rango: "personalizado", desde, hasta, campania: cam }));
    expect(resumen.totalIngresados.actual).toBe(5);
    expect(resumen.totalIngresados.anterior).toBe(3);
    expect(resumen.totalIngresados.variacionPorcentual).toBeNull();
  });

  it("cerrados.venta/noVenta usan su PROPIO conteo anterior como umbral, no el total combinado de cierres", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    const desde = new Date("2026-07-10T00:00:00.000Z");
    const hasta = new Date("2026-07-20T00:00:00.000Z");
    const { anteriorDesde } = resolveRangoFechas("personalizado", new Date(), desde, hasta);

    // Período anterior: 10 cierres en total (>=10) pero solo 1 VENTA — el
    // total combinado cruza el umbral, la categoría "venta" individual no.
    await crearLead({
      campania: cam,
      etapa: "VENTA",
      ingresadoEn: anteriorDesde,
      cerradoEn: new Date(anteriorDesde.getTime() + 1000),
    });
    for (let i = 0; i < 9; i += 1) {
      await crearLead({
        campania: cam,
        etapa: "NO_VENTA",
        ingresadoEn: anteriorDesde,
        cerradoEn: new Date(anteriorDesde.getTime() + 2000 + 1000 * i),
      });
    }

    // Período actual: 4 VENTA.
    for (let i = 0; i < 4; i += 1) {
      await crearLead({
        campania: cam,
        etapa: "VENTA",
        ingresadoEn: desde,
        cerradoEn: new Date(desde.getTime() + 1000 * i),
      });
    }

    const resumen = await getResumen(admin, query({ rango: "personalizado", desde, hasta, campania: cam }));

    expect(resumen.cerrados.total.anterior).toBe(10);
    expect(resumen.cerrados.total.variacionPorcentual).not.toBeNull();

    expect(resumen.cerrados.venta.anterior).toBe(1);
    expect(resumen.cerrados.venta.actual).toBe(4);
    expect(resumen.cerrados.venta.variacionPorcentual).toBeNull();

    expect(resumen.cerrados.noVenta.anterior).toBe(9);
    expect(resumen.cerrados.noVenta.variacionPorcentual).toBeNull();
  });
});

describe("services/metricas.service — 2.5/2.7: primera respuesta y SLA (docs/08 §2.5/§2.7)", () => {
  it("calcula promedio de respuesta, sin-respuesta y cumplimiento de SLA correlacionando lead_eventos", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const asesor = await crearUsuario("ASESOR");
    const cam = marcador();
    const t0 = new Date("2026-03-01T00:00:00.000Z");

    // Lead 1: responde a las 2h (dentro de SLA).
    const lead1 = await crearLead({ campania: cam, asesorId: asesor.id, ingresadoEn: t0, etapa: "CONTACTADO" });
    await crearEvento(lead1.id, "ASIGNACION", t0);
    await crearEvento(lead1.id, "CAMBIO_ETAPA", new Date(t0.getTime() + 2 * 3600_000), {
      etapaAnterior: "NUEVO",
      etapaNueva: "CONTACTADO",
    });

    // Lead 2: responde a las 30h (fuera de SLA, sí cuenta para el promedio).
    const lead2 = await crearLead({ campania: cam, asesorId: asesor.id, ingresadoEn: t0, etapa: "CONTACTADO" });
    await crearEvento(lead2.id, "ASIGNACION", t0);
    await crearEvento(lead2.id, "CAMBIO_ETAPA", new Date(t0.getTime() + 30 * 3600_000), {
      etapaAnterior: "NUEVO",
      etapaNueva: "CONTACTADO",
    });

    // Lead 3: nunca sale de NUEVO — "sin primera respuesta".
    const lead3 = await crearLead({ campania: cam, asesorId: asesor.id, ingresadoEn: t0, etapa: "NUEVO" });
    await crearEvento(lead3.id, "ASIGNACION", t0);

    const desde = new Date(t0.getTime() - 3600_000);
    const hasta = new Date(t0.getTime() + 40 * 3600_000);
    const resumen = await getResumen(admin, query({ rango: "personalizado", desde, hasta, campania: cam }));

    expect(resumen.tiempoPrimeraRespuesta.horasPromedio).toBe(16); // (2+30)/2
    expect(resumen.tiempoPrimeraRespuesta.sinPrimeraRespuesta).toBe(1);
    expect(resumen.cumplimientoSla.porcentaje).toBeCloseTo((1 / 3) * 100, 2);
  });
});

describe("services/metricas.service — getPorAsesor (docs/08 §3.2, solo admin/supervisor)", () => {
  it("403 cuando un asesor/vendedor consulta directamente esta gráfica", async () => {
    const asesor = await crearUsuario("ASESOR");
    await expect(getPorAsesor(asesor, query())).rejects.toMatchObject({ statusHttp: 403 });

    const vendedor = await crearUsuario("VENDEDOR");
    await expect(getPorAsesor(vendedor, query())).rejects.toMatchObject({ statusHttp: 403 });
  });

  it("un admin ve el desglose por responsable con tasa de conversión", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const asesor = await crearUsuario("ASESOR");
    const cam = marcador();
    await crearLead({ campania: cam, asesorId: asesor.id, etapa: "VENTA" });
    await crearLead({ campania: cam, asesorId: asesor.id, etapa: "VENTA" });
    await crearLead({ campania: cam, asesorId: asesor.id, etapa: "NO_VENTA" });

    const filas = await getPorAsesor(admin, query({ campania: cam }));
    const fila = filas.find((f) => f.responsableId === asesor.id);
    expect(fila?.total).toBe(3);
    expect(fila?.ventas).toBe(2);
    expect(fila?.noVentas).toBe(1);
    expect(fila?.tasaConversionPct).toBeCloseTo((2 / 3) * 100, 2);
  });

  it("un asesor desactivado (M2) sigue mostrando su nombre real, con sufijo '(usuario dado de baja)'", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    contador += 1;
    const asesorDadoDeBaja = await prisma.usuario.create({
      data: {
        nombre: `Asesor de baja ${contador}`,
        correo: `asesor-baja-${contador}-${Date.now()}@integracion.test`,
        passwordHash: await hashPassword("clave-de-prueba-123456"),
        rol: "ASESOR",
        activo: false,
      },
    });
    const cam = marcador();
    await crearLead({ campania: cam, asesorId: asesorDadoDeBaja.id, etapa: "VENTA" });

    const filas = await getPorAsesor(admin, query({ campania: cam }));
    const fila = filas.find((f) => f.responsableId === asesorDadoDeBaja.id);
    expect(fila?.nombre).toBe(`${asesorDadoDeBaja.nombre} (usuario dado de baja)`);
  });
});

describe("services/metricas.service — getPorRedSocial (docs/08 §3.1)", () => {
  it("agrupa por red social con tasa de conversión por red", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    await crearLead({ campania: cam, redSocial: "FACEBOOK", etapa: "VENTA" });
    await crearLead({ campania: cam, redSocial: "FACEBOOK", etapa: "NO_VENTA" });
    await crearLead({ campania: cam, redSocial: "FACEBOOK", etapa: "NUEVO" });
    await crearLead({ campania: cam, redSocial: "INSTAGRAM", etapa: "VENTA" });

    const filas = await getPorRedSocial(admin, query({ campania: cam }));
    const facebook = filas.find((f) => f.redSocial === "FACEBOOK");
    const instagram = filas.find((f) => f.redSocial === "INSTAGRAM");
    expect(facebook?.total).toBe(3);
    expect(facebook?.tasaConversionPct).toBeCloseTo(50, 2);
    expect(instagram?.total).toBe(1);
    expect(instagram?.tasaConversionPct).toBe(100);
  });
});

describe("services/metricas.service — getPorEtapa", () => {
  it("suma el total de leads del período incluyendo las 5 etapas", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    await crearLead({ campania: cam, etapa: "NUEVO" });
    await crearLead({ campania: cam, etapa: "CONTACTADO" });
    await crearLead({ campania: cam, etapa: "CITA" });
    await crearLead({ campania: cam, etapa: "VENTA" });
    await crearLead({ campania: cam, etapa: "NO_VENTA" });

    const filas = await getPorEtapa(admin, query({ campania: cam }));
    expect(filas).toHaveLength(5);
    const total = filas.reduce((acc, f) => acc + f.total, 0);
    expect(total).toBe(5);
    expect(filas.find((f) => f.etapa === "NO_VENTA")?.total).toBe(1);
  });
});

describe("services/metricas.service — getEmbudo (docs/08 §3.3)", () => {
  it("NO_VENTA nunca aparece como paso del embudo, solo VENTA es el último paso", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    for (let i = 0; i < 4; i += 1) await crearLead({ campania: cam, etapa: "NUEVO" });
    for (let i = 0; i < 2; i += 1) await crearLead({ campania: cam, etapa: "CONTACTADO" });
    await crearLead({ campania: cam, etapa: "CITA" });
    await crearLead({ campania: cam, etapa: "VENTA" });
    await crearLead({ campania: cam, etapa: "NO_VENTA" });

    const embudo = await getEmbudo(admin, query({ campania: cam }));
    expect(embudo.pasos.map((p) => p.etapa)).toEqual(["NUEVO", "CONTACTADO", "CITA", "VENTA"]);
    expect(embudo.pasos[0]?.total).toBe(4);
    expect(embudo.pasos[0]?.caidaPct).toBeNull();
    expect(embudo.pasos[1]?.total).toBe(2);
    expect(embudo.pasos[1]?.caidaPct).toBeCloseTo(50, 2);
    expect(embudo.pasos[2]?.caidaPct).toBeCloseTo(50, 2);
    expect(embudo.pasos[3]?.total).toBe(1);
    expect(embudo.noVenta).toBe(1);
  });
});

describe("services/metricas.service — getPorCampania (docs/08 §3.4)", () => {
  it("agrupa por nombre de campaña Y red social — mismo nombre en redes distintas son filas independientes", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    await crearLead({ campania: cam, redSocial: "FACEBOOK" });
    await crearLead({ campania: cam, redSocial: "FACEBOOK" });
    await crearLead({ campania: cam, redSocial: "INSTAGRAM" });

    const filas = await getPorCampania(admin, query({ campania: cam }));
    const fb = filas.find((f) => f.redSocial === "FACEBOOK");
    const ig = filas.find((f) => f.redSocial === "INSTAGRAM");
    expect(fb?.total).toBe(2);
    expect(ig?.total).toBe(1);
  });
});

describe("services/metricas.service — getRedSocialXSemaforo (docs/08 §3.5, matriz cruzada)", () => {
  it("cruza red social por color de semáforo con porcentaje de verdes por red", async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    await crearLead({ campania: cam, redSocial: "FACEBOOK", semaforo: "VERDE" });
    await crearLead({ campania: cam, redSocial: "FACEBOOK", semaforo: "VERDE" });
    await crearLead({ campania: cam, redSocial: "FACEBOOK", semaforo: "ROJO" });
    await crearLead({ campania: cam, redSocial: "FACEBOOK", semaforo: null });
    await crearLead({ campania: cam, redSocial: "INSTAGRAM", semaforo: "VERDE" });

    const filas = await getRedSocialXSemaforo(admin, query({ campania: cam }));
    const facebook = filas.find((f) => f.redSocial === "FACEBOOK");
    const instagram = filas.find((f) => f.redSocial === "INSTAGRAM");
    expect(facebook?.total).toBe(4);
    expect(facebook?.verde).toBe(2);
    expect(facebook?.rojo).toBe(1);
    expect(facebook?.sinCalificar).toBe(1);
    expect(facebook?.pctVerde).toBeCloseTo(50, 2);
    expect(instagram?.total).toBe(1);
    expect(instagram?.pctVerde).toBe(100);
  });
});
