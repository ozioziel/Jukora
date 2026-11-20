import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState } from '@/components/ui';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="container-x py-24">
      <EmptyState
        motif="potosi"
        text="404"
        action={
          <Link to="/" className="btn btn-primary">
            {t('nav.home')}
          </Link>
        }
      />
    </div>
  );
}
