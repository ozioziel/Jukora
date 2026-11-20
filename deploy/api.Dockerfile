# syntax=docker/dockerfile:1.7
# API NestJS. Multi-etapa: compila con dependencias de desarrollo y ejecuta solo con las de producción.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@jucumari/shared --workspace=@jucumari/api --include-workspace-root --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @jucumari/shared && npm run build -w @jucumari/api

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace=@jucumari/shared --workspace=@jucumari/api --no-audit --no-fund

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health/live || exit 1
# El compilador SWC conserva la carpeta src/ dentro de dist/.
CMD ["node", "apps/api/dist/src/main.js"]
