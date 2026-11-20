# Operación y rollback

## Salud

| Endpoint | Significado |
|---|---|
| `GET /api/health/live` | el proceso responde |
| `GET /api/health/ready` | base de datos accesible + qué integraciones están configuradas (sin secretos) |
| `GET /healthz` (web) | Nginx responde |

## Rollback de versión

```bash
cd /srv/penguinlab/apps/jukora        # o la carpeta definida en VPS_APP_DIR
PREV=$(cat .previous_tag)
GHCR_OWNER=<owner> IMAGE_TAG=$PREV WEB_PORT=6704 docker compose -f docker-compose.prod.yml up -d
curl -fsS http://127.0.0.1:6704/api/health/ready && echo "$PREV" > .current_tag
```

## Migraciones

- Solo hacia adelante y aditivas. Antes de una migración en producción: **copia de seguridad** (Supabase → Database → Backups, o `pg_dump` con la cadena directa).
- Si una migración falla: no reintentar a ciegas; restaurar la copia y corregir en una migración nueva.
- Nunca `supabase db reset` contra la base remota.

## Incidentes frecuentes

| Síntoma | Causa probable | Acción |
|---|---|---|
| La API no arranca: «Configuración inválida» | variable faltante o combinación peligrosa | leer el mensaje: indica la variable exacta |
| Búsquedas en error `queue_unavailable` | pg-boss sin acceso a la base | revisar `DATABASE_URL`; la cuota se devolvió |
| «Llegamos al límite de búsquedas en internet de hoy» | tope `SEARCH_DAILY_CREDIT_CAP` | esperado con presupuesto 0; ajustar si hay créditos |
| Escrow en `escrow_provider_error` | Trustless Work no disponible o clave inválida | revisar `TW_API_KEY`; nada se movió dos veces (transacciones idempotentes) |
| Supabase pausado | plan Free sin actividad 7 días | reactivar desde el panel |

## Datos y privacidad

- Evidencias en bucket privado; acceso solo por URL firmada de 2 minutos para las partes y el árbitro asignado.
- No se guardan documentos de identidad: solo estado de KYC y huella HMAC.
- Registros (`audit_events`) sin secretos ni documentos.
