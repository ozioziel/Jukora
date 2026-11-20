# syntax=docker/dockerfile:1.7
# Web estática (Vite) servida por Nginx, que además hace de proxy hacia la API interna.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@jucumari/shared --workspace=@jucumari/web --include-workspace-root --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# Solo variables PÚBLICAS (terminan en el navegador).
ARG VITE_API_URL=/api
ARG VITE_STELLAR_NETWORK=testnet
ARG VITE_DEMO_MODE=true
ARG VITE_POLLAR_PUBLISHABLE_KEY=
ENV VITE_API_URL=$VITE_API_URL VITE_STELLAR_NETWORK=$VITE_STELLAR_NETWORK VITE_DEMO_MODE=$VITE_DEMO_MODE VITE_POLLAR_PUBLISHABLE_KEY=$VITE_POLLAR_PUBLISHABLE_KEY
RUN npm run build -w @jucumari/web

FROM nginx:1.27-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
