// Fixture usada por `cifrado-token.test.ts` para verificar, en un proceso
// hijo aislado, que `config/env.ts` aborta el arranque (D-C, mismo patrón que
// `JWT_SECRET`) cuando falta una variable de entorno obligatoria. Importar
// este módulo dispara la validación de `env.ts` como efecto secundario de
// carga — igual que cualquier import real de la app.
import "../../src/config/env.js";
