import type { RedSocial } from "@prisma/client";
import type { AuthenticatedUser } from "./authenticated-user.js";

// Declaration merging: `req.user` es opcional porque Express no lo garantiza;
// solo `requireAuthentication` lo asigna. `req.bridge` sigue el mismo patrón
// para `requireBridgeKey` (DD4, diseño M4). `export {}` es obligatorio con
// "type": "module" para que este archivo se trate como módulo ambiental.
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      bridge?: { id: string; redSocial: RedSocial };
      /**
       * Cuerpo crudo exacto de la request (`app.ts`, opción `verify` de
       * `express.json()`). Necesario para el webhook de Meta: la verificación
       * de `X-Hub-Signature-256` es HMAC sobre estos bytes tal cual Meta los
       * envió, nunca sobre `JSON.stringify(req.body)` re-serializado (el
       * orden/espaciado puede no coincidir byte a byte). `undefined` cuando
       * el body está vacío (Express 5 no invoca `verify` sin bytes que leer).
       */
      rawBody?: Buffer;
    }
  }
}

export {};
