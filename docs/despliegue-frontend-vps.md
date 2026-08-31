# Despliegue frontend en VPS

Este flujo despliega solo el frontend en una VPS. El backend sigue viviendo en
Azure Container Apps y el frontend se publica como una imagen Docker estática
servida por Nginx.

## Ruta Rápida

1. Configurar los secrets y variables de GitHub Actions.
2. Preparar la VPS con Docker Compose y acceso SSH del usuario de deploy.
3. Apuntar el dominio al IP público de la VPS.
4. Hacer push a `main` con cambios de frontend.
5. Verificar `http://<dominio-o-ip>/health` y luego entrar a la aplicación.

## GitHub Actions

Workflow: `.github/workflows/deploy-frontend-vps.yml`.

El workflow corre en push a `main` si cambia frontend, schemas compartidos, el
Compose del VPS o el propio workflow. Primero ejecuta tests de frontend y build;
solo después construye la imagen Docker, la publica en GHCR y actualiza el
contenedor en la VPS por SSH.

El job desactiva la descarga de browsers de Puppeteer/Playwright porque el
frontend no los necesita para test/build. Esto evita que CI falle por descarga o
extracción de navegadores durante una instalación de workspace.

### Secrets Requeridos

| Secret | Uso |
|---|---|
| `VPS_HOST` | IP pública o dominio de la VPS. |
| `VPS_USER` | Usuario Linux que ejecuta Docker en la VPS. |
| `VPS_SSH_KEY_B64` | Clave privada SSH codificada en base64. |
| `VPS_PORT` | Opcional; si no existe usa `22`. |

Comando recomendado para cargar la clave sin compartirla en chat:

```bash
base64 -w0 ~/.ssh/id_ed25519_vps | gh secret set VPS_SSH_KEY_B64 --body-file -
```

### Variables Requeridas

| Variable | Uso |
|---|---|
| `FRONTEND_API_BASE_URL` | URL del backend con `/api/v1`, por ejemplo `https://arcano-crm.happyground-63307e62.eastus.azurecontainerapps.io/api/v1`. |
| `FRONTEND_HEALTH_URL` | Opcional; health check final del workflow. Usar cuando el dominio ya tenga HTTPS, por ejemplo `https://crm.tudominio.com/health`. |
| `VPS_DEPLOY_PATH` | Opcional; si no existe usa `/opt/crm-frontend`. |

`FRONTEND_API_BASE_URL` es variable, no secret: no contiene credenciales. Vite la
inyecta durante el build, así que cambiarla requiere reconstruir y redesplegar la
imagen.

## VPS

La VPS solo necesita Docker Engine, Docker Compose v2 y un usuario con permisos
para ejecutar `docker compose`. El workflow copia `deploy/frontend/docker-compose.yml`
a `VPS_DEPLOY_PATH` y crea allí un `.env` con la imagen exacta del commit.

Si se usa el path por defecto `/opt/crm-frontend`, prepararlo una vez en la VPS
con propietario del usuario de deploy. Ejemplo, ejecutado dentro de la VPS:

```bash
sudo mkdir -p /opt/crm-frontend
sudo chown -R $USER:$USER /opt/crm-frontend
```

Compose expone el contenedor en el puerto `80` de la VPS:

```yaml
ports:
  - "80:80"
```

Si en la VPS ya existe otro reverse proxy escuchando en `80`, cambiar ese mapeo
a un puerto local, por ejemplo `127.0.0.1:8080:80`, y hacer que el proxy externo
apunte a `http://127.0.0.1:8080`.

## Dominio

El dominio no se agrega en Docker ni en GitHub. Se configura en el proveedor DNS:

1. Crear un registro `A` para el dominio o subdominio.
2. Apuntarlo al IP público de la VPS.
3. Esperar propagación DNS.
4. Probar `http://<dominio>/health`.

Ejemplo:

| Tipo | Nombre | Valor |
|---|---|---|
| `A` | `crm` | IP pública de la VPS |

Eso publica `crm.tudominio.com` contra la VPS.

## HTTPS

Nginx dentro del contenedor solo sirve HTTP. Para HTTPS hay dos opciones válidas:

1. Terminar TLS en un reverse proxy del host, como Caddy o Nginx con Certbot.
2. Poner la VPS detras de un proxy administrado que entregue certificados.

Para el primer despliegue se puede validar por HTTP. Antes de uso real con
usuarios, HTTPS debe quedar activo y el backend debe cambiar `CORS_ORIGIN` de
`*` al origen exacto del frontend, por ejemplo `https://crm.tudominio.com`.

## Verificación

Después del despliegue:

```bash
curl -f http://<dominio-o-ip>/health
```

Luego abrir la app y verificar:

- Login contra el backend real.
- Recarga directa de rutas internas como `/leads`.
- CORS sin errores en consola.
- SSE de notificaciones sin bloqueo por proxy.

## Archivos

| Archivo | Función |
|---|---|
| `frontend/Dockerfile.prod` | Build multi-stage de Vite y servidor Nginx. |
| `deploy/frontend/nginx.conf` | Configuracion Nginx para SPA, cache de assets y `/health`. |
| `deploy/frontend/docker-compose.yml` | Runtime mínimo en la VPS. |
| `.github/workflows/deploy-frontend-vps.yml` | CI/CD de frontend hacia la VPS. |
