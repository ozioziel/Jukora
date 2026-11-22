/**
 * Contrato escrow de Montuno en Stellar Testnet REAL (sin valor), sin base de datos.
 * Se ejecuta solo con RUN_TESTNET_TESTS=1. Requiere en `.env`: DEMO_TOKEN_* (token de prueba) y
 * MONTUNO_ESCROW_CONTRACT_ID (instancia desplegada con ese token y el árbitro de la plataforma).
 * Flujo de anticipo parcial: depósito del 100 % → anticipo a la importadora → confirmación del comprador.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Asset, BASE_FEE, Horizon, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { hash32, onchainOrderId, SorobanEscrowClient } from '../src/escrow/soroban.client';

const rootEnv = resolve(__dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
const run = process.env.RUN_TESTNET_TESTS === '1';
const env = process.env;

const horizon = new Horizon.Server(env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org');
const pass = Networks.TESTNET;

async function fund(kp: Keypair) {
  const r = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}
async function classic(kp: Keypair, op: ReturnType<typeof Operation.changeTrust> | ReturnType<typeof Operation.payment>) {
  const acc = await horizon.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: pass }).addOperation(op).setTimeout(120).build();
  tx.sign(kp);
  await horizon.submitTransaction(tx);
}
const sign = (xdrStr: string, kp: Keypair) => {
  const tx = TransactionBuilder.fromXDR(xdrStr, pass);
  tx.sign(kp);
  return tx.toXDR();
};
const units = (n: number) => BigInt(n) * 10_000_000n;

describe.skipIf(!run)('Contrato escrow Montuno (testnet)', () => {
  it('anticipo parcial: deposita 100 %, la importadora cobra el anticipo y el comprador libera el resto', async () => {
    const asset = new Asset(env.DEMO_TOKEN_CODE!, env.DEMO_TOKEN_ISSUER!);
    const issuer = Keypair.fromSecret(env.DEMO_TOKEN_ISSUER_SECRET!);
    const buyer = Keypair.random();
    const importer = Keypair.random();
    await Promise.all([fund(buyer), fund(importer)]);
    await classic(buyer, Operation.changeTrust({ asset }));
    await classic(importer, Operation.changeTrust({ asset }));
    await classic(issuer, Operation.payment({ destination: buyer.publicKey(), asset, amount: '100' }));

    const client = new SorobanEscrowClient(env.STELLAR_RPC_URL!, env.MONTUNO_ESCROW_CONTRACT_ID!, pass);
    const orderId = onchainOrderId(`prueba-${Date.now()}`);
    const now = Math.floor(Date.now() / 1000);
    const terms = {
      importer: importer.publicKey(),
      arbiter: env.ARBITER_STELLAR_ADDRESS!,
      token: env.DEMO_TOKEN_CONTRACT_ID!,
      amountTotal: units(50),
      advanceAmount: units(15),
      mode: 'partial' as const,
      termsHash: hash32('términos de prueba'),
      fundingDeadline: now + 3600,
      fulfillmentDeadline: now + 30 * 86_400,
    };

    const funded = await client.send(sign(await client.createAndFund(buyer.publicKey(), orderId, terms), buyer));
    expect(funded.ok).toBe(true);
    let o = await client.getOrder(orderId, buyer.publicKey());
    expect(o).toMatchObject({ status: 'funded', remainingEscrow: units(50) });

    const adv = await client.send(sign(await client.claimAdvance(importer.publicKey(), orderId), importer));
    expect(adv.ok).toBe(true);
    o = await client.getOrder(orderId, buyer.publicKey());
    expect(o).toMatchObject({ status: 'advance_paid', advanceReleased: units(15), remainingEscrow: units(35) });

    const done = await client.send(sign(await client.confirmDelivery(buyer.publicKey(), orderId), buyer));
    expect(done.ok).toBe(true);
    o = await client.getOrder(orderId, buyer.publicKey());
    expect(o).toMatchObject({ status: 'settled', sellerReleased: units(50), remainingEscrow: 0n });
    console.log('hashes', { fund: funded.hash, advance: adv.hash, release: done.hash });
  }, 240_000);
});
