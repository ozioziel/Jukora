import { toUnits } from './money.js';
import type { SupplierTrust } from './states.js';
import type { PRIORITIES } from './search.js';

type Priority = (typeof PRIORITIES)[number];

export interface RankInput {
  id: string;
  price: { amount: string; currency: string } | null;
  leadTimeDays: number | null;
  /** Especificaciones obligatorias cumplidas / totales; null si no se pudo comprobar. */
  specs: { met: number; total: number } | null;
  trust: SupplierTrust;
  servesDestination: boolean | null;
  failsMandatory: boolean;
}

export interface Ranked {
  id: string;
  score: number;
  /** Códigos de razón traducibles en la interfaz. */
  reasons: string[];
  excluded: boolean;
}

/** Pesos iniciales ilustrativos (03 §7). Se recalibran con entrevistas. */
export function weightsFor(priorities: readonly Priority[]): { price: number; time: number; fit: number; trust: number } {
  const w = { price: 30, time: 25, fit: 25, trust: 20 };
  const order = priorities.filter((p) => p !== 'balance');
  order.forEach((p, i) => {
    const bonus = i === 0 ? 20 : 10;
    if (p === 'total_cost') w.price += bonus;
    if (p === 'arrival_time') w.time += bonus;
    if (p === 'quality') w.fit += bonus;
  });
  const sum = w.price + w.time + w.fit + w.trust;
  return { price: w.price / sum, time: w.time / sum, fit: w.fit / sum, trust: w.trust / sum };
}

const TRUST_SCORE: Record<SupplierTrust, number> = {
  kyb_verified: 1,
  registered: 0.5,
  kyb_pending: 0.5,
  found_online: 0.2,
  kyb_expired: 0.2,
  kyb_rejected: 0,
};

/**
 * Filtra requisitos duros y ordena. Un dato desconocido no suma puntos (no se trata como compatible).
 * Solo se comparan precios en la misma moneda: sin tipo de cambio verificado no se mezclan importes.
 */
export function rankCandidates(items: RankInput[], priorities: readonly Priority[], currency: string): Ranked[] {
  const w = weightsFor(priorities);
  const comparable = items.filter((i) => i.price && i.price.currency === currency).map((i) => toUnits(i.price!.amount));
  const minPrice = comparable.length ? comparable.reduce((a, b) => (a < b ? a : b)) : null;
  const maxPrice = comparable.length ? comparable.reduce((a, b) => (a > b ? a : b)) : null;
  const times = items.map((i) => i.leadTimeDays).filter((t): t is number => t !== null);
  const minTime = times.length ? Math.min(...times) : null;
  const maxTime = times.length ? Math.max(...times) : null;

  return items
    .map((i): Ranked => {
      const reasons: string[] = [];
      if (i.failsMandatory || i.servesDestination === false || i.trust === 'kyb_rejected') {
        return { id: i.id, score: 0, reasons: ['excluded_requirement'], excluded: true };
      }
      let score = 0;
      if (i.price && i.price.currency === currency && minPrice !== null && maxPrice !== null) {
        const p = toUnits(i.price.amount);
        const span = maxPrice - minPrice;
        const rel = span === 0n ? 1 : 1 - Number(((p - minPrice) * 1000n) / span) / 1000;
        score += w.price * rel;
        if (p === minPrice) reasons.push('lowest_price');
      } else {
        reasons.push(i.price ? 'price_other_currency' : 'price_unknown');
      }
      if (i.leadTimeDays !== null && minTime !== null && maxTime !== null) {
        const rel = maxTime === minTime ? 1 : 1 - (i.leadTimeDays - minTime) / (maxTime - minTime);
        score += w.time * rel;
        if (i.leadTimeDays === minTime) reasons.push('fastest_delivery');
      } else {
        reasons.push('lead_time_unknown');
      }
      if (i.specs && i.specs.total > 0) {
        score += w.fit * (i.specs.met / i.specs.total);
        reasons.push(i.specs.met === i.specs.total ? 'specs_met' : 'specs_partial');
      } else {
        reasons.push('specs_unverified');
      }
      score += w.trust * TRUST_SCORE[i.trust];
      reasons.push(`trust_${i.trust}`);
      return { id: i.id, score: Math.round(score * 1000) / 10, reasons, excluded: false };
    })
    .sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.score - a.score);
}
