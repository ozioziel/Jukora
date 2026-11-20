import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { DemoBadge, EmptyState, ErrorNote, Money, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';

interface Case {
  id: string;
  status: string;
  reason: string;
  title: string;
  amount: string;
  currency: string;
  is_demo: boolean;
  arbiter_id: string | null;
}

/** Vista restringida al rol árbitro (asignado por script). */
export default function Arbiter() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['arbiter-cases'], queryFn: () => api<Case[]>('/arbiter/cases') });
  return (
    <div className="container-x pt-10 pb-16">
      <PageHeader title={t('arbiter.title')} subtitle={t('arbiter.demoNote')} />
      <ErrorNote error={q.error} />
      {q.isSuccess && q.data.length === 0 && <EmptyState motif="chuquisaca" text={t('arbiter.none')} />}
      <ul className="grid gap-3">
        {q.data?.map((c) => (
          <li key={c.id}>
            <Link to={`/disputas/${c.id}`} className="panel flex flex-wrap items-center justify-between gap-3 py-4 hover:border-amber/40">
              <span className="font-semibold">{c.title}</span>
              <span className="text-sm text-muted">{t(`dispute.reasons.${c.reason}`)}</span>
              <Money amount={c.amount} currency={c.currency} />
              <span className="chip">{t(`dispute.status.${c.status}`)}</span>
              {c.is_demo && <DemoBadge />}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
