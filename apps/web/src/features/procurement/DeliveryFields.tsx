import { BOLIVIA_DEPARTMENTS, sameCity } from '@jucumari/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { DeliveryDraft } from './delivery';

/**
 * Datos de entrega. Jukora es una pasarela: el envío lo hace el proveedor.
 * El retiro en local solo se habilita si el proveedor lo ofrece y el comprador está en la misma ciudad.
 */
export function DeliveryFields({
  value,
  onChange,
  countries = ['BO'],
  pickupCity,
}: {
  value: DeliveryDraft;
  onChange: (next: DeliveryDraft) => void;
  countries?: string[];
  /** Ciudad del local si el proveedor ofrece retiro; undefined/null = sin retiro. */
  pickupCity?: string | null;
}) {
  const { t } = useTranslation();
  const id = useId();
  const set = (patch: Partial<DeliveryDraft>) => onChange({ ...value, ...patch });
  const pickupOffered = Boolean(pickupCity);
  const pickupAllowed = pickupOffered && sameCity(value.city, pickupCity);
  const isPickup = value.fulfillment === 'pickup';
  const phoneOk = value.phone === '' || /^\+?[0-9][0-9 -]{5,18}$/.test(value.phone.trim());

  return (
    <div className="space-y-3">
      {pickupOffered && (
        <fieldset>
          <legend className="label">{t('delivery.how')}</legend>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="chip" aria-pressed={!isPickup} onClick={() => set({ fulfillment: 'delivery' })}>
              {t('delivery.toAddress')}
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={isPickup}
              disabled={!pickupAllowed}
              onClick={() => set({ fulfillment: 'pickup' })}
            >
              {t('delivery.pickupIn', { city: pickupCity })}
            </button>
          </div>
          {!pickupAllowed && <p className="hint mt-1">{t('delivery.pickupOnlySameCity', { city: pickupCity })}</p>}
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${id}-city`}>
            {t('delivery.city')}
          </label>
          <input
            id={`${id}-city`}
            className="field"
            required
            maxLength={80}
            autoComplete="address-level2"
            value={value.city}
            onChange={(e) => {
              const city = e.target.value;
              // Si cambia de ciudad y ya no coincide con la del local, vuelve a envío.
              const back = isPickup && !sameCity(city, pickupCity);
              set({ city, ...(back ? { fulfillment: 'delivery' as const } : {}) });
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${id}-phone`}>
            {t('delivery.phone')}
          </label>
          <input
            id={`${id}-phone`}
            className="field"
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={20}
            placeholder="+591 7…"
            aria-invalid={!phoneOk}
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
          {!phoneOk && <p className="mt-1 text-xs text-danger">{t('delivery.phoneInvalid')}</p>}
        </div>
      </div>

      {!isPickup && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {countries.length > 1 && (
              <div>
                <label className="label" htmlFor={`${id}-country`}>
                  {t('delivery.country')}
                </label>
                <select id={`${id}-country`} className="field" value={value.country} onChange={(e) => set({ country: e.target.value })}>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label" htmlFor={`${id}-region`}>
                {value.country === 'BO' ? t('delivery.department') : t('delivery.region')}
              </label>
              <input
                id={`${id}-region`}
                className="field"
                required
                maxLength={60}
                autoComplete="address-level1"
                list={value.country === 'BO' ? `${id}-departments` : undefined}
                value={value.region}
                onChange={(e) => set({ region: e.target.value })}
              />
              <datalist id={`${id}-departments`}>
                {BOLIVIA_DEPARTMENTS.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
          </div>
          <div>
            <label className="label" htmlFor={`${id}-address`}>
              {t('delivery.address')}
            </label>
            <input
              id={`${id}-address`}
              className="field"
              required
              minLength={5}
              maxLength={200}
              autoComplete="street-address"
              placeholder={t('delivery.addressPlaceholder')}
              value={value.address}
              onChange={(e) => set({ address: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${id}-ref`}>
              {t('delivery.reference')}
            </label>
            <input
              id={`${id}-ref`}
              className="field"
              maxLength={200}
              placeholder={t('delivery.referencePlaceholder')}
              value={value.reference}
              onChange={(e) => set({ reference: e.target.value })}
            />
          </div>
        </>
      )}

      <p className="hint">{isPickup ? t('delivery.pickupNote') : t('delivery.privacyNote')}</p>
    </div>
  );
}
