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
    }
  }
}

export {};
