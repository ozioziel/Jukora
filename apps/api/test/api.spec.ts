/**
 * Pruebas de integración contra el Postgres local de Supabase (npm run db:start).
 * Usan cuentas DEMO con llaves aleatorias de prueba; nunca tocan servicios externos de pago.
 */
import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { signSep53 } from '../src/auth/sep53';
import { JobsService } from '../src/jobs/jobs.service';

let app: INestApplication;

async function login(mode: 'buyer' | 'supplier' = 'buyer') {
  const kp = Keypair.random();
  const agent = request.agent(app.getHttpServer());
  const ch = await agent.post('/api/auth/challenge').send({ address: kp.publicKey() }).expect(200);
  const r = await agent
    .post('/api/auth/verify')
    .send({
      address: kp.publicKey(),
      nonce: ch.body.nonce,
      signature: signSep53(kp.secret(), ch.body.message),
      method: 'demo',
      newAccount: { mode, timeZone: 'America/La_Paz' },
    })
    .expect(200);
  return { agent, kp, user: r.body.user };
}

const searchBody = (projectId?: string) => ({
  projectId,
  intent: 'start',
  description: 'Quiero abrir una hamburguesería para 40 personas en La Paz, necesito equipamiento de cocina y mobiliario',
  destination: { country: 'BO', city: 'La Paz' },
  capacity: { seats: 40 },
  budget: { currency: 'USD', flexibility: 'approximate' },
  priorities: ['total_cost', 'arrival_time'],
  deadline: { days: 30, strict: false },
  originScope: 'local_and_international',
  condition: ['new'],
});

beforeAll(async () => {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.get(JobsService).inline = true;
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

describe('autenticación SEP-53', () => {
  it('rechaza firmas inválidas y nonces reutilizados', async () => {
    const kp = Keypair.random();
    const other = Keypair.random();
    const agent = request.agent(app.getHttpServer());
    const ch = await agent.post('/api/auth/challenge').send({ address: kp.publicKey() }).expect(200);
    await agent
      .post('/api/auth/verify')
      .send({ address: kp.publicKey(), nonce: ch.body.nonce, signature: signSep53(other.secret(), ch.body.message), method: 'demo' })
      .expect(401);
    // El nonce ya fue consumido por el intento anterior: no se puede reutilizar.
    await agent
      .post('/api/auth/verify')
      .send({ address: kp.publicKey(), nonce: ch.body.nonce, signature: signSep53(kp.secret(), ch.body.message), method: 'demo' })
      .expect(401);
  });

  it('crea la cuenta y mantiene la sesión en cookie httpOnly', async () => {
    const { agent, kp } = await login();
    const me = await agent.get('/api/me').expect(200);
    expect(me.body.user.address).toBe(kp.publicKey());
    expect(me.body.user.timeZone).toBe('America/La_Paz');
    await request(app.getHttpServer()).get('/api/projects').expect(401);
  });
});

describe('Mi espacio y búsqueda inteligente', () => {
  it('crea una casa, busca con cuota y obtiene recursos y candidatos del catálogo', async () => {
    const { agent } = await login();
    const project = await agent
      .post('/api/projects')
      .send({ name: 'Hamburguesería', sector: 'restaurant', intent: 'start', country: 'BO', city: 'La Paz' })
      .expect(201);
    const q0 = await agent.get('/api/search/quota').expect(200);
    expect(q0.body.remaining).toBe(10);

    // Guardar borrador no consume cuota.
    await agent
      .post('/api/search/drafts')
      .send({ payload: { step: 2 }, projectId: project.body.id })
      .expect(201);
    expect((await agent.get('/api/search/quota')).body.remaining).toBe(10);

    await agent.post('/api/search/runs').send(searchBody(project.body.id)).expect(400); // sin Idempotency-Key
    const run = await agent
      .post('/api/search/runs')
      .set('Idempotency-Key', 'test-run-000001')
      .send(searchBody(project.body.id))
      .expect(202);
    // Reintento con la misma clave: misma corrida, sin cobrar dos veces.
    const again = await agent
      .post('/api/search/runs')
      .set('Idempotency-Key', 'test-run-000001')
      .send(searchBody(project.body.id))
      .expect(202);
    expect(again.body.id).toBe(run.body.id);

    const view = await agent.get(`/api/search/runs/${run.body.id}`).expect(200);
    expect(view.body.status).toBe('done');
    expect(view.body.ai.isDemo).toBe(true);
    const slugs = view.body.plan.resources.map((r: { id: string }) => r.id);
    expect(slugs).toContain('parrilla');
    const sillas = view.body.plan.resources.find((r: { id: string }) => r.id === 'silla');
    expect(sillas.quantity).toBe(40);
    expect((await agent.get('/api/search/quota')).body.remaining).toBe(9);

    const cands = await agent.post(`/api/search/runs/${run.body.id}/resources/parrilla/open`).expect(200);
    expect(cands.body.candidates.length).toBeGreaterThanOrEqual(3);
    expect(cands.body.candidates.every((c: { origin: string }) => c.origin === 'demo')).toBe(true);
    // Abrir de nuevo reutiliza resultados y no cobra.
    await agent.post(`/api/search/runs/${run.body.id}/resources/parrilla/open`).expect(200);
    expect((await agent.get('/api/search/quota')).body.remaining).toBe(9);

    const detail = await agent.get(`/api/projects/${project.body.id}`).expect(200);
    expect(detail.body.resources.find((r: { slug: string }) => r.slug === 'parrilla').progress).toEqual({
      accepted: 0,
      ordered: 0,
      inTransit: 0,
      required: 1,
    });

    const events = await agent.get(`/api/search/runs/${run.body.id}/events`).expect(200);
    expect(events.text).toContain('event: done');
  });

  it('bloquea la búsqueda 11 del día', async () => {
    const { agent } = await login();
    for (let i = 0; i < 10; i++)
      await agent.post('/api/search/runs').set('Idempotency-Key', `quota-run-${i}-abcdef`).send(searchBody()).expect(202);
    const r = await agent.post('/api/search/runs').set('Idempotency-Key', 'quota-run-11-abcdef').send(searchBody()).expect(429);
    expect(r.body.code).toBe('quota_exhausted');
    expect(r.body.details.resetsAt).toBeTruthy();
  });

  it('otro usuario no puede ver casas ni corridas ajenas', async () => {
    const a = await login();
    const b = await login();
    const p = await a.agent.post('/api/projects').send({ name: 'Privada', sector: 'cafe', intent: 'expand' }).expect(201);
    await b.agent.get(`/api/projects/${p.body.id}`).expect(404);
    const run = await a.agent.post('/api/search/runs').set('Idempotency-Key', 'private-run-0001').send(searchBody()).expect(202);
    await b.agent.get(`/api/search/runs/${run.body.id}`).expect(404);
  });
});

describe('Explorar, cotización y pedido', () => {
  it('lista el catálogo sin sesión y sin cuota', async () => {
    const r = await request(app.getHttpServer()).get('/api/listings?q=parrilla').expect(200);
    expect(r.body.items.length).toBeGreaterThan(0);
    expect(r.body.items[0].isDemo).toBe(true);
  });

  it('flujo RFQ → cotización → aceptación crea un pedido pendiente con comisión 2,5 %', async () => {
    const buyer = await login();
    const supplier = await login('supplier');
    await supplier.agent.post('/api/supplier/org').send({ name: 'Proveedor de prueba', country: 'BO', city: 'La Paz' }).expect(201);
    const org = await supplier.agent.get('/api/supplier/org').expect(200);

    await buyer.agent
      .post('/api/rfqs')
      .send({ title: 'Parrilla 4 quemadores', quantity: 1, destinationCountry: 'BO', visibility: 'public' })
      .expect(400); // sin consentimiento
    const rfq = await buyer.agent
      .post('/api/rfqs')
      .send({ title: 'Parrilla 4 quemadores', quantity: 1, destinationCountry: 'BO', visibility: 'invited', inviteOrgIds: [org.body.id] })
      .expect(201);
    const visible = await supplier.agent.get('/api/supplier/rfqs').expect(200);
    expect(visible.body.some((r: { id: string }) => r.id === rfq.body.id)).toBe(true);

    const quote = await supplier.agent
      .post(`/api/rfqs/${rfq.body.id}/quotes`)
      .send({ quantity: 1, unitPrice: '300', shipping: '0', currency: 'USD', leadTimeDays: 3, validDays: 7 })
      .expect(201);
    // El proveedor no puede aceptar su propia cotización.
    await supplier.agent.post(`/api/quotes/${quote.body.id}/accept`).expect(404);
    const accepted = await buyer.agent.post(`/api/quotes/${quote.body.id}/accept`).expect(200);
    const order = await buyer.agent.get(`/api/orders/${accepted.body.orderId}`).expect(200);
    expect(order.body.status).toBe('pending_payment');
    expect(order.body.platformFee).toEqual({ amount: '7.5', percent: '2.5' });

    // Sin financiación confirmada, el proveedor no puede marcar envío.
    await supplier.agent.post(`/api/orders/${accepted.body.orderId}/supplier-update`).send({ status: 'shipped' }).expect(409);
    // Un tercero no ve el pedido.
    const stranger = await login();
    await stranger.agent.get(`/api/orders/${accepted.body.orderId}`).expect(404);
    // Avisos: el comprador recibió la cotización.
    const notes = await buyer.agent.get('/api/notifications').expect(200);
    expect(notes.body.updates.length + notes.body.attention.length).toBeGreaterThan(0);
  });
});
