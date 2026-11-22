import type { CheckoutView } from '@jucumari/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useAuth } from '@/app/auth';
import { Busy, DemoBadge, ErrorNote, Money, TestnetBadge, TrustLabel } from '@/components/ui';
import { type DeliveryDraft, emptyDelivery, toDeliveryInput } from '@/features/procurement/delivery';
import { DeliveryFields } from '@/features/procurement/DeliveryFields';
import { api } from '@/lib/api';

/**
 * Checkout privado que la importadora manda por WhatsApp. Se puede ver sin cuenta; para pagar, el
 * comprador entra, acepta el aviso de riesgo exacto (queda registrado con su hash) y deja su dirección.
 */
export default function Checkout() {
  const { token = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { me, openLogin } = useAuth();
  const q = useQuery({ queryKey: ['checkout', token], queryFn: () => api<CheckoutView>(`/checkout/${token}`) });
  const [delivery, setDelivery] = useState<DeliveryDraft>(() => emptyDelivery('BO'));
  const [agree, setAgree] = useState(false);
  const input = toDeliveryInput(delivery);
  const c = q.data;
  const accept = useMutation({
    mutationFn: () =>
      api<{ orderId: string }>(`/checkout/${token}/accept`, {
        method: 'POST',
        json: { delivery: input, disclosureVersion: c!.disclosure.version, disclosureHash: c!.disclosure.hash },
      }),
    onSuccess: (r) => void nav(`/pedidos/${r.orderId}`),
  });

  if (q.error)
    return (
      <div className="container-x py-16">
        <ErrorNote error={q.error} />
      </div>
    );
  if (!c) return <div className="min-h-[60vh]" aria-busy="true" />;
  const partial = c.mode === 'partial';
  const pct = Number(c.total) > 0 ? Math.round((Number(c.advance) / Number(c.total)) * 100) : 0;
  const open = c.status === 'active';

  return (
    <div className="container-x pt-10 pb-16">
      <div className="mb-8 max-w-3xl">
        <p className="eyebrow mb-3 flex items-center gap-2">
          <Lock size={14} /> {t('checkout.eyebrow')}
        </p>
        <h1 className="display text-4xl text-white lg:text-5xl">{c.title}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-2 text-muted">
          {t('checkout.from', { name: c.seller.name })} {c.seller.city && `· ${c.seller.city}`}
          <TrustLabel trust={c.seller.trust} />
          {c.isDemo && <DemoBadge />}
          <TestnetBadge />
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="lglass p-7">
          <p className="font-display text-5xl">
            <Money amount={c.total} currency={c.currency} />
          </p>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between border-b border-ink/10 pb-2">
              <dt>{t('checkout.product')}</dt>
              <dd>
                <Money amount={c.price} currency={c.currency} />
              </dd>
            </div>
            <div className="flex justify-between border-b border-ink/10 pb-2">
              <dt>{t('checkout.shipping')}</dt>
              <dd>
                <Money amount={c.shipping} currency={c.currency} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>{t('checkout.arrives')}</dt>
              <dd>{t('checkout.days', { count: c.deliveryDays })}</dd>
            </div>
          </dl>

          <div className="mt-7 flex h-3 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
            {partial && <span className="bg-[#7d93a8]" style={{ width: `${pct}%` }} />}
            <span className="bg-oro" style={{ width: `${partial ? 100 - pct : 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-2">
            <span>{partial ? t('checkout.advanceLegend', { pct, amount: c.advance }) : t('checkout.fullLegend')}</span>
            <span className="font-semibold text-oro">
              <ShieldCheck size={12} className="mr-1 inline" />
              {t('checkout.protectedLegend', { amount: c.protectedAmount })}
            </span>
          </div>

          {c.description && <p className="mt-6 text-sm whitespace-pre-line text-ink-2">{c.description}</p>}
          {c.productUrl && (
            <a
              href={c.productUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 inline-flex items-center gap-1 text-sm text-oro underline underline-offset-4"
            >
              {t('checkout.seeProduct')} <ExternalLink size={13} />
            </a>
          )}
          <ol className="mt-8 space-y-3 text-sm">
            {(['s1', 's2', 's3'] as const).map((k, i) => (
              <li key={k} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-oro text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <span>{t(`checkout.steps.${k}`)}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lglass p-7">
          {!open ? (
            <p className="text-lg">{t(`checkout.closed.${c.status}`)}</p>
          ) : !me ? (
            <div>
              <p className="mb-4">{t('checkout.signInFirst')}</p>
              <button type="button" className="btn btn-primary btn-lg w-full" onClick={openLogin}>
                {t('checkout.signIn')}
              </button>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (input && agree) accept.mutate();
              }}
            >
              <h2 className="text-lg font-semibold">{t('checkout.deliveryTitle')}</h2>
              <DeliveryFields value={delivery} onChange={setDelivery} countries={['BO']} />
              <div
                className={`rounded-2xl border p-4 text-sm ${partial ? 'border-warning/50 bg-warning/10' : 'border-ink/10 bg-white/60'}`}
              >
                <p className="mb-2 text-xs font-semibold tracking-wide text-ink-2 uppercase">
                  {t('checkout.disclosure')} · {c.disclosure.version}
                </p>
                <p>{c.disclosure.text}</p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 accent-[#0b2c48]"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  required
                />
                {t('checkout.agree')}
              </label>
              <ErrorNote error={accept.error} />
              <button type="submit" className="btn btn-primary btn-lg w-full" disabled={!input || !agree || accept.isPending}>
                {accept.isPending ? <Busy /> : <ShieldCheck size={18} />} {t('checkout.acceptAndPay')}
              </button>
              <p className="hint">{t('checkout.afterNote')}</p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
