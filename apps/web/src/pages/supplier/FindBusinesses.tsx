import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Busy, Dialog, EmptyState, ErrorNote, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

interface Rfq {
  id: string;
  title: string;
  quantity: number;
  unit: string;
  destination_country: string;
  destination_city: string;
  deadline_days: number | null;
  currency: string;
  visibility: string;
  budget: string | null;
  created_at: string;
}

/** Marketplace inverso: necesidades publicadas con consentimiento o invitaciones directas. */
export default function FindBusinesses() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [quoteFor, setQuoteFor] = useState<Rfq | null>(null);
  const [f, setF] = useState({ unitPrice: '', shipping: '0', leadTimeDays: '', validDays: '7', warranty: '' });
  const [sent, setSent] = useState(false);
  const list = useQuery({
    queryKey: ['supplier-rfqs', q],
    queryFn: () => api<Rfq[]>(`/supplier/rfqs${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });
  const send = useMutation({
    mutationFn: () =>
      api(`/rfqs/${quoteFor!.id}/quotes`, {
        method: 'POST',
        json: {
          quantity: quoteFor!.quantity,
          unitPrice: f.unitPrice,
          shipping: f.shipping || '0',
          currency: quoteFor!.currency,
          leadTimeDays: f.leadTimeDays ? Number(f.leadTimeDays) : undefined,
          validDays: Number(f.validDays) || 7,
          warranty: f.warranty || undefined,
        },
      }),
    onSuccess: () => setSent(true),
  });

  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader title={t('supplier.findTitle')} subtitle={t('supplier.findSubtitle')} />
      <label className="mb-6 block max-w-md">
        <span className="sr-only">{t('explore.searchPlaceholder')}</span>
        <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('explore.searchPlaceholder')} />
      </label>
      <ErrorNote error={list.error} />
      {list.isSuccess && list.data.length === 0 && <EmptyState motif="pando" text={t('quotes.none')} />}
      <ul className="grid gap-4 md:grid-cols-2">
        {list.data?.map((r) => (
          <li key={r.id} id={r.id} className="panel flex flex-col gap-2 target:border-amber">
            <p className="font-semibold">{r.title}</p>
            <p className="text-sm text-muted">
              {r.quantity} {r.unit} · {[r.destination_city, r.destination_country].filter(Boolean).join(', ')}
              {r.deadline_days ? ` · ${t('common.days', { count: r.deadline_days })}` : ''}
            </p>
            {r.budget && (
              <p className="text-xs text-muted">
                {t('wizard.budgetTitle')}: {r.budget} {r.currency}
              </p>
            )}
            <button type="button" className="btn btn-primary btn-sm mt-2 self-start" onClick={() => (setQuoteFor(r), setSent(false))}>
              {t('supplier.sendQuote')}
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(quoteFor)} onClose={() => setQuoteFor(null)} title={t('supplier.sendQuote')}>
        {sent ? (
          <p className="text-success">{t('supplier.quoteSent')}</p>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <p className="text-sm text-muted">
              {quoteFor?.title} · {quoteFor?.quantity} {quoteFor?.unit}
            </p>
            {(
              [
                ['unitPrice', t('supplier.unitPrice'), true],
                ['shipping', t('quotes.shipping'), false],
                ['leadTimeDays', t('supplier.fields.leadTime'), false],
                ['validDays', t('supplier.validDays'), true],
                ['warranty', t('explore.warranty'), false],
              ] as const
            ).map(([k, label, req]) => (
              <label key={k}>
                <span className="label">
                  {label} {k === 'unitPrice' && `(${quoteFor?.currency})`}
                </span>
                <input
                  className="field"
                  required={req}
                  inputMode={k === 'warranty' ? 'text' : 'decimal'}
                  value={f[k]}
                  onChange={(e) => setF({ ...f, [k]: k === 'warranty' ? e.target.value : e.target.value.replace(/[^\d.]/g, '') })}
                />
              </label>
            ))}
            <ErrorNote error={send.error} />
            <button className="btn btn-primary" disabled={send.isPending}>
              {send.isPending && <Busy />} {t('supplier.sendQuote')}
            </button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
