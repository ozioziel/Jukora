import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useAuth } from '@/app/auth';
import { api } from '@/lib/api';
import { signerFor } from '@/lib/signer';

export type TxStage = 'idle' | 'preparing' | 'signing' | 'submitting' | 'confirmed' | 'failed';

/**
 * Prepara (API) → firma (wallet del usuario) → envía (API verifica que es la misma transacción).
 * El estado «confirmado» solo se muestra con respuesta de la red a través de la API.
 */
export function useSignedAction() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [stage, setStage] = useState<TxStage>('idle');
  const [error, setError] = useState<unknown>(null);

  const run = useCallback(
    async (
      prepare: () => Promise<{ unsignedXdr: string; networkPassphrase: string; txId?: string }>,
      submit: (signedXdr: string, txId?: string) => Promise<unknown>,
    ) => {
      if (!me) throw new Error('unauthenticated');
      setError(null);
      try {
        setStage('preparing');
        const p = await prepare();
        setStage('signing');
        const signer = await signerFor(me.authMethod, me.address);
        const signed = await signer.signTx(p.unsignedXdr, p.networkPassphrase);
        setStage('submitting');
        await submit(signed, p.txId);
        setStage('confirmed');
        await qc.invalidateQueries();
      } catch (e) {
        setError(e);
        setStage('failed');
      }
    },
    [me, qc],
  );

  const escrow = useCallback(
    (orderId: string, action: 'fund' | 'approve' | 'dispute' | 'change_status' | 'claim_advance', extra: Record<string, unknown> = {}) =>
      run(
        () =>
          api<{ txId: string; unsignedXdr: string; networkPassphrase: string }>(`/orders/${orderId}/escrow/prepare`, {
            method: 'POST',
            json: { action, ...extra },
          }),
        (signedXdr, txId) => api(`/escrow/txs/${txId}/submit`, { method: 'POST', json: { signedXdr } }),
      ),
    [run],
  );

  const prepared = useCallback(
    (tx: { txId: string; unsignedXdr: string; networkPassphrase: string }) =>
      run(
        async () => tx,
        (signedXdr, txId) => api(`/escrow/txs/${txId}/submit`, { method: 'POST', json: { signedXdr } }),
      ),
    [run],
  );

  const trustline = useCallback(
    () =>
      run(
        () => api<{ unsignedXdr: string; networkPassphrase: string }>('/payments/trustline', { method: 'POST' }),
        (signedXdr) => api('/payments/trustline/submit', { method: 'POST', json: { signedXdr } }),
      ),
    [run],
  );

  return { stage, error, escrow, prepared, trustline, reset: () => (setStage('idle'), setError(null)) };
}
