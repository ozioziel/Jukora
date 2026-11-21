import { expect, test } from '@playwright/test';

/** Comprador DEMO: llave de prueba → descripción → cuestionario → búsqueda → recursos → pedido. */
test('flujo de búsqueda inteligente y pedido pendiente de pago', async ({ page }) => {
  await page.goto('/espacio');
  await page.getByRole('button', { name: 'Entrar' }).first().click();
  await page
    .getByRole('button', { name: /crear llave de prueba|entrar/i })
    .last()
    .click();
  await expect(page.getByRole('button', { name: /tu cuenta/i })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/10 de 10 búsquedas disponibles hoy/)).toBeVisible();

  await page
    .getByRole('textbox')
    .first()
    .fill('Quiero abrir una hamburguesería para 40 personas en La Paz. Necesito equipamiento de cocina y mobiliario.');
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  for (let i = 0; i < 5; i++)
    await page
      .locator('[aria-labelledby="wizard-title"]')
      .getByRole('button', { name: /^Continuar/ })
      .click();
  await expect(page.getByRole('heading', { name: /revisa tu búsqueda/i })).toBeVisible();
  await page.getByRole('button', { name: /buscar · usa 1 de tus 10/i }).click();

  await expect(page).toHaveURL(/\/busqueda\//);
  await expect(page.getByRole('status')).toHaveText(/recursos disponibles/i, { timeout: 30_000 });
  await expect(page.getByText(/plan generado por reglas de demostración/i).first()).toBeVisible();
  await page.getByRole('button', { name: /buscar parrillas/i }).click();

  await expect(page.getByRole('heading', { name: 'Parrillas' })).toBeVisible();
  const card = page.locator('li', { hasText: 'Parrilla a gas de 4 quemadores' });
  await card.getByRole('button', { name: 'Solicitar', exact: true }).click();
  // Jukora es pasarela: el proveedor envía; el comprador da dirección y teléfono (datos de prueba).
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  await dialog.getByLabel('Ciudad').fill('La Paz');
  await dialog.getByLabel('Teléfono de contacto').fill('+591 71234567');
  await dialog.getByLabel('Departamento').fill('La Paz');
  await dialog.getByLabel('Dirección', { exact: true }).fill('Av. Arce 2000, Sopocachi (DATO DE PRUEBA)');
  await expect(dialog.getByText('Envío', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  await expect(page).toHaveURL(/\/pedidos\//);
  await expect(page.getByText('Pendiente de pago').first()).toBeVisible();
  await expect(page.getByText(/comisión de la plataforma/i)).toBeVisible();
  await expect(page.getByText(/token de prueba sin valor/i)).toBeVisible();

  await page.goto('/espacio');
  await expect(page.getByText(/9 de 10 búsquedas disponibles hoy/)).toBeVisible();
});
