import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { DemoBadge, ErrorNote } from '@/components/ui';
import { Jucumari2D } from '@/components/jucumari/Jucumari2D';
import { ResourceIcon } from '@/features/resources/ResourceIcon';
import { api, apiUrl } from '@/lib/api';
import type { ProjectDetail, SearchRun } from '@/lib/types';
import type { OrbitPhase, OrbitScene } from '@/scenes/orbitScene';

const ACTIVE = new Set(['accepted', 'planning']);

/** Estado visual derivado del estado REAL del backend (nunca de un porcentaje inventado). */
function phaseFor(run: SearchRun | undefined): OrbitPhase {
  if (!run) return 'morph';
  if (run.status === 'accepted') return 'morph';
  if (run.status === 'planning') return 'orbit';
  if (run.status === 'resources_ready') return 'reveal';
  return 'settled';
}

function SearchGuide({ active, categories }: { active: boolean; categories: string[] }) {
  const icons = (categories.length ? categories : ['parrilla', 'refrigerador', 'mesa', 'silla', 'campana', 'utensilios']).slice(0, 8);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]" aria-hidden="true">
      <span className="absolute inset-x-[10%] bottom-[14%] h-[18%] rounded-[50%] border-[1.5px] border-celeste/45 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(86_181_211/0.3),transparent_70%)]" />
      <div className={`absolute inset-[6%] rounded-full border border-dashed border-white/35 ${active ? 'animate-[spin_18s_linear_infinite]' : ''}`}>
        {icons.map((c, i) => {
          const a = (i / icons.length) * Math.PI * 2;
          return (
            <span
              key={`${c}-${i}`}
              className="lglass absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl text-naranja"
              style={{ left: `${50 + 50 * Math.cos(a)}%`, top: `${50 + 50 * Math.sin(a)}%` }}
            >
              <ResourceIcon category={c} size={20} />
            </span>
          );
        })}
      </div>
      <div className="absolute inset-x-[22%] bottom-[18%]">
        <Jucumari2D className="float-y w-full drop-shadow-[0_20px_26px_rgb(0_0_0/0.35)]" />
      </div>
    </div>
  );
}

export default function SearchScenePage() {
  const { runId = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const scene = useRef<OrbitScene | null>(null);

  const run = useQuery({
    queryKey: ['run', runId],
    queryFn: () => api<SearchRun>(`/search/runs/${runId}`),
    // Respaldo por sondeo si el flujo SSE no llega (proxy, red móvil…).
    refetchInterval: (q) => (q.state.data && !q.state.data.terminal ? 2500 : false),
  });
  const project = useQuery({
    queryKey: ['project', run.data?.projectId],
    queryFn: () => api<ProjectDetail>(`/projects/${run.data!.projectId}`),
    enabled: Boolean(run.data?.projectId && run.data.plan),
  });
  const cancel = useMutation({
    mutationFn: () => api<SearchRun>(`/search/runs/${runId}/cancel`, { method: 'POST' }),
    onSuccess: (d) => qc.setQueryData(['run', runId], d),
  });

  // Eventos en vivo: cada evento refresca la vista (la fuente de verdad sigue siendo la API).
  useEffect(() => {
    if (!runId || typeof EventSource === 'undefined') return;
    const es = new EventSource(apiUrl(`/search/runs/${runId}/events`), { withCredentials: true });
    const refresh = () => void qc.invalidateQueries({ queryKey: ['run', runId] });
    for (const ev of ['planning', 'resources_ready', 'candidate_batch', 'done', 'partial', 'error', 'cancelled'])
      es.addEventListener(ev, refresh);
    es.addEventListener('done', () => es.close());
    es.addEventListener('error', () => es.close());
    return () => es.close();
  }, [runId, qc]);

  // La escena de partículas anterior (OrbitScene) queda en el código por si se reutiliza; la vista
  // nueva usa <SearchGuide />. Se conserva el cálculo de fase por si vuelve a usarse.
  useEffect(() => {
    scene.current?.setPhase(phaseFor(run.data));
  }, [run.data]);

  const r = run.data;
  const statusText = !r
    ? t('search.statusPreparing')
    : r.status === 'accepted'
      ? t('search.statusPreparing')
      : r.status === 'planning'
        ? t('search.statusPlanning')
        : r.status === 'resources_ready'
          ? t('search.statusResources')
          : r.status === 'error'
            ? t('search.statusError')
            : r.status === 'cancelled'
              ? t('search.statusCancelled')
              : r.status === 'partial'
                ? t('search.statusPartial')
                : t('search.statusDone');
  const progressFor = (slug: string) => project.data?.resources.find((x) => x.slug === slug)?.progress;

  return (
    <div className="container-x pt-8 pb-16">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to={r?.projectId ? `/espacio/${r.projectId}` : '/espacio'} className="btn btn-sm">
          <ArrowLeft size={14} /> {t('search.backToSpace')}
        </Link>
        {r && ACTIVE.has(r.status) && (
          <button type="button" className="btn btn-sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            <X size={14} /> {t('search.cancel')}
          </button>
        )}
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="lg:sticky lg:top-28">
          {/* El jucumari trabaja: los recursos orbitan a su alrededor mientras planifica y se posan al terminar. */}
          <SearchGuide active={Boolean(r && ACTIVE.has(r.status))} categories={r?.plan?.resources.map((x) => x.category) ?? []} />
          <p className="msg msg-bot mx-auto mt-3 w-fit max-w-full text-center text-sm" role="status" aria-live="polite">
            {statusText}
          </p>
        </div>

        <div>
          {r?.status === 'error' && (
            <div className="space-y-3">
              <ErrorNote error={{ code: r.errorCode }} />
              <p className="text-sm text-muted">{t('search.quotaRefunded')}</p>
              <Link to="/espacio" className="btn btn-primary">
                {t('search.backToSpace')}
              </Link>
            </div>
          )}
          {r?.status === 'cancelled' && <p className="text-muted">{t('search.statusCancelled')}</p>}

          {r?.plan && (
            <>
              <div className="mb-6">
                <h1 className="display on-sky text-3xl text-white md:text-4xl">{r.plan.projectSummary}</h1>
                <p className="on-sky mt-2 flex flex-wrap items-center gap-2 text-sm text-white/85">
                  {r.ai.isDemo ? (
                    <>
                      <DemoBadge /> {t('search.aiDemo')}
                    </>
                  ) : (
                    t('search.aiBy', { provider: r.ai.provider })
                  )}
                </p>
              </div>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {r.plan.resources.map((res, i) => {
                  const pr = progressFor(res.id);
                  return (
                    <motion.li
                      key={res.id}
                      initial={reduced ? false : { opacity: 0, scale: 0.25, x: -140, y: 60 }}
                      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                      transition={{ delay: reduced ? 0 : 0.12 * i, type: 'spring', stiffness: 140, damping: 18 }}
                      className="card-glass relative flex aspect-square flex-col justify-between p-4"
                      style={{ viewTransitionName: `res-${res.id}` }}
                    >
                      <motion.span
                        className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)]"
                        initial={reduced ? false : { boxShadow: '0 0 0 1px rgba(242,169,59,0.9), 0 0 40px -6px rgba(242,169,59,0.7)' }}
                        animate={{ boxShadow: '0 0 0 1px rgba(242,169,59,0), 0 0 0 0 rgba(242,169,59,0)' }}
                        transition={{ delay: reduced ? 0 : 0.12 * i + 0.4, duration: 1.2 }}
                        aria-hidden="true"
                      />
                      <div className="flex items-start justify-between gap-2">
                        <ResourceIcon category={res.category} size={26} className="text-amber" aria-hidden="true" />
                        <span className="font-mono text-sm text-cream/90" aria-label={`${pr?.accepted ?? 0} / ${res.quantity ?? '?'}`}>
                          {t('search.counter', { accepted: pr?.accepted ?? 0, required: res.quantity ?? '?' })}
                        </span>
                      </div>
                      <div>
                        <h2 className="text-base leading-tight font-semibold">{res.label}</h2>
                        <p className="mt-1 text-xs text-muted">
                          {res.quantity === null ? t('common.quantityTbd') : `${res.quantity} ${res.unit}`} ·{' '}
                          {res.candidateCount ? t('search.candidates', { count: res.candidateCount }) : t('search.identifiedNoSupplier')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary relative w-full rounded-2xl text-center leading-tight whitespace-normal"
                        onClick={() => void nav(`/busqueda/${runId}/${res.id}`, { viewTransition: true })}
                      >
                        <Search size={13} /> {t('search.searchCategory', { label: res.label.toLowerCase() })}
                      </button>
                    </motion.li>
                  );
                })}
              </ul>
              {(r.plan.assumptions.length > 0 || r.plan.warnings.length > 0) && (
                <div className="mt-8 grid gap-4 md:grid-cols-2">
                  {r.plan.assumptions.length > 0 && (
                    <section className="panel">
                      <h2 className="mb-2 font-semibold">{t('search.assumptions')}</h2>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-cream/80">
                        {r.plan.assumptions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                  {r.plan.warnings.length > 0 && (
                    <section className="panel border-warning/30">
                      <h2 className="mb-2 font-semibold text-warning">{t('search.warnings')}</h2>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-cream/80">
                        {r.plan.warnings.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
