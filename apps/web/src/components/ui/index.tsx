import { formatMoney } from '@jucumari/shared';
import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/lib/api';

export function DemoBadge({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <span className="badge badge-demo" title={t('common.demoData')}>
      {label ?? t('common.demo')}
    </span>
  );
}

export function TestnetBadge() {
  const { t } = useTranslation();
  return <span className="badge badge-testnet">{t('common.testnet')}</span>;
}

/* Pastillas claras y legibles tanto sobre el cielo como dentro del vidrio claro. */
const TRUST_COLOR: Record<string, string> = {
  kyb_verified: 'bg-white/85 text-[#1f7a45] border-[#1f7a45]/40',
  registered: 'bg-white/85 text-ink border-ink/20',
  kyb_pending: 'bg-white/85 text-[#8a5300] border-[#8a5300]/40',
  found_online: 'bg-white/70 text-ink-2 border-ink/25 border-dashed',
  kyb_expired: 'bg-white/85 text-[#8a5300] border-[#8a5300]/40',
  kyb_rejected: 'bg-white/85 text-[#b23a28] border-[#b23a28]/40',
};

/** Nunca una insignia que sugiera garantía: texto explícito del alcance. */
export function TrustLabel({ trust }: { trust: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TRUST_COLOR[trust] ?? TRUST_COLOR.registered}`}
      title={t('trust.kybNote')}
    >
      {trust === 'kyb_verified' ? '✓ ' : ''}
      {t(`trust.${trust}`, { defaultValue: trust })}
    </span>
  );
}

export function Money({ amount, currency, className = '' }: { amount: string; currency: string; className?: string }) {
  const { i18n } = useTranslation();
  const isFiat = /^[A-Z]{3}$/.test(currency);
  return (
    <span className={`tabular-nums ${className}`}>
      {isFiat ? formatMoney(amount, currency, i18n.language === 'en' ? 'en-US' : 'es-BO') : `${amount} ${currency}`}
    </span>
  );
}

export function Rating({ rating }: { rating: { average: number; count: number } | null }) {
  const { t } = useTranslation();
  if (!rating) return <span className="text-xs text-muted">{t('results.noRatings')}</span>;
  return (
    <span className="text-xs text-cream/90">
      <span className="text-amber">★</span> {t('results.rating', { avg: rating.average.toFixed(1), count: rating.count })}
    </span>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (!error) return null;
  const code = error instanceof ApiError ? error.code : 'generic';
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-cream"
    >
      <span>{t(`errors.${code}`, { defaultValue: t('errors.generic') })}</span>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** Diálogo accesible: foco inicial, Escape para cerrar, regreso del foco al cerrar. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
  noHalo = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  noHalo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    el?.querySelector<HTMLElement>('input, button:not([data-close]), select, textarea, a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (x) => !x.hasAttribute('disabled'),
        );
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f.at(-1)!.focus();
        } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
          e.preventDefault();
          f[0]!.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(18_20_48/0.5)] p-0 backdrop-blur-md sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        data-no-halo={noHalo || undefined}
        className={`panel max-h-[92dvh] w-full overflow-y-auto rounded-b-none bg-[rgb(250_249_255/0.95)] [animation:rise-in_380ms_var(--ease-star)_both] pb-[calc(1.5rem+var(--safe-bottom))] sm:rounded-b-[var(--radius-card)] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={id} className="display text-2xl">
            {title}
          </h2>
          <button type="button" data-close className="btn btn-icon btn-sm" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h1 className="display text-4xl md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

/** Busy inline para botones (no es la experiencia central de carga). */
export function Busy() {
  return <span className="inline-block h-3.5 w-3.5 animate-pulse rounded-full bg-current opacity-70" aria-hidden="true" />;
}

/** Motivos discretos inspirados en los nueve departamentos (líneas mínimas, uno por composición). */
const MOTIFS: Record<string, ReactNode> = {
  lapaz: <path d="M2 40 L22 14 L30 24 L40 8 L58 40" />,
  oruro: <path d="M4 24 L14 14 L24 24 L34 14 L44 24 L54 14 M4 32 L14 22 L24 32 L34 22 L44 32 L54 22" />,
  potosi: <path d="M6 30 L30 6 L54 30 Z M6 34 L30 58 L54 34" opacity={0.6} />,
  cochabamba: <path d="M2 36 C14 22, 26 22, 34 32 S 52 40, 60 26" />,
  chuquisaca: <path d="M6 40 V24 A10 10 0 0 1 26 24 V40 M34 40 V24 A10 10 0 0 1 54 24 V40" />,
  tarija: <path d="M4 38 C16 28, 26 28, 36 36 S 52 40, 60 32 M40 16 C46 10, 54 12, 56 18 C50 22, 44 22, 40 16 Z" />,
  santacruz: (
    <path d="M30 40 V18 M30 22 C22 16, 18 10, 22 6 M30 22 C38 16, 42 10, 38 6 M30 28 C24 24, 16 24, 14 28 M30 28 C36 24, 44 24, 46 28" />
  ),
  beni: <path d="M2 20 C12 10, 18 30, 28 20 S 44 10, 54 20 M2 32 C12 22, 18 42, 28 32 S 44 22, 54 32" />,
  pando: <path d="M10 40 C10 24, 20 14, 30 12 C40 14, 50 24, 50 40 M30 12 V40 M20 28 L30 34 L40 28" />,
};
export type MotifName = keyof typeof MOTIFS;

export function Motif({ name, className = '' }: { name: MotifName; className?: string }) {
  return (
    <svg
      viewBox="0 0 60 44"
      className={`motif ${className}`}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {MOTIFS[name]}
    </svg>
  );
}

export function EmptyState({ motif, text, action }: { motif: MotifName; text: string; action?: ReactNode }) {
  return (
    <div className="card-glass flex flex-col items-center gap-4 px-6 py-10 text-center">
      <Motif name={motif} className="h-12 w-16 text-amber/60" />
      <p className="max-w-md text-muted">{text}</p>
      {action}
    </div>
  );
}
