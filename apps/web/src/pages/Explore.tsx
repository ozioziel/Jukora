import { useInfiniteQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { type CSSProperties, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { useSky } from '@/components/sky/Sky';
import { DemoBadge, ErrorNote, Money, Rating, TrustLabel } from '@/components/ui';
import { COUNTRIES } from '@/features/assistant/Wizard';
import { ResourceIcon } from '@/features/resources/ResourceIcon';
import { api } from '@/lib/api';
import type { Listing } from '@/lib/types';

interface Page {
  items: Listing[];
  page: number;
  hasMore: boolean;
  categories: { category: string; n: number }[];
}

const TINTS = ['var(--color-amarillo)', 'var(--color-verde)', 'var(--color-fucsia)', 'var(--color-naranja)', 'var(--color-morado)', 'var(--color-rojo)', 'var(--color-celeste)'];
/** Cada categoría conserva siempre el mismo tinte del aguayo. */
function tint(category: string) {
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

/** Explorar: buscador del catálogo (no consume búsquedas inteligentes) con cartas de vidrio claro. */
export default function Explore() {
  const { t, i18n } = useTranslation();
  useSky('bg-ocaso', 10);
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(params.get('q') ?? '');
  const regionNames = useMemo(() => new Intl.DisplayNames([i18n.language === 'en' ? 'en' : 'es'], { type: 'region' }), [i18n.language]);
  const filters = Object.fromEntries(params.entries());
  const q = useInfiniteQuery({
    queryKey: ['listings', filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Page>(`/listings?${new URLSearchParams({ ...filters, page: String(pageParam) })}`),
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
  const set = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v) n.set(k, v);
    else n.delete(k);
    setParams(n, { replace: true });
  };
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const categories = q.data?.pages[0]?.categories ?? [];
  const activeCat = params.get('category');

  return (
    <div className="container-x pt-8 pb-16">
      <div className="on-sky mb-6 max-w-3xl">
        <span className="eyebrow">{t('nav.explore')}</span>
        <h1 className="display mt-3 text-4xl text-white md:text-5xl">{t('explore.title')}</h1>
        <p className="mt-3 text-lg text-white/90">{t('explore.subtitle')}</p>
      </div>

      {/* Buscador */}
      <div className="lglass on-light float-y rounded-3xl p-4 md:p-5 [animation-duration:9s]">
        <form
          role="search"
          className="flex flex-col gap-3 md:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            set('q', text.trim() || null);
          }}
        >
          <label htmlFor="explore-q" className="sr-only">
            {t('explore.searchPlaceholder')}
          </label>
          <div className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-2" aria-hidden="true" />
            <input
              id="explore-q"
              className="field pl-11 text-base"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('explore.searchPlaceholder')}
            />
          </div>
          <button className="btn btn-primary btn-lg shrink-0">
            <Search size={16} /> {t('explore.title')}
          </button>
        </form>

        {categories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('explore.category')}>
            <button type="button" className="chip" aria-pressed={!activeCat} onClick={() => set('category', null)}>
              {t('explore.all')}
            </button>
            {categories.map((c) => (
              <button
                key={c.category}
                type="button"
                className="chip"
                aria-pressed={activeCat === c.category}
                onClick={() => set('category', activeCat === c.category ? null : c.category)}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: tint(c.category) }} aria-hidden="true" />
                {c.category} <span className="text-ink-2">({c.n})</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 grid gap-3 border-t border-ink/8 pt-4 md:grid-cols-[auto_1fr_1fr_auto] md:items-end">
          <span className="hidden items-center gap-2 pb-3 text-sm font-semibold text-ink-2 md:flex">
            <SlidersHorizontal size={16} aria-hidden="true" />
          </span>
          <label className="text-sm">
            <span className="label">{t('explore.country')}</span>
            <select className="field" value={params.get('country') ?? ''} onChange={(e) => set('country', e.target.value || null)}>
              <option value="">{t('explore.all')}</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {regionNames.of(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="label">{t('explore.sort')}</span>
            <select className="field" value={params.get('sort') ?? 'relevance'} onChange={(e) => set('sort', e.target.value)}>
              <option value="relevance">{t('results.sortRelevance')}</option>
              <option value="price_asc">{t('results.sortPrice')} ↑</option>
              <option value="price_desc">{t('results.sortPrice')} ↓</option>
              <option value="lead_time">{t('results.sortTime')}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pb-3 text-sm">
            <input
              type="checkbox"
              className="accent-oro"
              checked={params.get('verifiedOnly') === 'true'}
              onChange={(e) => set('verifiedOnly', e.target.checked ? 'true' : null)}
            />
            {t('explore.verifiedOnly')}
          </label>
        </div>
      </div>

      <div className="mt-8">
        <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
        {q.isSuccess && items.length === 0 && (
          <p className="lglass rounded-2xl px-6 py-8 text-center text-ink-2">{t('explore.empty')}</p>
        )}
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={q.isLoading}>
          {items.map((l, i) => (
            <li key={l.id} className="[animation:rise-in_520ms_var(--ease-star)_both]" style={{ animationDelay: `${(i % 12) * 60}ms` }}>
              <Link
                to={`/explorar/articulos/${l.id}`}
                className="lglass on-light float-y group flex h-full flex-col gap-3 overflow-hidden rounded-[20px] p-5 transition hover:-translate-y-0.5"
                style={{ '--c': tint(l.category), animationDelay: `${-(i % 7)}s` } as CSSProperties}
              >
                <span className="-mx-5 -mt-5 mb-1 block h-1 bg-[linear-gradient(90deg,transparent,var(--c),transparent)] opacity-80" aria-hidden="true" />
                <div className="flex items-start justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_oklab,var(--c)_22%,#fff)] text-[color-mix(in_oklab,var(--c)_75%,#1c1a33)]">
                    <ResourceIcon category={l.category} size={22} aria-hidden="true" />
                  </span>
                  {l.isDemo && <DemoBadge />}
                </div>
                <span className="text-[11px] font-bold tracking-[0.14em] text-[color-mix(in_oklab,var(--c)_72%,#1c1a33)] uppercase">{l.category}</span>
                <h2 className="font-display text-[17px] leading-snug font-bold">{l.title}</h2>
                <p className="text-sm text-ink-2">
                  {l.supplier.name} · {regionNames.of(l.origin.country)}
                </p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-bold">
                    {l.price ? (
                      <Money amount={l.price.amount} currency={l.price.currency} />
                    ) : (
                      <span className="text-sm text-ink-2">{t('results.priceUnknown')}</span>
                    )}
                  </span>
                  <TrustLabel trust={l.supplier.trust} />
                </div>
                <Rating rating={l.supplier.rating} />
              </Link>
            </li>
          ))}
        </ul>
        {q.hasNextPage && (
          <div className="mt-8 text-center">
            <button type="button" className="btn" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>
              {t('explore.loadMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
