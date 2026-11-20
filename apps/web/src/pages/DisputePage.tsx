import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Lock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Busy, DemoBadge, ErrorNote, Money, PageHeader } from '@/components/ui';
import { useSignedAction } from '@/features/payments/useEscrowTx';
import { api } from '@/lib/api';

interface Dispute {
  id: string;
  role: 'buyer' | 'supplier' | 'arbiter';
  orderId: string;
  orderTitle: string;
  amount: string;
  currency: string;
  reason: string;
  narrative: string;
  status: string;
  evidenceDeadline: string | null;
  decision: { buyer: string; supplier: string; rationale: string } | null;
  evidence: {
    id: string;
    mime: string;
    size_bytes: number;
    sha256: string;
    note: string;
    is_synthetic: boolean;
    mine: boolean;
    fromBuyer: boolean;
    created_at: string;
  }[];
  escrow: { status: string; amount: string; asset: { code: string } } | null;
}

export default function DisputePage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const sa = useSignedAction();
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [synthetic, setSynthetic] = useState(true);
  const [buyer, setBuyer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [rationale, setRationale] = useState('');
  const q = useQuery({ queryKey: ['dispute', id], queryFn: () => api<Dispute>(`/disputes/${id}`) });
  const upload = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.set('file', file!);
      fd.set('note', note);
      fd.set('synthetic', String(synthetic));
      return api(`/disputes/${id}/evidence`, { method: 'POST', body: fd });
    },
    onSuccess: () => {
      setFile(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: ['dispute', id] });
    },
  });
  const open = useMutation({
    mutationFn: (eid: string) => api<{ url: string }>(`/evidence/${eid}/url`),
    onSuccess: (r) => window.open(r.url, '_blank', 'noopener'),
  });
  const claim = useMutation({
    mutationFn: () => api(`/arbiter/cases/${id}/claim`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dispute', id] }),
  });
  const decide = useMutation({
    mutationFn: () =>
      api<{ tx: { txId: string; unsignedXdr: string; networkPassphrase: string } }>(`/arbiter/cases/${id}/decision`, {
        method: 'POST',
        json: { buyer, supplier, rationale },
      }),
    onSuccess: (r) => sa.prepared(r.tx),
  });
  const d = q.data;
  if (q.error)
    return (
      <div className="container-x py-16">
        <ErrorNote error={q.error} />
      </div>
    );
  if (!d) return <div className="min-h-[60vh]" aria-busy="true" />;
  const fmt = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en' : 'es', { dateStyle: 'medium', timeStyle: 'short' });
  const sumOk = buyer !== '' && supplier !== '' && Math.abs(Number(buyer) + Number(supplier) - Number(d.amount)) < 1e-7;

  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader
        eyebrow={t(`dispute.status.${d.status}`)}
        title={`${t('dispute.title')} · ${d.orderTitle}`}
        subtitle={t(`dispute.reasons.${d.reason}`)}
        actions={
          <Link to={`/pedidos/${d.orderId}`} className="btn btn-sm">
            {t('order.title')}
          </Link>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section className="space-y-6">
          <div className="panel">
            <p className="whitespace-pre-line text-cream/90">{d.narrative}</p>
            <p className="mt-3 text-sm text-muted">
              <Money amount={d.amount} currency={d.currency} /> · Escrow: {d.escrow ? t(`order.escrow.${d.escrow.status}`) : '—'}
            </p>
            {d.evidenceDeadline && (
              <p className="mt-1 text-xs text-muted">{t('dispute.deadline', { date: fmt.format(new Date(d.evidenceDeadline)) })}</p>
            )}
          </div>
          <div className="panel">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <Lock size={15} className="text-amber" /> {t('dispute.evidence')}
            </h2>
            <p className="hint mb-4">{t('dispute.privateNote')}</p>
            <ul className="space-y-2 text-sm">
              {d.evidence.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line-soft px-3 py-2">
                  <span>
                    {e.fromBuyer ? '🛒' : '🏭'} {e.note || e.mime} {e.is_synthetic && <DemoBadge />}
                    <span className="block font-mono text-[10px] text-muted">sha256 {e.sha256.slice(0, 16)}…</span>
                  </span>
                  <button type="button" className="btn btn-sm" onClick={() => open.mutate(e.id)}>
                    {t('common.viewSource')}
                  </button>
                </li>
              ))}
            </ul>
            {d.role !== 'arbiter' && ['open', 'collecting_evidence', 'review'].includes(d.status) && (
              <form
                className="mt-4 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (file) upload.mutate();
                }}
              >
                <label className="label" htmlFor="ev-file">
                  {t('dispute.upload')}
                </label>
                <input
                  id="ev-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf,video/mp4"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
                <input
                  aria-label={t('dispute.note')}
                  className="field"
                  placeholder={t('dispute.note')}
                  value={note}
                  maxLength={500}
                  onChange={(e) => setNote(e.target.value)}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-amber" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} />{' '}
                  {t('dispute.synthetic')}
                </label>
                <button className="btn btn-sm" disabled={!file || upload.isPending}>
                  {upload.isPending ? <Busy /> : <FileUp size={14} />} {t('dispute.upload')}
                </button>
                <ErrorNote error={upload.error} />
              </form>
            )}
          </div>
        </section>

        <aside className="space-y-6">
          {d.decision && (
            <section className="panel border-amber/40">
              <h2 className="mb-2 font-semibold">{t('dispute.decision')}</h2>
              <p className="text-sm">
                {t('arbiter.buyerAmount')}: {d.decision.buyer} · {t('arbiter.supplierAmount')}: {d.decision.supplier}
              </p>
              <p className="mt-2 text-sm text-cream/80">{d.decision.rationale}</p>
            </section>
          )}
          {d.role === 'arbiter' && (
            <section className="panel" data-no-halo>
              <p className="mb-3 text-xs text-warning">{t('arbiter.demoNote')}</p>
              {d.status === 'collecting_evidence' || d.status === 'open' ? (
                <button type="button" className="btn btn-primary" onClick={() => claim.mutate()}>
                  {t('arbiter.claim')}
                </button>
              ) : d.status === 'review' || d.status === 'execution_pending' ? (
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    decide.mutate();
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="label">{t('arbiter.buyerAmount')}</span>
                      <input
                        className="field"
                        inputMode="decimal"
                        value={buyer}
                        onChange={(e) => setBuyer(e.target.value.replace(/[^\d.]/g, ''))}
                      />
                    </label>
                    <label>
                      <span className="label">{t('arbiter.supplierAmount')}</span>
                      <input
                        className="field"
                        inputMode="decimal"
                        value={supplier}
                        onChange={(e) => setSupplier(e.target.value.replace(/[^\d.]/g, ''))}
                      />
                    </label>
                  </div>
                  <p className={`text-xs ${sumOk ? 'text-success' : 'text-muted'}`}>{t('arbiter.sumMustMatch', { amount: d.amount })}</p>
                  <label className="block">
                    <span className="label">{t('arbiter.rationale')}</span>
                    <textarea
                      className="field min-h-24"
                      minLength={20}
                      required
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                    />
                  </label>
                  <button className="btn btn-primary w-full" disabled={!sumOk || decide.isPending}>
                    {decide.isPending && <Busy />} {t('arbiter.decide')}
                  </button>
                  <ErrorNote error={decide.error ?? sa.error} />
                </form>
              ) : null}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
