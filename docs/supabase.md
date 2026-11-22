# Supabase

## Local

- Configuración: `supabase/config.toml` (`project_id = "jucumari"`, puertos 553xx). Servicios activos: base de datos, REST, gateway y Storage. Auth, Studio, Realtime, Edge y Analytics están desactivados (el login es por firma Stellar).
- Migraciones: `supabase/migrations/*.sql`. Semilla DEMO: `supabase/seed.sql`.
- Reiniciar desde cero: `npx supabase db reset` (borra datos locales).
- Tipos de Kysely: con la base local corriendo, `npm run db:types -w @jucumari/api`.

## Esquema (resumen)

Cuentas (`app_users`, `auth_challenges`, `auth_sessions`), proveedores (`organizations`, `memberships`), negocios (`projects`, `resource_requirements`), búsqueda (`search_drafts`, `search_runs`, `search_events`, `search_candidates`, `search_category_fetches`, `quota_ledger`, `external_search_budget`), catálogo (`listings`), compras (`rfqs`, `rfq_invites`, `quotes`, `orders`, `escrows`, `escrow_txs`, `shipments`, `ramps`), confianza (`disputes`, `evidence`, `reviews`), avisos y auditoría (`notifications`, `audit_events`).

Funciones: `reserve_search_quota` (reserva atómica e idempotente, bloqueo por usuario) y `spend_external_credits` (tope global diario). Buckets: `evidence` (privado, 10 MB) y `listing-photos` (público, 5 MB).

## Remoto (lo hace el responsable)

1. Crear un proyecto en supabase.com (plan Free). Anotar la región.
2. **Connect → Direct → Session pooler** (IPv4, puerto 5432; la conexión directa es solo IPv6) → guardarla como `DATABASE_URL` en el `.env.production` del VPS y como secreto `SUPABASE_DB_URL` en GitHub (environment `production`).
3. Project Settings → API Keys → **Secret key** (`sb_secret_…`; la `service_role` heredada también sirve hasta que Supabase la retire) → `SUPABASE_SERVICE_ROLE_KEY` (solo servidor). La URL del proyecto (`https://<ref>.supabase.co`, en Data API) → `SUPABASE_URL`.
4. Las migraciones pendientes las aplica el CD en cada despliegue (nunca `db reset` en remoto). A mano:
   ```bash
   npx supabase@2.119.0 db push --db-url "$SUPABASE_DB_URL"
   ```
5. `seed.sql` son datos **ficticios** etiquetados DEMO (proveedores, artículos, costos de envío). Para la demo pública se pueden cargar una vez con el SQL Editor; retirarlos antes de operar con proveedores reales. Su último bloque (envíos DEMO) se puede ejecutar solo si el resto ya estaba cargado.
6. El plan Free pausa el proyecto tras ~1 semana sin actividad: reactivarlo desde el panel si ocurre.

## Comprobación

```sql
select count(*) from public.listings;               -- 0 sin datos DEMO; 17 con seed.sql
select tablename from pg_tables where schemaname='public' and rowsecurity = false;  -- debe devolver 0 filas
```
