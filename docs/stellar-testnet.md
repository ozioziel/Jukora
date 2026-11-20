# Stellar Testnet, Trustless Work, Pollar y KYC

## Token de prueba

`npm run stellar:setup` crea en **testnet** (sin valor real):

| Cuenta | Para qué | Dónde queda la llave |
|---|---|---|
| Plataforma | recibe la comisión, despliega el escrow y libera tras la aprobación del comprador | `.env` (`PLATFORM_STELLAR_SECRET`, solo testnet) |
| Árbitro DEMO | resuelve disputas en la demo | `.demo-keys.json` (se importa en el navegador) |
| Emisor USDCDEMO | emite el token de la rampa QR simulada | `.env` (`DEMO_TOKEN_ISSUER_SECRET`, solo testnet) |

Además despliega el contrato SAC del token (`DEMO_TOKEN_CONTRACT_ID`), que se usa como `trustline.address` en Trustless Work. Se eligió un token propio porque el grifo de USDC de prueba de Circle entrega montos pequeños; **USDCDEMO no es USDC** y la interfaz lo dice.

## Trustless Work

1. Instalar Freighter, crear una cuenta en **Testnet** y fondearla con XLM de prueba.
2. Entrar a https://dapp.trustlesswork.com, conectar la wallet y firmar.
3. Dirección (abajo a la izquierda) → **Settings** → completar nombre, correo y **caso de uso** (obligatorio).
4. Pestaña **API Keys** → **Testnet** → **Request API Key**. Copiarla en ese momento (no se vuelve a mostrar).
5. Pegarla en `.env` como `TW_API_KEY` (local) o en el `.env.production` del VPS. Nunca en el chat ni en Git.
6. Reiniciar la API y comprobar `GET /api/escrow/status` → `enabled: true`.

Detalles de la integración: API REST `https://dev.api.trustlesswork.com` (cabecera `x-api-key`, 50 solicitudes/60 s). Cada acción devuelve un XDR sin firmar; firma el rol correspondiente y se envía con `/helper/send-transaction`. **Pendiente de verificar con la clave:** formato exacto de `roles` y si `trustline.address` debe ser el contrato SAC (configurado así) o el emisor.

Flujo implementado: plataforma despliega → comprador financia (firma) → proveedor marca envío y entrega → comprador revisa y aprueba (firma) → plataforma libera. Disputa: comprador o proveedor la abre (firma) → árbitro decide y firma la resolución (los montos deben sumar el total del escrow).

## Pagar con QR (Pollar)

- **Testnet:** rampa SIMULADA en bolivianos: el QR dice «SIMULACION NO PAGABLE» y el botón «Simular el pago del banco» acredita USDCDEMO desde el emisor de prueba. Probado en testnet real.
- **Ancla sandbox de Pollar (ARS, PEN, COP):** requiere `VITE_POLLAR_PUBLISHABLE_KEY` y sesión Pollar; preparado, sin probar.
- **Mainnet (BOB por QR bancario vía Stereum):** la ruta existe en Pollar (Stereum en Polygon → swap → puente a Stellar), pero el puente solo funciona en mainnet. **No se activa** sin aprobación expresa, revisión legal y fondos reales.

Para obtener las claves: dashboard.pollar.xyz → crear app en Test mode → Developers → API keys (`pub_testnet_…` en `VITE_POLLAR_PUBLISHABLE_KEY`, `sec_testnet_…` en `POLLAR_SECRET_KEY`) → Developers → Websites: añadir `http://localhost:5173` y el dominio final. Pollar cobra créditos también en Test mode (se pagan con USDC de prueba de Circle).

## KYC (Didit sandbox)

1. En Didit, usar una aplicación **sandbox**, crear un flujo de verificación KYC y copiar su `workflow_id` (`DIDIT_WORKFLOW_ID`) y la API key (`DIDIT_API_KEY`).
2. Configurar el webhook a `https://<dominio>/api/verification/webhook` y copiar su secreto (`DIDIT_WEBHOOK_SECRET`).
3. No subir documentos reales en sandbox. La API guarda solo el estado y una huella HMAC del documento.

## Comprobación rápida

```bash
RUN_TESTNET_TESTS=1 npm run test -w @jucumari/api    # trustline + rampa simulada en testnet real
```
