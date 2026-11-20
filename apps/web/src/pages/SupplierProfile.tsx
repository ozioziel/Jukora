import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { DemoBadge, ErrorNote, Money, PageHeader, Rating, TrustLabel } from '@/components/ui';
import { api } from '@/lib/api';
import type { Listing } from '@/lib/types';

interface Supplier {
  id: string;
  name: string;
  description: string;
  country: string;
  city: string;
  trust: string;
  isDemo: boolean;
  rating: { average: number; count: number } | null;
  reviews: { supplier_rating: number; comment: string; is_demo: boolean; created_at: string }[];
  listings: Listing[];
}

export default function SupplierProfile() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['supplier', id], queryFn: () => api<Supplier>(`/suppliers/${id}`) });
  const s = q.data;
  if (q.error)
    return (
      <div className="container-x py-16">
        <ErrorNote error={q.error} />
      </div>
    );
  if (!s) return <div className="min-h-[60vh]" aria-busy="true" />;
  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader
        eyebrow={[s.city, s.country].filter(Boolean).join(', ')}
        title={s.name}
        subtitle={s.description}
        actions={
          <div className="flex items-center gap-2">
            {s.isDemo && <DemoBadge />}
            <TrustLabel trust={s.trust} />
          </div>
        }
      />
      <p className="hint mb-8">{t('trust.kybNote')}</p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <h2 className="mb-4 text-xl font-semibold">{t('explore.supplierListings')}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {s.listings.map((l) => (
              <li key={l.id}>
                <Link to={`/explorar/articulos/${l.id}`} className="card-glass block p-4 hover:border-amber/40">
                  <p className="font-semibold">{l.title}</p>
                  <p className="text-sm text-muted">
                    {l.price ? <Money amount={l.price.amount} currency={l.price.currency} /> : t('results.priceUnknown')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">{t('explore.reviews')}</h2>
          <Rating rating={s.rating} />
          <ul className="mt-4 space-y-3">
            {s.reviews.map((r, i) => (
              <li key={i} className="panel py-3 text-sm">
                <span className="text-amber">{'★'.repeat(r.supplier_rating)}</span> {r.is_demo && <DemoBadge />}
                <p className="mt-1 text-cream/85">{r.comment}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
