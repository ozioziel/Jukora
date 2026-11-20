import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { HouseSprite } from '@/components/house/HouseSprite';
import { EmptyState, ErrorNote, PageHeader } from '@/components/ui';
import { ResourceIcon } from '@/features/resources/ResourceIcon';
import { api } from '@/lib/api';
import type { ProjectDetail } from '@/lib/types';

/** Interior de la casa: resumen compacto, recursos con progreso real y herramientas contextuales. */
export default function House() {
  const { projectId = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['project', projectId], queryFn: () => api<ProjectDetail>(`/projects/${projectId}`) });
  const [newRes, setNewRes] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [qty, setQty] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['project', projectId] });
  const add = useMutation({
    mutationFn: () => api(`/projects/${projectId}/resources`, { method: 'POST', json: { label: newRes.trim() } }),
    onSuccess: () => (setNewRes(''), refresh()),
  });
  const update = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number | null }) =>
      api(`/projects/${projectId}/resources/${id}`, { method: 'PATCH', json: { quantity } }),
    onSuccess: () => (setEditing(null), refresh()),
  });
  const archive = useMutation({
    mutationFn: () => api(`/projects/${projectId}`, { method: 'PATCH', json: { archived: true } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void nav('/espacio');
    },
  });

  const p = q.data;
  if (q.error)
    return (
      <div className="container-x py-16">
        <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  if (!p) return <div className="min-h-[60vh]" aria-busy="true" />;
  const orders = Object.entries(p.summary.orders).reduce((a, [, n]) => a + n, 0);

  return (
    <div className="container-x pt-8 pb-16">
      <Link to="/espacio" className="btn btn-sm mb-6">
        <ArrowLeft size={14} /> {t('nav.space')}
      </Link>
      <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-4">
          {/* La casa del negocio, construida en su paisaje; la puerta se abre al pasar el cursor. */}
          <div
            className="house-hover relative aspect-[4/5] overflow-hidden rounded-[var(--radius-card)] border border-white/80 bg-cover bg-[center_60%] shadow-[0_30px_60px_-30px_rgb(30_30_80/0.5)]"
            style={{ backgroundImage: `url(/escenas/card-${p.sector === 'other' ? 'other' : p.sector}.webp)` }}
          >
            <HouseSprite sector={p.sector} reflect className="absolute bottom-[12%] left-[14%] w-[72%]" />
          </div>
          {/* El dibujo anterior (HouseIllustration) sigue disponible en components/motion/House.tsx. */}
          <dl className="panel grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[11px] text-muted uppercase">RFQ</dt>
              <dd className="text-xl font-semibold">{p.summary.rfqs}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted uppercase">{t('quotes.title')}</dt>
              <dd className="text-xl font-semibold">{p.summary.openQuotes}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted uppercase">{t('supplier.stats.orders')}</dt>
              <dd className="text-xl font-semibold">{orders}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void nav('/espacio', { state: { projectId: p.id, idea: p.objective } })}
            >
              <Search size={16} /> {t('space.title')}
            </button>
            <Link to="/cotizaciones" className="btn">
              {t('quotes.received')}
            </Link>
            <button type="button" className="btn btn-sm text-muted" onClick={() => archive.mutate()}>
              <Archive size={14} /> {t('space.archived')}
            </button>
          </div>
        </aside>

        <section>
          <PageHeader
            eyebrow={`${t(`sectors.${p.sector}`)} · ${t(`intent.${p.intent}`)}${p.city ? ` · ${p.city}` : ''}`}
            title={p.name}
            subtitle={p.objective || undefined}
          />
          {p.lastSearchRun && (
            <Link to={`/busqueda/${p.lastSearchRun.id}`} className="btn btn-sm mb-6">
              {t('search.statusDone')}
            </Link>
          )}
          {p.resources.length === 0 ? (
            <EmptyState motif="tarija" text={t('space.noHouses')} />
          ) : (
            <ul className="grid gap-3">
              {p.resources.map((r) => {
                const req = r.progress.required;
                return (
                  <li key={r.id} className="panel flex flex-wrap items-center gap-4 py-4">
                    <ResourceIcon category={r.category} size={22} className="text-amber" aria-hidden="true" />
                    <div className="min-w-40 flex-1">
                      <p className="font-semibold">{r.label}</p>
                      <p className="text-xs text-muted">
                        {req === null ? t('common.quantityTbd') : t('space.progress', { accepted: r.progress.accepted, required: req })}
                        {r.progress.ordered > 0 && ` · ${t('order.status.funded')}: ${r.progress.ordered}`}
                        {r.progress.inTransit > 0 && ` · ${t('order.status.shipped')}: ${r.progress.inTransit}`}
                      </p>
                    </div>
                    <span className="font-mono text-lg">{req === null ? `${r.progress.accepted}/?` : `${r.progress.accepted}/${req}`}</span>
                    {editing === r.id ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          update.mutate({ id: r.id, quantity: qty ? Number(qty) : null });
                        }}
                      >
                        <label className="sr-only" htmlFor={`q-${r.id}`}>
                          {t('search.editQuantity')}
                        </label>
                        <input
                          id={`q-${r.id}`}
                          className="field w-24 py-1.5"
                          inputMode="numeric"
                          value={qty}
                          onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
                        />
                        <button className="btn btn-sm btn-primary">{t('common.save')}</button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-icon btn-sm"
                        aria-label={t('search.editQuantity')}
                        onClick={() => (setEditing(r.id), setQty(r.quantity ? String(r.quantity) : ''))}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {r.searchRunId && (
                      <Link to={`/busqueda/${r.searchRunId}/${r.slug}`} className="btn btn-sm">
                        <Search size={13} /> {t('search.searchCategory', { label: r.label.toLowerCase() })}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newRes.trim().length >= 2) add.mutate();
            }}
          >
            <label htmlFor="new-res" className="sr-only">
              {t('common.add')}
            </label>
            <input
              id="new-res"
              className="field"
              value={newRes}
              maxLength={80}
              onChange={(e) => setNewRes(e.target.value)}
              placeholder={t('common.add')}
            />
            <button className="btn">
              <Plus size={14} /> {t('common.add')}
            </button>
          </form>
          <ErrorNote error={add.error ?? update.error} />
        </section>
      </div>
    </div>
  );
}
