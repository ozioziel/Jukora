import { useQuery } from '@tanstack/react-query';
import { ArrowRight, LayoutGrid, MessageCircle } from 'lucide-react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@/app/auth';
import { SECTOR_COLOR } from '@/components/house/House2D';
import { HouseSprite } from '@/components/house/HouseSprite';
import { Jucumari2D } from '@/components/jucumari/Jucumari2D';
import { useSky } from '@/components/sky/Sky';
import { Wizard } from '@/features/assistant/Wizard';
import { api } from '@/lib/api';
import type { ProjectSummary, Quota } from '@/lib/types';

const DRAFT_KEY = 'jcm.idea';

function useRelative() {
  const { i18n } = useTranslation();
  return (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'en' ? 'en' : 'es', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(
      new Date(iso),
    );
}

/**
 * Mi espacio: el jucumari y el chat ocupan toda la pantalla (es el corazón de la app). Los negocios
 * no compiten con la conversación: aparecen solo al pulsar «Ver mis negocios», como casas cuya puerta
 * se abre al pasar el cursor.
 */
export default function Space() {
  const { t } = useTranslation();
  const { me, openLogin } = useAuth();
  useSky('bg-alba', 4);
  const loc = useLocation() as { state?: { idea?: string; projectId?: string } };
  const rel = useRelative();
  const [idea, setIdea] = useState(() => loc.state?.idea || safeGet(DRAFT_KEY) || '');
  const [wizard, setWizard] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHouses, setShowHouses] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const houses = useRef<HTMLElement>(null);

  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<ProjectSummary[]>('/projects'), enabled: Boolean(me) });
  const quota = useQuery({ queryKey: ['quota'], queryFn: () => api<Quota>('/search/quota'), enabled: Boolean(me) });

  // Borrador local inmediato (sin red, sin cuota).
  useEffect(() => {
    const h = window.setTimeout(() => {
      safeSet(DRAFT_KEY, idea);
      if (idea) setSaved(true);
    }, 500);
    return () => window.clearTimeout(h);
  }, [idea]);

  const toBottom = () => {
    window.requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }));
  };
  useEffect(() => {
    toBottom();
  }, [wizard, me]);
  useEffect(() => {
    if (showHouses) window.requestAnimationFrame(() => houses.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [showHouses]);

  const remaining = quota.data?.remaining ?? 10;
  const exhausted = Boolean(me && quota.data && quota.data.remaining === 0);
  const canContinue = idea.trim().length >= 20 && !exhausted;
  const backToChat = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => textRef.current?.focus(), 400);
  };

  return (
    <div className="container-x">
      <section aria-labelledby="space-title" className="grid gap-6 pt-4 pb-8 lg:min-h-[calc(100dvh-88px)] lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
        {/* El jucumari, protagonista */}
        <div className="on-sky flex flex-col items-center text-center lg:items-start lg:text-left">
          <span className="eyebrow">{t('nav.space')}</span>
          <h1 id="space-title" className="display mt-3 text-[clamp(28px,3vw,44px)] text-white">
            {t('space.title')}
          </h1>
          <div className="relative mt-3 h-[200px] w-full max-w-[420px] lg:mt-5 lg:h-[370px]">
            <span className="absolute inset-x-[6%] bottom-4 h-[70px] rounded-[50%] border-[1.5px] border-celeste/45 bg-[radial-gradient(50%_50%_at_50%_50%,rgb(86_181_211/0.3),transparent_70%)]">
              <span className="absolute inset-x-[18%] inset-y-3.5 rounded-[50%] border border-dashed border-amarillo/45" />
            </span>
            {/* centrado con márgenes: la flotación usa «translate» y pisaría un -translate-x */}
            <div className="absolute inset-x-0 bottom-7 mx-auto w-[150px] lg:w-[min(290px,72%)]">
              <Jucumari2D title={t('home.hero.guide')} className="float-y w-full drop-shadow-[0_26px_30px_rgb(0_0_0/0.4)]" />
            </div>
          </div>
          <button type="button" className="btn btn-lg mt-2" aria-expanded={showHouses} aria-controls="negocios" onClick={() => setShowHouses(true)}>
            <LayoutGrid size={18} /> {t('space.showHouses')}
          </button>
        </div>

        {/* El chat ocupa la altura de la pantalla */}
        <div
          className="chat-panel relative flex flex-col overflow-hidden rounded-3xl lg:h-[calc(100dvh-120px)] lg:max-h-[860px] lg:min-h-[560px]"
          role="region"
          aria-label={t('space.chatLabel')}
        >
          <div className="flex items-center gap-2.5 border-b border-ink/8 px-6 pt-6 pb-4 text-[13px] text-ink-2">
            <span className="h-2 w-2 rounded-full bg-[#3fae6f] shadow-[0_0_0_4px_rgb(63_174_111/0.15)]" />
            <b className="font-display text-[15px] text-ink">{t('space.chatName')}</b>
            <span>{t('space.chatSub')}</span>
          </div>

          <div ref={scroller} className="flex min-h-[260px] flex-1 flex-col gap-3 overflow-y-auto px-6 py-5" aria-live="polite">
            <p className="msg msg-bot">{t('space.greet')}</p>
            {!me && (
              <div className="msg msg-bot">
                <p>{t('space.signInTitle')}</p>
                <button type="button" className="btn btn-primary btn-sm mt-3 border-oro text-[#6a4f10]" onClick={openLogin}>
                  {t('nav.signIn')}
                </button>
              </div>
            )}
            {me && !wizard && <p className="msg msg-bot">{t('space.jucumariSays')}</p>}
            {wizard && me && (
              <>
                <p className="msg msg-me whitespace-pre-line">{idea}</p>
                <Wizard
                  variant="chat"
                  description={idea}
                  projects={projects.data ?? []}
                  quota={quota.data}
                  initialProjectId={loc.state?.projectId}
                  onCancel={() => setWizard(false)}
                  onStep={toBottom}
                />
              </>
            )}
          </div>

          {!wizard && (
            <div className="on-light border-t border-ink/8 px-6 pt-4 pb-5">
              <label htmlFor="idea" className="sr-only">
                {t('space.title')}
              </label>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <textarea
                  id="idea"
                  ref={textRef}
                  className="field min-h-[88px] flex-1 resize-none text-[15.5px] leading-relaxed"
                  maxLength={4000}
                  value={idea}
                  onChange={(e) => {
                    setIdea(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={t('space.placeholder')}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-lg self-end sm:self-stretch"
                  disabled={!canContinue}
                  onClick={() => (me ? setWizard(true) : openLogin())}
                  aria-describedby="continue-hint"
                >
                  {t('common.continue')} <ArrowRight size={18} />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                <span aria-live="polite">
                  {me && quota.data ? (
                    exhausted ? (
                      <span className="text-[#9a5b06]">{t('space.quotaExhausted', { when: rel(quota.data.resetsAt) })}</span>
                    ) : (
                      <span>
                        <span className="font-semibold text-ink">{t('space.quota', { remaining, limit: quota.data.limit })}</span>
                        <span className="text-ink-2"> · {t('space.quotaResets', { when: rel(quota.data.resetsAt) })}</span>
                      </span>
                    )
                  ) : (
                    <span className="text-ink-2">{t('space.quota', { remaining: 10, limit: 10 })}</span>
                  )}
                  {saved && <span className="ml-2 text-xs text-ink-2">· {t('space.draftSaved')}</span>}
                </span>
                <span id="continue-hint" className="text-xs text-ink-2">
                  {t('space.continueHint')}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>

      {showHouses && (
        <section ref={houses} id="negocios" aria-labelledby="houses-title" className="scroll-mt-28 pt-6 pb-10">
          <div className="on-sky mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 id="houses-title" className="display text-3xl text-white md:text-4xl">
              {t('space.housesTitle')}
            </h2>
            <button type="button" className="btn" onClick={backToChat}>
              <MessageCircle size={16} /> {t('space.backToChat')}
            </button>
          </div>
          {!me ? (
            <div className="lglass flex flex-col items-center gap-4 rounded-3xl px-6 py-10 text-center">
              <HouseSprite sector="new" className="w-36" />
              <p className="max-w-md text-ink-2">{t('space.signInTitle')}</p>
              <button type="button" className="btn btn-primary on-light" onClick={openLogin}>
                {t('nav.signIn')}
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {(projects.data ?? []).map((p, i) => (
                <li key={p.id} className="[animation:rise-in_520ms_var(--ease-star)_both]" style={{ animationDelay: `${i * 70}ms` }}>
                  <Link
                    to={`/espacio/${p.id}`}
                    className="house-hover lglass float-y flex h-full flex-col rounded-2xl p-4 transition hover:-translate-y-0.5"
                    style={{ '--c': SECTOR_COLOR[p.sector], animationDelay: `${-i}s` } as CSSProperties}
                    aria-label={t('space.openHouse', { name: p.name })}
                  >
                    <HouseSprite sector={p.sector} className="mx-auto w-[88%]" />
                    <h3 className="mt-2 truncate font-display text-sm font-bold">{p.name}</h3>
                    <p className="truncate text-xs text-ink-2">
                      {t(`sectors.${p.sector}`)} · {t(`intent.${p.intent}`)}
                      {p.city ? ` · ${p.city}` : ''}
                    </p>
                    <div className="mt-auto pt-3">
                      {p.progress.required > 0 ? (
                        <>
                          <div className="h-1 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                            <div
                              className="h-full rounded-full"
                              style={{ background: SECTOR_COLOR[p.sector], width: `${Math.min(100, (p.progress.accepted / p.progress.required) * 100)}%` }}
                            />
                          </div>
                          <p className="mt-1.5 text-[11px] text-ink-2">
                            {t('space.progress', { accepted: p.progress.accepted, required: p.progress.required })}
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-ink-2">{t('space.progressUnknown')}</p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
              <li className="[animation:rise-in_520ms_var(--ease-star)_both]" style={{ animationDelay: `${(projects.data?.length ?? 0) * 70}ms` }}>
                <button
                  type="button"
                  className="house-hover lglass float-y flex h-full w-full flex-col items-center justify-center rounded-2xl border-dashed p-4 text-center"
                  style={{ '--c': SECTOR_COLOR.new } as CSSProperties}
                  onClick={backToChat}
                >
                  <HouseSprite sector="new" className="w-[80%]" />
                  <span className="mt-2 font-display text-sm font-bold">{t('space.newHouse')}</span>
                  <span className="text-[11px] text-ink-2">{t('space.newHouseHint')}</span>
                </button>
              </li>
            </ul>
          )}
          {me && projects.data?.length === 0 && <p className="on-sky mt-4 text-sm text-white/85">{t('space.noHouses')}</p>}
        </section>
      )}
    </div>
  );
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento */
  }
}
