import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { House2D, SECTOR_COLOR, type Sector } from './House2D';

const SECTORS: Sector[] = ['restaurant', 'cafe', 'workshop', 'store', 'studio', 'other', 'new'];

describe('House2D', () => {
  it('cada sector tiene un color del aguayo', () => {
    for (const s of SECTORS) expect(SECTOR_COLOR[s]).toMatch(/^var\(--color-/);
  });

  it('las casas con local tienen una puerta que se puede abrir y su hueco iluminado', () => {
    for (const s of ['restaurant', 'cafe', 'workshop', 'store', 'studio'] as const) {
      const { container, unmount } = render(<House2D sector={s} />);
      expect(container.querySelector('.door')).not.toBeNull();
      expect(container.querySelector('.doorway')).not.toBeNull();
      expect(container.querySelectorAll('.spark')).toHaveLength(3);
      unmount();
    }
  });

  it('«tu idea» es una casa por construir, sin puerta, y es decorativa para lectores de pantalla', () => {
    const { container } = render(<House2D sector="new" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.door')).toBeNull();
  });
});
