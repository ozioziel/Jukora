import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { addMoney, fromUnits, toUnits } from '@jucumari/shared';
import { Busy, Dialog, ErrorNote, Money } from '@/components/ui';
import { api } from '@/lib/api';
import type { Listing } from '@/lib/types';
import { type DeliveryDraft, emptyDelivery, toDeliveryInput } from './delivery';
import { DeliveryFields } from './DeliveryFields';

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

/**
 * Compra directa de un artículo con precio y stock confirmados: crea un pedido pendiente de pago.
 * Jukora es pasarela: el envío lo hace el proveedor al costo que fijó, o el comprador retira en el local.
 */
export function BuyDialog({
  open,
  onClose,
  listing,
  projectId,
  requirementId,
  defaultQuantity = 1,
  defaultCity = '',
}: {
  open: boolean;
  onClose: () => void;
  listing: {
    id: string;
    title: string;
    price: { amount: string; currency: string };
    minQty: number;
    supplierName: string;
    shipping: { amount: string; currency: string };
    pickup: { city: string | null } | null;
    shipsTo: string[];
    originCountry: string;
  };
  projectId?: string;
  requirementId?: string;
  defaultQuantity?: number;
  defaultCity?: string;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [qty, setQty] = useState(String(Math.max(defaultQuantity, listing.minQty)));
  const countries = [...new Set([listing.originCountry, ...listing.shipsTo])];
  const [delivery, setDelivery] = useState<DeliveryDraft>(() => emptyDelivery(countries.includes('BO') ? 'BO' : countries[0], defaultCity));
  const input = toDeliveryInput(delivery);
  const n = Number(qty) || 0;
  const subtotal = n > 0 ? fromUnits(toUnits(listing.price.amount) * BigInt(n)) : '0';
  const shipping = delivery.fulfillment === 'delivery' ? listing.shipping.amount : '0';
  const total = addMoney(subtotal, shipping);
  const create = useMutation({
    mutationFn: () =>
      api<{ orderId: string }>('/orders/from-listing', {
        method: 'POST',
        json: { listingId: listing.id, quantity: n, projectId, requirementId, delivery: input },
      }),
    onSuccess: (r) => void nav(`/pedidos/${r.orderId}`),
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('explore.buy')} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (input) create.mutate();
        }}
      >
        <div>
          <p className="font-semibold">{listing.title}</p>
          <p className="text-sm text-muted">{listing.supplierName}</p>
        </div>
        <div>
          <label className="label" htmlFor="buy-qty">
            {t('explore.quantity')}
          </label>
          <input
            id="buy-qty"
            className="field mb-1"
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
          />
          <p className="text-sm">
            <Money amount={listing.price.amount} currency={listing.price.currency} /> · {t('explore.minQty', { count: listing.minQty })}
          </p>
        </div>

        <DeliveryFields value={delivery} onChange={setDelivery} countries={countries} pickupCity={listing.pickup?.city ?? null} />

        <dl className="grid grid-cols-3 gap-2 rounded-xl border border-ink/10 p-3 text-sm">
          <div>
            <dt className="text-xs text-muted">{t('quotes.subtotal')}</dt>
            <dd>
              <Money amount={subtotal} currency={listing.price.currency} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('quotes.shipping')}</dt>
            <dd>
              {delivery.fulfillment === 'pickup' ? (
                t('delivery.pickupFree')
              ) : (
                <Money amount={shipping} currency={listing.shipping.currency} />
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{t('quotes.total')}</dt>
            <dd className="font-semibold">
              <Money amount={total} currency={listing.price.currency} />
            </dd>
          </div>
        </dl>
        <p className="hint">{t('quotes.acceptNote')}</p>
        <ErrorNote error={create.error} />
        <button type="submit" className="btn btn-primary w-full" disabled={create.isPending || n < listing.minQty || !input}>
          {create.isPending && <Busy />} {t('common.continue')}
        </button>
      </form>
    </Dialog>
  );
}

/** Compra desde resultados: carga el artículo (costo de envío, retiro, destinos) y abre la compra. */
export function BuyListingDialog({
  onClose,
  listingId,
  ...rest
}: {
  onClose: () => void;
  listingId: string;
  projectId?: string;
  requirementId?: string;
  defaultQuantity?: number;
  defaultCity?: string;
}) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['listing', listingId], queryFn: () => api<Listing>(`/listings/${listingId}`) });
  const l = q.data;
  if (!l?.price)
    return (
      <Dialog open onClose={onClose} title={t('explore.buy')}>
        {q.error ? <ErrorNote error={q.error} /> : <Busy />}
      </Dialog>
    );
  return (
    <BuyDialog
      open
      onClose={onClose}
      listing={{
        id: l.id,
        title: l.title,
        price: l.price,
        minQty: l.minQty,
        supplierName: l.supplier.name,
        shipping: l.shipping,
        pickup: l.pickup,
        shipsTo: l.shipsTo,
        originCountry: l.origin.country,
      }}
      {...rest}
    />
  );
}

/** Aceptar una cotización: el envío ya viene cotizado por el proveedor; se piden dirección y teléfono. */
export function AcceptQuoteDialog({
  open,
  onClose,
  quote,
  defaultCountry = 'BO',
  defaultCity = '',
  onAccepted,
}: {
  open: boolean;
  onClose: () => void;
  quote: { id: string; title: string; supplierName: string; total: string; shipping: string; currency: string };
  defaultCountry?: string;
  defaultCity?: string;
  onAccepted: (orderId: string) => void;
}) {
  const { t } = useTranslation();
  const [delivery, setDelivery] = useState<DeliveryDraft>(() => emptyDelivery(defaultCountry, defaultCity));
  const input = toDeliveryInput(delivery);
  const accept = useMutation({
    mutationFn: () => api<{ orderId: string }>(`/quotes/${quote.id}/accept`, { method: 'POST', json: { delivery: input } }),
    onSuccess: (r) => onAccepted(r.orderId),
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('quotes.accept')} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (input) accept.mutate();
        }}
      >
        <div>
          <p className="font-semibold">{quote.title}</p>
          <p className="text-sm text-muted">
            {quote.supplierName} · {t('quotes.total')} <Money amount={quote.total} currency={quote.currency} /> ({t('quotes.shipping')}{' '}
            <Money amount={quote.shipping} currency={quote.currency} />)
          </p>
        </div>
        <DeliveryFields value={delivery} onChange={setDelivery} countries={[defaultCountry]} />
        <p className="hint">{t('quotes.acceptNote')}</p>
        <ErrorNote error={accept.error} />
        <button type="submit" className="btn btn-primary w-full" disabled={accept.isPending || !input}>
          {accept.isPending && <Busy />} {t('quotes.accept')}
        </button>
      </form>
    </Dialog>
  );
}
