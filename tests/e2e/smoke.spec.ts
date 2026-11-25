import { expect, test } from '@playwright/test';

// The software renderer in CI is slow: run the game on the Low graphics setting (no shadows).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('the-human.graphics', 'low');
    } catch {
      // Storage may be blocked; the default setting is used then.
    }
  });
});

test('game loads, the clock runs and there are no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('./?quick');
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

test('M2: tap the bed, choose Tidur, the character sleeps and time fast-forwards', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('./?debug');
  type Game = {
    controller: { queue: { state: string }[] } | null;
    session: { current: { def: { id: string } } | null; clock: { fastForward: boolean } };
    screenOf: (id: string, y?: number) => { x: number; y: number } | null;
  };
  await page.waitForFunction(() => (window as unknown as { __game?: Game }).__game?.controller != null, null, { timeout: 15000 });
  // The test drives the character itself, so switch autonomy off.
  await page.evaluate(() => {
    (window as unknown as { __game: { session: { character: { autonomy: string } } } }).__game.session.character.autonomy = 'off';
  });
  const bed = await page.evaluate(() => (window as unknown as { __game: Game }).__game.screenOf('bed', 0.5));
  expect(bed).not.toBeNull();
  await page.mouse.click(bed!.x, bed!.y);
  await page.locator('.action-menu-item', { hasText: 'Tidur' }).first().click();
  await page.waitForFunction(() => (window as unknown as { __game: Game }).__game.session.current?.def.id === 'sleep', null, { timeout: 20000 });
  expect(await page.evaluate(() => (window as unknown as { __game: Game }).__game.session.clock.fastForward)).toBe(true);
  expect(errors).toEqual([]);
});

test('M5: main menu -> character creator -> the new character starts in the kos', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('./');
  // Animated intro: tap to start, skip the captions, then the menu.
  await page.getByRole('button', { name: 'Ketuk untuk mulai' }).click();
  await page.getByRole('button', { name: 'Lewati ›' }).click();
  await page.getByRole('button', { name: 'Mulai hidup baru' }).click();
  await page.locator('.cr-input').fill('Sari');
  await page.getByRole('button', { name: 'Perempuan' }).click();
  await page.getByRole('button', { name: 'Asal' }).click();
  await page.getByRole('button', { name: 'Hindu' }).click();
  await page.getByRole('button', { name: 'Denpasar' }).click();
  await page.getByRole('button', { name: 'Sifat' }).click();
  await page.locator('.cr-trait', { hasText: 'Rajin' }).click();
  await page.locator('.cr-trait', { hasText: 'Ramah' }).click();
  await page.getByRole('button', { name: 'Mulai hidup' }).click();
  // Choose the first home: the kos (Denpasar rent is paid up front).
  await page.locator('.housing-card', { hasText: 'Kamar kos' }).click();
  await expect(page.locator('.hud-date')).toHaveText('Jumat, 1 Januari 2027');
  await expect(page.locator('.hud-money')).not.toHaveText('Rp3.500.000');
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
});

test('M6: the phone lists jobs and a CV can be sent', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?quick');
  await page.locator('.phone-btn').click();
  await page.getByRole('button', { name: 'Loker' }).click();
  const apply = page.locator('.phone-card button', { hasText: 'Kirim CV' }).first();
  await expect(apply).toBeVisible();
  await apply.click();
  await page.locator('.phone-tab', { hasText: 'Lamaran' }).click();
  await expect(page.locator('.phone-card').first()).toContainText('Menunggu kabar');
  expect(errors).toEqual([]);
});

test('M7: build mode buys and places furniture', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?quick');
  await page.locator('.build-btn').click();
  await page.locator('.build-card', { hasText: 'Tanaman hias' }).locator('button', { hasText: 'Beli tunai' }).click();
  // The ghost starts in the middle of the room, which is free: place it there.
  await page.locator('.build-bar button', { hasText: 'Taruh di sini' }).click();
  await expect(page.locator('.hud-money')).toHaveText('Rp3.415.000');
  await page.locator('.build-panel .btn-primary', { hasText: 'Selesai' }).click();
  expect(errors).toEqual([]);
});

test('M8: going outside shows the neighborhood with the joystick', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.goto('./?debug');
  type G = { controller: unknown; session: { character: { autonomy: string } }; screenOf: (id: string, y?: number) => { x: number; y: number } };
  await page.waitForFunction(() => (window as unknown as { __game?: G }).__game?.controller != null, null, { timeout: 15000 });
  await page.evaluate(() => {
    (window as unknown as { __game: G }).__game.session.character.autonomy = 'off';
  });
  const door = await page.evaluate(() => (window as unknown as { __game: G }).__game.screenOf('door', 1.0));
  await page.mouse.click(door.x, door.y);
  await page.locator('.action-menu-item', { hasText: 'Keluar rumah' }).click();
  await expect(page.locator('.joystick')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.world-btn', { hasText: 'Kos' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

test('M9: contacts, tickets and a life event dialog', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?quick');
  await page.locator('.phone-btn').click();
  await page.getByRole('button', { name: 'Kontak' }).click();
  await expect(page.locator('.phone-card').first()).toContainText('Keluarga');
  await page.locator('.phone-card button', { hasText: 'Telepon' }).first().click();
  await expect(page.locator('.phone-card').first()).toContainText('Kedekatan');
  await page.locator('.phone-header button', { hasText: '‹' }).click();
  await page.getByRole('button', { name: 'Tiket' }).click();
  await expect(page.locator('.phone-card').first()).toContainText('Mudik');
  await page.locator('.phone-header button', { hasText: '✕' }).click();
  expect(errors).toEqual([]);
});

test('M10: settings app, graphics levels and the web app manifest', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  const manifest = await request.get('./manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe('The Human');
  await page.goto('./?quick');
  await page.locator('.phone-btn').click();
  await page.getByRole('button', { name: 'Setelan' }).click();
  await expect(page.locator('.phone-card').first()).toContainText('Grafis');
  await expect(page.locator('.phone-card button', { hasText: 'Rendah' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Stage 5: walk into the minimarket, take an item, pay at the cashier', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug');
  type G = { controller: unknown; session: { character: { autonomy: string }; wallet: { balance: number } }; screenOf: (id: string, y?: number) => { x: number; y: number }; outdoor: { teleport: (id: string) => void }; enterStore: (id: string) => void };
  await page.waitForFunction(() => (window as unknown as { __game?: G }).__game?.controller != null, null, { timeout: 30000 });
  await page.evaluate(() => {
    (window as unknown as { __game: G }).__game.session.character.autonomy = 'off';
  });
  const door = await page.evaluate(() => (window as unknown as { __game: G }).__game.screenOf('door', 1.0));
  await page.mouse.click(door.x, door.y);
  await page.locator('.action-menu-item', { hasText: 'Keluar rumah' }).click();
  await expect(page.locator('.joystick')).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => (window as unknown as { __game: G }).__game.enterStore('minimarket'));
  await expect(page.locator('.basket-hud')).toHaveText('🧺 Keranjang kosong');
  // Walk up aisle A until its button shows, take a pack of instant noodles.
  await page.keyboard.down('w');
  await expect(page.locator('.world-btn', { hasText: 'Rak A' })).toBeVisible({ timeout: 30000 });
  await page.keyboard.up('w');
  await page.locator('.world-btn', { hasText: 'Rak A' }).click();
  await page.locator('.store-row', { hasText: 'Mi instan' }).getByRole('button', { name: '+' }).click();
  await page.getByRole('button', { name: 'Selesai' }).click();
  await expect(page.locator('.basket-hud')).toContainText('1 barang');
  const before = await page.evaluate(() => (window as unknown as { __game: G }).__game.session.wallet.balance);
  // Pay through the store's own logic (walking to the counter is covered by the zone test).
  await page.evaluate(() => (window as unknown as { __game: { session: { buyNow: (l: Record<string, number>) => boolean } } }).__game.session.buyNow({ mi_instan: 1 }));
  const after = await page.evaluate(() => (window as unknown as { __game: G }).__game.session.wallet.balance);
  expect(after).toBeLessThan(before);
  expect(errors).toEqual([]);
});

test('Stage 6: hospital registration, waiting room and the doctor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('./?debug');
  type G = { controller: unknown; session: { character: { autonomy: string; vitals: { sick: boolean; health: number } } }; screenOf: (id: string, y?: number) => { x: number; y: number }; enterFacility: (id: string, kind: string) => void };
  await page.waitForFunction(() => (window as unknown as { __game?: G }).__game?.controller != null, null, { timeout: 30000 });
  await page.evaluate(() => {
    const g = (window as unknown as { __game: G }).__game;
    g.session.character.autonomy = 'off';
    g.session.character.vitals.sick = true;
    g.session.character.vitals.health = 55;
  });
  const door = await page.evaluate(() => (window as unknown as { __game: G }).__game.screenOf('door', 1.0));
  await page.mouse.click(door.x, door.y);
  await page.locator('.action-menu-item', { hasText: 'Keluar rumah' }).click();
  await expect(page.locator('.joystick')).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => (window as unknown as { __game: G }).__game.enterFacility('rs', 'hospital'));
  // Step in front of the registration desk (walking itself is covered by the store test).
  await page.evaluate(() => (window as unknown as { __game: { character: { root: { position: { set: (x: number, y: number, z: number) => void } } } } }).__game.character.root.position.set(-5, 0, 3.6));
  await expect(page.locator('.world-btn', { hasText: 'Loket pendaftaran' })).toBeVisible({ timeout: 40000 });
  await page.locator('.world-btn', { hasText: 'Loket pendaftaran' }).click();
  await page.getByRole('button', { name: 'Umum (bayar sendiri)' }).click();
  await expect(page.locator('.hud-toast').filter({ hasText: 'Nomor antreanmu' }).first()).toBeVisible({ timeout: 10000 });
  expect(errors).toEqual([]);
});
