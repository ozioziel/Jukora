import { KeyRound, Mail, Wallet } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Busy, Dialog, ErrorNote, TestnetBadge } from '@/components/ui';
import { hasStoredTestKey, pollarSendCode, pollarVerify, testKeySigner, walletKitSigner, type Signer } from '@/lib/signer';
import { useAuth } from './auth';

export function LoginDialog() {
  const { t } = useTranslation();
  const { loginOpen, closeLogin, signIn, config } = useAuth();
  const [mode, setMode] = useState<'buyer' | 'supplier'>('buyer');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const run = async (key: string, get: () => Promise<Signer>) => {
    setError(null);
    setBusy(key);
    try {
      await signIn(await get(), mode);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={loginOpen} onClose={closeLogin} title={t('auth.title')} noHalo>
      <p className="mb-5 text-sm text-muted">{t('auth.subtitle')}</p>

      <fieldset className="mb-6">
        <legend className="label">{t('auth.modeQ')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['buyer', 'supplier'] as const).map((m) => (
            <button key={m} type="button" className="chip" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {t(`auth.${m}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-5">
        <section className="card-glass p-4">
          <h3 className="mb-1 flex items-center gap-2 font-semibold">
            <Mail size={16} className="text-amber" /> {t('auth.pollar')}
          </h3>
          <p className="hint mb-3">{t('auth.pollarHint')}</p>
          {config?.methods.pollar ? (
            !codeSent ? (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusy('code');
                  pollarSendCode(email)
                    .then(() => setCodeSent(true))
                    .catch(setError)
                    .finally(() => setBusy(null));
                }}
              >
                <label className="sr-only" htmlFor="login-email">
                  {t('auth.email')}
                </label>
                <input
                  id="login-email"
                  className="field"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.email')}
                />
                <button className="btn btn-primary" disabled={busy !== null}>
                  {busy === 'code' ? <Busy /> : null} {t('auth.sendCode')}
                </button>
              </form>
            ) : (
              <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run('pollar', () => pollarVerify(code));
                }}
              >
                <label className="sr-only" htmlFor="login-code">
                  {t('auth.code')}
                </label>
                <input
                  id="login-code"
                  className="field"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder={t('auth.code')}
                />
                <button className="btn btn-primary" disabled={busy !== null}>
                  {busy === 'pollar' ? <Busy /> : null} {t('auth.verify')}
                </button>
              </form>
            )
          ) : (
            <p className="text-xs text-warning">{t('auth.unavailable')}</p>
          )}
        </section>

        <button type="button" className="btn w-full" disabled={busy !== null} onClick={() => run('wallet', walletKitSigner)}>
          {busy === 'wallet' ? <Busy /> : <Wallet size={16} />} {t('auth.wallet')}
        </button>

        {config?.methods.demoKey && (
          <section className="rounded-2xl border border-dashed border-warning/40 p-4">
            <h3 className="mb-1 flex items-center gap-2 font-semibold">
              <KeyRound size={16} className="text-warning" /> {t('auth.testKey')} <TestnetBadge />
            </h3>
            <p className="hint mb-3">{t('auth.testKeyHint')}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => run('demo', () => testKeySigner())}>
                {busy === 'demo' ? <Busy /> : null} {hasStoredTestKey() ? t('auth.title') : t('auth.generate')}
              </button>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted">{t('auth.import')}</summary>
              <form
                className="mt-2 flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run('import', () => testKeySigner(secret.trim()));
                }}
              >
                <label className="sr-only" htmlFor="login-secret">
                  {t('auth.secret')}
                </label>
                <input
                  id="login-secret"
                  className="field font-mono text-xs"
                  autoComplete="off"
                  spellCheck={false}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={t('auth.secret')}
                />
                <button className="btn btn-sm" disabled={!/^S[A-Z2-7]{55}$/.test(secret.trim()) || busy !== null}>
                  {t('auth.import')}
                </button>
              </form>
            </details>
          </section>
        )}
        <ErrorNote error={error} />
        {config && <p className="text-center text-xs text-muted">{t('auth.network', { network: config.network })}</p>}
      </div>
    </Dialog>
  );
}
