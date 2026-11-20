# Desarrollo local

Probado en Windows 10 (8 GB RAM) con Node 24.16, npm 11.16, Docker Desktop 4.93 y Supabase CLI 2.119.0 (dependencia del proyecto).

## 1. Requisitos

| Herramienta | Uso | Comprobación |
|---|---|---|
| Node ≥ 24 | todo el monorepo | `node --version` |
| Docker Desktop (daemon encendido) | Supabase local, imágenes | `docker info` |
| Stellar CLI | contrato SAC del token de prueba | `stellar --version` |
| Google Chrome | pruebas E2E sin descargar navegadores | — |

## 2. Primera vez

```bash
npm ci
npx supabase start          # solo db, rest, kong y storage (puertos 55321/55322)
npm run setup:local         # .env con SESSION_SECRET, KYC_HMAC_SECRET y la clave de servicio local
npm run stellar:setup       # testnet: plataforma, árbitro DEMO, token USDCDEMO y su SAC
npm run dev                 # API http://localhost:3000/api · web http://localhost:5173
```

`stellar:setup` escribe direcciones y llaves **de testnet** en `.env` y la llave del árbitro DEMO en `.demo-keys.json` (ambos ignorados por Git). Nunca usar esas llaves en mainnet.

## 3. Entrar en la app

- **Llave de prueba** (solo `DEMO_MODE=true` y testnet): se crea en el navegador, se fondea con friendbot y firma el mensaje de inicio (SEP-53).
- **Wallet Stellar** (Freighter, xBull, LOBSTR, WalletConnect…) mediante Stellar Wallets Kit.
- **Pollar por correo**: requiere `VITE_POLLAR_PUBLISHABLE_KEY`.

Para actuar como **árbitro DEMO**: en «Entrar → Importar llave de prueba» pegar la llave `arbiter` de `.demo-keys.json`. Para actuar como **proveedor DEMO**: en modo proveedor, «Usar un proveedor DEMO».

## 4. Comandos útiles

| Comando | Qué hace |
|---|---|
| `npx supabase db reset` | Reaplica migraciones y `seed.sql` (borra datos locales) |
| `npm run roles:assign -- --address G… --role arbiter` | Asigna un rol privilegiado |
| `npm run test` | Pruebas de shared y API |
| `npm run test:e2e` | Playwright (levanta API y web si no corren) |
| `docker compose -f deploy/docker-compose.yml --env-file .env up --build` | App en contenedores en http://localhost:8080 |

## 5. Variables

Ver `.env.example`: cada variable indica si es pública (`VITE_*`) o privada y dónde obtenerla. La API valida todo al arrancar y se niega a iniciar con combinaciones peligrosas (p. ej. mainnet sin `MAINNET_APPROVED=true`, o llaves de prueba fuera de testnet).

## 6. Otros proyectos en la misma máquina

Supabase de este proyecto usa puertos 553xx para no chocar con otros stacks de Supabase (54321…). Si la RAM no alcanza, detener otros contenedores con `docker stop <nombre>` (no borra datos).
