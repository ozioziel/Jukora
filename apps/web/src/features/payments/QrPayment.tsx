import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Busy, ErrorNote } from '@/components/ui';
import { api } from '@/lib/api';

interface Ramp {
  id: string;
  isSimulated: boolean;
  fiat: { amount: string; currency: string };
  tokenAmount: string;
  tokenCode: string;
  status: string;
  reference: string;
  qrPayload: string | null;
  txHash: string | null;
  expiresAt: string;
}
interface PayConfig {
  simulatedRamp: { currency: string; ratePerUnit: string; feePercent: number; minutes: number } | null;
  pollar: { enabled: boolean; sandboxCurrencies: string[]; liveBobQr: boolean };
}

function QrSvg({ text }: { text: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import('qrcode').then((QR) =>
      QR.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#0b0d12', light: '#f3e9d7' } }).then(
        (s) => alive && setSvg(s),
      ),
    );
    return () => {
      alive = false;
    };
  }, [text]);
  return svg ? (
    <div className="w-52 overflow-hidden rounded-2xl" role="img" aria-label="QR" dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <div className="h-52 w-52 rounded-2xl bg-cream/10" />
  );
}

/**
 * «Pagar con QR». En testnet la rampa es SIMULADA y lo dice sobre el propio QR (no es un QR
 * bancario pagable). La rampa real de Pollar (BOB por QR) solo existe en mainnet.
 */
export function QrPayment({
  orderId,
  tokenAmount,
  hasTrustline,
  onActivate,
}: {
  orderId: string;
  tokenAmount: string;
  hasTrustline: boolean;
  onActivate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [rampId, setRampId] = useState<string | null>(null);
  const cfg = useQuery({ queryKey: ['pay-config'], queryFn: () => api<PayConfig>('/payments/config'), staleTime: Infinity });
  const ramp = useQuery({ queryKey: ['ramp', rampId], queryFn: () => api<Ramp>(`/payments/ramps/${rampId}`), enabled: Boolean(rampId) });
  const create = useMutation({
    mutationFn: () => api<Ramp>('/payments/ramps', { method: 'POST', json: { tokenAmount, orderId } }),
    onSuccess: (r) => (setRampId(r.id), qc.setQueryData(['ramp', r.id], r)),
  });
  const simulate = useMutation({
    mutationFn: () => api<Ramp>(`/payments/ramps/${rampId}/simulate-bank-payment`, { method: 'POST' }),
    onSuccess: (r) => {
      qc.setQueryData(['ramp', r.id], r);
      void qc.invalidateQueries({ queryKey: ['wallet'] });
    },
  });
  const sim = cfg.data?.simulatedRamp;
  const r = ramp.data;
  const fmt = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en' : 'es', { timeStyle: 'short' });

  return (
    <div className="space-y-4" data-no-halo>
      {!sim && <p className="text-sm text-warning">{t('errors.simulated_ramp_unavailable')}</p>}
      {sim && !hasTrustline && (
        <button type="button" className="btn btn-sm" onClick={onActivate}>
          {t('order.activateToken')}
        </button>
      )}
      {sim && hasTrustline && !r && (
        <button type="button" className="btn btn-primary" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending && <Busy />} {t('qr.title')}
        </button>
      )}
      {r && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {r.qrPayload ? <QrSvg text={r.qrPayload} /> : null}
          <div className="space-y-2 text-sm">
            <p className="rounded-xl border border-dashed border-warning/60 bg-warning/10 px-3 py-2 font-semibold text-warning">
              {t('qr.simulated')}
            </p>
            <p>{t('qr.pay', { fiat: r.fiat.amount, token: r.tokenAmount, code: r.tokenCode })}</p>
            {sim && <p className="text-xs text-muted">{t('qr.rate', { rate: sim.ratePerUnit, fee: sim.feePercent })}</p>}
            <p className="font-mono text-xs text-muted">ref {r.reference}</p>
            {r.status === 'awaiting_payment' && (
              <>
                <p className="text-xs text-muted">{t('qr.expires', { when: fmt.format(new Date(r.expiresAt)) })}</p>
                <button type="button" className="btn btn-sm" disabled={simulate.isPending} onClick={() => simulate.mutate()}>
                  {simulate.isPending && <Busy />} {t('qr.simulateBank')}
                </button>
              </>
            )}
            {r.status === 'credited' && <p className="text-success">{t('qr.credited', { token: r.tokenAmount, code: r.tokenCode })}</p>}
            {(r.status === 'expired' || r.status === 'failed') && (
              <button type="button" className="btn btn-sm" onClick={() => (setRampId(null), create.reset())}>
                {t('common.retry')}
              </button>
            )}
          </div>
        </div>
      )}
      <ErrorNote error={create.error ?? simulate.error} />
      <p className="text-xs text-muted">
        {cfg.data?.pollar.enabled ? t('qr.sandbox') : null} {t('qr.liveUnavailable')}
      </p>
    </div>
  );
}
