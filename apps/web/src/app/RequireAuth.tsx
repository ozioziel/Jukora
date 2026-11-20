import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Jucumari } from '@/components/motion/Jucumari';
import { useAuth } from './auth';

/** Rutas privadas: sin sesión se ofrece entrar, sin perder la dirección actual. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { me, loading, openLogin } = useAuth();
  if (loading) return <div className="min-h-[60vh]" aria-busy="true" />;
  if (!me)
    return (
      <div className="container-x flex min-h-[60vh] flex-col items-center justify-center gap-6 py-20 text-center">
        <Jucumari size={180} glow className="text-cream" />
        <h1 className="display text-3xl">{t('common.signInToContinue')}</h1>
        <button type="button" className="btn btn-primary btn-lg" onClick={openLogin}>
          {t('nav.signIn')}
        </button>
      </div>
    );
  return <>{children}</>;
}
