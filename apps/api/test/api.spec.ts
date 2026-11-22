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

const ADDRESS = {
  fulfillment: 'delivery',
  country: 'BO',
  region: 'La Paz',
  city: 'El Alto',
  address: 'Av. Juan Pablo II 1234, zona 16 de Julio',
  reference: 'Portón verde (DATO DE PRUEBA)',
  phone: '+591 71234567',
};

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
    // Aceptar exige dirección y teléfono (el envío lo hace el proveedor).
    await buyer.agent.post(`/api/quotes/${quote.body.id}/accept`).send({}).expect(400);
    // El proveedor no puede aceptar su propia cotización.
    await supplier.agent.post(`/api/quotes/${quote.body.id}/accept`).send({ delivery: ADDRESS }).expect(404);
    const accepted = await buyer.agent.post(`/api/quotes/${quote.body.id}/accept`).send({ delivery: ADDRESS }).expect(200);
    const order = await buyer.agent.get(`/api/orders/${accepted.body.orderId}`).expect(200);
    expect(order.body.status).toBe('pending_payment');
    expect(order.body.platformFee).toEqual({ amount: '7.5', percent: '2.5' });
    expect(order.body.delivery).toMatchObject({ fulfillment: 'delivery', city: 'El Alto', phone: '+591 71234567' });
    // Sin pago financiado, el proveedor todavía no ve la dirección del comprador.
    const asSupplier = await supplier.agent.get(`/api/orders/${accepted.body.orderId}`).expect(200);
    expect(asSupplier.body.delivery).toBeNull();
    expect(asSupplier.body.deliveryHidden).toBe(true);

    // Sin financiación confirmada, el proveedor no puede marcar envío.
    await supplier.agent.post(`/api/orders/${accepted.body.orderId}/supplier-update`).send({ status: 'shipped' }).expect(409);
    // Un tercero no ve el pedido.
    const stranger = await login();
    await stranger.agent.get(`/api/orders/${accepted.body.orderId}`).expect(404);
    // Avisos: el comprador recibió la cotización.
    const notes = await buyer.agent.get('/api/notifications').expect(200);
    expect(notes.body.updates.length + notes.body.attention.length).toBeGreaterThan(0);
  });
  it('compra directa: envío al costo del proveedor o retiro solo en la misma ciudad', async () => {
    const buyer = await login();
    const supplier = await login('supplier');
    await supplier.agent.post('/api/supplier/org').send({ name: 'Proveedor envíos', country: 'BO', city: 'La Paz' }).expect(201);
    const listing = await supplier.agent
      .post('/api/supplier/listings')
      .send({
        title: 'Freidora de prueba',
        category: 'freidora',
        price: '100',
        currency: 'USD',
        originCountry: 'BO',
        originCity: 'La Paz',
        shipsTo: ['BO'],
        shippingCost: '15',
        pickupAddress: 'Calle Comercio 100 (DATO DE PRUEBA)',
      })
      .expect(201);
    await supplier.agent.post(`/api/supplier/listings/${listing.body.id}/published`).expect(201);
    const pub = await buyer.agent.get(`/api/listings/${listing.body.id}`).expect(200);
    expect(pub.body.shipping).toEqual({ amount: '15', currency: 'USD' });
    expect(pub.body.pickup).toEqual({ city: 'La Paz' }); // la dirección del local no es pública

    // Envío: total = precio × cantidad + costo de envío.
    const sent = await buyer.agent
      .post('/api/orders/from-listing')
      .send({ listingId: listing.body.id, quantity: 2, delivery: ADDRESS })
      .expect(201);
    const o1 = await buyer.agent.get(`/api/orders/${sent.body.orderId}`).expect(200);
    expect(o1.body).toMatchObject({ amount: '215', shipping: '15', fulfillment: 'delivery' });

    // Retiro desde otra ciudad: no permitido. Misma ciudad: sin costo de envío.
    await buyer.agent
      .post('/api/orders/from-listing')
      .send({ listingId: listing.body.id, quantity: 1, delivery: { fulfillment: 'pickup', city: 'Cochabamba', phone: '71234567' } })
      .expect(409);
    const picked = await buyer.agent
      .post('/api/orders/from-listing')
      .send({ listingId: listing.body.id, quantity: 1, delivery: { fulfillment: 'pickup', city: ' la paz ', phone: '71234567' } })
      .expect(201);
    const o2 = await buyer.agent.get(`/api/orders/${picked.body.orderId}`).expect(200);
    expect(o2.body).toMatchObject({ amount: '100', shipping: '0', fulfillment: 'pickup' });
    // Antes del pago, el comprador sabe la ciudad del retiro pero no la dirección del local.
    expect(o2.body.delivery.pickup).toEqual({ city: 'La Paz' });

    // Destino no atendido por el proveedor.
    await buyer.agent
      .post('/api/orders/from-listing')
      .send({ listingId: listing.body.id, quantity: 1, delivery: { ...ADDRESS, country: 'PE' } })
      .expect(409);
  });
  it('enlace de checkout: la importadora lo crea, el comprador lo ve sin cuenta y lo acepta una sola vez', async () => {
    const buyer = await login();
    const seller = await login('supplier');
    await seller.agent.post('/api/supplier/org').send({ name: 'Importadora de prueba', country: 'BO', city: 'La Paz' }).expect(201);
    // Anticipo por encima del tope de la plataforma: rechazado.
    await seller.agent
      .post('/api/links')
      .send({ title: 'Celular de prueba', price: '100', deliveryDays: 20, mode: 'partial', advance: '90' })
      .expect(400);
    const link = await seller.agent
      .post('/api/links')
      .send({ title: 'Celular de prueba', price: '100', shipping: '20', deliveryDays: 20, mode: 'full' })
      .expect(201);
    expect(link.body.url).toMatch(/\/c\/[A-Za-z0-9_-]{20,}$/);

    // Vista pública: sin wallets ni datos personales; trae el aviso de riesgo con su huella.
    const view = await request(app.getHttpServer()).get(`/api/checkout/${link.body.token}`).expect(200);
    expect(view.body).toMatchObject({ total: '120', mode: 'full', status: 'active' });
    expect(view.body.disclosure.version).toBe('full/v1');
    expect(JSON.stringify(view.body)).not.toMatch(/payout|address|G[A-Z2-7]{55}/);

    const body = { delivery: ADDRESS, disclosureVersion: view.body.disclosure.version, disclosureHash: view.body.disclosure.hash };
    // La importadora no puede comprar su propio enlace; un aviso distinto al mostrado se rechaza.
    await seller.agent.post(`/api/checkout/${link.body.token}/accept`).send(body).expect(403);
    await buyer.agent
      .post(`/api/checkout/${link.body.token}/accept`)
      .send({ ...body, disclosureHash: '0'.repeat(64) })
      .expect(409);
    const ok = await buyer.agent.post(`/api/checkout/${link.body.token}/accept`).send(body).expect(200);
    const order = await buyer.agent.get(`/api/orders/${ok.body.orderId}`).expect(200);
    expect(order.body).toMatchObject({ amount: '120', shipping: '20', escrowMode: 'full', status: 'pending_payment' });
    // Un enlace se usa una sola vez.
    await buyer.agent.post(`/api/checkout/${link.body.token}/accept`).send(body).expect(409);
    const mine = await seller.agent.get('/api/links/mine').expect(200);
    expect(mine.body[0]).toMatchObject({ status: 'accepted', orderId: ok.body.orderId });
  });
});
