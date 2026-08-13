FROM node:22.23.2-bookworm-slim

RUN corepack enable && corepack prepare pnpm@11.21.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY frontend/package.json frontend/package.json

RUN pnpm install --frozen-lockfile --filter frontend...

COPY frontend frontend

WORKDIR /app/frontend

EXPOSE 5173

CMD ["pnpm", "dev"]
