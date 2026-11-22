import { addMoney, fromUnits, toUnits } from '@jucumari/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Link2, MessageCircle, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Busy, DemoBadge, ErrorNote, Money, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

interface MyLink {
  id: string;
  url: string;
  title: string;
  total: string;
  currency: string;
  mode: 'full' | 'partial';
  advance: string;
  status: 'active' | 'accepted' | 'expired' | 'cancelled';
  orderId: string | null;
  orderStatus: string | null;
}

const DEC = /^\d{1,13}(\.\d{1,7})?$/;
const safe = (v: string) => (DEC.test(v) ? v : '0');

/**
 * Importadora: crea el enlace de checkout privado y lo comparte por WhatsApp.
 * La conversación sigue en el chat; solo el pago pasa por Montuno.
 */
export default function Sell() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const org = useQuery({ queryKey: ['my-org'], queryFn: () => api<{ id: string; name: string } | null>('/supplier/org') });
  const links = useQuery({ queryKey: ['my-links'], queryFn: () => api<MyLink[]>('/links/mine'), enabled: Boolean(org.data) });
  const [f, setF] = useState({
    title: '',
    productUrl: '',
    description: '',
    price: '',
    shipping: '0',
    deliveryDays: '20',
    mode: 'full' as 'full' | 'partial',
    advancePct: '30',
  });
  const [made, setMade] = useState<{ url: string; title: string; total: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const total = addMoney(safe(f.price), safe(f.shipping));
  const pct = Math.min(70, Math.max(5, Number(f.advancePct) || 0));
  const advance = f.mode === 'partial' ? fromUnits((toUnits(total) * BigInt(pct)) / 100n) : '0';
  const protectedAmt = fromUnits(toUnits(total) - toUnits(advance));
  const valid = f.title.trim().length >= 3 && DEC.test(f.price) && toUnits(safe(f.price)) > 0n && Number(f.deliveryDays) >= 1;

  const create = useMutation({
    mutationFn: () =>
      api<{ id: string; url: string }>('/links', {
        method: 'POST',
        json: {
          title: f.title.trim(),
          productUrl: f.productUrl.trim() || undefined,
          description: f.description.trim() || undefined,
          price: f.price,
          shipping: safe(f.shipping),
          deliveryDays: Number(f.deliveryDays),
          mode: f.mode,
          advance: f.mode === 'partial' ? advance : undefined,
        },
      }),
    onSuccess: (r) => {
      setMade({ url: r.url, title: f.title.trim(), total });
      setCopied(false);
      void qc.invalidateQueries({ queryKey: ['my-links'] });
    },
  });

  const share = (m: { url: string; title: string; total: string }) =>
    `https://wa.me/?text=${encodeURIComponent(t('sell.waText', { title: m.title, total: `${m.total} USD`, url: m.url }))}`;

  if (org.isSuccess && !org.data)
    return (
      <div className="container-x pt-10 pb-16">
        <PageHeader title={t('sell.title')} subtitle={t('sell.subtitle')} />
        <section className="lglass max-w-xl p-6">
          <p className="mb-4">{t('sell.needOrg')}</p>
          <Link to="/proveedor" className="btn btn-primary">
            {t('sell.registerOrg')}
          </Link>
        </section>
      </div>
    );

  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader title={t('sell.title')} subtitle={t('sell.subtitle')} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <form
          className="panel grid gap-4 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) create.mutate();
          }}
        >
          <label className="block md:col-span-2">
            <span className="label">{t('sell.product')}</span>
            <input
              className="field"
              required
              minLength={3}
              maxLength={120}
              placeholder={t('sell.productPh')}
              value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="label">{t('sell.productUrl')}</span>
            <input
              className="field"
              type="url"
              maxLength={500}
              placeholder="https://www.amazon.com/…"
              value={f.productUrl}
              onChange={(e) => setF({ ...f, productUrl: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">{t('sell.price')} (USD)</span>
            <input
              className="field"
              inputMode="decimal"
              required
              pattern="\d+(\.\d{1,7})?"
              value={f.price}
              onChange={(e) => setF({ ...f, price: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">{t('sell.shipping')} (USD)</span>
            <input
              className="field"
              inputMode="decimal"
              pattern="\d+(\.\d{1,7})?"
              value={f.shipping}
              onChange={(e) => setF({ ...f, shipping: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">{t('sell.deliveryDays')}</span>
            <input
              className="field"
              inputMode="numeric"
              value={f.deliveryDays}
              onChange={(e) => setF({ ...f, deliveryDays: e.target.value.replace(/\D/g, '') })}
            />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="label">{t('sell.mode')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['full', 'partial'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={f.mode === m}
                  onClick={() => setF({ ...f, mode: m })}
                  className={`rounded-2xl border p-4 text-left transition ${f.mode === m ? 'border-oro bg-white shadow-[0_10px_30px_-18px_rgb(11_44_72/.6)]' : 'border-ink/10 bg-white/50 hover:bg-white/80'}`}
                >
                  <span className="block font-semibold">{t(`sell.modes.${m}.title`)}</span>
                  <span className="mt-1 block text-sm text-ink-2">{t(`sell.modes.${m}.body`)}</span>
                </button>
              ))}
            </div>
          </fieldset>
          {f.mode === 'partial' && (
            <label className="block md:col-span-2">
              <span className="label">
                {t('sell.advance')}: {pct} % · <Money amount={advance} currency="USD" />
              </span>
              <input
                type="range"
                min={5}
                max={70}
                step={5}
                className="w-full accent-[#0b2c48]"
                value={pct}
                onChange={(e) => setF({ ...f, advancePct: e.target.value })}
              />
              <span className="hint">{t('sell.advanceNote')}</span>
            </label>
          )}
          <label className="block md:col-span-2">
            <span className="label">{t('sell.notes')}</span>
            <textarea
              className="field"
              maxLength={1000}
              rows={3}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </label>
          <ErrorNote error={create.error} />
          <button className="btn btn-primary md:col-span-2" disabled={!valid || create.isPending}>
            {create.isPending ? <Busy /> : <Link2 size={16} />} {t('sell.create')}
          </button>
        </form>

        <aside className="space-y-6">
          {/* Vista previa: lo que verá el comprador */}
          <section className="lglass p-6">
            <p className="eyebrow mb-3 text-oro">{t('sell.preview')}</p>
            <p className="text-lg font-semibold">{f.title || t('sell.productPh')}</p>
            <p className="mt-2 font-display text-4xl">
              <Money amount={total} currency="USD" />
            </p>
            <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
              {f.mode === 'partial' && <span className="bg-[#7d93a8]" style={{ width: `${pct}%` }} />}
              <span className="bg-oro" style={{ width: `${f.mode === 'partial' ? 100 - pct : 100}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-ink-2">
              <span>{f.mode === 'partial' ? t('sell.advanceShort', { amount: advance }) : t('sell.fullShort')}</span>
              <span>
                <ShieldCheck size={12} className="mr-1 inline" />
                {t('sell.protectedShort', { amount: protectedAmt })}
              </span>
            </div>
          </section>

          {made && (
            <section className="lglass p-6" aria-live="polite">
              <p className="mb-2 font-semibold text-success">{t('sell.ready')}</p>
              <p className="mb-4 rounded-xl bg-white/70 px-3 py-2 font-mono text-xs break-all">{made.url}</p>
              <div className="flex flex-wrap gap-2">
                <a className="btn btn-primary btn-sm" href={share(made)} target="_blank" rel="noreferrer">
                  <MessageCircle size={15} /> {t('sell.shareWa')}
                </a>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void navigator.clipboard?.writeText(made.url).then(() => setCopied(true))}
                >
                  <Copy size={14} /> {copied ? t('sell.copied') : t('sell.copy')}
                </button>
                <a className="btn btn-sm" href={made.url} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> {t('sell.open')}
                </a>
              </div>
            </section>
          )}

          <section className="lglass p-6">
            <h2 className="mb-3 font-semibold">{t('sell.mine')}</h2>
            {links.data?.length === 0 && <p className="text-sm text-ink-2">{t('sell.none')}</p>}
            <ul className="space-y-3">
              {links.data?.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/10 bg-white/60 px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{l.title}</span>
                  <Money amount={l.total} currency={l.currency} />
                  <span className="chip">{t(`sell.status.${l.status}`)}</span>
                  {l.mode === 'partial' && <DemoBadge label={t('sell.withAdvance')} />}
                  {l.orderId ? (
                    <Link to={`/pedidos/${l.orderId}`} className="text-oro underline underline-offset-4">
                      {t('sell.seeOrder')}
                    </Link>
                  ) : (
                    <a
                      className="text-oro underline underline-offset-4"
                      href={share({ url: l.url, title: l.title, total: l.total })}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
