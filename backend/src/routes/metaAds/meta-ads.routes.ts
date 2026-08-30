import { Router } from "express";
import {
  getMetaAdsCallback,
  getMetaAdsConectar,
  getMetaAdsConexionStatus,
  postMetaAdsConexion,
} from "../../controllers/metaAds/meta-ads.controller.js";
import { requireAuthentication } from "../../middlewares/require-authentication.middleware.js";
import { requireRole } from "../../middlewares/require-role.middleware.js";

export const metaAdsRouter = Router();

metaAdsRouter.get(
  "/meta-ads/conectar",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getMetaAdsConectar,
);
metaAdsRouter.get("/meta-ads/callback", getMetaAdsCallback);
metaAdsRouter.post(
  "/meta-ads/conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  postMetaAdsConexion,
);
metaAdsRouter.get(
  "/meta-ads/conexion",
  requireAuthentication,
  requireRole("ADMINISTRADOR"),
  getMetaAdsConexionStatus,
);
