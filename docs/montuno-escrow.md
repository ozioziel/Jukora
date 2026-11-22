# Escrow de Montuno (Soroban) y enlaces de checkout

## Qué hace

La importadora crea un **enlace de checkout** (`/vender`) con precio, envío, plazo y modalidad, y lo manda por
WhatsApp. El comprador lo abre sin cuenta (`/c/:token`), entra, acepta el aviso de riesgo exacto y deja su
dirección. Se guarda su consentimiento (`consent_records`: versión, texto, hash del texto, hash de los términos y
fecha) y se crea el pedido pendiente de pago.

| Modalidad | Motor del escrow |
|---|---|
| Escrow completo | Trustless Work si está configurado (`TW_API_KEY`); si no, el contrato Soroban de Montuno |
| Anticipo parcial | Contrato Soroban de Montuno (siempre) |

El comprador siempre deposita el 100 %. Con anticipo, la importadora cobra una parte fija **antes de comprar**;
esa parte no se puede recuperar desde el contrato. El resto queda retenido hasta que el comprador confirma la
entrega, o hasta que el árbitro resuelve una disputa (solo sobre lo retenido).

## Contrato

- Código del equipo: `contracts/import_escrow` en <https://github.com/daniel69zz/montuno-backend> (Rust/Soroban, con pruebas).
- Montuno usa **su propia instancia**, desplegada a partir del mismo WASM ya instalado en testnet
  (`wasm hash d369daf5820a9f1b44ba0bffba29389ff4ffdeea67554db442f6e3c3742a406d`), con:
  - `admin` = cuenta de la plataforma (`PLATFORM_STELLAR_ADDRESS`)
  - `token` = SAC del token de prueba USDCDEMO (`DEMO_TOKEN_CONTRACT_ID`), el mismo que entrega la rampa QR simulada
  - `arbiter` = `ARBITER_STELLAR_ADDRESS`
  - `max_advance_bps` = 7000 (la plataforma limita además con `MONTUNO_MAX_ADVANCE_BPS`)
- Instancia actual (testnet): `CATJZCGP7CP62UGZ2RVFRNJSI2NYBD5P2JBASMVK6I75UKEW3UKEMQ24` → `MONTUNO_ESCROW_CONTRACT_ID`.

Volver a desplegar (si testnet se reinicia), con la CLI de Stellar y la llave de la plataforma en `STELLAR_ACCOUNT`:

```bash
stellar contract deploy --wasm-hash d369daf5820a9f1b44ba0bffba29389ff4ffdeea67554db442f6e3c3742a406d \
  --rpc-url https://soroban-testnet.stellar.org --network-passphrase "Test SDF Network ; September 2015" \
  -- --admin <PLATFORM_STELLAR_ADDRESS> --token <DEMO_TOKEN_CONTRACT_ID> --arbiter <ARBITER_STELLAR_ADDRESS> --max_advance_bps 7000
```

Si el WASM ya no está en la red, hay que compilarlo desde el repositorio del equipo (`stellar contract build`).
Las entradas de Soroban tienen vigencia: renovarla con `stellar contract extend --id <contrato> --ledgers-to-extend 500000 --durability persistent`.

## Flujo en la API

`apps/api/src/escrow/soroban.client.ts` arma las invocaciones sin firmar; cada parte firma en su wallet:

| Acción (`/orders/:id/escrow/prepare`) | Función del contrato | Firma |
|---|---|---|
| `fund` | `create_and_fund` (términos exactos, con `terms_hash`) | comprador |
| `claim_advance` | `claim_advance` | importadora |
| `approve` | `confirm_delivery_and_release` | comprador |
| `dispute` | `open_dispute` | comprador o importadora |
| `resolve` | `resolve_dispute` (reparte solo lo retenido) | árbitro |

Un pedido se marca financiado solo después de leer `get_order` en la red y comprobar el `terms_hash` y el monto.

## Pruebas

- `RUN_TESTNET_TESTS=1 npx vitest run test/soroban-escrow.testnet.spec.ts` (en `apps/api`): flujo real en testnet
  con cuentas nuevas: depósito del 100 %, cobro del anticipo y confirmación del comprador.
- `apps/api/test/api.spec.ts`: enlace de checkout (vista pública sin datos personales, aviso con huella, uso único).
