/* eslint-disable react-refresh/only-export-components -- proveedor y hook de autenticación juntos a propósito */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { setSigner, type Signer } from '@/lib/signer';
import type { AuthConfig, Me } from '@/lib/types';

interface AuthCtx {
  me: Me | null;
  loading: boolean;
  config: AuthConfig | null;
  signIn: (signer: Signer, mode: 'buyer' | 'supplier') => Promise<Me>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  loginOpen: boolean;
  openLogin: () => void;
  closeLogin: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { i18n } = useTranslation();
  const [loginOpen, setLoginOpen] = useState(false);
  const meQ = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: Me | null }>('/me'), staleTime: 60_000 });
  const cfgQ = useQuery({ queryKey: ['auth-config'], queryFn: () => api<AuthConfig>('/auth/config'), staleTime: Infinity });

  const signIn = useCallback(
    async (signer: Signer, mode: 'buyer' | 'supplier') => {
      const ch = await api<{ nonce: string; message: string }>('/auth/challenge', { method: 'POST', json: { address: signer.address } });
      const signature = await signer.signMessage(ch.message);
      const r = await api<{ user: Me }>('/auth/verify', {
        method: 'POST',
        json: {
          address: signer.address,
          nonce: ch.nonce,
          signature,
          method: signer.method,
          newAccount: {
            mode,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            locale: (['es', 'en', 'qu', 'ay'].includes(i18n.language) ? i18n.language : 'es') as Me['locale'],
          },
        },
      });
      setSigner(signer);
      try {
        localStorage.setItem('jcm.signer', signer.method);
      } catch {
        /* sin almacenamiento */
      }
      qc.setQueryData(['me'], { user: r.user });
      await qc.invalidateQueries();
      setLoginOpen(false);
      return r.user;
    },
    [qc, i18n.language],
  );

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSigner(null);
    qc.clear();
    qc.setQueryData(['me'], { user: null });
  }, [qc]);

  const value = useMemo<AuthCtx>(
    () => ({
      me: meQ.data?.user ?? null,
      loading: meQ.isLoading,
      config: cfgQ.data ?? null,
      signIn,
      signOut,
      refresh: async () => {
        await meQ.refetch();
      },
      loginOpen,
      openLogin: () => setLoginOpen(true),
      closeLogin: () => setLoginOpen(false),
    }),
    [meQ, cfgQ.data, signIn, signOut, loginOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider missing');
  return c;
}
