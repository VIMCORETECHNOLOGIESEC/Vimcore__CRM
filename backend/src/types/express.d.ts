import type { AuthenticatedUser } from "./authenticated-user.js";

// Declaration merging: `req.user` es opcional porque Express no lo garantiza;
// solo `requireAuthentication` lo asigna. `export {}` es obligatorio con
// "type": "module" para que este archivo se trate como módulo ambiental.
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
