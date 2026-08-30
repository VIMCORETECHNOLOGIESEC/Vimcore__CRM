FROM node:22.23.2-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY backend/prisma backend/prisma

RUN pnpm install --frozen-lockfile --filter backend...

COPY backend backend

RUN pnpm --filter backend exec prisma generate

WORKDIR /app/backend

# Compila a dist/ para produccion. Sin efecto sobre el flujo de desarrollo
# local (docker-compose.yml bind-monta el repo entero y sobreescribe
# `command:` con `pnpm dev`/tsx, ignorando este build y este CMD) -- este
# paso solo importa cuando la imagen corre tal cual, sin compose de por
# medio (Azure Container Apps).
RUN pnpm build

RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
