import { logger } from "../../lib/logger.js";
import { runMetaAdsSyncOnce } from "../../services/metaAds/meta-ads-sync.service.js";

const META_ADS_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1_000;

let running = false;

export function startMetaAdsSyncJob(): NodeJS.Timeout {
  return setInterval(() => {
    if (running) return;
    running = true;
    void runMetaAdsSyncOnce()
      .catch((error: unknown) => {
        logger.error({ err: error, holdingWide: true }, "meta-ads: fallo el job programado");
      })
      .finally(() => {
        running = false;
      });
  }, META_ADS_SYNC_INTERVAL_MS);
}
