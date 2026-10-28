import { expect, test } from '@playwright/test';

const MENU = '/m/moka-studio';

test.describe('carta pública', () => {
  test('abre directo desde el QR, sin login y sin scroll horizontal', async ({ page }) => {
    await page.goto(`${MENU}?qr=mk7q2d9wz4`);
    await expect(page.getByRole('heading', { level: 1, name: 'Moka Studio' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Categorías de la carta' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('las fotografías no se deforman y los controles son táctiles', async ({ page }) => {
    await page.goto(MENU);
    await page.getByRole('button', { name: 'Ver la carta' }).click();
    const imgs = page.locator('.nq-card__media img');
    await expect(imgs.first()).toBeVisible();
    const fits = await imgs.evaluateAll((els) => els.map((e) => getComputedStyle(e).objectFit));
    expect(new Set(fits)).toEqual(new Set(['cover']));
    for (const name of ['Buscar en la carta', 'Volver al inicio']) {
      const box = await page.getByRole('button', { name }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(32);
    }
    const pill = await page.locator('.nq-pill').first().boundingBox();
    expect(pill!.height).toBeGreaterThanOrEqual(36);
  });

  test('ficha: la variante cambia el precio y al cerrar vuelve al mismo lugar', async ({ page }) => {
    await page.goto(MENU);
    await page.getByRole('button', { name: 'Té, matcha y chocolate' }).click();
    // Espera a que termine el desplazamiento suave.
    let last = -1;
    await expect.poll(async () => { const y = await page.evaluate(() => window.scrollY); const stable = y === last; last = y; return stable; }, { intervals: [300] }).toBe(true);
    const before = last;
    await page.getByRole('button', { name: 'Ver Chocolate caliente' }).click();
    const dialog = page.getByRole('dialog', { name: 'Chocolate caliente' });
    await expect(dialog).toBeVisible();
    const total = dialog.locator('.nq-sheet__total strong');
    await expect(total).toContainText('4.900');
    const large = dialog.getByText('Grande · 480 ml');
    await large.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    // Toque por coordenadas: verifica además que nada tape el control.
    const box = (await large.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(total).toContainText('6.500');
    await dialog.getByRole('button', { name: 'Cerrar' }).click();
    await expect(dialog).toBeHidden();
    const after = await page.evaluate(() => window.scrollY);
    expect(Math.abs(after - before)).toBeLessThan(40);
  });

  test('los videos se descargan solo al reproducirlos', async ({ page }) => {
    const videoRequests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/video/espresso.mp4')) videoRequests.push(r.url()); });
    await page.goto(`${MENU}?producto=espresso`);
    const dialog = page.getByRole('dialog', { name: 'Espresso' });
    await expect(dialog.getByRole('button', { name: /Reproducir video/ })).toBeVisible();
    await page.waitForTimeout(800);
    expect(videoRequests).toHaveLength(0);
    await dialog.getByRole('button', { name: /Reproducir video/ }).click();
    await expect.poll(() => videoRequests.length, { timeout: 20_000 }).toBeGreaterThan(0);
    // La información sigue disponible mientras el video carga.
    await expect(dialog.getByText('Doble ristretto del blend de la casa', { exact: false })).toBeVisible();
  });

  test('si una imagen falla se muestra una reserva y el producto sigue disponible', async ({ page }) => {
    await page.route('**/img/croissant-*.webp', (route) => route.abort());
    await page.goto(MENU);
    const card = page.locator('.nq-card', { has: page.getByRole('heading', { name: 'Croissant francés' }) });
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.nq-img--fallback')).toBeVisible();
    await expect(card.getByText('2.400')).toBeVisible();
  });

  test('búsqueda sin acentos y sin resultados', async ({ page }) => {
    await page.goto(MENU);
    await page.getByRole('button', { name: 'Buscar en la carta' }).click();
    await page.getByRole('searchbox').fill('cafe frio');
    await expect(page.getByRole('dialog', { name: 'Buscar en la carta' }).getByText('Iced latte')).toBeVisible();
    await page.getByRole('searchbox').fill('hamburguesa');
    await expect(page.getByText(/No encontramos/)).toBeVisible();
  });

  test('una carta inexistente muestra un mensaje claro', async ({ page }) => {
    await page.goto('/m/no-existe');
    await expect(page.getByRole('heading', { name: 'Carta no disponible' })).toBeVisible();
  });
});
