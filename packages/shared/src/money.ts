/**
 * Dinero sin coma flotante. Los importes viajan como cadenas decimales y se operan en unidades
 * enteras de 7 decimales (precisión de los activos de Stellar).
 */

export const MONEY_DECIMALS = 7;
const SCALE = 10n ** BigInt(MONEY_DECIMALS);
const DECIMAL_RE = /^\d{1,13}(\.\d{1,7})?$/;

export function isDecimalString(value: string): boolean {
  return DECIMAL_RE.test(value);
}

export function toUnits(value: string): bigint {
  if (!isDecimalString(value)) throw new Error(`Importe inválido: ${value}`);
  const [int, frac = ''] = value.split('.');
  return BigInt(int!) * SCALE + BigInt(frac.padEnd(MONEY_DECIMALS, '0'));
}

export function fromUnits(units: bigint): string {
  if (units < 0n) throw new Error('Importe negativo');
  const int = units / SCALE;
  const frac = (units % SCALE).toString().padStart(MONEY_DECIMALS, '0').replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int.toString();
}

export function addMoney(...values: string[]): string {
  return fromUnits(values.reduce((acc, v) => acc + toUnits(v), 0n));
}

/** Formato para mostrar con 2 decimales mínimos (no redondea hacia arriba información de cobro). */
export function formatMoney(value: string, currency: string, locale = 'es-BO'): string {
  const units = toUnits(value);
  const whole = Number(units / SCALE);
  const cents = Number((units % SCALE) / 10n ** BigInt(MONEY_DECIMALS - 2));
  const n = whole + cents / 100;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export interface PlatformFeeConfig {
  /** Porcentaje en puntos básicos (250 = 2,5 %). */
  basisPoints: number;
  /** Comisión mínima por pedido, en la moneda del escrow. */
  minimum: string;
}

export const DEFAULT_PLATFORM_FEE: PlatformFeeConfig = { basisPoints: 250, minimum: '1' };

export interface PlatformFee {
  fee: string;
  /** Porcentaje efectivo con dos decimales, el que se envía a Trustless Work como `platformFee`. */
  percent: number;
  providerReceivesBeforeProtocol: string;
}

/**
 * Comisión al proveedor: el mayor entre el porcentaje y el mínimo. El pedido debe superar el doble
 * del mínimo para que la comisión no consuma una parte desproporcionada.
 */
export function computePlatformFee(amount: string, cfg: PlatformFeeConfig = DEFAULT_PLATFORM_FEE): PlatformFee {
  const total = toUnits(amount);
  const minimum = toUnits(cfg.minimum);
  if (total < minimum * 2n) throw new Error(`El pedido debe ser de al menos ${fromUnits(minimum * 2n)}`);
  const byPercent = (total * BigInt(cfg.basisPoints) + 9_999n) / 10_000n; // redondeo hacia arriba
  const fee = byPercent > minimum ? byPercent : minimum;
  // Porcentaje efectivo redondeado hacia arriba a 2 decimales para no cobrar menos de lo anunciado.
  const percentTimes100 = (fee * 10_000n + total - 1n) / total;
  return {
    fee: fromUnits(fee),
    percent: Number(percentTimes100) / 100,
    providerReceivesBeforeProtocol: fromUnits(total - fee),
  };
}
