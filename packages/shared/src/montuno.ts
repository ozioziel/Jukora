/**
 * Montuno: enlaces de checkout de importadoras y avisos de riesgo versionados.
 * El comprador acepta el texto exacto (la API guarda versión, texto, hash y fecha).
 */
export const ESCROW_MODES = ['full', 'partial'] as const;
export type EscrowModeKind = (typeof ESCROW_MODES)[number];

export interface Disclosure {
  version: string;
  text: string;
}

export const RISK_DISCLOSURES: Record<EscrowModeKind, Disclosure> = {
  full: {
    version: 'full/v1',
    text:
      'Pagas el 100 % del pedido ({total}) en token de prueba de Stellar Testnet, sin valor real. El dinero queda retenido ' +
      'en un contrato y solo se libera a la importadora cuando confirmes la entrega, o según decida un árbitro si abres una ' +
      'disputa. El tracking del courier no se considera prueba definitiva de entrega.',
  },
  partial: {
    version: 'partial/v1',
    text:
      'Pagas el 100 % del pedido ({total}) en token de prueba de Stellar Testnet, sin valor real. La importadora puede cobrar ' +
      'un ANTICIPO FIJO de {advance} ({advancePct}) ANTES de comprar el producto. Ese anticipo, una vez pagado, NO se puede ' +
      'recuperar desde el contrato. Si la importadora incumple, la protección se limita al saldo retenido ({protected}).',
  },
};

export function renderDisclosure(d: Disclosure, vars: Record<string, string>): string {
  return d.text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}

/** Datos públicos del checkout (sin wallets, correos, teléfonos ni direcciones). */
export interface CheckoutView {
  token: string;
  status: 'active' | 'accepted' | 'expired' | 'cancelled';
  title: string;
  description: string;
  productUrl: string;
  price: string;
  shipping: string;
  total: string;
  currency: string;
  deliveryDays: number;
  mode: EscrowModeKind;
  advance: string;
  protectedAmount: string;
  expiresAt: string;
  isDemo: boolean;
  seller: { name: string; city: string; trust: string; isDemo: boolean };
  disclosure: { version: string; text: string; hash: string };
  orderId: string | null;
}
