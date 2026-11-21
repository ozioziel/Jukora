# Pasos del responsable (checklist operativo)

Lo que **solo tú** puedes hacer: crear cuentas, generar claves, aprobar despliegues y operar Git. Nunca pegues claves en un chat; cópialas directamente al `.env` (local) o a los secretos de GitHub / `.env.production` (VPS).

## Ya hecho y probado en local

- Monorepo instalado; Supabase local con migraciones y datos DEMO.
- `.env` local con secretos generados; cuentas de testnet, token USDCDEMO y su contrato SAC creados.
- API: 7 pruebas de integración + 1 prueba real en Stellar Testnet (trustline + rampa QR simulada). Paquete compartido: 9 pruebas.
- Web: build de producción; E2E Playwright en escritorio y móvil (9 pruebas), incluido el flujo completo del comprador hasta el pedido.
- Imágenes Docker de API y web construidas; Compose probado (`http://localhost:8080`).

## Pendiente de ti, en orden

| # | Acción | Dónde | Variable / resultado | Comprobación |
|---|---|---|---|---|
| 1 | Clave de **Trustless Work** (testnet) | dapp.trustlesswork.com → Settings (caso de uso) → API Keys → Testnet | `TW_API_KEY` | `GET /api/escrow/status` → `enabled: true` y probar un pedido de punta a punta |
| 2 | Clave de **Groq** (IA, plan gratuito) | console.groq.com → API Keys | `GROQ_API_KEY`, `AI_PROVIDER=groq` | Una búsqueda deja de mostrar «reglas DEMO» |
| 3 | Clave de **Tavily** (búsqueda web, 1.000 créditos/mes gratis) | app.tavily.com → API Keys | `TAVILY_API_KEY`, `SEARCH_PROVIDER=tavily` | Al abrir una categoría aparecen resultados «Encontrado en internet» |
| 4 | **Didit** sandbox (KYC) | Consola de Didit → aplicación sandbox → flujo KYC + webhook | `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET` | «Tu cuenta → Verificar identidad» abre Didit |
| 5 | **Pollar** (login por correo y rampas) | dashboard.pollar.xyz → app Test mode → API keys + Websites | `VITE_POLLAR_PUBLISHABLE_KEY`, `POLLAR_SECRET_KEY` | En «Entrar» se habilita «Entrar con tu correo» |
| 6 | Revisar traducciones quechua y aimara con hablantes | `apps/web/src/i18n/qu-ay.ts` | — | — |
| 7 | Crear el repositorio y decidir la licencia | GitHub | — | — |
| 8 | Proyecto **Supabase** remoto (Free) | supabase.com | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `docs/supabase.md` |
| 9 | Configurar GitHub Environment `production` y secretos | GitHub → Settings | ver `docs/ci-cd.md` | CI verde en un PR |
| 10 | Preparar el VPS (carpeta, `.env.production`, proxy, TLS) | VPS Oracle | ver `docs/despliegue-vps.md` | `curl …/api/health/ready` |
| 11 | Mergear un PR en `main` (el CD despliega solo si el CI pasa) | GitHub → Pull requests | — | Web accesible por https |
| 12 | (Opcional) Ollama en el VPS como respaldo | VPS | `OLLAMA_URL` | `docs/despliegue-vps.md` §5 |

Tras cada clave nueva: reiniciar la API (`npm run dev` o `docker compose … up -d`). La API valida la configuración al arrancar y explica qué falta.

## Lo que queda bloqueado o simulado (dicho en la interfaz)

- **QR con bolivianos real**: solo existe en mainnet (Pollar → Stereum → puente). En testnet se usa la rampa SIMULADA con QR no pagable.
- **Envíos**: Jukora es pasarela; el envío lo hace el proveedor (costo por artículo o en la cotización, o retiro en local en la misma ciudad). El comprador da dirección y teléfono, visibles para el proveedor solo con el pago protegido financiado. Jukora registra lo que informa el proveedor y no lo verifica; en datos DEMO se etiqueta como simulado.
- **Árbitro**: cuenta DEMO; no es arbitraje legal.
- **Catálogo y reseñas**: ficticios, marcados DEMO.
- **Mainnet**: bloqueado por configuración (`MAINNET_APPROVED` + revisión legal).

## Git (tú lo ejecutas)

Revisa con `git status` antes de agregar. `planeacion/`, `.env`, `.demo-keys.json`, `node_modules/`, `dist/`, `test-results/` y `playwright-report/` están en `.gitignore`.
