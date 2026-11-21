import { z } from 'zod';

/**
 * Entrega. Jukora es una pasarela: el envío lo hace el proveedor. El comprador elige entre
 * envío a su dirección (con el costo que fija el proveedor) o retiro en el local del proveedor,
 * esto último solo si está en la misma ciudad.
 */
export const FULFILLMENTS = ['delivery', 'pickup'] as const;
export type Fulfillment = (typeof FULFILLMENTS)[number];

/** Los nueve departamentos de Bolivia (sugerencias del formulario; otros países usan texto libre). */
export const BOLIVIA_DEPARTMENTS = [
  'Chuquisaca',
  'La Paz',
  'Cochabamba',
  'Oruro',
  'Potosí',
  'Tarija',
  'Santa Cruz',
  'Beni',
  'Pando',
] as const;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
/** Teléfono de contacto: dígitos con prefijo + opcional, espacios o guiones (7 a 20 caracteres). */
export const PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 -]{5,18}$/, 'Teléfono inválido');

/** Envío a la dirección del comprador (también se usa al aceptar una cotización). */
export const DeliveryAddressSchema = z.object({
  fulfillment: z.literal('delivery'),
  country: z.string().regex(/^[A-Z]{2}$/),
  region: text(2, 60),
  city: text(2, 80),
  address: text(5, 200),
  reference: z.string().trim().max(200).optional(),
  phone: PhoneSchema,
});
export type DeliveryAddress = z.infer<typeof DeliveryAddressSchema>;

/** Retiro en el local del proveedor: la ciudad del comprador debe coincidir con la del artículo. */
export const PickupInputSchema = z.object({
  fulfillment: z.literal('pickup'),
  city: text(2, 80),
  phone: PhoneSchema,
});

export const DeliveryInputSchema = z.discriminatedUnion('fulfillment', [DeliveryAddressSchema, PickupInputSchema]);
export type DeliveryInput = z.infer<typeof DeliveryInputSchema>;

/** Datos de entrega guardados en el pedido (privados). */
export type DeliveryRecord =
  | ({ fulfillment: 'delivery' } & Omit<DeliveryAddress, 'fulfillment'>)
  | { fulfillment: 'pickup'; city: string; phone: string; pickup: { address: string; city: string } };

/** Lo que ve cada parte: el proveedor recibe los datos solo con el pago financiado; el comprador ve la dirección del local también solo entonces. */
export function deliveryFor(
  role: 'buyer' | 'supplier' | 'arbiter',
  funded: boolean,
  record: DeliveryRecord | Record<string, unknown>,
): { visible: boolean; data: Record<string, unknown> | null } {
  const r = record as Record<string, unknown>;
  if (role === 'supplier' && !funded) return { visible: false, data: null };
  if (role === 'buyer' && !funded && r.fulfillment === 'pickup') {
    const { pickup, ...rest } = r as { pickup?: { city?: string } } & Record<string, unknown>;
    return { visible: true, data: { ...rest, pickup: { city: pickup?.city ?? null } } };
  }
  return { visible: true, data: r };
}

/** Compara ciudades sin mayúsculas, tildes ni espacios sobrantes («Potosí» = «potosi »). */
export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return Boolean(a && b && norm(a) !== '' && norm(a) === norm(b));
}
