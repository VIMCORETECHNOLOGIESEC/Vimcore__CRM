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

## Corte a producción real

Cuando el backend se despliegue de verdad contra Azure, `AZURE_STORAGE_CONNECTION_STRING`
se pisa (como variable de entorno del Container App, nunca en un archivo
versionado) con la connection string real de `nexuscorp` — sacala con:

```
az storage account show-connection-string --name nexuscorp --resource-group documents
```

Ningún archivo de código cambia en ese corte — es solo la variable de
entorno.
