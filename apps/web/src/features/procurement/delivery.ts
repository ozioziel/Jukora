import { type DeliveryInput, DeliveryInputSchema } from '@jucumari/shared';

/** Borrador del formulario de entrega (envío a dirección o retiro en local). */
export interface DeliveryDraft {
  fulfillment: 'delivery' | 'pickup';
  country: string;
  region: string;
  city: string;
  address: string;
  reference: string;
  phone: string;
}

export function emptyDelivery(country = 'BO', city = ''): DeliveryDraft {
  return { fulfillment: 'delivery', country, region: '', city, address: '', reference: '', phone: '' };
}

/** Convierte el borrador en el dato que valida la API; null si falta algo. */
export function toDeliveryInput(d: DeliveryDraft): DeliveryInput | null {
  const raw =
    d.fulfillment === 'pickup'
      ? { fulfillment: 'pickup', city: d.city, phone: d.phone }
      : {
          fulfillment: 'delivery',
          country: d.country,
          region: d.region,
          city: d.city,
          address: d.address,
          reference: d.reference.trim() || undefined,
          phone: d.phone,
        };
  const r = DeliveryInputSchema.safeParse(raw);
  return r.success ? r.data : null;
}
