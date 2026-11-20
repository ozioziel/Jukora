import type { LucideProps } from 'lucide-react';
import { createElement } from 'react';
import { resourceIcon } from './icons';

/** Icono estable por categoría (componente fijo; el ícono se elige sin crear componentes en render). */
export function ResourceIcon({ category, ...props }: LucideProps & { category: string }) {
  return createElement(resourceIcon(category), props);
}
