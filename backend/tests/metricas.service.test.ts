import { afterAll, describe, expect, it } from "vitest";
import { resolveRangoFechas } from "../src/lib/rango-fechas.js";
import { hashPassword } from "../src/lib/password.js";
import { prisma, runWithTenantContext } from "../src/lib/prisma.js";
import { testAdminPrisma } from "./fixtures/admin-prisma.js";
import type { MetricasQuery } from "../src/schemas/metricas.schema.js";
import type { UsuarioAcceso } from "../src/services/leads.access.js";
import {
  getCascadaLeadOportunidad,
  getEmbudo,
  getEmbudoOportunidad,
  getPorAsesor,
  getPorCampania,
  getPorEtapa,
  getPorHabilitadoParaVenta,
  getPorProducto,
  getPorRedSocial,
  getRankingProductosPorEmpresa,
  getRedSocialXSemaforo,
  getRendimientoCampanias,
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
  const lead = await testAdminPrisma.lead.create({
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
  await testAdminPrisma.leadEvento.create({
    data: { leadId, empresaId: EMPRESA_BOOTSTRAP_ID, tipo, ocurridoEn, etapaAnterior: extra.etapaAnterior, etapaNueva: extra.etapaNueva },
  });
}

function query(overrides: Partial<MetricasQuery> = {}): MetricasQuery {
  return { rango: "30d", ...overrides };
}

/**
 * Extensiones de dashboard (Bloque E, docs/blocks/e-dashboards.md):
 * fixtures de `Producto`/`Oportunidad`/`Membresia` -- mismo criterio que
 * `crearLead`/`crearEvento` de arriba (`testAdminPrisma`, bypass de RLS
 * exclusivo para arrange). `Oportunidad`/`Membresia` tienen RLS (mismo
 * criterio que `leads`/`lead_eventos`), `Producto` no lo necesita para el
 * `empresaId` fijo de este archivo.
 */
async function crearProducto(nombre?: string): Promise<{ id: string; nombre: string }> {
  contador += 1;
  const producto = await testAdminPrisma.producto.create({
    data: { empresaId: EMPRESA_BOOTSTRAP_ID, nombre: nombre ?? `Producto MS ${contador}-${Date.now()}` },
  });
  return { id: producto.id, nombre: producto.nombre };
}

interface OportunidadOverrides {
  empresaId?: string;
  etapa?: "NUEVO" | "CONTACTADO" | "CITA" | "VENTA" | "NO_VENTA";
  asesorId?: string | null;
  vendedorId?: string | null;
  productoId?: string | null;
  creadaEn?: Date;
  cerradaEn?: Date | null;
}

async function crearOportunidad(leadId: string, overrides: OportunidadOverrides = {}): Promise<{ id: string }> {
  const oportunidad = await testAdminPrisma.oportunidad.create({
    data: {
      leadId,
      empresaId: overrides.empresaId ?? EMPRESA_BOOTSTRAP_ID,
      productoId: overrides.productoId ?? null,
      etapa: overrides.etapa ?? "NUEVO",
      asesorId: overrides.asesorId ?? null,
      vendedorId: overrides.vendedorId ?? null,
      creadaEn: overrides.creadaEn ?? new Date(),
      cerradaEn: overrides.cerradaEn ?? null,
    },
  });
  return { id: oportunidad.id };
}

async function crearMembresiaAsesor(usuarioId: string, habilitadoParaVenta: boolean): Promise<void> {
  await testAdminPrisma.membresia.create({
    data: { usuarioId, empresaId: EMPRESA_BOOTSTRAP_ID, rol: "ASESOR", habilitadoParaVenta, activa: true },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Bloque C (Etapa 3, batch 3 discovery, D2 gap closure): `metricas.
 * service.ts` no acepta un `client`/contexto swappable — se llama DIRECTO
 * (sin HTTP) en todo este archivo, y toca `leads`/`lead_eventos` (RLS).
 * Todos los fixtures viven en la empresa bootstrap.
 */
function conContexto<T>(fn: () => Promise<T>): Promise<T> {
  return runWithTenantContext({ empresaId: EMPRESA_BOOTSTRAP_ID }, fn);
}

describe("services/metricas.service — alcance por rol (docs/08 §1)", () => {
  it("un asesor consultando /resumen recibe solo datos de su cartera", () =>
    conContexto(async () => {
    const asesorA = await crearUsuario("ASESOR");
    const asesorB = await crearUsuario("ASESOR");
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: asesorB.id });
    await crearLead(); // sin asignar

    const resumen = await getResumen(asesorA, query());
    expect(resumen.totalIngresados.actual).toBe(2);
  }));

  it("un administrador ve todos los leads del período", () =>
    conContexto(async () => {
    const admin = await crearUsuario("ADMINISTRADOR");
    const cam = marcador();
    await crearLead({ campania: cam });
    await crearLead({ campania: cam });
    await crearLead({ campania: cam });

    const resumen = await getResumen(admin, query({ campania: cam }));
    expect(resumen.totalIngresados.actual).toBe(3);
  }));

  it("responsableId enviado por un asesor es ignorado — sigue viendo solo lo suyo", () =>
    conContexto(async () => {
    const asesorA = await crearUsuario("ASESOR");
    const otroAsesor = await crearUsuario("ASESOR");
    await crearLead({ asesorId: asesorA.id });
    await crearLead({ asesorId: otroAsesor.id });
    await crearLead({ asesorId: otroAsesor.id });

    const resumen = await getResumen(asesorA, query({ responsableId: otroAsesor.id }));
    expect(resumen.totalIngresados.actual).toBe(1);
  }));
});

describe("services/metricas.service — getResumen: criterio de fecha (docs/08 §2.3)", () => {
  it("un lead ingresado en el período anterior pero cerrado en el actual cuenta en el cierre correcto, no en el ingreso", () =>
    conContexto(async () => {
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
  }));
});

describe("services/metricas.service — getResumen: comparativa (docs/08 §4)", () => {
  it("período anterior con >=10 leads devuelve variacionPorcentual numérico", () =>
    conContexto(async () => {
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
  }));

  it("período anterior con <10 leads omite el porcentaje (null)", () =>
    conContexto(async () => {
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
  }));

  it("cerrados.venta/noVenta usan su PROPIO conteo anterior como umbral, no el total combinado de cierres", () =>
    conContexto(async () => {
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
  }));
});

describe("services/metricas.service — 2.5/2.7: primera respuesta y SLA (docs/08 §2.5/§2.7)", () => {
  it("calcula promedio de respuesta, sin-respuesta y cumplimiento de SLA correlacionando lead_eventos", () =>
    conContexto(async () => {
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
  }));
});

describe("services/metricas.service — getPorAsesor (docs/08 §3.2, solo admin/supervisor)", () => {
  it("403 cuando un asesor/vendedor consulta directamente esta gráfica", () =>
    conContexto(async () => {
    const asesor = await crearUsuario("ASESOR");
    await expect(getPorAsesor(asesor, query())).rejects.toMatchObject({ statusHttp: 403 });

    const vendedor = await crearUsuario("VENDEDOR");
    await expect(getPorAsesor(vendedor, query())).rejects.toMatchObject({ statusHttp: 403 });
  }));

  it("un admin ve el desglose por responsable con tasa de conversión", () =>
    conContexto(async () => {
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
  }));

  it("un asesor desactivado (M2) sigue mostrando su nombre real, con sufijo '(usuario dado de baja)'", () =>
    conContexto(async () => {
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
  }));
});

describe("services/metricas.service — getPorRedSocial (docs/08 §3.1)", () => {
  it("agrupa por red social con tasa de conversión por red", () =>
    conContexto(async () => {
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
  }));
});

describe("services/metricas.service — getPorEtapa", () => {
  it("suma el total de leads del período incluyendo las 5 etapas", () =>
    conContexto(async () => {
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
  }));
});

describe("services/metricas.service — getEmbudo (docs/08 §3.3)", () => {
  it("NO_VENTA nunca aparece como paso del embudo, solo VENTA es el último paso", () =>
    conContexto(async () => {
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
  }));
});

describe("services/metricas.service — getPorCampania (docs/08 §3.4)", () => {
  it("agrupa por nombre de campaña Y red social — mismo nombre en redes distintas son filas independientes", () =>
    conContexto(async () => {
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
  }));
});

describe("services/metricas.service — getRedSocialXSemaforo (docs/08 §3.5, matriz cruzada)", () => {
  it("cruza red social por color de semáforo con porcentaje de verdes por red", () =>
    conContexto(async () => {
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
  }));
});

// ---------------------------------------------------------------------------
// Extensiones de dashboard (Bloque E, docs/blocks/e-dashboards.md
// "Extensiones de dashboard"): E1-E5.
// ---------------------------------------------------------------------------

describe("services/metricas.service — getEmbudoOportunidad (E1, embudo de negociación)", () => {
  it("calcula el embudo sobre Oportunidad.etapa, separado del embudo de Lead, con caída porcentual entre pasos", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const lead1 = await crearLead();
      const lead2 = await crearLead();
      const lead3 = await crearLead();
      const lead4 = await crearLead();

      await crearOportunidad(lead1.id, { asesorId: asesor.id, etapa: "NUEVO" });
      await crearOportunidad(lead2.id, { asesorId: asesor.id, etapa: "NUEVO" });
      await crearOportunidad(lead3.id, { asesorId: asesor.id, etapa: "CONTACTADO" });
      await crearOportunidad(lead4.id, { asesorId: asesor.id, etapa: "NO_VENTA" });

      const embudo = await getEmbudoOportunidad(asesor, query());
      expect(embudo.pasos.map((p) => p.etapa)).toEqual(["NUEVO", "CONTACTADO", "CITA", "VENTA"]);
      expect(embudo.pasos[0]?.total).toBe(2);
      expect(embudo.pasos[0]?.caidaPct).toBeNull();
      expect(embudo.pasos[1]?.total).toBe(1);
      expect(embudo.pasos[1]?.caidaPct).toBeCloseTo(50, 2);
      expect(embudo.noVenta).toBe(1);
    }));

  it("triangulación: un asesor sin ninguna Oportunidad propia ve el embudo en cero, no lanza", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const embudo = await getEmbudoOportunidad(asesor, query());
      expect(embudo.pasos.every((p) => p.total === 0)).toBe(true);
      expect(embudo.noVenta).toBe(0);
    }));
});

describe("services/metricas.service — getPorProducto (E2, rendimiento por producto)", () => {
  it("agrupa por producto con conteos y tasa de conversión, mismo patrón que getPorRedSocial", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const productoA = await crearProducto();
      const productoB = await crearProducto();
      const lead1 = await crearLead();
      const lead2 = await crearLead();
      const lead3 = await crearLead();

      await crearOportunidad(lead1.id, { asesorId: asesor.id, productoId: productoA.id, etapa: "VENTA" });
      await crearOportunidad(lead2.id, { asesorId: asesor.id, productoId: productoA.id, etapa: "NO_VENTA" });
      await crearOportunidad(lead3.id, { asesorId: asesor.id, productoId: productoB.id, etapa: "NUEVO" });

      const filas = await getPorProducto(asesor, query());
      const filaA = filas.find((f) => f.productoId === productoA.id);
      const filaB = filas.find((f) => f.productoId === productoB.id);
      expect(filaA?.total).toBe(2);
      expect(filaA?.ventas).toBe(1);
      expect(filaA?.noVentas).toBe(1);
      expect(filaA?.tasaConversionPct).toBeCloseTo(50, 2);
      expect(filaA?.nombreProducto).toBe(productoA.nombre);
      expect(filaB?.total).toBe(1);
      expect(filaB?.tasaConversionPct).toBeNull();
    }));

  it("triangulación: un producto sin ningún cierre en el período tiene tasaConversionPct null (denominador 0)", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const producto = await crearProducto();
      const lead = await crearLead();
      await crearOportunidad(lead.id, { asesorId: asesor.id, productoId: producto.id, etapa: "CITA" });

      const filas = await getPorProducto(asesor, query());
      const fila = filas.find((f) => f.productoId === producto.id);
      expect(fila?.total).toBe(1);
      expect(fila?.ventas).toBe(0);
      expect(fila?.noVentas).toBe(0);
      expect(fila?.tasaConversionPct).toBeNull();
    }));
});

describe("services/metricas.service — getCascadaLeadOportunidad (E3, cascada Lead→Oportunidad→Venta)", () => {
  it("cuenta cuántos Leads llegan a tener una Oportunidad y cuántos de esos cierran en VENTA", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      await crearLead({ asesorId: asesor.id }); // sin Oportunidad
      const leadConOportunidadAbierta = await crearLead({ asesorId: asesor.id });
      const leadConVenta = await crearLead({ asesorId: asesor.id });
      await crearOportunidad(leadConOportunidadAbierta.id, { asesorId: asesor.id, etapa: "CONTACTADO" });
      await crearOportunidad(leadConVenta.id, { asesorId: asesor.id, etapa: "VENTA" });

      const cascada = await getCascadaLeadOportunidad(asesor, query());
      expect(cascada.leads).toBe(3);
      expect(cascada.conOportunidad).toBe(2);
      expect(cascada.ventaOportunidad).toBe(1);
      expect(cascada.tasaAperturaPct).toBeCloseTo((2 / 3) * 100, 2);
      expect(cascada.tasaCierrePct).toBeCloseTo(50, 2);
    }));

  it("triangulación: ningún lead con Oportunidad -> tasaCierrePct es null (denominador 0), tasaAperturaPct es 0", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      await crearLead({ asesorId: asesor.id });
      await crearLead({ asesorId: asesor.id });

      const cascada = await getCascadaLeadOportunidad(asesor, query());
      expect(cascada.leads).toBe(2);
      expect(cascada.conOportunidad).toBe(0);
      expect(cascada.ventaOportunidad).toBe(0);
      expect(cascada.tasaAperturaPct).toBe(0);
      expect(cascada.tasaCierrePct).toBeNull();
    }));
});

describe("services/metricas.service — getPorHabilitadoParaVenta (E4, eficiencia del handoff D8)", () => {
  it("403 cuando un asesor consulta esta gráfica directamente (mismo criterio que getPorAsesor)", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      await expect(getPorHabilitadoParaVenta(asesor, query())).rejects.toMatchObject({ statusHttp: 403 });
    }));

  it("compara volumen/conversión entre asesores habilitados y no habilitados para venta (D7)", () =>
    conContexto(async () => {
      const admin = await crearUsuario("ADMINISTRADOR");
      const antes = await getPorHabilitadoParaVenta(admin, query());
      const habilitadoAntes = antes.find((b) => b.habilitadoParaVenta === true);
      const noHabilitadoAntes = antes.find((b) => b.habilitadoParaVenta === false);

      const asesorHabilitado = await crearUsuario("ASESOR");
      const asesorNoHabilitado = await crearUsuario("ASESOR");
      await crearMembresiaAsesor(asesorHabilitado.id, true);
      await crearMembresiaAsesor(asesorNoHabilitado.id, false);

      const lead1 = await crearLead();
      const lead2 = await crearLead();
      const lead3 = await crearLead();
      await crearOportunidad(lead1.id, { asesorId: asesorHabilitado.id, etapa: "VENTA" });
      await crearOportunidad(lead2.id, { asesorId: asesorHabilitado.id, etapa: "NO_VENTA" });
      await crearOportunidad(lead3.id, { asesorId: asesorNoHabilitado.id, etapa: "NO_VENTA" });

      const despues = await getPorHabilitadoParaVenta(admin, query());
      const habilitadoDespues = despues.find((b) => b.habilitadoParaVenta === true);
      const noHabilitadoDespues = despues.find((b) => b.habilitadoParaVenta === false);

      // Delta contra el "antes" -- consulta holding-wide (admin), sin un
      // marcador equivalente a `campania` para aislar de otras pruebas de
      // este mismo archivo (Oportunidad no tiene ese campo, ver nota de
      // `metricas.access.ts::resolveAlcanceBaseOportunidad`); comparar la
      // diferencia exacta que agregan LOS DOS asesores nuevos de esta prueba
      // es correcto sin importar cuántas filas previas ya existan.
      expect((habilitadoDespues?.total ?? 0) - (habilitadoAntes?.total ?? 0)).toBe(2);
      expect((habilitadoDespues?.ventas ?? 0) - (habilitadoAntes?.ventas ?? 0)).toBe(1);
      expect((habilitadoDespues?.noVentas ?? 0) - (habilitadoAntes?.noVentas ?? 0)).toBe(1);
      expect((habilitadoDespues?.totalAsesores ?? 0) - (habilitadoAntes?.totalAsesores ?? 0)).toBe(1);

      expect((noHabilitadoDespues?.total ?? 0) - (noHabilitadoAntes?.total ?? 0)).toBe(1);
      expect((noHabilitadoDespues?.noVentas ?? 0) - (noHabilitadoAntes?.noVentas ?? 0)).toBe(1);
      expect((noHabilitadoDespues?.totalAsesores ?? 0) - (noHabilitadoAntes?.totalAsesores ?? 0)).toBe(1);
    }));
});

describe("services/metricas.service — getRankingProductosPorEmpresa (E5)", () => {
  it("agrupa por (empresa, producto) — un administrador holding-wide ve el desglose de cada empresa por separado", () =>
    conContexto(async () => {
      const admin = await crearUsuario("ADMINISTRADOR");
      const empresaB = await testAdminPrisma.empresa.create({ data: { nombre: `Empresa Ranking ${Date.now()}` } });
      const productoBootstrap = await crearProducto();
      const productoEmpresaB = await testAdminPrisma.producto.create({
        data: { empresaId: empresaB.id, nombre: `Producto B ${Date.now()}` },
      });
      const clienteEmpresaB = await testAdminPrisma.cliente.create({
        data: { nombre: "Cliente Empresa B Ranking", telefonoValido: false },
      });
      const leadEmpresaB = await testAdminPrisma.lead.create({
        data: {
          clienteId: clienteEmpresaB.id,
          origen: "NUEVO",
          etapa: "NUEVO",
          ingresadoEn: new Date(),
          empresaId: empresaB.id,
        },
      });
      const leadBootstrap = await crearLead();

      await crearOportunidad(leadBootstrap.id, { productoId: productoBootstrap.id, etapa: "VENTA" });
      await crearOportunidad(leadEmpresaB.id, { empresaId: empresaB.id, productoId: productoEmpresaB.id, etapa: "NO_VENTA" });

      const filas = await getRankingProductosPorEmpresa(admin, query());
      const filaBootstrap = filas.find((f) => f.productoId === productoBootstrap.id);
      const filaEmpresaB = filas.find((f) => f.productoId === productoEmpresaB.id);

      expect(filaBootstrap?.empresaId).toBe(EMPRESA_BOOTSTRAP_ID);
      expect(filaBootstrap?.total).toBe(1);
      expect(filaBootstrap?.ventas).toBe(1);
      expect(filaEmpresaB?.empresaId).toBe(empresaB.id);
      expect(filaEmpresaB?.nombreEmpresa).toBe(empresaB.nombre);
      expect(filaEmpresaB?.noVentas).toBe(1);
    }));

  it("triangulación: un asesor company-scoped solo ve el ranking de su propia empresa, nunca de otras", () =>
    conContexto(async () => {
      const asesor = await crearUsuario("ASESOR");
      const producto = await crearProducto();
      const lead = await crearLead();
      await crearOportunidad(lead.id, { asesorId: asesor.id, productoId: producto.id, etapa: "CITA" });

      const filas = await getRankingProductosPorEmpresa(asesor, query());
      expect(filas.every((f) => f.empresaId === EMPRESA_BOOTSTRAP_ID)).toBe(true);
      expect(filas.some((f) => f.productoId === producto.id)).toBe(true);
    }));
});

describe("services/metricas.service — getRendimientoCampanias Meta Ads", () => {
  it("calcula CPC/CPL/CAC reales por moneda y devuelve null cuando no hay denominador", () =>
    conContexto(async () => {
      const admin = await crearUsuario("ADMINISTRADOR");
      const autorizado = await testAdminPrisma.usuario.create({
        data: {
          nombre: "Admin Meta Ads Métricas",
          correo: `meta-ads-metricas-${Date.now()}@test.local`,
          passwordHash: "hash-no-usado",
          rol: "ADMINISTRADOR",
        },
      });
      const conexion = await testAdminPrisma.cuentaAnunciosConexion.create({
        data: {
          empresaId: EMPRESA_BOOTSTRAP_ID,
          autorizadoPorUsuarioId: autorizado.id,
          cuentaAnunciosIdExterno: `act_${Date.now()}`,
          nombre: "Cuenta Meta Ads Métricas",
          moneda: "USD",
          tokenCifrado: "fake-ciphertext",
          estado: "ACTIVA",
        },
      });
      const campaniaConDatos = await testAdminPrisma.campania.create({
        data: {
          cuentaAnunciosConexionId: conexion.id,
          idExterno: `camp-meta-${Date.now()}`,
          nombre: "Campaña Meta con datos",
          redSocial: "FACEBOOK",
        },
      });
      const campaniaSinDenominadores = await testAdminPrisma.campania.create({
        data: {
          cuentaAnunciosConexionId: conexion.id,
          idExterno: `camp-meta-sin-den-${Date.now()}`,
          nombre: "Campaña Meta sin denominadores",
          redSocial: "INSTAGRAM",
        },
      });

      await testAdminPrisma.campaniaMetricaDiaria.createMany({
        data: [
          {
            campaniaId: campaniaConDatos.id,
            fecha: new Date("2026-08-10T00:00:00.000Z"),
            redSocial: "FACEBOOK",
            gasto: "100.00",
            impresiones: 1000,
            clics: 20,
            alcance: 800,
            moneda: "USD",
          },
          {
            campaniaId: campaniaSinDenominadores.id,
            fecha: new Date("2026-08-10T00:00:00.000Z"),
            redSocial: "INSTAGRAM",
            gasto: "50.00",
            impresiones: 500,
            clics: 0,
            alcance: 300,
            moneda: "ARS",
          },
        ],
      });
      const leadVenta = await crearLead({
        etapa: "NUEVO",
        redSocial: "FACEBOOK",
        ingresadoEn: new Date("2026-08-10T12:00:00.000Z"),
      });
      await testAdminPrisma.lead.update({ where: { id: leadVenta.id }, data: { campaniaId: campaniaConDatos.id } });
      await crearOportunidad(leadVenta.id, {
        etapa: "VENTA",
        cerradaEn: new Date("2026-08-11T12:00:00.000Z"),
      });
      const leadSinVenta = await crearLead({
        redSocial: "FACEBOOK",
        ingresadoEn: new Date("2026-08-12T12:00:00.000Z"),
      });
      await testAdminPrisma.lead.update({ where: { id: leadSinVenta.id }, data: { campaniaId: campaniaConDatos.id } });

      const filas = await getRendimientoCampanias(admin, query({
        rango: "personalizado",
        desde: new Date("2026-08-01T00:00:00.000Z"),
        hasta: new Date("2026-08-31T23:59:59.999Z"),
      }));

      const filaConDatos = filas.find((fila) => fila.campaniaId === campaniaConDatos.id);
      const filaSinDenominadores = filas.find((fila) => fila.campaniaId === campaniaSinDenominadores.id);
      expect(filaConDatos).toMatchObject({
        moneda: "USD",
        gasto: 100,
        clics: 20,
        leads: 2,
        ventas: 1,
        cpc: 5,
        cpl: 50,
        cac: 100,
      });
      expect(filaSinDenominadores).toMatchObject({
        moneda: "ARS",
        clics: 0,
        leads: 0,
        ventas: 0,
        cpc: null,
        cpl: null,
        cac: null,
      });
    }));
});
