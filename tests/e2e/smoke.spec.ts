import { expect, test } from '@playwright/test';

test('game loads, the clock runs and there are no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./');
  await expect(page.locator('#game')).toBeVisible();
  await expect(page.locator('.hud-date')).toHaveText('Jumat, 1 Januari 2027');
  await expect(page.locator('.hud-money')).toHaveText('Rp3.500.000');
  const t0 = await page.locator('.hud-time').textContent();
  await page.getByRole('button', { name: '3x' }).click();
  await expect(page.locator('.hud-time')).not.toHaveText(t0 ?? '', { timeout: 5000 });
  await page.waitForTimeout(1000); // let a few frames render

  const size = await page.locator('#game').evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(size[0]).toBeGreaterThan(0);
  expect(size[1]).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('style preview page loads without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./style.html');
  await expect(page.locator('#hud h1')).toHaveText('Contoh Gaya Grafis');
  await page.getByRole('button', { name: /Malam/ }).click();
  await page.getByRole('button', { name: /Ganti orang/ }).click();
  await page.waitForTimeout(2500); // let the character GLB load and animate
  expect(errors).toEqual([]);
});
