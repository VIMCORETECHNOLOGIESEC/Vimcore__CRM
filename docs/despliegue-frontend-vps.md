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
| `VPS_SSH_KEY` | Opción recomendada si se carga desde la UI de GitHub: private key completa, multilínea. |
| `VPS_SSH_KEY_B64` | Clave privada SSH codificada en base64. El workflow también tolera la private key pegada en crudo si se cargó así por error. |
| `VPS_PORT` | Opcional; si no existe usa `22`. |

Comando recomendado para cargar la clave sin compartirla en chat:

```bash
base64 -w0 ~/.ssh/id_ed25519_vps | gh secret set VPS_SSH_KEY_B64 --body-file -
```

Si no se usa `gh` y se carga desde GitHub web, es más simple crear
`VPS_SSH_KEY` y pegar la clave privada completa. Para verla localmente:

```bash
sed -n '1,$p' ~/.ssh/id_ed25519_crm
```

Debe empezar con `-----BEGIN OPENSSH PRIVATE KEY-----` y terminar con
`-----END OPENSSH PRIVATE KEY-----`. No pegarla en chat.

Si se carga manualmente desde la interfaz web de GitHub, pegar solo la salida
base64, sin prompt, sin comillas y sin texto adicional. Si accidentalmente se
pegó la private key completa (`-----BEGIN OPENSSH PRIVATE KEY-----`), el
workflow también la escribe como archivo PEM válido.

### Variables Requeridas

| Variable | Uso |
|---|---|
| `FRONTEND_API_BASE_URL` | URL del backend con `/api/v1`, por ejemplo `https://arcano-crm.happyground-63307e62.eastus.azurecontainerapps.io/api/v1`. |
| `FRONTEND_DOMAIN` | Dominio público que Traefik debe enrutar al frontend. Si no existe usa `crm.nexuscorpec.com`. |
| `FRONTEND_HEALTH_URL` | Opcional; health check público del workflow. Usar cuando el dominio ya tenga HTTPS, por ejemplo `https://crm.tudominio.com/health`. Si no existe, el workflow solo valida salud interna desde la VPS. |
| `FRONTEND_HTTP_PORT` | Opcional; puerto público del contenedor en la VPS. Si no existe usa `30080` para no chocar con un proxy o web server existente en `80`/`8080`. |
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

Compose conecta el contenedor a la red externa `coolify`, publica el puerto
`30080` solo en loopback para diagnóstico interno y agrega labels de Traefik
para que Coolify enrute `FRONTEND_DOMAIN` por HTTPS:

```yaml
ports:
  - "127.0.0.1:${FRONTEND_HTTP_PORT:-30080}:80"
```

No publicar `30080` como puerto público si Traefik/Coolify ya maneja `80/443`.
La entrada pública debe ser el dominio, por ejemplo
`https://crm.nexuscorpec.com`.

## Dominio

El dominio no se agrega en Docker ni en GitHub. Se configura en el proveedor DNS:

1. Crear un registro `A` para el dominio o subdominio.
2. Apuntarlo al IP público de la VPS.
3. Esperar propagación DNS.
4. Probar `https://<dominio>/health` cuando Traefik haya emitido el certificado.

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

Después del despliegue, primero verificar desde la VPS:

```bash
cd /root/service/crm-frontend
docker compose exec -T frontend wget -qO- http://127.0.0.1/health
```

Si eso responde `ok`, el contenedor está sano. Si el dominio no responde, el
problema está en DNS, Traefik/Let's Encrypt o el proxy de Coolify, no en la
imagen frontend.

Verificación pública:

```bash
curl -f https://crm.nexuscorpec.com/health
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
