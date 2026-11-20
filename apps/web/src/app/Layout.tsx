import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Gavel, LogOut, Repeat, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { type SkyKey, SkyProvider, useSetSky } from '@/components/sky/Sky';

/** Paisaje por defecto de cada pantalla (Inicio, Mi espacio y Explorar eligen el suyo). */
const ROUTE_SKY: [RegExp, SkyKey][] = [
  [/^\/busqueda\//, 'bg-noche'],
  [/^\/espacio\/./, 'bg-alba'],
  [/^\/(explorar\/.|proveedores\/)/, 'bg-ocaso'],
  [/^\/(cotizaciones|pedidos|disputas)/, 'card-workshop'],
  [/^\/cuenta/, 'bg-alba'],
  [/^\/proveedor/, 'card-store'],
];
const SELF_SKY = ['/', '/espacio', '/explorar'];
import { DemoBadge, TestnetBadge } from '@/components/ui';
import { LANGUAGES } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from './auth';
import { LoginDialog } from './LoginDialog';
import { NotificationCenter } from './NotificationCenter';

function useNavItems() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const supplier = me?.activeMode === 'supplier';
  return supplier
    ? [
        { to: '/proveedor', label: t('nav.supplierHome'), end: true },
        { to: '/proveedor/negocios', label: t('nav.findBusinesses'), end: false },
        { to: '/proveedor/publicar', label: t('nav.publish'), end: false },
      ]
    : [
        { to: '/', label: t('nav.home'), end: true },
        { to: '/espacio', label: t('nav.space'), end: false },
        { to: '/explorar', label: t('nav.explore'), end: false },
      ];
}

function MainNav({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const items = useNavItems();
  return (
    <nav aria-label={t('nav.mainNav')} className={className}>
      <ul className="flex items-center gap-1">
        {items.map((i) => (
          <li key={i.to}>
            <NavLink
              to={i.to}
              end={i.end}
              className={({ isActive }) =>
                `relative block rounded-xl px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/8 hover:text-white'}`
              }
            >
              {({ isActive }) => (
                <>
                  {i.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amarillo shadow-[0_0_10px_2px_rgb(232_191_69/0.6)]"
                    />
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ProfileMenu() {
  const { t, i18n } = useTranslation();
  const { me, signOut } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const switchMode = useMutation({
    mutationFn: (mode: 'buyer' | 'supplier') =>
      api('/me', {
        method: 'PATCH',
        json: mode === 'supplier' && !me?.modes.includes('supplier') ? { enableSupplier: true, activeMode: mode } : { activeMode: mode },
      }),
    onSuccess: async (_d, mode) => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      setOpen(false);
      void nav(mode === 'supplier' ? '/proveedor' : '/espacio');
    },
  });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  if (!me) return null;
  const initials = (me.displayName || me.address.slice(0, 2)).slice(0, 2).toUpperCase();
  const other = me.activeMode === 'supplier' ? 'buyer' : 'supplier';
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="btn gap-1.5 py-1.5 pr-3 pl-1.5"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        aria-label={t('nav.profile')}
      >
        <span className="grid h-8 w-8 place-items-center rounded-full border border-amber/50 text-xs font-bold text-amber-2">
          {initials}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="glass absolute right-0 z-50 mt-3 w-64 rounded-2xl p-2 shadow-2xl">
          <p className="truncate px-3 py-2 font-mono text-[11px] text-muted">{me.address}</p>
          <Link
            role="menuitem"
            to="/cuenta"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-cream/5"
            onClick={() => setOpen(false)}
          >
            <UserRound size={15} /> {t('nav.profile')}
          </Link>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-cream/5"
            onClick={() => switchMode.mutate(other)}
          >
            <Repeat size={15} /> {other === 'supplier' ? t('nav.switchToSupplier') : t('nav.switchToBuyer')}
          </button>
          {me.staffRoles.includes('arbiter') && (
            <Link
              role="menuitem"
              to="/arbitro"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-cream/5"
              onClick={() => setOpen(false)}
            >
              <Gavel size={15} /> {t('nav.arbiter')}
            </Link>
          )}
          <div className="my-1 border-t border-line-soft" />
          <label className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>{t('nav.language')}</span>
            <select
              className="rounded-lg border border-line bg-night-2 px-2 py-1 text-sm"
              value={i18n.resolvedLanguage}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                  {l.beta ? ` (${t('nav.beta')})` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-cream/5"
            onClick={() => void signOut().then(() => nav('/'))}
          >
            <LogOut size={15} /> {t('nav.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

function LanguageQuick() {
  const { t, i18n } = useTranslation();
  return (
    <label className="hidden items-center sm:flex">
      <span className="sr-only">{t('nav.language')}</span>
      <select
        className="rounded-full border border-cream/20 bg-transparent px-3 py-2 text-xs font-semibold"
        value={i18n.resolvedLanguage}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code} className="bg-night">
            {l.code.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Al cambiar de página: una estrella cruza la pantalla y la página nueva entra (sin bloquear la navegación). */
function StarTransition({ path }: { path: string }) {
  const first = useRef(true);
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setRun((n) => n + 1);
  }, [path]);
  useEffect(() => {
    if (!run) return;
    const h = window.setTimeout(() => setRun(0), 1400);
    return () => window.clearTimeout(h);
  }, [run]);
  if (!run) return null;
  return (
    <div className="star-trans" aria-hidden="true" key={run}>
      <span className="ring" />
      <span className="star">
        <svg viewBox="0 0 40 40" width="46" height="46">
          <path d="M20 2l4.5 13.5L38 20l-13.5 4.5L20 38l-4.5-13.5L2 20l13.5-4.5z" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}

function Logo({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 font-display text-[19px] font-extrabold tracking-tight text-white">
      <svg viewBox="0 0 40 40" width="20" height="20" className="text-amarillo" aria-hidden="true">
        <path d="M20 2l4.5 13.5L38 20l-13.5 4.5L20 38l-4.5-13.5L2 20l13.5-4.5z" fill="currentColor" />
      </svg>
      {label.toLowerCase()}
    </span>
  );
}

export function Layout() {
  return (
    <SkyProvider>
      <Shell />
    </SkyProvider>
  );
}

function Shell() {
  const { t } = useTranslation();
  const { me, openLogin, config } = useAuth();
  const loc = useLocation();
  const setSky = useSetSky();
  // La primera carga no anima; cada navegación posterior la «forma» la estrella.
  const [prevPath, setPrevPath] = useState(loc.pathname);
  const [navigated, setNavigated] = useState(false);
  if (prevPath !== loc.pathname) {
    setPrevPath(loc.pathname);
    setNavigated(true);
  }
  useEffect(() => {
    if (!loc.hash) window.scrollTo({ top: 0 });
  }, [loc.pathname, loc.hash]);
  useEffect(() => {
    if (SELF_SKY.includes(loc.pathname)) return;
    const hit = ROUTE_SKY.find(([re]) => re.test(loc.pathname));
    setSky({ key: hit?.[1] ?? 'bg-noche', blur: 10 });
  }, [loc.pathname, setSky]);
  return (
    <>
      <a href="#main" className="sr-only-focusable fixed top-3 left-3 z-[80] btn btn-primary">
        {t('nav.skip')}
      </a>
      <StarTransition path={loc.pathname} />
      <header className="sticky top-0 z-40 pt-3">
        <div className="container-x">
          <div className="flex h-[62px] items-center justify-between gap-3 rounded-[18px] border border-white/25 bg-[rgb(28_30_70/0.32)] px-3 pl-5 backdrop-blur-xl md:px-3">
            <Link to={me?.activeMode === 'supplier' ? '/proveedor' : '/'} className="shrink-0 rounded-xl" aria-label={t('brand.name')}>
              <Logo label={t('brand.name')} />
            </Link>
            <MainNav className="hidden md:block" />
            <div className="flex items-center gap-2">
              {config?.demoMode && (
                <span className="hidden lg:inline-flex">
                  <DemoBadge />
                </span>
              )}
              {config?.network === 'testnet' && (
                <span className="hidden xl:inline-flex">
                  <TestnetBadge />
                </span>
              )}
              {me ? (
                <>
                  <NotificationCenter />
                  <ProfileMenu />
                </>
              ) : (
                <>
                  <LanguageQuick />
                  <button type="button" className="btn btn-primary" onClick={openLogin}>
                    {t('nav.signIn')}
                  </button>
                </>
              )}
            </div>
          </div>
          <MainNav className="mt-2 flex justify-center md:hidden [&_ul]:glass [&_ul]:rounded-2xl [&_ul]:p-1" />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="outline-none">
        <div key={loc.pathname} className={navigated ? 'page-in' : undefined}>
          <Outlet />
        </div>
      </main>
      <footer className="mt-24 mb-[calc(2rem+var(--safe-bottom))] text-xs text-white/75">
        <div className="kisa mb-6" aria-hidden="true" />
        <div className="container-x flex flex-wrap items-center justify-between gap-4">
          <span>{t('brand.tagline')}</span>
          <span>{t('home.protectionNote')}</span>
        </div>
      </footer>
      <LoginDialog />
    </>
  );
}
