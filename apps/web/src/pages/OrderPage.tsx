import { DISPUTE_REASONS } from '@jucumari/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, QrCode, ShieldCheck, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Busy, DemoBadge, Dialog, ErrorNote, Money, TestnetBadge, TrustLabel } from '@/components/ui';
import { QrPayment } from '@/features/payments/QrPayment';
import { type TxStage, useSignedAction } from '@/features/payments/useEscrowTx';
import { api } from '@/lib/api';
import type { OrderDetail } from '@/lib/types';

interface WalletInfo {
  address: string;
  hasTrustline: boolean;
  balance: string | null;
}

const EXPLORER = 'https://stellar.expert/explorer/testnet';

function Stage({ stage }: { stage: TxStage }) {
  const { t } = useTranslation();
  const text = {
    idle: '',
    preparing: t('order.signing'),
    signing: t('order.signing'),
    submitting: t('order.submitting'),
    confirmed: t('order.confirmed'),
    failed: t('order.failed'),
  }[stage];
  if (!text) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={`text-sm ${stage === 'failed' ? 'text-danger' : stage === 'confirmed' ? 'text-success' : 'text-cream/80'}`}
    >
      {text}
    </p>
  );
}

export default function OrderPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const sa = useSignedAction();
  const [payWith, setPayWith] = useState<'qr' | 'wallet'>('qr');
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState<(typeof DISPUTE_REASONS)[number]>('not_delivered');
  const [narrative, setNarrative] = useState('');
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [rating, setRating] = useState(5);

  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDetail>(`/orders/${id}`), refetchInterval: 15_000 });
  const o = q.data;
  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<WalletInfo>('/payments/wallet'),
    enabled: Boolean(o && (o.role === 'buyer' || o.role === 'supplier')),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['order', id] });
  const openEscrow = useMutation({ mutationFn: () => api(`/orders/${id}/escrow`, { method: 'POST' }), onSuccess: refresh });
  const supplierUpdate = useMutation({
    mutationFn: (status: string) =>
      api(`/orders/${id}/supplier-update`, {
        method: 'POST',
        json: { status, carrier: carrier || undefined, tracking: tracking || undefined },
      }),
    onSuccess: refresh,
  });
  const startReview = useMutation({ mutationFn: () => api(`/orders/${id}/review-start`, { method: 'POST' }), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => api(`/orders/${id}/cancel`, { method: 'POST' }), onSuccess: refresh });
  const rate = useMutation({
    mutationFn: () => api(`/orders/${id}/rating`, { method: 'POST', json: { supplierRating: rating } }),
    onSuccess: refresh,
  });
  const dispute = useMutation({
    mutationFn: () =>
      api<{ disputeId: string; tx: { txId: string; unsignedXdr: string; networkPassphrase: string } }>(`/orders/${id}/disputes`, {
        method: 'POST',
        json: { reason, narrative },
      }),
    onSuccess: async (r) => {
      await sa.prepared(r.tx);
      setDisputeOpen(false);
      void nav(`/disputas/${r.disputeId}`);
    },
  });

  if (q.error)
    return (
      <div className="container-x py-16">
        <ErrorNote error={q.error} />
      </div>
    );
  if (!o) return <div className="min-h-[60vh]" aria-busy="true" />;
  const e = o.escrow;
  const balanceOk = wallet.data?.balance !== null && wallet.data?.balance !== undefined && Number(wallet.data.balance) >= Number(o.amount);
  const busy = sa.stage === 'preparing' || sa.stage === 'signing' || sa.stage === 'submitting';

  return (
    <div className="container-x pt-8 pb-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">{t('order.title')}</p>
          <h1 className="display text-4xl">{o.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Link to={`/proveedores/${o.supplier.id}`} className="hover:text-cream">
              {o.supplier.name}
            </Link>
            <TrustLabel trust={o.supplier.trust} />
            {o.isDemo && <DemoBadge />}
            <TestnetBadge />
          </p>
        </div>
        <div className="text-right">
          <span className="chip text-sm">{t(`order.status.${o.status}`)}</span>
          {e && <p className="mt-2 text-xs text-muted">Escrow: {t(`order.escrow.${e.status}`)}</p>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {/* ───────── Pago protegido (comprador) ───────── */}
          {o.role === 'buyer' && o.status === 'pending_payment' && (
            <section className="panel" data-no-halo>
              <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
                <ShieldCheck size={20} className="text-amber" /> {t('order.checkoutTitle')}
              </h2>
              <p className="text-sm text-cream/90">{t('order.protection')}</p>
              <p className="mt-2 text-xs text-muted">{t('order.limits')}</p>
              <dl className="my-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt>{t('order.amount')}</dt>
                  <dd>
                    <Money amount={o.amount} currency={o.currency} />
                  </dd>
                </div>
                <div className="flex justify-between text-muted">
                  <dt>
                    {t('order.fee')} ({o.platformFee.percent} %)
                  </dt>
                  <dd>
                    <Money amount={o.platformFee.amount} currency={o.currency} />
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line-soft pt-2 text-base font-semibold">
                  <dt>{t('order.total')}</dt>
                  <dd className="text-amber-2">
                    {o.amount} {o.escrowConfig.asset.code}
                  </dd>
                </div>
              </dl>
              <p className="mb-4 text-xs text-teal">{t('order.testToken', { code: o.escrowConfig.asset.code })}</p>

              {!o.escrowConfig.enabled ? (
                <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                  {t('order.escrowNotReady', { missing: o.escrowConfig.missing.join(', ') })}
                </p>
              ) : !e?.contractId ? (
                <button
                  type="button"
                  className="btn btn-primary btn-lg w-full"
                  disabled={openEscrow.isPending}
                  onClick={() => openEscrow.mutate()}
                >
                  {openEscrow.isPending && <Busy />} {t('order.startEscrow')}
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={`btn btn-lg flex-1 ${payWith === 'qr' ? 'btn-primary' : ''}`}
                      onClick={() => setPayWith('qr')}
                    >
                      <QrCode size={18} /> {t('order.payQr')}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm self-center ${payWith === 'wallet' ? 'btn-primary' : ''}`}
                      onClick={() => setPayWith('wallet')}
                    >
                      <Wallet size={14} /> {t('order.payWallet')}
                    </button>
                  </div>
                  {wallet.data && (
                    <p className="text-xs text-muted">
                      {t('order.balance', { amount: wallet.data.balance ?? '0', code: o.escrowConfig.asset.code })}
                      {!balanceOk && ` · ${t('order.insufficient')}`}
                    </p>
                  )}
                  {payWith === 'qr' && !balanceOk && (
                    <QrPayment
                      orderId={o.id}
                      tokenAmount={o.amount}
                      hasTrustline={Boolean(wallet.data?.hasTrustline)}
                      onActivate={() => void sa.trustline()}
                    />
                  )}
                  {payWith === 'wallet' && !wallet.data?.hasTrustline && (
                    <button type="button" className="btn btn-sm" onClick={() => void sa.trustline()}>
                      {t('order.activateToken')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    disabled={!balanceOk || busy}
                    onClick={() => void sa.escrow(o.id, 'fund')}
                  >
                    {busy && <Busy />} {t('order.fund')}
                  </button>
                </div>
              )}
              <div className="mt-3 space-y-2">
                <Stage stage={sa.stage} />
                <ErrorNote error={openEscrow.error ?? sa.error} />
              </div>
              <button type="button" className="btn btn-sm mt-4 text-muted" onClick={() => cancel.mutate()}>
                {t('order.cancel')}
              </button>
            </section>
          )}

          {/* ───────── Recepción (comprador) ───────── */}
          {o.role === 'buyer' && ['delivery_notified', 'in_review'].includes(o.status) && (
            <section className="panel border-amber/40">
              <p className="mb-4 font-semibold">{t('order.deliveryNotified')}</p>
              {o.status === 'delivery_notified' ? (
                <button type="button" className="btn btn-primary" onClick={() => startReview.mutate()}>
                  {t('order.startReview')}
                </button>
              ) : (
                <>
                  <p className="mb-3 text-sm text-warning">{t('order.acceptWarn')}</p>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void sa.escrow(o.id, 'approve')}>
                    {busy && <Busy />} {t('order.acceptDelivery')}
                  </button>
                  <Stage stage={sa.stage} />
                  <ErrorNote error={sa.error} />
                </>
              )}
            </section>
          )}

          {/* ───────── Proveedor ───────── */}
          {o.role === 'supplier' && (
            <section className="panel">
              <h2 className="mb-3 text-lg font-semibold">{t('order.supplierActions')}</h2>
              {wallet.data && !wallet.data.hasTrustline && (
                <button type="button" className="btn btn-sm mb-3" onClick={() => void sa.trustline()}>
                  {t('supplier.activatePayouts')}
                </button>
              )}
              {o.status === 'funded' && (
                <button type="button" className="btn" onClick={() => supplierUpdate.mutate('preparing')}>
                  {t('order.markPreparing')}
                </button>
              )}
              {['funded', 'preparing'].includes(o.status) && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input
                    aria-label={t('order.carrier')}
                    className="field"
                    placeholder={t('order.carrier')}
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                  />
                  <input
                    aria-label={t('order.trackingCode')}
                    className="field"
                    placeholder={t('order.trackingCode')}
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                  />
                  <button type="button" className="btn btn-primary" onClick={() => supplierUpdate.mutate('shipped')}>
                    {t('order.markShipped')}
                  </button>
                </div>
              )}
              {o.status === 'shipped' && (
                <button type="button" className="btn btn-primary" onClick={() => supplierUpdate.mutate('delivery_notified')}>
                  {t('order.markDelivered')}
                </button>
              )}
              <p className="hint mt-3">{t('order.simulatedLogistics')}</p>
              <Stage stage={sa.stage} />
              <ErrorNote error={supplierUpdate.error ?? sa.error} />
            </section>
          )}

          {/* ───────── Valoración ───────── */}
          {o.role === 'buyer' && o.status === 'completed' && (
            <section className="panel">
              {o.reviewed ? (
                <p className="text-success">{t('order.rated')}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-semibold">{t('order.rate')}</span>
                  <div role="radiogroup" aria-label={t('order.rate')} className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={rating === n}
                        aria-label={`${n}`}
                        className={`text-2xl ${n <= rating ? 'text-amber' : 'text-line'}`}
                        onClick={() => setRating(n)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => rate.mutate()}>
                    {t('common.save')}
                  </button>
                </div>
              )}
            </section>
          )}
        </div>

        <aside className="space-y-6">
          <section className="panel">
            <h2 className="mb-3 font-semibold">{t('order.tracking')}</h2>
            <ol className="space-y-2 text-sm">
              {['pending_payment', 'funded', 'preparing', 'shipped', 'delivery_notified', 'in_review', 'accepted', 'completed'].map((s) => {
                const order = [
                  'pending_payment',
                  'funded',
                  'preparing',
                  'shipped',
                  'delivery_notified',
                  'in_review',
                  'accepted',
                  'completed',
                ];
                const done = order.indexOf(o.status) >= order.indexOf(s) && o.status !== 'cancelled';
                return (
                  <li key={s} className={`flex items-center gap-2 ${done ? 'text-cream' : 'text-muted/60'}`}>
                    <span className={`h-2 w-2 rounded-full ${done ? 'bg-amber' : 'bg-line'}`} aria-hidden="true" /> {t(`order.status.${s}`)}
                  </li>
                );
              })}
            </ol>
            {o.shipments.map((s) => (
              <p key={s.id} className="mt-3 text-xs text-muted">
                {s.carrier} {s.tracking && `· ${s.tracking}`} {s.isSimulated && <DemoBadge label={t('order.simulatedLogistics')} />}
              </p>
            ))}
          </section>

          {e && (
            <section className="panel">
              <h2 className="mb-3 font-semibold">{t('order.receipt')}</h2>
              {e.contractId && (
                <a
                  className="flex items-center gap-1 text-xs break-all text-teal hover:underline"
                  href={`${EXPLORER}/contract/${e.contractId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {e.contractId} <ExternalLink size={12} />
                </a>
              )}
              <ul className="mt-3 space-y-1.5 text-xs">
                {e.txs.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {x.action} ·{' '}
                      <span className={x.status === 'confirmed' ? 'text-success' : x.status === 'failed' ? 'text-danger' : 'text-muted'}>
                        {x.status}
                      </span>
                    </span>
                    {x.tx_hash && x.status === 'confirmed' && (
                      <a className="text-teal hover:underline" href={`${EXPLORER}/tx/${x.tx_hash}`} target="_blank" rel="noreferrer">
                        {t('order.explorer')}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(o.role === 'buyer' || o.role === 'supplier') && e && ['funded', 'approval_pending'].includes(e.status) && !o.dispute && (
            <button type="button" className="btn w-full border-danger/40 text-danger" onClick={() => setDisputeOpen(true)}>
              {t('order.openDispute')}
            </button>
          )}
          {o.dispute && (
            <Link to={`/disputas/${o.dispute.id}`} className="btn w-full">
              {t('dispute.title')} · {t(`dispute.status.${o.dispute.status}`)}
            </Link>
          )}
        </aside>
      </div>

      <Dialog open={disputeOpen} onClose={() => setDisputeOpen(false)} title={t('order.openDispute')} noHalo>
        <form
          className="space-y-4"
          onSubmit={(ev) => {
            ev.preventDefault();
            dispute.mutate();
          }}
        >
          <label className="block">
            <span className="label">{t('dispute.reason')}</span>
            <select className="field" value={reason} onChange={(ev) => setReason(ev.target.value as typeof reason)}>
              {DISPUTE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(`dispute.reasons.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('dispute.narrative')}</span>
            <textarea
              className="field min-h-28"
              required
              minLength={10}
              maxLength={4000}
              value={narrative}
              onChange={(ev) => setNarrative(ev.target.value)}
            />
          </label>
          <p className="hint">{t('dispute.privateNote')}</p>
          <ErrorNote error={dispute.error ?? sa.error} />
          <button className="btn btn-primary w-full" disabled={dispute.isPending || busy}>
            {(dispute.isPending || busy) && <Busy />} {t('dispute.open')}
          </button>
        </form>
      </Dialog>
    </div>
  );
}
