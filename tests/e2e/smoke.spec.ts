import { expect, test } from '@playwright/test';

test('Inicio: portada, seis paneles, navegación y acceso directo a Mi espacio', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/sin pagar a ciegas/i);
  await expect(page.getByRole('region', { name: /qué negocio quieres armar/i })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(6);
  const nav = page.getByRole('navigation', { name: /navegación principal/i }).first();
  await expect(nav.getByRole('link')).toHaveText(['Inicio', 'Mi espacio', 'Explorar']);
  await page.getByRole('link', { name: /ir directo a mi espacio/i }).click();
  await expect(page).toHaveURL(/\/espacio$/);
  await expect(page.getByRole('heading', { name: /qué necesita tu negocio/i })).toBeVisible();
  await expect(page.getByRole('region', { name: /conversación con el jucumari/i })).toBeVisible();
  // Los negocios no compiten con el chat: aparecen solo al pedirlos.
  await expect(page.locator('#negocios')).toHaveCount(0);
  await page.getByRole('button', { name: /ver mis negocios/i }).click();
  await expect(page.getByRole('heading', { name: /tus negocios/i })).toBeVisible();
});

test('Movimiento reducido: el contenido sigue completo', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /construye sin fronteras/i })).toBeAttached();
  await ctx.close();
});

test('Explorar es público y no usa la cuota', async ({ page }) => {
  await page.goto('/explorar?q=parrilla');
  await expect(page.getByRole('link', { name: /parrilla/i }).first()).toBeVisible();
  await expect(page.getByRole('main').getByText('DEMO').first()).toBeVisible();
});

test('Teclado: el enlace para saltar al contenido existe', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: /saltar al contenido/i })).toBeFocused();
});
