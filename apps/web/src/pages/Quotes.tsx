import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Busy, DemoBadge, EmptyState, ErrorNote, Money, PageHeader, TrustLabel } from '@/components/ui';
import { api } from '@/lib/api';
import type { Quote } from '@/lib/types';

interface MyOrder {
  id: string;
  title: string;
  amount: string;
  currency: string;
  status: string;
  supplier_name: string;
  is_demo: boolean;
}

/** Cotizaciones recibidas, comparables por total entregado y plazo; y pedidos del comprador. */
export default function Quotes() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const quotes = useQuery({ queryKey: ['quotes'], queryFn: () => api<Quote[]>('/quotes/mine') });
  const orders = useQuery({ queryKey: ['orders', 'buyer'], queryFn: () => api<MyOrder[]>('/orders?as=buyer') });
  const accept = useMutation({
    mutationFn: (id: string) => api<{ orderId: string }>(`/quotes/${id}/accept`, { method: 'POST' }),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      void nav(`/pedidos/${r.orderId}`);
    },
  });
  const reject = useMutation({
    mutationFn: (id: string) => api(`/quotes/${id}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quotes'] }),
  });
  const fmt = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en' : 'es', { dateStyle: 'medium' });

  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader title={t('quotes.received')} subtitle={t('quotes.acceptNote')} />
      <ErrorNote error={quotes.error ?? accept.error} />
      {quotes.isSuccess && quotes.data.length === 0 && <EmptyState motif="oruro" text={t('quotes.none')} />}
      <ul className="grid gap-4 lg:grid-cols-2">
        {quotes.data?.map((q) => (
          <li key={q.id} id={q.id} className="panel flex flex-col gap-3 target:border-amber">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{q.rfqTitle}</p>
                <p className="text-sm text-muted">
                  {q.supplier.name} · {t('quotes.version', { v: q.version })}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {q.supplier.isDemo && <DemoBadge />}
                <TrustLabel trust={q.supplier.trust} />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted">{t('quotes.subtotal')}</dt>
                <dd>
                  {q.quantity} × <Money amount={q.unitPrice} currency={q.currency} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('quotes.shipping')}</dt>
                <dd>
                  <Money amount={q.shipping} currency={q.currency} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('quotes.total')}</dt>
                <dd className="font-semibold text-amber-2">
                  <Money amount={q.total} currency={q.currency} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">{t('results.sortTime')}</dt>
                <dd>{q.leadTimeDays === null ? t('results.leadUnknown') : t('common.days', { count: q.leadTimeDays })}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">
              {q.status === 'expired' ? t('quotes.expired') : t('quotes.validUntil', { date: fmt.format(new Date(q.validUntil)) })}
            </p>
            {q.status === 'sent' && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary btn-sm" disabled={accept.isPending} onClick={() => accept.mutate(q.id)}>
                  {accept.isPending && <Busy />} {t('quotes.accept')}
                </button>
                <button type="button" className="btn btn-sm" onClick={() => reject.mutate(q.id)}>
                  {t('quotes.reject')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <h2 className="display mt-14 mb-4 text-3xl">{t('order.myOrders')}</h2>
      <ul className="grid gap-3">
        {orders.data?.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              className="panel flex w-full flex-wrap items-center justify-between gap-3 py-4 text-left hover:border-amber/40"
              onClick={() => void nav(`/pedidos/${o.id}`)}
            >
              <span className="font-semibold">{o.title}</span>
              <span className="text-sm text-muted">{o.supplier_name}</span>
              <Money amount={o.amount} currency={o.currency} />
              <span className="chip">{t(`order.status.${o.status}`)}</span>
              {o.is_demo && <DemoBadge />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
