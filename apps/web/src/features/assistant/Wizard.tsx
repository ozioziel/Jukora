import { CONDITIONS, ORIGIN_SCOPES, PRIORITIES, SERVICES, type SearchRequest } from '@jucumari/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Busy, ErrorNote } from '@/components/ui';
import { api, newIdempotencyKey } from '@/lib/api';
import type { ProjectSummary, Quota } from '@/lib/types';

export const COUNTRIES = [
  'BO',
  'PE',
  'AR',
  'CL',
  'BR',
  'PY',
  'UY',
  'EC',
  'CO',
  'VE',
  'MX',
  'US',
  'CA',
  'ES',
  'FI',
  'DE',
  'FR',
  'IT',
  'CN',
  'GB',
];
const SECTORS = ['restaurant', 'cafe', 'workshop', 'store', 'studio', 'other'] as const;

function guessSector(text: string): (typeof SECTORS)[number] {
  if (/caf[eé]|coffee/i.test(text)) return 'cafe';
  if (/hamburg|burger|restaur|comida|taquer|pizz|food/i.test(text)) return 'restaurant';
  if (/taller|workshop|mec[aá]n|carpint|solda/i.test(text)) return 'workshop';
  if (/estudio|studio|audiovisual|foto|video/i.test(text)) return 'studio';
  if (/tienda|store|shop|almac/i.test(text)) return 'store';
  return 'other';
}

export interface WizardState {
  projectId: string | 'new';
  name: string;
  sector: (typeof SECTORS)[number];
  intent: 'start' | 'expand';
  scope: 'whole_business' | 'single_resource';
  country: string;
  city: string;
  priorities: (typeof PRIORITIES)[number][];
  budgetMax: string;
  currency: string;
  flexibility: 'strict' | 'approximate' | 'unknown';
  deadlineDays: string;
  deadlineStrict: boolean;
  originScope: (typeof ORIGIN_SCOPES)[number];
  condition: (typeof CONDITIONS)[number][];
  seats: string;
  unitsPerDay: string;
  existing: string;
  reqs: { key: string; value: string; mandatory: boolean }[];
  services: (typeof SERVICES)[number][];
  preferVerified: boolean;
}

export function initialWizard(description: string, projects: ProjectSummary[], projectId?: string): WizardState {
  const p = projects.find((x) => x.id === projectId);
  const seats = description.match(/(\d{1,4})\s*(personas|people|comensales|clientes|asientos)/i)?.[1] ?? '';
  return {
    projectId: p?.id ?? 'new',
    name: p?.name ?? '',
    sector: p?.sector ?? guessSector(description),
    intent: p?.intent ?? 'start',
    scope: 'whole_business',
    country: p?.country ?? 'BO',
    city: p?.city ?? (/la paz/i.test(description) ? 'La Paz' : ''),
    priorities: ['balance'],
    budgetMax: '',
    currency: 'USD',
    flexibility: 'unknown',
    deadlineDays: '',
    deadlineStrict: false,
    originScope: 'local_and_international',
    condition: ['new'],
    seats,
    unitsPerDay: '',
    existing: '',
    reqs: [],
    services: [],
    preferVerified: true,
  };
}

/** Arma el borrador determinista (sin IA). El backend vuelve a validarlo. */
export function toRequest(description: string, s: WizardState, projectId: string | undefined, locale: string): SearchRequest {
  return {
    projectId,
    scope: s.scope,
    intent: s.intent,
    description: description.trim(),
    destination: { country: s.country, city: s.city.trim() || undefined },
    capacity:
      s.seats || s.unitsPerDay
        ? { seats: s.seats ? Number(s.seats) : undefined, unitsPerDay: s.unitsPerDay ? Number(s.unitsPerDay) : undefined }
        : undefined,
    budget: { max: s.budgetMax.trim() || undefined, currency: s.currency, flexibility: s.flexibility },
    priorities: s.priorities.length ? s.priorities : ['balance'],
    deadline: { days: s.deadlineDays ? Number(s.deadlineDays) : undefined, strict: s.deadlineStrict },
    originScope: s.originScope,
    includeCountries: [],
    excludeCountries: [],
    condition: s.condition.length ? s.condition : ['new'],
    existingResources: s.existing
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 50),
    technicalRequirements: s.reqs.filter((r) => r.key.trim() && r.value.trim()),
    preferVerified: s.preferVerified,
    services: s.services,
    shareWithSuppliers: false,
    locale: (['es', 'en', 'qu', 'ay'].includes(locale) ? locale : 'es') as SearchRequest['locale'],
  };
}

const TOTAL = 6;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

export function Wizard({
  description,
  projects,
  quota,
  initialProjectId,
  onCancel,
  variant = 'panel',
  onStep,
}: {
  description: string;
  projects: ProjectSummary[];
  quota: Quota | undefined;
  initialProjectId?: string;
  onCancel: () => void;
  /** «chat»: cada paso es una pregunta del jucumari dentro de la conversación de Mi espacio. */
  variant?: 'panel' | 'chat';
  onStep?: (step: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [s, setS] = useState<WizardState>(() => initialWizard(description, projects, initialProjectId));
  // Una clave por confirmación: doble clic o reintento no consumen dos búsquedas.
  const [key] = useState(newIdempotencyKey);
  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) => setS((x) => ({ ...x, [k]: v }));
  const regionNames = useMemo(() => new Intl.DisplayNames([i18n.language === 'en' ? 'en' : 'es'], { type: 'region' }), [i18n.language]);

  const submit = useMutation({
    mutationFn: async () => {
      let projectId = s.projectId === 'new' ? undefined : s.projectId;
      if (!projectId) {
        const p = await api<{ id: string }>('/projects', {
          method: 'POST',
          json: {
            name: s.name.trim() || t(`sectors.${s.sector}`),
            sector: s.sector,
            intent: s.intent,
            country: s.country,
            city: s.city.trim() || undefined,
            objective: description.slice(0, 600),
          },
        });
        projectId = p.id;
      }
      const run = await api<{ id: string }>('/search/runs', {
        method: 'POST',
        json: toRequest(description, s, projectId, i18n.language),
        idempotencyKey: key,
      });
      return run.id;
    },
    onSuccess: async (runId) => {
      await qc.invalidateQueries({ queryKey: ['quota'] });
      await qc.invalidateQueries({ queryKey: ['projects'] });
      void nav(`/busqueda/${runId}`);
    },
  });

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const unknownBtn = (onClick: () => void, active: boolean) => (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      {t('common.dontKnow')}
    </button>
  );

  const title = [
    t('wizard.contextTitle'),
    t('wizard.locationTitle'),
    t('wizard.prioritiesTitle'),
    t('wizard.deadlineTitle'),
    t('wizard.scaleTitle'),
    t('wizard.reviewTitle'),
  ][step - 1];
  const chat = variant === 'chat';
  const goStep = (n: number) => {
    setStep(n);
    onStep?.(n);
  };

  return (
    <section aria-labelledby="wizard-title" className={chat ? 'on-light flex flex-col gap-3' : 'panel mt-6'}>
      {chat ? (
        <div key={step} className="msg msg-bot">
          <h2 id="wizard-title" className="font-display text-[15px] font-bold">
            {title}
          </h2>
          <span className="mt-0.5 block text-xs text-ink-2" aria-live="polite">
            {t('wizard.stepOf', { step, total: TOTAL })}
          </span>
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="wizard-title" className="display text-2xl">
            {title}
          </h2>
          <span className="text-xs text-muted" aria-live="polite">
            {t('wizard.stepOf', { step, total: TOTAL })}
          </span>
        </div>
      )}
      <div className={`h-1 overflow-hidden rounded-full bg-line-soft ${chat ? '' : 'mb-6'}`} aria-hidden="true">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${chat ? 'bg-oro' : 'bg-amber'}`}
          style={{ width: `${(step / TOTAL) * 100}%` }}
        />
      </div>
      <div key={`body-${step}`} className={chat ? 'rounded-2xl border border-ink/8 bg-white/75 p-4 [animation:rise-in_420ms_var(--ease-star)_both]' : ''}>

      {step === 1 && (
        <div className="grid gap-5 md:grid-cols-2">
          <fieldset className="md:col-span-2">
            <legend className="label">{t('wizard.contextTitle')}</legend>
            <div className="flex flex-wrap gap-2">
              <Chip active={s.projectId === 'new'} onClick={() => set('projectId', 'new')}>
                {t('wizard.newBusiness')}
              </Chip>
              {projects.map((p) => (
                <Chip
                  key={p.id}
                  active={s.projectId === p.id}
                  onClick={() =>
                    setS((x) => ({
                      ...x,
                      projectId: p.id,
                      name: p.name,
                      sector: p.sector,
                      intent: p.intent,
                      country: p.country ?? x.country,
                      city: p.city ?? x.city,
                    }))
                  }
                >
                  {p.name}
                </Chip>
              ))}
            </div>
          </fieldset>
          {s.projectId === 'new' && (
            <>
              <div>
                <label className="label" htmlFor="w-name">
                  {t('wizard.businessName')}
                </label>
                <input id="w-name" className="field" value={s.name} maxLength={60} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="w-sector">
                  {t('wizard.sector')}
                </label>
                <select
                  id="w-sector"
                  className="field"
                  value={s.sector}
                  onChange={(e) => set('sector', e.target.value as WizardState['sector'])}
                >
                  {SECTORS.map((x) => (
                    <option key={x} value={x}>
                      {t(`sectors.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <fieldset>
            <legend className="label">{t('wizard.intentQ')}</legend>
            <div className="flex gap-2">
              {(['start', 'expand'] as const).map((x) => (
                <Chip key={x} active={s.intent === x} onClick={() => set('intent', x)}>
                  {t(`intent.${x}`)}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="label">{t('wizard.scopeQ')}</legend>
            <div className="flex flex-wrap gap-2">
              <Chip active={s.scope === 'whole_business'} onClick={() => set('scope', 'whole_business')}>
                {t('wizard.scopeWhole')}
              </Chip>
              <Chip active={s.scope === 'single_resource'} onClick={() => set('scope', 'single_resource')}>
                {t('wizard.scopeSingle')}
              </Chip>
            </div>
          </fieldset>
        </div>
      )}

      {step === 2 && (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="w-country">
              {t('wizard.country')}
            </label>
            <select id="w-country" className="field" value={s.country} onChange={(e) => set('country', e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {regionNames.of(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="w-city">
              {t('wizard.city')}
            </label>
            <input id="w-city" className="field" value={s.city} maxLength={80} onChange={(e) => set('city', e.target.value)} />
          </div>
          <fieldset className="md:col-span-2">
            <legend className="label">{t('wizard.originTitle')}</legend>
            <div className="flex flex-wrap gap-2">
              {ORIGIN_SCOPES.map((o) => (
                <Chip key={o} active={s.originScope === o} onClick={() => set('originScope', o)}>
                  {t(`wizard.origins.${o}`)}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-6">
          <fieldset>
            <legend className="label">{t('wizard.prioritiesTitle')}</legend>
            <p className="hint mb-2">{t('wizard.prioritiesHint')}</p>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => {
                const idx = s.priorities.indexOf(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className="chip"
                    aria-pressed={idx >= 0}
                    onClick={() => set('priorities', toggle(s.priorities, p))}
                  >
                    {idx >= 0 && (
                      <span className="grid h-4 w-4 place-items-center rounded-full bg-amber text-[10px] text-night">{idx + 1}</span>
                    )}
                    {t(`wizard.priorities.${p}`)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="label" htmlFor="w-budget">
                {t('wizard.budgetMax')} <span className="text-muted">({t('common.optional')})</span>
              </label>
              <input
                id="w-budget"
                className="field"
                inputMode="decimal"
                value={s.budgetMax}
                onChange={(e) => set('budgetMax', e.target.value.replace(/[^\d.]/g, ''))}
              />
            </div>
            <div>
              <label className="label" htmlFor="w-currency">
                {t('wizard.currency')}
              </label>
              <select id="w-currency" className="field" value={s.currency} onChange={(e) => set('currency', e.target.value)}>
                {['USD', 'BOB', 'EUR', 'PEN', 'MXN', 'BRL'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <fieldset>
              <legend className="label">{t('wizard.budgetTitle')}</legend>
              <div className="flex flex-wrap gap-2">
                {(['strict', 'approximate', 'unknown'] as const).map((f) => (
                  <Chip key={f} active={s.flexibility === f} onClick={() => set('flexibility', f)}>
                    {t(`wizard.flexibility.${f}`)}
                  </Chip>
                ))}
              </div>
            </fieldset>
          </div>
          <p className="hint">{t('wizard.budgetPrivacy')}</p>
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="w-days">
              {t('wizard.deadlineDays')}
            </label>
            <div className="flex gap-2">
              <input
                id="w-days"
                className="field"
                inputMode="numeric"
                value={s.deadlineDays}
                onChange={(e) => set('deadlineDays', e.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              {unknownBtn(() => set('deadlineDays', ''), s.deadlineDays === '')}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.deadlineStrict}
                onChange={(e) => set('deadlineStrict', e.target.checked)}
                className="accent-amber"
              />
              {t('wizard.deadlineStrict')}
            </label>
          </div>
          <fieldset>
            <legend className="label">{t('wizard.conditionTitle')}</legend>
            <div className="flex gap-2">
              {CONDITIONS.map((c) => (
                <Chip key={c} active={s.condition.includes(c)} onClick={() => set('condition', toggle(s.condition, c))}>
                  {t(`wizard.conditions.${c}`)}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset className="md:col-span-2">
            <legend className="label">{t('wizard.servicesTitle')}</legend>
            <div className="flex flex-wrap gap-2">
              {SERVICES.map((v) => (
                <Chip key={v} active={s.services.includes(v)} onClick={() => set('services', toggle(s.services, v))}>
                  {t(`wizard.services.${v}`)}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="w-seats">
              {t('wizard.seats')}
            </label>
            <div className="flex gap-2">
              <input
                id="w-seats"
                className="field"
                inputMode="numeric"
                value={s.seats}
                onChange={(e) => set('seats', e.target.value.replace(/\D/g, '').slice(0, 5))}
              />
              {unknownBtn(() => set('seats', ''), s.seats === '')}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="w-units">
              {t('wizard.unitsPerDay')} <span className="text-muted">({t('common.optional')})</span>
            </label>
            <input
              id="w-units"
              className="field"
              inputMode="numeric"
              value={s.unitsPerDay}
              onChange={(e) => set('unitsPerDay', e.target.value.replace(/\D/g, '').slice(0, 7))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="w-existing">
              {t('wizard.inventoryTitle')}
            </label>
            <input id="w-existing" className="field" value={s.existing} onChange={(e) => set('existing', e.target.value)} />
            <p className="hint mt-1">{t('wizard.inventoryHint')}</p>
          </div>
          <fieldset className="md:col-span-2">
            <legend className="label">{t('wizard.compatibilityTitle')}</legend>
            <p className="hint mb-2">{t('wizard.compatibilityHint')}</p>
            <ul className="space-y-2">
              {s.reqs.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={t('wizard.reqKey')}
                    className="field max-w-48"
                    placeholder={t('wizard.reqKey')}
                    value={r.key}
                    onChange={(e) =>
                      set(
                        'reqs',
                        s.reqs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                      )
                    }
                  />
                  <input
                    aria-label={t('wizard.reqValue')}
                    className="field max-w-48"
                    placeholder={t('wizard.reqValue')}
                    value={r.value}
                    onChange={(e) =>
                      set(
                        'reqs',
                        s.reqs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                      )
                    }
                  />
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="accent-amber"
                      checked={r.mandatory}
                      onChange={(e) =>
                        set(
                          'reqs',
                          s.reqs.map((x, j) => (j === i ? { ...x, mandatory: e.target.checked } : x)),
                        )
                      }
                    />
                    {t('wizard.reqMandatory')}
                  </label>
                  <button
                    type="button"
                    className="btn btn-icon btn-sm"
                    aria-label={t('common.remove')}
                    onClick={() =>
                      set(
                        'reqs',
                        s.reqs.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-sm mt-2"
              onClick={() => set('reqs', [...s.reqs, { key: '', value: '', mandatory: true }])}
            >
              <Plus size={14} /> {t('common.add')}
            </button>
          </fieldset>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              className="accent-amber"
              checked={s.preferVerified}
              onChange={(e) => set('preferVerified', e.target.checked)}
            />
            {t('wizard.preferVerified')}
          </label>
        </div>
      )}

      {step === 6 && (
        <div>
          <p className="hint mb-4">{t('wizard.reviewHint')}</p>
          <dl className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
            {[
              [
                t('wizard.contextTitle'),
                s.projectId === 'new'
                  ? `${s.name || t(`sectors.${s.sector}`)} · ${t(`intent.${s.intent}`)}`
                  : projects.find((p) => p.id === s.projectId)?.name,
              ],
              [
                t('wizard.locationTitle'),
                `${s.city ? `${s.city}, ` : ''}${regionNames.of(s.country)} · ${t(`wizard.origins.${s.originScope}`)}`,
              ],
              [t('wizard.prioritiesTitle'), s.priorities.map((p) => t(`wizard.priorities.${p}`)).join(' → ')],
              [
                t('wizard.budgetTitle'),
                s.budgetMax ? `${s.budgetMax} ${s.currency} · ${t(`wizard.flexibility.${s.flexibility}`)}` : t('common.dontKnow'),
              ],
              [
                t('wizard.deadlineTitle'),
                s.deadlineDays
                  ? `${t('common.days', { count: Number(s.deadlineDays) })}${s.deadlineStrict ? ` · ${t('common.required')}` : ''}`
                  : t('common.dontKnow'),
              ],
              [t('wizard.seats'), s.seats || t('common.dontKnow')],
              [t('wizard.conditionTitle'), s.condition.map((c) => t(`wizard.conditions.${c}`)).join(', ')],
              [
                t('wizard.compatibilityTitle'),
                s.reqs
                  .filter((r) => r.key)
                  .map((r) => `${r.key}: ${r.value}${r.mandatory ? '*' : ''}`)
                  .join(' · ') || '—',
              ],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-line-soft pb-2">
                <dt className="text-muted">{k}</dt>
                <dd className="mt-0.5 text-cream">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="hint mt-4">{t('wizard.privacyNote')}</p>
          <div className="mt-4">
            <ErrorNote error={submit.error} />
          </div>
        </div>
      )}
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-3 ${chat ? 'mt-1' : 'mt-8'}`}>
        <button type="button" className="btn" onClick={() => (step === 1 ? onCancel() : goStep(step - 1))}>
          <ArrowLeft size={16} /> {step === 1 ? t('common.cancel') : t('common.back')}
        </button>
        {step < TOTAL ? (
          <button type="button" className="btn btn-primary" onClick={() => goStep(step + 1)}>
            {t('common.continue')} <ArrowRight size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={submit.isPending || (quota?.remaining ?? 0) < 1}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? <Busy /> : <Search size={18} />} {t('wizard.confirm', { remaining: quota?.remaining ?? 0 })}
          </button>
        )}
      </div>
    </section>
  );
}
