import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/auth';
import { Busy, ErrorNote, PageHeader, TestnetBadge } from '@/components/ui';
import { useSignedAction } from '@/features/payments/useEscrowTx';
import { LANGUAGES } from '@/i18n';
import { api } from '@/lib/api';

export default function Account() {
  const { t, i18n } = useTranslation();
  const { me, refresh } = useAuth();
  const qc = useQueryClient();
  const sa = useSignedAction();
  const [name, setName] = useState(me?.displayName ?? '');
  const wallet = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<{ address: string; hasTrustline: boolean; balance: string | null; network: string }>('/payments/wallet'),
  });
  const kycCfg = useQuery({ queryKey: ['kyc-config'], queryFn: () => api<{ kycEnabled: boolean }>('/verification/config') });
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api('/me', { method: 'PATCH', json: body }),
    onSuccess: () => refresh(),
  });
  const kyc = useMutation({
    mutationFn: () => api<{ url: string | null }>('/verification/kyc/session', { method: 'POST' }),
    onSuccess: (r) => r.url && window.location.assign(r.url),
  });
  const kycRefresh = useMutation({ mutationFn: () => api('/verification/kyc/refresh', { method: 'POST' }), onSuccess: () => refresh() });
  if (!me) return null;

  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader title={t('account.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel space-y-4">
          <label className="block">
            <span className="label">{t('account.displayName')}</span>
            <div className="flex gap-2">
              <input className="field" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <button type="button" className="btn" onClick={() => save.mutate({ displayName: name })}>
                {t('common.save')}
              </button>
            </div>
          </label>
          <label className="block">
            <span className="label">{t('account.language')}</span>
            <select
              className="field"
              value={i18n.resolvedLanguage}
              onChange={(e) => {
                void i18n.changeLanguage(e.target.value);
                save.mutate({ locale: e.target.value });
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                  {l.beta ? ` (${t('nav.beta')})` : ''}
                </option>
              ))}
            </select>
            <span className="hint mt-1 block">{t('account.qayBeta')}</span>
          </label>
          <fieldset>
            <legend className="label">{t('account.mode')}</legend>
            <div className="flex gap-2">
              {(['buyer', 'supplier'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="chip"
                  aria-pressed={me.activeMode === m}
                  onClick={() =>
                    save.mutate(
                      m === 'supplier' && !me.modes.includes('supplier') ? { enableSupplier: true, activeMode: m } : { activeMode: m },
                    )
                  }
                >
                  {t(`auth.${m}`)}
                </button>
              ))}
            </div>
          </fieldset>
          <ErrorNote error={save.error} />
        </section>

        <section className="panel space-y-3">
          <h2 className="font-semibold">{t('account.identity')}</h2>
          <p className="text-sm">
            <span className="chip">{t(`account.kyc.${me.kycStatus}`, { defaultValue: me.kycStatus })}</span>
          </p>
          <p className="hint">{t('account.kycSandbox')}</p>
          {kycCfg.data?.kycEnabled ? (
            <div className="flex flex-wrap gap-2">
              {me.kycStatus !== 'approved' && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => kyc.mutate()} disabled={kyc.isPending}>
                  {kyc.isPending && <Busy />} {t('account.kycStart')}
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={() => kycRefresh.mutate()}>
                {t('account.kycRefresh')}
              </button>
            </div>
          ) : (
            <p className="text-xs text-warning">{t('errors.kyc_not_configured')}</p>
          )}
          <ErrorNote error={kyc.error} />
        </section>

        <section className="panel space-y-3 lg:col-span-2">
          <h2 className="flex items-center gap-2 font-semibold">
            {t('account.wallet')} <TestnetBadge />
          </h2>
          <p className="font-mono text-xs break-all text-muted">{me.address}</p>
          {wallet.data && (
            <p className="text-sm">
              {wallet.data.hasTrustline
                ? t('order.balance', { amount: wallet.data.balance ?? '0', code: 'USDCDEMO' })
                : t('order.activateToken')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {wallet.data && !wallet.data.hasTrustline && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => void sa.trustline().then(() => qc.invalidateQueries({ queryKey: ['wallet'] }))}
              >
                {t('order.activateToken')}
              </button>
            )}
            <a
              className="btn btn-sm"
              href={`https://stellar.expert/explorer/testnet/account/${me.address}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={13} /> {t('order.explorer')}
            </a>
          </div>
          <ErrorNote error={sa.error} />
        </section>
      </div>
    </div>
  );
}
