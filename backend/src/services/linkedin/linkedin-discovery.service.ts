import { Prisma } from "@prisma/client";
import { AppError } from "../../lib/app-error.js";
import * as bridgeRepository from "../../repositories/bridge.repository.js";
import * as linkedinConexionRepository from "../../repositories/linkedin/linkedin-conexion.repository.js";
import * as linkedinFormularioRepository from "../../repositories/linkedin/linkedin-formulario.repository.js";
import * as linkedinFuenteRepository from "../../repositories/linkedin/linkedin-fuente.repository.js";
import type { LinkedInLeadFormBody } from "../../schemas/linkedin/linkedin-leads.schema.js";
import {
  linkedinAdAccountsResponseSchema,
  linkedinLeadFormsResponseSchema,
  linkedinOrganizationAclsResponseSchema,
  type LinkedInAdAccountBody,
  type LinkedInAdAccountsResponseBody,
  type LinkedInLeadFormsResponseBody,
  type LinkedInOrganizationAclBody,
  type LinkedInOrganizationAclsResponseBody,
} from "../../schemas/linkedin/linkedin-discovery.schema.js";
import type { LinkedInFuenteDto, LinkedInLeadType, LinkedInSourceType } from "../../types/linkedin/linkedin.dto.js";
import { createProductionLinkedInApiClient, type LinkedInApiClient } from "./linkedin-api.service.js";
import { withLinkedInAccessToken } from "./linkedin-token.service.js";

const DISCOVERY_PAGE_SIZE = 100;
const LINKEDIN_DISCOVERY_MAX_PAGES = 25;
const ORGANIC_DISCOVERY_LEAD_TYPE: LinkedInLeadType = "COMPANY";
const LEAD_SYNC_ORGANIZATION_ROLES = new Set([
  "ADMINISTRATOR",
  "LEAD_GEN_FORMS_MANAGER",
  "CURATOR",
  "CONTENT_ADMINISTRATOR",
  "ANALYST",
]);

type PagedResponse = {
  elements: unknown[];
  paging?: { total?: number };
};

interface DiscoveredSource {
  tipo: LinkedInSourceType;
  ownerUrn: string;
  ownerParamName: "organization" | "sponsoredAccount";
  nombre: string;
  tipoLead: LinkedInLeadType;
}

export interface LinkedInDiscoveryDependencies {
  now: () => Date;
  findBridgeById: typeof bridgeRepository.findById;
  findConexionByBridgeId: typeof linkedinConexionRepository.findByBridgeId;
  withLinkedInAccessToken: typeof withLinkedInAccessToken;
  createApiClient: (accessToken: string) => LinkedInApiClient;
  upsertDiscoveredSource: typeof linkedinFuenteRepository.upsertDiscoveredSource;
  upsertForm: typeof linkedinFormularioRepository.upsertForm;
  markInactiveMissingForms: typeof linkedinFormularioRepository.markInactiveMissingForms;
}

export interface DescubrirFuentesLinkedInResult {
  fuentes: LinkedInFuenteDto[];
}

function bridgeNotFound(): AppError {
  return new AppError("bridge_no_encontrado", 404, "Bridge no encontrado");
}

function invalidLinkedInBridge(): AppError {
  return new AppError(
    "linkedin_bridge_invalido",
    422,
    "El bridge no es válido para LinkedIn",
  );
}

function connectionRequired(): AppError {
  return new AppError(
    "linkedin_conexion_requerida",
    409,
    "Debes conectar LinkedIn antes de descubrir fuentes",
  );
}

function linkedinApiError(): AppError {
  return new AppError(
    "linkedin_api_error",
    502,
    "No se pudo consultar la API de LinkedIn",
  );
}

function sanitizeProviderError(error: unknown): never {
  if (error instanceof AppError) throw error;
  throw linkedinApiError();
}

async function safeGetJson(apiClient: LinkedInApiClient, path: string): Promise<unknown> {
  try {
    return await apiClient.getJson(path);
  } catch (error) {
    return sanitizeProviderError(error);
  }
}

function toFuenteDto(fuente: Awaited<ReturnType<typeof linkedinFuenteRepository.upsertDiscoveredSource>>): LinkedInFuenteDto {
  return {
    id: fuente.id,
    tipo: fuente.tipo,
    ownerUrn: fuente.ownerUrn,
    nombre: fuente.nombre,
    tipoLead: fuente.tipoLead,
    activa: fuente.activa,
    estadoSuscripcion: fuente.estadoSuscripcion,
    ultimaSincronizacionEn: fuente.ultimaSincronizacionEn?.toISOString() ?? null,
  };
}

function localizedText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const localized = record.localized;
  if (typeof localized === "object" && localized !== null) {
    const first = Object.values(localized).find((candidate) => typeof candidate === "string" && candidate.trim());
    if (typeof first === "string") return first.trim();
  }

  return null;
}

function queryPath(resource: string, params: Record<string, string | number>): string {
  return `/${resource}?${new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString()}`;
}

function shouldContinue(response: PagedResponse, start: number): boolean {
  if (response.elements.length < DISCOVERY_PAGE_SIZE) return false;
  const total = response.paging?.total;
  if (typeof total === "number" && start + response.elements.length >= total) return false;
  return true;
}

async function fetchPaged<T extends PagedResponse>(
  apiClient: LinkedInApiClient,
  pathForPage: (start: number, count: number) => string,
  parse: (body: unknown) => T,
): Promise<T["elements"]> {
  const elements: T["elements"] = [];

  for (let page = 0; page < LINKEDIN_DISCOVERY_MAX_PAGES; page += 1) {
    const start = page * DISCOVERY_PAGE_SIZE;
    const response = parse(await safeGetJson(apiClient, pathForPage(start, DISCOVERY_PAGE_SIZE)));
    elements.push(...response.elements);
    if (!shouldContinue(response, start)) return elements;
  }

  return elements;
}

async function fetchAdAccounts(apiClient: LinkedInApiClient): Promise<LinkedInAdAccountBody[]> {
  const elements: LinkedInAdAccountBody[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < LINKEDIN_DISCOVERY_MAX_PAGES; page += 1) {
    const params: Record<string, string | number> = { q: "search", pageSize: DISCOVERY_PAGE_SIZE };
    if (pageToken) params.pageToken = pageToken;

    const response = parseAdAccounts(await safeGetJson(apiClient, queryPath("adAccounts", params)));
    elements.push(...response.elements);

    pageToken = response.metadata?.nextPageToken;
    if (!pageToken) return elements;
  }

  return elements;
}

function parseAdAccounts(body: unknown): LinkedInAdAccountsResponseBody {
  const parsed = linkedinAdAccountsResponseSchema.safeParse(body);
  if (!parsed.success) throw linkedinApiError();
  return parsed.data;
}

function parseOrganizationAcls(body: unknown): LinkedInOrganizationAclsResponseBody {
  const parsed = linkedinOrganizationAclsResponseSchema.safeParse(body);
  if (!parsed.success) throw linkedinApiError();
  return parsed.data;
}

function parseLeadForms(body: unknown): LinkedInLeadFormsResponseBody {
  const parsed = linkedinLeadFormsResponseSchema.safeParse(body);
  if (!parsed.success) throw linkedinApiError();
  return parsed.data;
}

function sponsoredAccountSource(account: LinkedInAdAccountBody): DiscoveredSource | null {
  if (account.status !== "ACTIVE") return null;
  const accountId = String(account.id);
  const ownerUrn = `urn:li:sponsoredAccount:${accountId}`;
  return {
    tipo: "SPONSORED_ACCOUNT",
    ownerUrn,
    ownerParamName: "sponsoredAccount",
    nombre: localizedText(account.name) ?? ownerUrn,
    tipoLead: "SPONSORED",
  };
}

function aclRoles(acl: LinkedInOrganizationAclBody): string[] {
  return [...new Set([acl.role, ...(acl.roles ?? [])].filter((role): role is string => Boolean(role)))];
}

function organizationUrn(acl: LinkedInOrganizationAclBody): string | null {
  return acl.organization ?? acl.organizationTarget ?? null;
}

function organizationSource(acl: LinkedInOrganizationAclBody): DiscoveredSource | null {
  if (acl.state && acl.state !== "APPROVED") return null;
  if (!aclRoles(acl).some((role) => LEAD_SYNC_ORGANIZATION_ROLES.has(role))) return null;

  const ownerUrn = organizationUrn(acl);
  if (!ownerUrn) return null;

  return {
    tipo: "ORGANIZATION",
    ownerUrn,
    ownerParamName: "organization",
    nombre: localizedText((acl as Record<string, unknown>).name) ?? ownerUrn,
    // TODO LinkedIn: confirmar con permisos reales cuándo EVENT y
    // ORGANIZATION_PRODUCT pueden activarse. Discovery los deja fuera para no
    // registrar fuentes que luego no se puedan sincronizar de forma segura.
    tipoLead: ORGANIC_DISCOVERY_LEAD_TYPE,
  };
}

function uniqueSources(sources: DiscoveredSource[]): DiscoveredSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.ownerUrn}:${source.tipoLead}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formVersionedUrn(form: LinkedInLeadFormBody): string {
  if (form.versionedLeadGenFormUrn) return form.versionedLeadGenFormUrn;
  const id = String(form.id);
  if (id.startsWith("urn:")) return id;
  return `urn:li:versionedLeadGenForm:${id}`;
}

function formContent(form: LinkedInLeadFormBody): Prisma.InputJsonValue {
  return form as Prisma.InputJsonObject;
}

async function fetchDiscoveredSources(apiClient: LinkedInApiClient): Promise<DiscoveredSource[]> {
  const [adAccounts, organizationAcls] = await Promise.all([
    fetchAdAccounts(apiClient),
    fetchPaged(
      apiClient,
      (start, count) => queryPath("organizationAcls", { q: "roleAssignee", state: "APPROVED", start, count }),
      parseOrganizationAcls,
    ),
  ]);

  return uniqueSources([
    ...adAccounts.map(sponsoredAccountSource).filter((source): source is DiscoveredSource => source !== null),
    ...organizationAcls.map(organizationSource).filter((source): source is DiscoveredSource => source !== null),
  ]);
}

function leadFormsPath(source: DiscoveredSource, start: number, count: number): string {
  return queryPath("leadForms", {
    q: "owner",
    owner: `(${source.ownerParamName}:${source.ownerUrn})`,
    start,
    count,
  });
}

export function createLinkedInDiscoveryService(dependencies: LinkedInDiscoveryDependencies) {
  async function descubrirFuentesLinkedIn(bridgeId: string): Promise<DescubrirFuentesLinkedInResult> {
    const bridge = await dependencies.findBridgeById(bridgeId);
    if (!bridge) throw bridgeNotFound();
    if (bridge.redSocial !== "LINKEDIN") throw invalidLinkedInBridge();

    const conexion = await dependencies.findConexionByBridgeId(bridgeId);
    if (!conexion) throw connectionRequired();

    return dependencies.withLinkedInAccessToken(bridgeId, async (accessToken) => {
      const apiClient = dependencies.createApiClient(accessToken);
      const discoveredSources = await fetchDiscoveredSources(apiClient);
      const fuentes: LinkedInFuenteDto[] = [];

      for (const source of discoveredSources) {
        const forms = await fetchPaged(
          apiClient,
          (start, count) => leadFormsPath(source, start, count),
          parseLeadForms,
        );
        const fuente = await dependencies.upsertDiscoveredSource({
          conexionId: conexion.id,
          cuentaPublicitariaId: null,
          tipo: source.tipo,
          ownerUrn: source.ownerUrn,
          nombre: source.nombre,
          tipoLead: source.tipoLead,
        });
        const versionedFormUrns: string[] = [];

        for (const form of forms) {
          const versionedFormUrn = formVersionedUrn(form);
          versionedFormUrns.push(versionedFormUrn);
          await dependencies.upsertForm({
            fuenteId: fuente.id,
            versionedFormUrn,
            nombre: localizedText(form.name),
            contenido: formContent(form),
            sincronizadoEn: dependencies.now(),
          });
        }

        await dependencies.markInactiveMissingForms(fuente.id, versionedFormUrns);
        fuentes.push(toFuenteDto(fuente));
      }

      return { fuentes };
    });
  }

  return { descubrirFuentesLinkedIn };
}

const productionService = createLinkedInDiscoveryService({
  now: () => new Date(),
  findBridgeById: bridgeRepository.findById,
  findConexionByBridgeId: linkedinConexionRepository.findByBridgeId,
  withLinkedInAccessToken,
  createApiClient: createProductionLinkedInApiClient,
  upsertDiscoveredSource: linkedinFuenteRepository.upsertDiscoveredSource,
  upsertForm: linkedinFormularioRepository.upsertForm,
  markInactiveMissingForms: linkedinFormularioRepository.markInactiveMissingForms,
});

export const descubrirFuentesLinkedIn = productionService.descubrirFuentesLinkedIn;
