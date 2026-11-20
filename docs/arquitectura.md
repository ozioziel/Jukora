# Arquitectura

```text
Navegador (React)
  ├─ Inicio (partículas por scroll), Mi espacio, Explorar, modo proveedor
  ├─ Firma local: Pollar · Stellar Wallets Kit · llave de prueba (testnet)
  │      HTTPS · cookie de sesión httpOnly
NestJS API (monolito modular)
  ├─ auth        SEP-53 (desafío de un uso) → sesión JWT propia
  ├─ projects    casas, requisitos, progreso por unidades aceptadas
  ├─ search      borradores · cuota 10/día · corridas (pg-boss) · eventos SSE
  │   ├─ ai      Groq | Ollama | reglas DEMO → JSON validado (zod)
  │   └─ sources catálogo SQL · Tavily (tope global diario)
  ├─ catalog / procurement / orders / notifications / verification (Didit)
  ├─ escrow      Trustless Work (XDR sin firmar → firma del rol → envío verificado)
  ├─ payments    trustline · rampa QR simulada (testnet)
  ├─ disputes    pruebas privadas (Storage) · árbitro con rol
  └─ uploads     Supabase Storage con clave de servicio y URLs firmadas
Supabase Postgres (RLS denegando acceso directo) · Storage privado
Stellar Testnet (escrow Trustless Work, token de prueba USDCDEMO + SAC)
```

## Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Backend | NestJS 11 + TypeScript 5.9 (SWC) | Nest 12 es solo ESM; se evita riesgo en decoradores y pruebas |
| Datos | SQL de Supabase como única fuente de esquema + Kysely tipado | Sin dos historias de migraciones |
| Cola | pg-boss sobre el mismo Postgres | Sin Redis, menos RAM |
| Tiempo real | SSE con reanudación (`Last-Event-ID`) y sondeo de respaldo | Simple y compatible con proxies |
| Login | Firma SEP-53 de la wallet (Pollar o externa) | La plataforma nunca tiene llaves de usuario |
| Dinero | Cadenas decimales y enteros de 7 decimales (bigint) | Nunca coma flotante |
| Escrow | Trustless Work single-release por pedido | No se reimplementa escrow propio |

## Roles del escrow

| Rol Trustless Work | Quién | Por qué |
|---|---|---|
| approver | comprador | solo él aprueba la recepción |
| serviceProvider / receiver | proveedor (dirección de cobro) | entrega y recibe |
| platformAddress | plataforma | recibe la comisión; puede editar solo antes de financiar |
| releaseSigner | plataforma | libera **después** de la aprobación del comprador (regla del contrato) |
| disputeResolver | árbitro independiente | reparte fondos en disputa; en la demo, cuenta DEMO separada |

## Seguridad

- RLS activado sin políticas para `anon`/`authenticated`: la clave pública de Supabase no da acceso a datos.
- Autorización por entidad en la API (comprador, miembro del proveedor, árbitro asignado). Recursos ajenos responden 404.
- Firmas: la API compara el hash de la transacción firmada con la que preparó antes de enviarla.
- Archivos: tipo detectado por bytes, límite de tamaño, bucket privado, URL firmada de 2 minutos.
- Contenido externo (Tavily) nunca se envía al modelo de IA (evita inyección de instrucciones).
- Helmet, CORS restringido al origen de la web, cookies `httpOnly` + `SameSite=Lax` (+ `Secure` en producción).
