# Jucumari (nombre provisional)

Plataforma web para **encontrar, cotizar y comprar con protección** los recursos que necesita un negocio para comenzar o expandirse. La persona describe su negocio, responde unas preguntas (sin IA ni costo), y el jucumari —un oso andino de constelación— organiza los recursos, busca proveedores y permite pagar con un depósito en garantía (escrow) en **Stellar Testnet** mediante Trustless Work.

> Estado: MVP para demostración. Todo pago ocurre en **testnet** con un **token de prueba sin valor (USDCDEMO, no es USDC)**. El catálogo y las reseñas incluidos son **DEMO** (ficticios y etiquetados).

## Qué incluye

| Área | Estado |
|---|---|
| Inicio con 6 paneles de partículas reversibles por scroll, halo estelar del cursor | Implementado y probado en navegador |
| Mi espacio: jucumari, cuestionario progresivo (sin IA), casas por negocio con puerta animada | Implementado y probado (E2E) |
| 10 búsquedas inteligentes/día (cuota atómica en el servidor, idempotente, reinicio a medianoche local) | Implementado y probado |
| Plan de recursos: Groq / Ollama / reglas DEMO; escena oso → estrella → Tierra → tarjetas | Implementado; IA real pendiente de clave |
| Resultados por categoría: catálogo propio + Tavily (con tope diario global), ranking explicable | Implementado; Tavily pendiente de clave |
| Explorar (marketplace), ficha de artículo y proveedor | Implementado y probado |
| Solicitudes de cotización, cotizaciones versionadas, aceptación → pedido con comisión 2,5 % (mín. 1) | Implementado y probado |
| Pago protegido: Trustless Work (single-release), firma con Pollar / wallet / llave de prueba | Implementado, **sin probar** (falta `TW_API_KEY`) |
| «Pagar con QR»: rampa simulada BOB en testnet (QR no pagable, etiquetado) | Implementado y probado en testnet real |
| Seguimiento, recepción, aceptación, disputas con pruebas privadas y árbitro | Implementado; ejecución en escrow pendiente de `TW_API_KEY` |
| KYC Didit (sandbox), KYB por verificador, notificaciones en la app | Implementado; Didit pendiente de clave |
| Modo proveedor: Inicio, Buscar negocios, Publicar artículo | Implementado |
| Idiomas: español, inglés, quechua y aimara (beta, por validar con hablantes) | Implementado |
| Docker, Compose, CI (GitHub Actions) y CD manual con aprobación | Preparado; imágenes y Compose probados en local |

## Inicio rápido

Requisitos: Node 24, Docker Desktop encendido, Stellar CLI (opcional, para el token de prueba).

```bash
npm ci
npx supabase start            # base local (puertos 553xx)
npm run setup:local           # crea .env con valores locales (no imprime secretos)
npm run stellar:setup         # cuentas y token de prueba en testnet (opcional)
npm run dev                   # API :3000 + web :5173
```

Más detalle en [docs/desarrollo-local.md](docs/desarrollo-local.md). Lo que debe hacer el responsable con cuentas y claves está en [docs/pasos-del-usuario.md](docs/pasos-del-usuario.md).

## Estructura

```
apps/web        React 19 + Vite + Tailwind 4 (interfaz, escenas, i18n)
apps/api        NestJS 11 (auth SEP-53, búsqueda, catálogo, pedidos, escrow, pagos, disputas)
packages/shared Contratos y reglas compartidas (dinero sin coma flotante, cuota, ranking)
supabase/       Migraciones SQL (RLS), funciones, seed DEMO, configuración local
deploy/         Dockerfiles, Nginx, Compose local y de producción
scripts/        Configuración local, testnet y asignación de roles
tests/e2e       Playwright
docs/           Guías de arquitectura, operación y despliegue
```

## Pruebas

```bash
npm run test                                   # shared + API (integración con Postgres local)
RUN_TESTNET_TESTS=1 npm run test -w @jucumari/api   # incluye Stellar Testnet real
npm run test:e2e                               # Playwright con el Chrome instalado
npm run lint && npm run typecheck
```

## Principios

- La plataforma nunca tiene las llaves de los usuarios: cada quien firma con su wallet.
- Un pago solo se muestra como confirmado con respuesta de la red.
- El escrow protege el dinero según condiciones acordadas; **no garantiza la entrega física**. KYB confirma la existencia de una empresa, no su calidad.
- La IA no inventa proveedores, no paga, no decide disputas.
"# Jukora" 
