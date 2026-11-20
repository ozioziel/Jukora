/**
 * Cuota diaria de búsquedas inteligentes: se reinicia a medianoche de la zona horaria fijada en el
 * perfil al crear la cuenta. En la base se guarda en UTC.
 */

export const DAILY_SMART_SEARCHES = 10;
export const DEFAULT_TIME_ZONE = 'America/La_Paz';

function partsIn(timeZone: string, date: Date) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), s: Number(p.second) };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Clave del día local, p. ej. `2026-11-20`. */
export function quotaDayKey(timeZone: string, now = new Date()): string {
  const { y, m, d } = partsIn(timeZone, now);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Desfase (ms) entre la hora local de la zona y UTC en un instante dado. */
function offsetMs(timeZone: string, at: Date): number {
  const p = partsIn(timeZone, at);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instante UTC del próximo reinicio (medianoche local siguiente). */
export function nextQuotaReset(timeZone: string, now = new Date()): Date {
  const { y, m, d } = partsIn(timeZone, now);
  const localMidnightAsUtc = Date.UTC(y, m - 1, d + 1, 0, 0, 0);
  let guess = localMidnightAsUtc - offsetMs(timeZone, new Date(localMidnightAsUtc));
  // Segunda pasada por si el desfase cambia en esa noche (horario de verano).
  guess = localMidnightAsUtc - offsetMs(timeZone, new Date(guess));
  return new Date(guess);
}
