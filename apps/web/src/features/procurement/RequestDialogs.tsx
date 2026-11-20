import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Busy, Dialog, ErrorNote, Money } from '@/components/ui';
import { api } from '@/lib/api';

/** Solicitud de cotización a un proveedor (privada) o pública con consentimiento explícito. */
export function RfqDialog({
  open,
  onClose,
  title,
  listingId,
  projectId,
  requirementId,
  defaultQuantity = 1,
  country = 'BO',
  city = '',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  listingId?: string;
  projectId?: string;
  requirementId?: string;
  defaultQuantity?: number;
  country?: string;
  city?: string;
}) {
  const { t } = useTranslation();
  const [item, setItem] = useState(title);
  const [qty, setQty] = useState(String(defaultQuantity));
  const [deadline, setDeadline] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>(listingId ? 'private' : 'public');
  const [consent, setConsent] = useState(false);
  const [done, setDone] = useState(false);
  const send = useMutation({
    mutationFn: () =>
      api('/rfqs', {
        method: 'POST',
        json: {
          title: item.trim(),
          quantity: Number(qty) || 1,
          destinationCountry: country,
          destinationCity: city || undefined,
          deadlineDays: deadline ? Number(deadline) : undefined,
          listingId: visibility === 'private' ? listingId : undefined,
          projectId,
          requirementId,
          visibility: visibility === 'private' ? 'invited' : 'public',
          consentPublish: visibility === 'public' ? consent : undefined,
        },
      }),
    onSuccess: () => setDone(true),
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('rfq.title')}>
      {done ? (
        <p className="text-success">{t('rfq.sent')}</p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <div>
            <label className="label" htmlFor="rfq-item">
              {t('rfq.item')}
            </label>
            <input
              id="rfq-item"
              className="field"
              required
              minLength={3}
              maxLength={120}
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="rfq-qty">
                {t('rfq.quantity')}
              </label>
              <input
                id="rfq-qty"
                className="field"
                inputMode="numeric"
                required
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div>
              <label className="label" htmlFor="rfq-deadline">
                {t('rfq.deadline')}
              </label>
              <input
                id="rfq-deadline"
                className="field"
                inputMode="numeric"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </div>
          <fieldset>
            <legend className="label">{t('rfq.visibility')}</legend>
            <div className="flex flex-wrap gap-2">
              {listingId && (
                <button type="button" className="chip" aria-pressed={visibility === 'private'} onClick={() => setVisibility('private')}>
                  {t('rfq.private')}
                </button>
              )}
              <button type="button" className="chip" aria-pressed={visibility === 'public'} onClick={() => setVisibility('public')}>
                {t('rfq.public')}
              </button>
            </div>
          </fieldset>
          {visibility === 'public' && (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1 accent-amber"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
              />
              {t('rfq.consent')}
            </label>
          )}
          <ErrorNote error={send.error} />
          <button className="btn btn-primary w-full" disabled={send.isPending || (visibility === 'public' && !consent)}>
            {send.isPending && <Busy />} {t('rfq.send')}
          </button>
        </form>
      )}
    </Dialog>
  );
}

/** Compra directa de un artículo con precio y stock confirmados: crea un pedido pendiente de pago. */
export function BuyDialog({
  open,
  onClose,
  listing,
  projectId,
  requirementId,
  defaultQuantity = 1,
}: {
  open: boolean;
  onClose: () => void;
  listing: { id: string; title: string; price: { amount: string; currency: string }; minQty: number; supplierName: string };
  projectId?: string;
  requirementId?: string;
  defaultQuantity?: number;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [qty, setQty] = useState(String(Math.max(defaultQuantity, listing.minQty)));
  const create = useMutation({
    mutationFn: () =>
      api<{ orderId: string }>('/orders/from-listing', {
        method: 'POST',
        json: { listingId: listing.id, quantity: Number(qty), projectId, requirementId },
      }),
    onSuccess: (r) => void nav(`/pedidos/${r.orderId}`),
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('explore.buy')}>
      <p className="font-semibold">{listing.title}</p>
      <p className="mb-4 text-sm text-muted">{listing.supplierName}</p>
      <label className="label" htmlFor="buy-qty">
        {t('explore.quantity')}
      </label>
      <input
        id="buy-qty"
        className="field mb-2"
        inputMode="numeric"
        value={qty}
        onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
      />
      <p className="mb-4 text-sm">
        <Money amount={listing.price.amount} currency={listing.price.currency} /> · {t('explore.minQty', { count: listing.minQty })}
      </p>
      <p className="hint mb-4">{t('quotes.acceptNote')}</p>
      <ErrorNote error={create.error} />
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={create.isPending || Number(qty) < listing.minQty}
        onClick={() => create.mutate()}
      >
        {create.isPending && <Busy />} {t('common.continue')}
      </button>
    </Dialog>
  );
}
