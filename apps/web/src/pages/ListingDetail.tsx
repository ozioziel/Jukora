import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useAuth } from '@/app/auth';
import { DemoBadge, ErrorNote, Money, Rating, TrustLabel } from '@/components/ui';
import { BuyDialog, RfqDialog } from '@/features/procurement/RequestDialogs';
import { ResourceIcon } from '@/features/resources/ResourceIcon';
import { api } from '@/lib/api';
import type { Listing } from '@/lib/types';

export default function ListingDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const { me, openLogin } = useAuth();
  const [buy, setBuy] = useState(false);
  const [rfq, setRfq] = useState(false);
  const q = useQuery({ queryKey: ['listing', id], queryFn: () => api<Listing>(`/listings/${id}`) });
  const l = q.data;
  if (q.error)
    return (
      <div className="container-x py-16">
        <ErrorNote error={q.error} />
      </div>
    );
  if (!l) return <div className="min-h-[60vh]" aria-busy="true" />;
  const purchasable = !l.quoteOnly && l.price && (l.stock === null || l.stock > 0);
  const need = (fn: () => void) => (me ? fn() : openLogin());

  return (
    <div className="container-x pt-8 pb-16">
      <Link to="/explorar" className="btn btn-sm mb-6">
        <ArrowLeft size={14} /> {t('explore.title')}
      </Link>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="card-glass grid place-items-center p-10">
          <ResourceIcon category={l.category} size={120} strokeWidth={0.8} className="text-amber/80" aria-hidden="true" />
        </section>
        <section className="panel">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {l.isDemo && <DemoBadge />}
            <TrustLabel trust={l.supplier.trust} />
          </div>
          <h1 className="display text-4xl">{l.title}</h1>
          <p className="mt-2 text-muted">
            <Link to={`/proveedores/${l.supplier.id}`} className="underline decoration-amber/40 underline-offset-4 hover:text-cream">
              {l.supplier.name}
            </Link>{' '}
            · <Rating rating={l.supplier.rating} />
          </p>
          <p className="mt-6 text-3xl font-semibold">
            {l.price ? <Money amount={l.price.amount} currency={l.price.currency} /> : t('results.priceUnknown')}
          </p>
          <p className="text-sm text-muted">
            {t('common.perUnit', { unit: l.unit })} · {t('explore.minQty', { count: l.minQty })} ·{' '}
            {l.stock === null ? t('explore.stockAsk') : t('explore.stock', { count: l.stock })}
          </p>
          <p className="mt-4 text-cream/85">{l.description}</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            {Object.entries(l.specs).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line-soft px-3 py-2">
                <dt className="text-xs text-muted capitalize">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div className="rounded-xl border border-line-soft px-3 py-2">
              <dt className="text-xs text-muted">{t('explore.warranty')}</dt>
              <dd>{l.warranty || '—'}</dd>
            </div>
            <div className="rounded-xl border border-line-soft px-3 py-2">
              <dt className="text-xs text-muted">{t('explore.shipsTo')}</dt>
              <dd>{l.shipsTo.join(', ')}</dd>
            </div>
            <div className="rounded-xl border border-line-soft px-3 py-2">
              <dt className="text-xs text-muted">{t('delivery.shippingBySupplier')}</dt>
              <dd>
                <Money amount={l.shipping.amount} currency={l.shipping.currency} />
              </dd>
            </div>
            {l.pickup && (
              <div className="rounded-xl border border-line-soft px-3 py-2">
                <dt className="text-xs text-muted">{t('delivery.pickupTitle')}</dt>
                <dd>{t('delivery.pickupAvailable', { city: l.pickup.city ?? '—' })}</dd>
              </div>
            )}
            <div className="rounded-xl border border-line-soft px-3 py-2">
              <dt className="text-xs text-muted">{t('results.sortTime')}</dt>
              <dd>{l.leadTimeDays === null ? t('results.leadUnknown') : t('results.leadTime', { count: l.leadTimeDays })}</dd>
            </div>
          </dl>
          <p className="hint mt-4">{t('trust.kybNote')}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {purchasable && (
              <button type="button" className="btn btn-primary btn-lg" onClick={() => need(() => setBuy(true))}>
                {t('explore.buy')}
              </button>
            )}
            <button type="button" className="btn btn-lg" onClick={() => need(() => setRfq(true))}>
              {t('common.requestQuote')}
            </button>
          </div>
        </section>
      </div>
      {buy && l.price && (
        <BuyDialog
          open
          onClose={() => setBuy(false)}
          listing={{
            id: l.id,
            title: l.title,
            price: l.price,
            minQty: l.minQty,
            supplierName: l.supplier.name,
            shipping: l.shipping,
            pickup: l.pickup,
            shipsTo: l.shipsTo,
            originCountry: l.origin.country,
          }}
        />
      )}
      {rfq && <RfqDialog open onClose={() => setRfq(false)} title={l.title} listingId={l.id} defaultQuantity={l.minQty} />}
    </div>
  );
}
