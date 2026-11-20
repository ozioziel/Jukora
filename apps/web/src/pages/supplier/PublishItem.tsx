import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Busy, DemoBadge, ErrorNote, Money, PageHeader } from '@/components/ui';
import { COUNTRIES } from '@/features/assistant/Wizard';
import { api } from '@/lib/api';
import type { Listing } from '@/lib/types';

const empty = {
  title: '',
  description: '',
  category: '',
  price: '',
  currency: 'USD',
  quoteOnly: false,
  stock: '',
  minQty: '1',
  condition: 'new',
  originCountry: 'BO',
  originCity: '',
  shipsTo: 'BO',
  leadTimeDays: '',
  warranty: '',
  specs: '',
};

function parseSpecs(text: string): Record<string, string> {
  return Object.fromEntries(
    text
      .split('\n')
      .map((l) => l.split(':'))
      .filter((p) => p.length >= 2 && p[0]!.trim())
      .slice(0, 20)
      .map(([k, ...v]) => [k!.trim().slice(0, 40), v.join(':').trim().slice(0, 120)]),
  );
}

export default function PublishItem() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [f, setF] = useState(empty);
  const mine = useQuery({ queryKey: ['my-listings'], queryFn: () => api<Listing[]>('/supplier/listings') });
  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const r = await api<{ id: string }>('/supplier/listings', {
        method: 'POST',
        json: {
          title: f.title,
          description: f.description || undefined,
          category: f.category,
          specs: parseSpecs(f.specs),
          price: f.quoteOnly ? null : f.price || null,
          currency: f.currency,
          quoteOnly: f.quoteOnly,
          stock: f.stock ? Number(f.stock) : null,
          minQty: Number(f.minQty) || 1,
          condition: f.condition,
          originCountry: f.originCountry,
          originCity: f.originCity || undefined,
          shipsTo: f.shipsTo.split(/[,\s]+/).filter((c) => /^[A-Z]{2}$/.test(c)),
          leadTimeDays: f.leadTimeDays ? Number(f.leadTimeDays) : null,
          warranty: f.warranty || undefined,
        },
      });
      if (publish) await api(`/supplier/listings/${r.id}/published`, { method: 'POST' });
    },
    onSuccess: () => {
      setF(empty);
      void qc.invalidateQueries({ queryKey: ['my-listings'] });
    },
  });
  const setStatus = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => api(`/supplier/listings/${id}/${s}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-listings'] }),
  });
  const input = (k: keyof typeof empty, label: string, props: Record<string, unknown> = {}) => (
    <label className="block">
      <span className="label">{label}</span>
      <input className="field" value={String(f[k])} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
    </label>
  );

  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader title={t('supplier.publishTitle')} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <form
          className="panel grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(true);
          }}
        >
          <div className="md:col-span-2">
            {input('title', t('supplier.fields.title'), { required: true, minLength: 3, maxLength: 120 })}
          </div>
          {input('category', t('supplier.fields.category'), { required: true, minLength: 2, maxLength: 60 })}
          <label className="flex items-end gap-2 pb-3 text-sm">
            <input
              type="checkbox"
              className="accent-amber"
              checked={f.quoteOnly}
              onChange={(e) => setF({ ...f, quoteOnly: e.target.checked })}
            />{' '}
            {t('supplier.fields.quoteOnly')}
          </label>
          {!f.quoteOnly &&
            input('price', `${t('supplier.fields.price')} (${f.currency})`, {
              inputMode: 'decimal',
              required: true,
              pattern: '\\d+(\\.\\d{1,7})?',
            })}
          {input('stock', t('supplier.fields.stock'), { inputMode: 'numeric' })}
          <label className="block">
            <span className="label">{t('supplier.fields.originCountry')}</span>
            <select className="field" value={f.originCountry} onChange={(e) => setF({ ...f, originCountry: e.target.value })}>
              {COUNTRIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          {input('originCity', t('supplier.fields.originCity'))}
          {input('shipsTo', t('supplier.fields.shipsTo'))}
          {input('leadTimeDays', t('supplier.fields.leadTime'), { inputMode: 'numeric' })}
          {input('warranty', t('supplier.fields.warranty'))}
          <label className="block md:col-span-2">
            <span className="label">{t('supplier.description')}</span>
            <textarea
              className="field"
              maxLength={4000}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="label">{t('supplier.fields.specs')}</span>
            <textarea
              className="field font-mono text-sm"
              value={f.specs}
              onChange={(e) => setF({ ...f, specs: e.target.value })}
              placeholder={'voltaje: 220V\ncombustible: gas GLP'}
            />
          </label>
          <div className="md:col-span-2">
            <ErrorNote error={save.error} />
          </div>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="button" className="btn" disabled={save.isPending} onClick={() => save.mutate(false)}>
              {t('supplier.saveDraft')}
            </button>
            <button className="btn btn-primary" disabled={save.isPending}>
              {save.isPending && <Busy />} {t('supplier.publish')}
            </button>
          </div>
        </form>
        <section>
          <h2 className="mb-4 text-xl font-semibold">{t('supplier.myListings')}</h2>
          <ul className="space-y-3">
            {mine.data?.map((l) => (
              <li key={l.id} className="panel flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link to={`/explorar/articulos/${l.id}`} className="font-semibold hover:text-amber-2">
                    {l.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {l.price ? <Money amount={l.price.amount} currency={l.price.currency} /> : t('results.priceUnknown')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {l.isDemo && <DemoBadge />}
                  <span className="chip">{t(`supplier.status.${l.status}`)}</span>
                  {l.status !== 'published' ? (
                    <button type="button" className="btn btn-sm" onClick={() => setStatus.mutate({ id: l.id, s: 'published' })}>
                      {t('supplier.publish')}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-sm" onClick={() => setStatus.mutate({ id: l.id, s: 'archived' })}>
                      {t('space.archived')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
