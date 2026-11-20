import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import type { Notice } from '@/lib/types';

interface NoticeList {
  attention: Notice[];
  updates: Notice[];
  pendingCount: number;
  unreadCount: number;
}

function routeFor(n: Notice): string {
  switch (n.entity.type) {
    case 'order':
      return `/pedidos/${n.entity.id}`;
    case 'quote':
      return `/cotizaciones#${n.entity.id}`;
    case 'dispute':
      return `/disputas/${n.entity.id}`;
    case 'rfq':
      return `/proveedor/negocios#${n.entity.id}`;
    case 'verification':
      return '/cuenta';
    default:
      return '/espacio';
  }
}

/** Botón de avisos bien visible, con brillo discreto cuando hay acciones pendientes (sin parpadeo). */
export function NotificationCenter() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['notifications'], queryFn: () => api<NoticeList>('/notifications'), refetchInterval: 30_000 });
  const read = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pending = q.data?.pendingCount ?? 0;
  const fmt = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en' : 'es', { dateStyle: 'short', timeStyle: 'short' });

  const Item = ({ n }: { n: Notice }) => (
    <li>
      <button
        type="button"
        className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-cream/5 ${n.read ? 'text-muted' : 'text-cream'}`}
        onClick={() => {
          read.mutate(n.id);
          setOpen(false);
          void nav(routeFor(n));
        }}
      >
        <span className="block">{t(`notifications.kinds.${n.kind}`, { defaultValue: n.kind })}</span>
        <span className="text-[11px] text-muted">{fmt.format(new Date(n.createdAt))}</span>
      </button>
    </li>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`btn btn-icon relative ${pending ? 'border-amber/70 shadow-[0_0_24px_-6px_rgb(242_169_59/0.6)]' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t('nav.notifications')}${pending ? ` · ${t('notifications.pending', { count: pending })}` : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={19} />
        {pending > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-amber px-1 text-[11px] font-bold text-night">
            {pending}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t('notifications.title')}
          className="glass absolute right-0 z-50 mt-3 w-[min(92vw,380px)] rounded-2xl p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="font-semibold">{t('notifications.title')}</h2>
            <button type="button" className="text-xs text-muted underline-offset-4 hover:underline" onClick={() => readAll.mutate()}>
              {t('notifications.markAll')}
            </button>
          </div>
          {!q.data?.attention.length && !q.data?.updates.length && (
            <p className="px-2 py-6 text-center text-sm text-muted">{t('notifications.empty')}</p>
          )}
          {!!q.data?.attention.length && (
            <section className="mb-2">
              <h3 className="eyebrow px-2 py-1">{t('notifications.attention')}</h3>
              <ul>
                {q.data.attention.slice(0, 8).map((n) => (
                  <Item key={n.id} n={n} />
                ))}
              </ul>
            </section>
          )}
          {!!q.data?.updates.length && (
            <section>
              <h3 className="px-2 py-1 text-xs font-bold tracking-widest text-muted uppercase">{t('notifications.updates')}</h3>
              <ul>
                {q.data.updates.slice(0, 8).map((n) => (
                  <Item key={n.id} n={n} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
