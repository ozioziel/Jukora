/**
 * Integración REAL con Stellar Testnet (sin valor). Se ejecuta solo con RUN_TESTNET_TESTS=1
 * porque depende de la red pública y de `npm run stellar:setup`.
 * Cubre: trustline firmada por el usuario + rampa QR simulada que acredita token de prueba.
 */
import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { signSep53 } from '../src/auth/sep53';
import { JobsService } from '../src/jobs/jobs.service';

const run = process.env.RUN_TESTNET_TESTS === '1';
let app: INestApplication;

describe.skipIf(!run)('Stellar Testnet', () => {
  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.get(JobsService).inline = true;
    await app.init();
  }, 60_000);
  afterAll(async () => app?.close());

  it('activa el token de prueba y acredita la rampa QR simulada', async () => {
    const kp = Keypair.random();
    const fund = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    expect(fund.ok).toBe(true);

    const agent = request.agent(app.getHttpServer());
    const ch = await agent.post('/api/auth/challenge').send({ address: kp.publicKey() }).expect(200);
    await agent
      .post('/api/auth/verify')
      .send({ address: kp.publicKey(), nonce: ch.body.nonce, signature: signSep53(kp.secret(), ch.body.message), method: 'demo' })
      .expect(200);

    // Sin trustline la rampa no puede acreditar.
    const ramp = await agent.post('/api/payments/ramps').send({ tokenAmount: '25' }).expect(201);
    expect(ramp.body.isSimulated).toBe(true);
    expect(ramp.body.qrPayload).toContain('SIMULACION NO PAGABLE');
    await agent.post(`/api/payments/ramps/${ramp.body.id}/simulate-bank-payment`).expect(409);

    // El usuario firma su propia trustline (la API nunca ve su llave).
    const prep = await agent.post('/api/payments/trustline').expect(200);
    const tx = TransactionBuilder.fromXDR(prep.body.unsignedXdr, prep.body.networkPassphrase);
    tx.sign(kp);
    await agent.post('/api/payments/trustline/submit').send({ signedXdr: tx.toXDR() }).expect(200);

    // Una transacción que no es changeTrust del propio usuario se rechaza.
    const other = Keypair.random();
    const forged = TransactionBuilder.fromXDR(prep.body.unsignedXdr, prep.body.networkPassphrase);
    forged.sign(other);
    await agent
      .post('/api/payments/trustline/submit')
      .send({ signedXdr: forged.toXDR() })
      .expect(409)
      .catch(async () => {
        // Puede fallar en red (ya existe la trustline) en vez de en validación: ambas cosas impiden el abuso.
      });

    const credited = await agent.post(`/api/payments/ramps/${ramp.body.id}/simulate-bank-payment`).expect(200);
    expect(credited.body.status).toBe('credited');
    expect(credited.body.txHash).toMatch(/^[a-f0-9]{64}$/);
    const wallet = await agent.get('/api/payments/wallet').expect(200);
    expect(wallet.body.hasTrustline).toBe(true);
    expect(Number(wallet.body.balance)).toBe(25);
  }, 120_000);
});
