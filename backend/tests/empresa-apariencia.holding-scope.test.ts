import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/azure-blob-storage.js", () => ({ uploadImage: vi.fn() }));
vi.mock("../src/repositories/empresa.repository.js", () => ({
  findById: vi.fn(),
  findAll: vi.fn(),
  create: vi.fn(),
  updateAparienciaHolding: vi.fn(),
}));

import {
  getEmpresa,
  getEmpresas,
  patchEmpresaAparienciaHolding,
  postEmpresa,
} from "../src/controllers/empresa-apariencia.controller.js";
import * as empresaRepository from "../src/repositories/empresa.repository.js";

const HOLDING_A = "11111111-1111-4111-8111-111111111111";
const HOLDING_B = "22222222-2222-4222-8222-222222222222";
const EMPRESA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPRESA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const repo = vi.mocked(empresaRepository);

function empresaRow(id: string, holdingId: string | null) {
  return {
    id,
    nombre: `Empresa ${id}`,
    colorPrimario: null,
    colorSecundario: null,
    logoUrl: null,
    holdingId,
  };
}

function makeReq(
  user: { holdingId?: string | null; rol?: string },
  extra: { params?: object; query?: object; body?: object } = {},
): Request {
  return {
    user: { sessionScope: "holding", empresaId: null, rol: "ADMINISTRADOR_HOLDING", ...user },
    params: {},
    query: {},
    body: {},
    ...extra,
  } as unknown as Request;
}

function makeRes() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as unknown as Response & { status: typeof res.status; json: typeof res.json };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("empresa-apariencia holding scope", () => {
  describe("session without holdingId", () => {
    it("fails closed (403 identidad_no_vinculada) for a non-SUPER_ADMIN holding session and never reads", async () => {
      await expect(
        getEmpresas(makeReq({ rol: "ADMINISTRADOR" }, { query: { page: "1", pageSize: "25" } }), makeRes()),
      ).rejects.toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
      await expect(
        getEmpresa(makeReq({ rol: "ADMINISTRADOR" }, { params: { empresaId: EMPRESA_A } }), makeRes()),
      ).rejects.toMatchObject({ code: "identidad_no_vinculada", statusHttp: 403 });
      expect(repo.findAll).not.toHaveBeenCalled();
      expect(repo.findById).not.toHaveBeenCalled();
    });
  });

  describe("GET /empresas", () => {
    it("filters by the caller holdingId", async () => {
      repo.findAll.mockResolvedValue({ items: [], total: 0 });
      await getEmpresas(makeReq({ holdingId: HOLDING_A }, { query: { page: "1", pageSize: "25" } }), makeRes());
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { AND: [{ holdingId: HOLDING_A }] } }),
      );
    });

    it("keeps the name search AND-ed with the holding filter", async () => {
      repo.findAll.mockResolvedValue({ items: [], total: 0 });
      await getEmpresas(
        makeReq({ holdingId: HOLDING_A }, { query: { page: "1", pageSize: "25", search: "acme" } }),
        makeRes(),
      );
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [{ holdingId: HOLDING_A }, { nombre: { contains: "acme", mode: "insensitive" } }],
          },
        }),
      );
    });

    it("does not filter by holding for the global (SUPER_ADMIN) path", async () => {
      repo.findAll.mockResolvedValue({ items: [], total: 0 });
      await getEmpresas(makeReq({ rol: "SUPER_ADMIN" }, { query: { page: "1", pageSize: "25" } }), makeRes());
      expect(repo.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
    });

    it("global path still supports the name search", async () => {
      repo.findAll.mockResolvedValue({ items: [], total: 0 });
      await getEmpresas(makeReq({ rol: "SUPER_ADMIN" }, { query: { page: "1", pageSize: "25", search: "acme" } }), makeRes());
      expect(repo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ nombre: { contains: "acme", mode: "insensitive" } }] },
        }),
      );
    });
  });

  describe("GET /empresas/:empresaId", () => {
    it("returns the empresa of the caller holding", async () => {
      repo.findById.mockResolvedValue(empresaRow(EMPRESA_A, HOLDING_A));
      const res = makeRes();
      await getEmpresa(makeReq({ holdingId: HOLDING_A }, { params: { empresaId: EMPRESA_A } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("404s for an empresa of another holding", async () => {
      repo.findById.mockResolvedValue(empresaRow(EMPRESA_B, HOLDING_B));
      await expect(
        getEmpresa(makeReq({ holdingId: HOLDING_A }, { params: { empresaId: EMPRESA_B } }), makeRes()),
      ).rejects.toMatchObject({ statusHttp: 404, code: "empresa_no_encontrada" });
    });

    it("404s for an empresa without holding when the caller has one", async () => {
      repo.findById.mockResolvedValue(empresaRow(EMPRESA_B, null));
      await expect(
        getEmpresa(makeReq({ holdingId: HOLDING_A }, { params: { empresaId: EMPRESA_B } }), makeRes()),
      ).rejects.toMatchObject({ statusHttp: 404 });
    });

    it("global path can read any empresa", async () => {
      repo.findById.mockResolvedValue(empresaRow(EMPRESA_B, HOLDING_B));
      const res = makeRes();
      await getEmpresa(makeReq({ rol: "SUPER_ADMIN" }, { params: { empresaId: EMPRESA_B } }), res);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("PATCH /empresas/:empresaId/apariencia", () => {
    it("404s and never writes for an empresa of another holding", async () => {
      repo.findById.mockResolvedValue(empresaRow(EMPRESA_B, HOLDING_B));
      await expect(
        patchEmpresaAparienciaHolding(
          makeReq({ holdingId: HOLDING_A }, { params: { empresaId: EMPRESA_B }, body: { nombre: "x" } }),
          makeRes(),
        ),
      ).rejects.toMatchObject({ statusHttp: 404, code: "empresa_no_encontrada" });
      expect(repo.updateAparienciaHolding).not.toHaveBeenCalled();
    });

    it("updates an empresa of the caller holding", async () => {
      repo.findById.mockResolvedValue(empresaRow(EMPRESA_A, HOLDING_A));
      repo.updateAparienciaHolding.mockResolvedValue(empresaRow(EMPRESA_A, HOLDING_A));
      const res = makeRes();
      await patchEmpresaAparienciaHolding(
        makeReq({ holdingId: HOLDING_A }, { params: { empresaId: EMPRESA_A }, body: { nombre: "x" } }),
        res,
      );
      expect(repo.updateAparienciaHolding).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("POST /empresas", () => {
    it("sets holdingId from the caller session", async () => {
      repo.create.mockResolvedValue(empresaRow(EMPRESA_A, HOLDING_A));
      const res = makeRes();
      await postEmpresa(makeReq({ holdingId: HOLDING_A }, { body: { nombre: "Nueva" } }), res);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ nombre: "Nueva", holdingId: HOLDING_A }));
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("ignores a holdingId sent in the body", async () => {
      repo.create.mockResolvedValue(empresaRow(EMPRESA_A, HOLDING_A));
      await postEmpresa(
        makeReq({ holdingId: HOLDING_A }, { body: { nombre: "Nueva", holdingId: HOLDING_B } }),
        makeRes(),
      );
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ holdingId: HOLDING_A }));
    });

    it("global path keeps the previous behavior (no holdingId)", async () => {
      repo.create.mockResolvedValue(empresaRow(EMPRESA_A, null));
      await postEmpresa(makeReq({ rol: "SUPER_ADMIN" }, { body: { nombre: "Nueva" } }), makeRes());
      expect(repo.create.mock.calls[0]?.[0]).not.toHaveProperty("holdingId");
    });
  });
});
