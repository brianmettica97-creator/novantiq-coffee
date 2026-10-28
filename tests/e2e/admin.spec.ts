import { expect, test, type Page } from '@playwright/test';
import { deflateSync } from 'node:zlib';

async function login(page: Page) {
  await page.goto('/admin');
  await page.getByLabel('Contraseña').fill('moka2026');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { name: 'Resumen' })).toBeVisible();
}

/** PNG válido mínimo generado en memoria (color sólido). */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x9a)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test.describe('panel administrativo', () => {
  test('sin sesión no se ve el panel', async ({ page }) => {
    await page.goto('/admin/productos');
    await expect(page.getByRole('heading', { name: 'Panel de la cafetería' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Productos' })).toHaveCount(0);
    await page.getByLabel('Contraseña').fill('incorrecta');
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page.getByRole('alert')).toContainText('incorrectos');
  });

  test('cambiar un precio se refleja en la carta', async ({ page }) => {
    await login(page);
    await page.goto('/admin/productos');
    await page.getByRole('button', { name: /^Latte/ }).first().click();
    const price = page.getByLabel('Precio');
    await price.fill('5.300');
    await price.blur();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByText('Producto guardado')).toBeVisible();
    await page.goto('/m/moka-studio?producto=latte');
    await expect(page.getByRole('dialog', { name: 'Latte' }).locator('.nq-sheet__total strong')).toContainText('5.300');
  });

  test('crear un producto, previsualizarlo y publicarlo', async ({ page }) => {
    await login(page);
    await page.goto('/admin/productos/nuevo');
    await page.getByLabel('Nombre').fill('Affogato');
    await page.getByLabel('Precio').fill('6100');
    await page.getByLabel('Descripción breve').fill('Helado de crema con un espresso doble.');
    await page.getByRole('button', { name: 'Vista previa' }).click();
    const preview = page.getByRole('dialog', { name: 'Vista previa del producto' });
    await expect(preview.getByRole('dialog', { name: 'Affogato' })).toBeVisible();
    await preview.getByRole('button', { name: 'Cerrar vista previa' }).click();
    await page.getByRole('button', { name: 'Guardar y publicar' }).click();
    await expect(page.getByText('Producto guardado')).toBeVisible();
    await page.goto('/m/moka-studio?producto=affogato');
    await expect(page.getByRole('dialog', { name: 'Affogato' })).toBeVisible();
  });

  test('ordenar categorías se refleja en la carta', async ({ page }) => {
    await login(page);
    await page.goto('/admin/categorias');
    await page.getByRole('button', { name: 'Subir Cafés fríos' }).click();
    await expect(page.getByText('Cafés fríos').first()).toBeVisible();
    await page.goto('/m/moka-studio');
    const first = page.getByRole('navigation', { name: 'Categorías de la carta' }).locator('.nq-pill').first();
    await expect(first).toHaveText('Cafés fríos');
  });

  test('subir y reemplazar una imagen', async ({ page }) => {
    await login(page);
    await page.goto('/admin/multimedia');
    await expect(page.locator('.ad-asset').first()).toBeVisible();
    const before = await page.locator('.ad-asset').count();
    await page.locator('input[type=file]').first().setInputFiles({ name: 'vitrina.png', mimeType: 'image/png', buffer: png(1200, 900) });
    await expect(page.getByText('Se subió la imagen')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.ad-asset')).toHaveCount(before + 1);
    const uploaded = page.locator('.ad-asset').last();
    await expect(uploaded).toContainText('1200×900');
    await uploaded.locator('input[type=file]').first().setInputFiles({ name: 'vitrina2.png', mimeType: 'image/png', buffer: png(800, 800) });
    await expect(page.getByText('Archivo reemplazado')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.ad-asset').last()).toContainText('800×800');
  });

  test('rechaza archivos con formato no permitido', async ({ page }) => {
    await login(page);
    await page.goto('/admin/multimedia');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'virus.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
    await expect(page.getByText(/Formato no admitido/)).toBeVisible();
  });

  test('genera el QR de la carta', async ({ page }) => {
    await login(page);
    await page.goto('/admin/qr');
    await expect(page.locator('.ad-qr svg').first()).toBeVisible();
    await expect(page.getByText(/\/m\/moka-studio\?qr=/).first()).toBeVisible();
    await page.getByLabel('Nombre').fill('Mesa 7');
    await page.getByLabel('Mesa (opcional)').fill('7');
    await page.getByRole('button', { name: 'Generar QR' }).click();
    await expect(page.getByRole('heading', { name: 'Mesa 7' })).toBeVisible();
  });
});
