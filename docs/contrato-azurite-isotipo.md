# Contrato: Azurite local para el upload de isotipo (hasta el deploy real)

## Por qué

El backend gana dos endpoints nuevos (`POST /empresas/actual/apariencia/logo`,
`POST /configuracion-empresa/logo`) que suben una imagen a Azure Blob
Storage. La Storage Account real (`nexuscorp`) vive en Azure, en el mismo
resource group donde se despliega el backend — no accesible ni deseable
para desarrollo local diario. Mientras no hay deploy real corriendo contra
esa cuenta, el equipo usa **Azurite** (emulador oficial de Azure Storage de
Microsoft) como reemplazo local, sin ningún cambio de código.

## Cómo funciona

`docker-compose.yml` agrega un servicio `azurite` (imagen oficial
`mcr.microsoft.com/azure-storage/azurite`), y `.env.dev` ya trae
`AZURE_STORAGE_CONNECTION_STRING` apuntando a él, usando las credenciales
de desarrollo **públicas y bien conocidas** de Azurite (no son un secreto —
son las mismas para cualquiera que corra Azurite en cualquier proyecto).

`backend/src/lib/azure-blob-storage.ts` usa `BlobServiceClient.fromConnectionString(...)`
del SDK oficial — no le importa si la connection string apunta a Azurite o
a Azure real, el código es idéntico en los dos casos.

## Uso local

```
sudo docker compose up -d azurite
```

(o simplemente `sudo docker compose up` normal, ya que `azurite` es un
servicio más del mismo compose). Los blobs subidos quedan en el volumen
`azurite_data`, persistente entre reinicios del contenedor.

## URL pública en local vs. producción (`AZURE_STORAGE_PUBLIC_BASE_URL`)

La connection string local apunta al hostname de red interna de Docker
Compose (`azurite:10000`) — resoluble desde el contenedor `backend`, pero
NO desde el navegador que corre en el host (`localhost:5173`). Sin más, la
URL del isotipo que devuelve `POST .../logo` quedaría como
`http://azurite:10000/...`, y el `<img src>` del frontend no cargaría nada
en desarrollo local.

`AZURE_STORAGE_PUBLIC_BASE_URL=http://localhost:10000` (en `.env`, ya
seteado para este worktree) resuelve esto: `lib/azure-blob-storage.ts`
reescribe SOLO el origin (protocolo+host+puerto) de la URL que devuelve el
SDK por este valor, dejando el path intacto — la persistencia real sigue
yendo contra `azurite:10000` (el backend necesita ese hostname para
escribir), solo cambia lo que se le devuelve al navegador para leer.

## Corte a producción real

Cuando el backend se despliegue de verdad contra Azure, dos variables de
entorno del Container App cambian (nunca en un archivo versionado):

1. `AZURE_STORAGE_CONNECTION_STRING` se pisa con la connection string real
   de `nexuscorp`:
   ```
   az storage account show-connection-string --name nexuscorp --resource-group documents
   ```
2. `AZURE_STORAGE_PUBLIC_BASE_URL` **debe quedar SIN SETEAR** — la Storage
   Account real de Azure ya expone una única URL pública, resoluble tanto
   desde el backend como desde cualquier navegador. No hay split de host
   interno/externo que resolver ahí; si esta variable queda seteada por
   error en producción, las URLs de isotipo devueltas apuntarían a
   `localhost:10000`, rotas para cualquiera fuera de esta máquina.

Ningún archivo de código cambia en ese corte — son solo esas dos variables
de entorno.
