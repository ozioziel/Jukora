import { describe, expect, it } from 'vitest';
import { addMoney, computePlatformFee, fromUnits, toUnits } from './money.js';
import { nextQuotaReset, quotaDayKey } from './quota.js';
import { rankCandidates, weightsFor } from './ranking.js';
import { SearchRequestSchema } from './search.js';
import { canTransitionOrder } from './states.js';
import { DeliveryInputSchema, deliveryFor, sameCity } from './delivery.js';

describe('money', () => {
  it('convierte sin perder precisión', () => {
    expect(toUnits('0.1') + toUnits('0.2')).toBe(toUnits('0.3'));
    expect(fromUnits(toUnits('450.0000001'))).toBe('450.0000001');
    expect(addMoney('450', '25', '5')).toBe('480');
  });
  it('rechaza importes mal formados', () => {
    expect(() => toUnits('1e3')).toThrow();
    expect(() => toUnits('-5')).toThrow();
  });
  it('aplica 2,5 % con mínimo de 1', () => {
    expect(computePlatformFee('300')).toEqual({ fee: '7.5', percent: 2.5, providerReceivesBeforeProtocol: '292.5' });
    const small = computePlatformFee('20');
    expect(small.fee).toBe('1');
    expect(small.percent).toBe(5);
    expect(() => computePlatformFee('1.5')).toThrow();
  });
});

describe('cuota', () => {
  it('usa el día local de La Paz (UTC-4)', () => {
    const now = new Date('2026-11-21T02:30:00Z'); // 22:30 del 20 en La Paz
    expect(quotaDayKey('America/La_Paz', now)).toBe('2026-11-20');
    expect(nextQuotaReset('America/La_Paz', now).toISOString()).toBe('2026-11-21T04:00:00.000Z');
  });
  it('maneja Helsinki', () => {
    const now = new Date('2026-11-20T21:59:00Z'); // 23:59 en Helsinki (UTC+2)
    expect(quotaDayKey('Europe/Helsinki', now)).toBe('2026-11-20');
    expect(nextQuotaReset('Europe/Helsinki', now).toISOString()).toBe('2026-11-20T22:00:00.000Z');
  });
});

describe('ranking', () => {
  it('excluye incumplimientos y no premia datos desconocidos', () => {
    const r = rankCandidates(
      [
        {
          id: 'local',
          price: { amount: '450', currency: 'USD' },
          leadTimeDays: 2,
          specs: { met: 3, total: 3 },
          trust: 'kyb_verified',
          servesDestination: true,
          failsMandatory: false,
        },
        {
          id: 'peru',
          price: { amount: '380', currency: 'USD' },
          leadTimeDays: 12,
          specs: { met: 3, total: 3 },
          trust: 'registered',
          servesDestination: true,
          failsMandatory: false,
        },
        {
          id: 'voltaje',
          price: { amount: '100', currency: 'USD' },
          leadTimeDays: 1,
          specs: null,
          trust: 'registered',
          servesDestination: true,
          failsMandatory: true,
        },
        {
          id: 'sin-datos',
          price: null,
          leadTimeDays: null,
          specs: null,
          trust: 'found_online',
          servesDestination: null,
          failsMandatory: false,
        },
      ],
      ['arrival_time'],
      'USD',
    );
    expect(r[0]!.id).toBe('local');
    expect(r.at(-1)!.id).toBe('voltaje');
    expect(r.at(-1)!.excluded).toBe(true);
    expect(r.find((x) => x.id === 'sin-datos')!.reasons).toContain('price_unknown');
  });
  it('los pesos suman 1', () => {
    const w = weightsFor(['total_cost', 'arrival_time']);
    expect(w.price + w.time + w.fit + w.trust).toBeCloseTo(1);
    expect(w.price).toBeGreaterThan(w.time);
  });
});

describe('contrato de búsqueda', () => {
  it('valida un borrador mínimo y nunca comparte con proveedores por defecto', () => {
    const r = SearchRequestSchema.parse({
      intent: 'start',
      description: 'Quiero abrir una hamburguesería para 40 personas en La Paz',
      destination: { country: 'BO', city: 'La Paz' },
      budget: { currency: 'USD', flexibility: 'unknown' },
      priorities: ['total_cost', 'arrival_time'],
      deadline: { strict: false },
      originScope: 'local_and_international',
      condition: ['new'],
    });
    expect(r.shareWithSuppliers).toBe(false);
    expect(r.locale).toBe('es');
  });
});

describe('pedido', () => {
  it('el proveedor no puede saltar a aceptado', () => {
    expect(canTransitionOrder('shipped', 'accepted')).toBe(false);
    expect(canTransitionOrder('in_review', 'accepted')).toBe(true);
  });
  it('retiro en local: de financiado o en preparación a «listo / entrega notificada»', () => {
    expect(canTransitionOrder('funded', 'delivery_notified')).toBe(true);
    expect(canTransitionOrder('preparing', 'delivery_notified')).toBe(true);
    expect(canTransitionOrder('pending_payment', 'delivery_notified')).toBe(false);
  });
});

describe('entrega', () => {
  it('envío: exige dirección y teléfono', () => {
    const ok = DeliveryInputSchema.safeParse({
      fulfillment: 'delivery',
      country: 'BO',
      region: 'La Paz',
      city: 'El Alto',
      address: 'Av. Juan Pablo II 123',
      phone: '+591 71234567',
    });
    expect(ok.success).toBe(true);
    expect(DeliveryInputSchema.safeParse({ fulfillment: 'delivery', country: 'BO', city: 'El Alto', phone: '71234567' }).success).toBe(
      false,
    );
  });
  it('retiro: solo ciudad y teléfono; teléfono inválido se rechaza', () => {
    expect(DeliveryInputSchema.safeParse({ fulfillment: 'pickup', city: 'Tarija', phone: '71234567' }).success).toBe(true);
    expect(DeliveryInputSchema.safeParse({ fulfillment: 'pickup', city: 'Tarija', phone: 'llámame' }).success).toBe(false);
  });
  it('el proveedor no ve la dirección hasta que el pago esté financiado', () => {
    const rec = { fulfillment: 'delivery', country: 'BO', region: 'La Paz', city: 'El Alto', address: 'Calle 1', phone: '71234567' };
    expect(deliveryFor('supplier', false, rec)).toEqual({ visible: false, data: null });
    expect(deliveryFor('supplier', true, rec).data).toEqual(rec);
    expect(deliveryFor('buyer', false, rec).data).toEqual(rec);
  });
  it('retiro: la dirección del local se muestra al comprador solo con el pago financiado', () => {
    const rec = { fulfillment: 'pickup', city: 'Tarija', phone: '71234567', pickup: { address: 'Av. Las Américas 10', city: 'Tarija' } };
    expect(deliveryFor('buyer', false, rec).data).toEqual({
      fulfillment: 'pickup',
      city: 'Tarija',
      phone: '71234567',
      pickup: { city: 'Tarija' },
    });
    expect(deliveryFor('buyer', true, rec).data).toEqual(rec);
  });
  it('misma ciudad sin importar tildes ni mayúsculas', () => {
    expect(sameCity('Potosí', ' potosi ')).toBe(true);
    expect(sameCity('La Paz', 'El Alto')).toBe(false);
    expect(sameCity('', '')).toBe(false);
  });
});
