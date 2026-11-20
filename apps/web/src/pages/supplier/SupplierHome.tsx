import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '@/app/auth';
import { Busy, DemoBadge, ErrorNote, Money, PageHeader, TrustLabel } from '@/components/ui';
import { COUNTRIES } from '@/features/assistant/Wizard';
import { api } from '@/lib/api';
import type { Listing } from '@/lib/types';

interface Org {
  id: string;
  name: string;
  trust: string;
  isDemo: boolean;
}
interface SupplierOrder {
  id: string;
  title: string;
  amount: string;
  currency: string;
  status: string;
  is_demo: boolean;
}

const DEMO_ORG = '10000000-0000-4000-8000-000000000001';

/** Inicio del proveedor: actividad y accesos contextuales (sin pestañas nuevas). */
export default function SupplierHome() {
  const { t } = useTranslation();
  const { config } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', country: 'BO', city: '' });
  const org = useQuery({ queryKey: ['my-org'], queryFn: () => api<Org | null>('/supplier/org') });
  const listings = useQuery({ queryKey: ['my-listings'], queryFn: () => api<Listing[]>('/supplier/listings'), enabled: Boolean(org.data) });
  const orders = useQuery({
    queryKey: ['orders', 'supplier'],
    queryFn: () => api<SupplierOrder[]>('/orders?as=supplier'),
    enabled: Boolean(org.data),
  });
  const rfqs = useQuery({ queryKey: ['supplier-rfqs', ''], queryFn: () => api<unknown[]>('/supplier/rfqs'), enabled: Boolean(org.data) });
  const create = useMutation({
    mutationFn: () =>
      api('/supplier/org', { method: 'POST', json: { ...form, city: form.city || undefined, description: form.description || undefined } }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const demoJoin = useMutation({
    mutationFn: () => api(`/supplier/demo-join/${DEMO_ORG}`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries(),
  });

  if (org.isLoading) return <div className="min-h-[60vh]" aria-busy="true" />;
  if (!org.data)
    return (
      <div className="container-x pt-10 pb-16">
        <PageHeader title={t('supplier.createOrg')} />
        <form
          className="panel grid max-w-2xl gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label>
            <span className="label">{t('supplier.orgName')}</span>
            <input
              className="field"
              required
              minLength={2}
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            <span className="label">{t('supplier.description')}</span>
            <textarea
              className="field"
              maxLength={1000}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">{t('wizard.country')}</span>
              <select className="field" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">{t('wizard.city')}</span>
              <input className="field" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </label>
          </div>
          <ErrorNote error={create.error} />
          <button className="btn btn-primary" disabled={create.isPending}>
            {create.isPending && <Busy />} {t('supplier.createOrg')}
          </button>
        </form>
        {config?.demoMode && (
          <div className="card-glass mt-6 max-w-2xl rounded-2xl border-dashed p-5">
            <p className="mb-2 text-sm text-cream/90">{t('supplier.demoJoinHint')}</p>
            <button type="button" className="btn btn-sm" onClick={() => demoJoin.mutate()} disabled={demoJoin.isPending}>
              {t('supplier.demoJoin')}
            </button>
            <ErrorNote error={demoJoin.error} />
          </div>
        )}
      </div>
    );

  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader
        eyebrow={t('supplier.homeTitle')}
        title={org.data.name}
        actions={
          <div className="flex items-center gap-2">
            {org.data.isDemo && <DemoBadge />}
            <TrustLabel trust={org.data.trust} />
          </div>
        }
      />
      <dl className="mb-10 grid grid-cols-3 gap-4">
        {[
          [t('supplier.stats.listings'), listings.data?.length ?? 0, '/proveedor/publicar'],
          [t('supplier.stats.rfqs'), rfqs.data?.length ?? 0, '/proveedor/negocios'],
          [t('supplier.stats.orders'), orders.data?.length ?? 0, '#pedidos'],
        ].map(([label, n, to]) => (
          <Link key={String(label)} to={String(to)} className="card-glass p-5 hover:border-amber/40">
            <dt className="text-xs text-muted uppercase">{label}</dt>
            <dd className="display mt-1 text-4xl">{n}</dd>
          </Link>
        ))}
      </dl>
      <h2 id="pedidos" className="display mb-4 text-2xl">
        {t('order.myOrders')}
      </h2>
      <ul className="grid gap-3">
        {orders.data?.map((o) => (
          <li key={o.id}>
            <Link to={`/pedidos/${o.id}`} className="panel flex flex-wrap items-center justify-between gap-3 py-4 hover:border-amber/40">
              <span className="font-semibold">{o.title}</span>
              <Money amount={o.amount} currency={o.currency} />
              <span className="chip">{t(`order.status.${o.status}`)}</span>
              {o.is_demo && <DemoBadge />}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
