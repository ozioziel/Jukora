import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, MapPin, Search, Timer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { DemoBadge, EmptyState, ErrorNote, Money, Rating, TrustLabel } from '@/components/ui';
import { BuyDialog, RfqDialog } from '@/features/procurement/RequestDialogs';
import { ResourceIcon } from '@/features/resources/ResourceIcon';
import { api } from '@/lib/api';
import type { ProjectDetail, RankedCandidate, SearchRun } from '@/lib/types';

type Sort = 'relevance' | 'price' | 'time';

export default function CategoryResults() {
  const { runId = '', slug = '' } = useParams();
  const { t } = useTranslation();
  const [sort, setSort] = useState<Sort>('relevance');
  const [rfqFor, setRfqFor] = useState<RankedCandidate | null>(null);
  const [buyFor, setBuyFor] = useState<RankedCandidate | null>(null);

  const run = useQuery({ queryKey: ['run', runId], queryFn: () => api<SearchRun>(`/search/runs/${runId}`) });
  // Abrir la categoría es idempotente en el servidor: reabrir no cobra cuota ni créditos.
  const data = useQuery({
    queryKey: ['candidates', runId, slug],
    queryFn: () =>
      api<{ externalStatus: string | null; candidates: RankedCandidate[] }>(`/search/runs/${runId}/resources/${slug}/open`, {
        method: 'POST',
      }),
    staleTime: 5 * 60_000,
  });
  const project = useQuery({
    queryKey: ['project', run.data?.projectId],
    queryFn: () => api<ProjectDetail>(`/projects/${run.data!.projectId}`),
    enabled: Boolean(run.data?.projectId),
  });

  const resource = run.data?.plan?.resources.find((r) => r.id === slug);
  const requirement = project.data?.resources.find((r) => r.slug === slug);

  const sorted = useMemo(() => {
    const list = [...(data.data?.candidates ?? [])];
    const num = (c: RankedCandidate) => (c.price ? Number(c.price.amount) : Number.POSITIVE_INFINITY);
    if (sort === 'price') list.sort((a, b) => Number(a.excluded) - Number(b.excluded) || num(a) - num(b));
    if (sort === 'time') list.sort((a, b) => Number(a.excluded) - Number(b.excluded) || (a.leadTimeDays ?? 9e9) - (b.leadTimeDays ?? 9e9));
    return list;
  }, [data.data, sort]);

  const ext = data.data?.externalStatus;
  return (
    <div className="container-x pt-8 pb-16">
      <Link to={`/busqueda/${runId}`} viewTransition className="btn btn-sm mb-6">
        <ArrowLeft size={14} /> {t('results.backToResources')}
      </Link>

      <header
        className="card-glass mb-6 flex flex-wrap items-center justify-between gap-4 p-5"
        style={{ viewTransitionName: `res-${slug}` }}
      >
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-amber/40">
            <ResourceIcon category={resource?.category ?? slug} size={28} className="text-amber" aria-hidden="true" />
          </span>
          <div>
            <h1 className="display text-3xl">{resource?.label ?? slug}</h1>
            <p className="text-sm text-muted">
              {resource?.quantity === null || !resource
                ? t('common.quantityTbd')
                : `${requirement?.progress.accepted ?? 0}/${resource.quantity} · ${resource.unit}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('explore.sort')}>
          {(['relevance', 'price', 'time'] as const).map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={sort === s} onClick={() => setSort(s)}>
              {t(s === 'relevance' ? 'results.sortRelevance' : s === 'price' ? 'results.sortPrice' : 'results.sortTime')}
            </button>
          ))}
        </div>
      </header>

      {ext === null && !run.data?.externalSearch.enabled && <p className="mb-4 text-sm text-muted">{t('results.externalOff')}</p>}
      {ext === 'budget_exhausted' && <p className="mb-4 text-sm text-warning">{t('results.budgetExhausted')}</p>}
      {ext === 'error' && <p className="mb-4 text-sm text-warning">{t('results.externalError')}</p>}
      <ErrorNote error={data.error} onRetry={() => void data.refetch()} />

      {data.isSuccess && sorted.length === 0 && (
        <EmptyState
          motif="beni"
          text={t('results.none')}
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setRfqFor({ id: 'public', title: resource?.label ?? slug } as RankedCandidate)}
            >
              <Search size={14} /> {t('common.requestQuote')}
            </button>
          }
        />
      )}

      <ul className="grid gap-4 lg:grid-cols-2" aria-busy={data.isLoading}>
        {sorted.map((c) => (
          <li key={c.id} className={`panel flex flex-col gap-3 ${c.excluded ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold">{c.title}</h2>
                <p className="text-sm text-muted">{c.supplierName}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {c.origin === 'demo' ? <DemoBadge /> : <span className="chip">{t(`results.origin.${c.origin}`)}</span>}
                <TrustLabel trust={c.supplierTrust} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="text-xl font-semibold">
                {c.price ? (
                  <Money amount={c.price.amount} currency={c.price.currency} />
                ) : (
                  <span className="text-muted">{t('results.priceUnknown')}</span>
                )}
              </span>
              <span className="flex items-center gap-1 text-cream/80">
                <Timer size={14} /> {c.leadTimeDays === null ? t('results.leadUnknown') : t('results.leadTime', { count: c.leadTimeDays })}
              </span>
              {c.locationCountry && (
                <span className="flex items-center gap-1 text-cream/80">
                  <MapPin size={14} /> {t('results.from', { place: [c.locationCity, c.locationCountry].filter(Boolean).join(', ') })}
                </span>
              )}
              <Rating rating={c.rating} />
            </div>
            {c.excluded && <p className="text-sm text-danger">{t('results.excluded')}</p>}
            <details>
              <summary className="cursor-pointer text-xs text-muted">{t('results.whyRanked')}</summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {c.reasons.map((r) => (
                  <li key={r} className="chip">
                    {t(`results.reasons.${r}`, { defaultValue: r })}
                  </li>
                ))}
              </ul>
            </details>
            <div className="mt-auto flex flex-wrap gap-2">
              {c.sourceUrl && (
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-sm">
                  <ExternalLink size={13} /> {t('common.viewSource')}
                </a>
              )}
              {c.listingId && (
                <Link to={`/explorar/articulos/${c.listingId}`} className="btn btn-sm">
                  {t('explore.specs')}
                </Link>
              )}
              {!c.excluded && c.action === 'request_order' && c.price && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setBuyFor(c)}>
                  {t('common.request')}
                </button>
              )}
              {!c.excluded && c.listingId && (
                <button type="button" className="btn btn-sm" onClick={() => setRfqFor(c)}>
                  {t('common.requestQuote')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {rfqFor && (
        <RfqDialog
          open
          onClose={() => setRfqFor(null)}
          title={rfqFor.title}
          listingId={rfqFor.listingId ?? undefined}
          projectId={run.data?.projectId ?? undefined}
          requirementId={requirement?.id}
          defaultQuantity={resource?.quantity ?? 1}
          country={project.data?.country ?? 'BO'}
          city={project.data?.city ?? ''}
        />
      )}
      {buyFor && buyFor.price && buyFor.listingId && (
        <BuyDialog
          open
          onClose={() => setBuyFor(null)}
          listing={{ id: buyFor.listingId, title: buyFor.title, price: buyFor.price, minQty: 1, supplierName: buyFor.supplierName ?? '' }}
          projectId={run.data?.projectId ?? undefined}
          requirementId={requirement?.id}
          defaultQuantity={resource?.quantity ?? 1}
        />
      )}
    </div>
  );
}
